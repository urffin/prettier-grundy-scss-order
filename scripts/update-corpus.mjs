import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { corpusRoot, corpusPath, hash, projectDigest } from "./corpus.mjs";

const run = promisify(execFile),
    options = { revision: "HEAD" },
    seen = new Set();
for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (seen.has(key)) throw new Error(`Duplicate ${key}`);
    seen.add(key);
    if (key === "--check") {
        options.check = true;
        continue;
    }
    if (key === "--help") {
        console.log(
            "Usage: npm run corpus:update -- --project ID --root PATH [--revision REV] [--check]\nReads committed Git blobs only. --check reports changed/added/deleted styles without writing. CI uses checked-in snapshots, never local repositories."
        );
        process.exit(0);
    }
    if (!["--project", "--root", "--revision"].includes(key)) throw new Error(`Invalid option: ${key}`);
    const value = process.argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value: ${key}`);
    options[key.slice(2)] = value;
}
if (!options.project || !options.root) throw new Error("--project and --root are required");
const selection = JSON.parse(await readFile(path.join(corpusRoot, "selection.json"), "utf8"));
const policy = selection.projects.find(p => p.id === options.project);
if (!policy) throw new Error(`Unknown corpus project: ${options.project}`);
const git = async args =>
    (
        await run("git", args, {
            cwd: path.resolve(options.root),
            encoding: "utf8",
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024
        })
    ).stdout;
const revision = (await git(["rev-parse", "--verify", "--end-of-options", `${options.revision}^{commit}`])).trim();
if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("Invalid source revision");
const files = [];
if (policy.roots) {
    const tree = (await git(["ls-tree", "-r", "-z", revision, "--", ...policy.roots])).split("\0").filter(Boolean);
    for (const entry of tree) {
        const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
        if (match && /\.(css|scss)$/.test(match[3])) files.push(match[3]);
    }
} else files.push(...policy.paths);
files.sort();
if (!files.length || new Set(files).size !== files.length) throw new Error("Empty or duplicate source selection");
const contents = [];
for (const name of files) {
    corpusPath(policy.id, name);
    const mode = (await git(["ls-tree", revision, "--", name])).split(" ")[0];
    if (!["100644", "100755"].includes(mode)) throw new Error(`Style is not a regular Git blob: ${name}`);
    const source = (await git(["show", `${revision}:${name}`])).replaceAll("\r\n", "\n");
    contents.push({ path: name, source, bytes: Buffer.byteLength(source), sha256: hash(source) });
}
let manifest;
try {
    manifest = JSON.parse(await readFile(path.join(corpusRoot, "manifest.json"), "utf8"));
} catch (error) {
    if (error.code !== "ENOENT") throw error;
    manifest = { schemaVersion: 1, normalization: "LF line endings; whole files otherwise unchanged", projects: [] };
}
const previous = manifest.projects.find(p => p.id === policy.id);
const currentFiles = contents.map(({ source, ...file }) => file);
const added = currentFiles.filter(f => !previous?.files.some(p => p.path === f.path)).map(f => f.path);
const changed = currentFiles
    .filter(f => previous?.files.some(p => p.path === f.path && p.sha256 !== f.sha256))
    .map(f => f.path);
const deleted = (previous?.files ?? []).filter(f => !currentFiles.some(p => p.path === f.path)).map(f => f.path);
const damaged = [];
for (const file of previous?.files ?? []) {
    try {
        if (hash(await readFile(corpusPath(policy.id, file.path))) !== file.sha256) damaged.push(file.path);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        damaged.push(file.path);
    }
}
// Unrelated commits do not make a snapshot stale. Provenance remains the commit
// from which the identical files were last imported.
if (!added.length && !changed.length && !deleted.length && !damaged.length) {
    console.log(JSON.stringify({ project: policy.id, current: true, revision, files: files.length }));
    process.exit(0);
}
if (options.check) {
    console.log(JSON.stringify({ project: policy.id, current: false, revision, added, changed, deleted, damaged }, null, 2));
    process.exitCode = 1;
} else {
    for (const file of contents) {
        const destination = corpusPath(policy.id, file.path);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, file.source);
    }
    // Remove only obsolete files named in our old manifest, never a source tree
    // or a recursively computed directory. corpusPath checks the resolved target.
    for (const name of deleted) await rm(corpusPath(policy.id, name), { force: true });
    const project = {
        id: policy.id,
        origin: policy.origin,
        revision,
        selection: policy.roots ? { roots: policy.roots } : { audit: "2026-11-02 SCSS inventory" },
        digest: projectDigest(currentFiles),
        files: currentFiles
    };
    manifest.projects = manifest.projects
        .filter(p => p.id !== policy.id)
        .concat(project)
        .sort((a, b) => a.id.localeCompare(b.id));
    await writeFile(path.join(corpusRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(
        JSON.stringify({
            project: policy.id,
            revision,
            files: files.length,
            bytes: contents.reduce((s, f) => s + f.bytes, 0),
            added: added.length,
            changed: changed.length,
            deleted: deleted.length,
            repaired: damaged.length,
            digest: project.digest
        })
    );
}
