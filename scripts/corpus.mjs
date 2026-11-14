import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const corpusRoot = fileURLToPath(new URL("../tests/fixtures/corpus/real/", import.meta.url));
export const hash = value => createHash("sha256").update(value).digest("hex");

export function corpusPath(project, relative) {
    if (
        !/^[\w.-]+$/.test(project) ||
        project === "." ||
        project === ".." ||
        !relative ||
        relative.includes("\\") ||
        relative.split("/").some(p => !p || p === "." || p === "..") ||
        path.posix.isAbsolute(relative) ||
        relative.includes(":")
    )
        throw new Error("Invalid corpus path");
    const root = path.resolve(corpusRoot, project),
        destination = path.resolve(root, relative);
    if (!destination.startsWith(root + path.sep)) throw new Error("Corpus path escapes project");
    return destination;
}

export function corpusManifest() {
    return JSON.parse(readFileSync(path.join(corpusRoot, "manifest.json"), "utf8"));
}

export function corpusProject(id) {
    const project = corpusManifest().projects.find(p => p.id === id);
    if (!project) throw new Error(`Unknown corpus project: ${id}`);
    return project;
}

export function corpusSources(id) {
    const project = corpusProject(id);
    return project.files.map(file => {
        const source = readFileSync(corpusPath(id, file.path), "utf8");
        if (hash(source) !== file.sha256 || Buffer.byteLength(source) !== file.bytes)
            throw new Error(`Corpus checksum mismatch: ${id}/${file.path}`);
        return { path: file.path, source };
    });
}

export function projectDigest(files) {
    return hash(JSON.stringify(files.map(f => [f.path, f.sha256])));
}
