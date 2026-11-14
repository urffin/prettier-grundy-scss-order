import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "uvu";
import * as assert from "uvu/assert";
import { corpusPath, hash, projectDigest } from "../scripts/corpus.mjs";

const run = promisify(execFile),
    root = fileURLToPath(new URL("../", import.meta.url));
test("Corpus paths reject escapes and absolute source paths", () => {
    for (const [project, file] of [
        ["..", "a.scss"],
        ["a/b", "a.scss"],
        ["test", "../a.scss"],
        ["test", "/a.scss"],
        ["test", "C:/a.scss"],
        ["test", "a\\b.scss"],
        ["test", "a//b.scss"]
    ])
        assert.throws(() => corpusPath(project, file));
    assert.ok(corpusPath("test", "styles/a.scss").endsWith(path.join("test", "styles", "a.scss")));
});

test("Corpus refresh discovers committed styles, detects growth and repairs snapshots without changing sources", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scss-corpus-test-"));
    try {
        const library = path.join(directory, "library"),
            source = path.join(directory, "source");
        const scripts = path.join(library, "scripts"),
            snapshots = path.join(library, "tests/fixtures/corpus/real");
        await mkdir(scripts, { recursive: true });
        await mkdir(snapshots, { recursive: true });
        await mkdir(path.join(source, "styles"), { recursive: true });
        for (const file of ["corpus.mjs", "update-corpus.mjs"])
            await copyFile(path.join(root, "scripts", file), path.join(scripts, file));
        await writeFile(
            path.join(snapshots, "selection.json"),
            JSON.stringify({
                projects: [{ id: "example", origin: { kind: "local-git", repository: "example" }, roots: ["styles"] }]
            })
        );
        const git = async (...args) =>
            (
                await run(
                    "git",
                    [
                        "-c",
                        "core.autocrlf=false",
                        "-c",
                        "user.name=Corpus test",
                        "-c",
                        "user.email=corpus@example.invalid",
                        "-c",
                        "commit.gpgsign=false",
                        "-c",
                        "core.hooksPath=",
                        ...args
                    ],
                    { cwd: source, windowsHide: true }
                )
            ).stdout.trim();
        await git("init", "--quiet");
        await writeFile(path.join(source, "styles/a.scss"), ".a {\r\n  color:red;\r\n}\r\n");
        await git("add", ".");
        await git("commit", "--quiet", "-m", "Initial styles");
        const revision = await git("rev-parse", "HEAD");
        const update = async (...args) => {
            try {
                const result = await run(
                    process.execPath,
                    [path.join(scripts, "update-corpus.mjs"), "--project", "example", "--root", source, ...args],
                    { cwd: library, windowsHide: true }
                );
                return { code: 0, ...result };
            } catch (error) {
                return error;
            }
        };
        const readManifest = async () => JSON.parse(await readFile(path.join(snapshots, "manifest.json"), "utf8"));
        assert.is((await update()).code, 0);
        let manifest = await readManifest(),
            project = manifest.projects[0];
        assert.is(project.revision, revision);
        assert.is(project.files.length, 1);
        assert.is(project.digest, projectDigest(project.files));
        assert.is(await readFile(path.join(snapshots, "example/styles/a.scss"), "utf8"), ".a {\n  color:red;\n}\n");
        assert.ok((await readFile(path.join(source, "styles/a.scss"), "utf8")).includes("\r\n"));
        assert.is(await git("status", "--porcelain"), "");
        // Uncommitted development must not silently change a pinned benchmark.
        await writeFile(path.join(source, "styles/b.css"), ".b { width: 2px; }\n");
        assert.ok(JSON.parse((await update("--check")).stdout).current);
        await writeFile(path.join(source, "styles/a.scss"), ".a { color: blue; }\n");
        await git("add", ".");
        await git("commit", "--quiet", "-m", "More styles");
        const before = JSON.stringify(await readManifest());
        let result = await update("--check");
        assert.is(result.code, 1);
        assert.equal(JSON.parse(result.stdout).added, ["styles/b.css"]);
        assert.equal(JSON.parse(result.stdout).changed, ["styles/a.scss"]);
        assert.is(JSON.stringify(await readManifest()), before);
        assert.is((await update()).code, 0);
        project = (await readManifest()).projects[0];
        assert.is(project.files.length, 2);
        for (const file of project.files)
            assert.is(hash(await readFile(path.join(snapshots, "example", file.path))), file.sha256);
        await writeFile(path.join(snapshots, "example/styles/a.scss"), "broken snapshot");
        result = await update("--check");
        assert.is(result.code, 1);
        assert.equal(JSON.parse(result.stdout).damaged, ["styles/a.scss"]);
        assert.is((await update()).code, 0);
        assert.ok(JSON.parse((await update("--check")).stdout).current);
        await git("rm", "--quiet", "styles/a.scss");
        await git("commit", "--quiet", "-m", "Remove old style");
        assert.equal(JSON.parse((await update("--check")).stdout).deleted, ["styles/a.scss"]);
        assert.is((await update()).code, 0);
        const missing = await readFile(path.join(snapshots, "example/styles/a.scss")).catch(error => error);
        assert.is(missing.code, "ENOENT");
        const pinned = (await readManifest()).projects[0].revision;
        await writeFile(path.join(source, "unrelated.txt"), "unrelated");
        await git("add", ".");
        await git("commit", "--quiet", "-m", "Unrelated development");
        assert.ok(JSON.parse((await update("--check")).stdout).current);
        assert.is((await readManifest()).projects[0].revision, pinned);
        result = await update("--revision", "HEAD", "--revision", "HEAD");
        assert.ok(result.code !== 0 && result.stderr.includes("Duplicate --revision"));
        assert.is(await git("status", "--porcelain"), "");
    } finally {
        const relative = path.relative(path.resolve(tmpdir()), path.resolve(directory));
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
            throw new Error("Invalid test cleanup path");
        await rm(directory, { recursive: true, force: true });
    }
});

test.run();
