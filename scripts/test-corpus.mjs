import { writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import prettier from "prettier";
import scss from "postcss-scss";
import plugin from "../src/index.mjs";
import { corpusManifest, corpusSources, corpusPath, projectDigest } from "./corpus.mjs";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output"))
    throw new Error("Usage: npm run test:corpus -- [--output FILE]");
const manifest = corpusManifest(),
    presets = ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"];
const clean = text => text.replace(/\s+/g, " ").trim();
function inventory(source) {
    const records = [];
    function visit(node, context) {
        const own =
            node.type === "decl" ? ["decl", node.prop, node.value, !!node.important]
            : node.type === "rule" ? ["rule", clean(node.selector)]
            : node.type === "atrule" ? ["atrule", node.name, clean(node.params)]
            : node.type === "comment" ? ["comment", clean(node.text)]
            : [node.type];
        if (node.type !== "root") records.push(JSON.stringify([context, own]));
        const next = node.type === "root" ? context : context.concat([own]);
        for (const child of node.nodes ?? []) visit(child, next);
    }
    visit(scss.parse(source), []);
    return records.sort();
}
function diskFiles(root, relative = "") {
    const files = [];
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
        const name = path.posix.join(relative, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Corpus must not depend on symlinks: ${name}`);
        if (entry.isDirectory()) files.push(...diskFiles(root, name));
        else files.push(name);
    }
    return files.sort();
}
const report = {
    schemaVersion: 1,
    corpus: manifest.projects.map(p => ({ id: p.id, revision: p.revision, digest: p.digest, files: p.files.length })),
    files: 0,
    cases: 0,
    failures: []
};
for (const project of manifest.projects) {
    if (projectDigest(project.files) !== project.digest) throw new Error(`Corpus digest mismatch: ${project.id}`);
    const sources = corpusSources(project.id);
    const stored = diskFiles(path.dirname(corpusPath(project.id, "placeholder")));
    if (JSON.stringify(stored) !== JSON.stringify(project.files.map(f => f.path).sort()))
        throw new Error(`Unmanifested or missing files: ${project.id}`);
    for (const file of sources) {
        const common = { parser: "scss", printWidth: 100, endOfLine: "lf" };
        const before = inventory(await prettier.format(file.source, { ...common, plugins: [] }));
        report.files++;
        for (const preset of presets)
            for (const safety of ["strict", "loose"])
                for (const split of [false, true]) {
                    const options = {
                        ...common,
                        plugins: [plugin],
                        grundyScssSorterPreset: preset,
                        grundyScssSorterSafety: safety,
                        grundyScssSorterSplitGroup: split
                    };
                    report.cases++;
                    try {
                        const output = await prettier.format(file.source, options);
                        if ((await prettier.format(output, options)) !== output) throw new Error("Not idempotent");
                        const after = inventory(output);
                        if (JSON.stringify(before) !== JSON.stringify(after)) {
                            const missing = before.filter(r => !after.includes(r)).slice(0, 2),
                                extra = after.filter(r => !before.includes(r)).slice(0, 2);
                            throw new Error("AST inventory differs: " + JSON.stringify({ missing, extra }));
                        }
                    } catch (error) {
                        report.failures.push({
                            project: project.id,
                            file: file.path,
                            preset,
                            safety,
                            split,
                            error: error.message
                        });
                    }
                }
    }
    process.stderr.write(`Corpus ${project.id}: ${sources.length} files, ${report.failures.length} failures\n`);
}
report.valid = report.failures.length === 0;
if (args.length) await writeFile(path.resolve(args[1]), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!report.valid) process.exitCode = 1;
