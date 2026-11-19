import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import stock from "../src/index.mjs";
import { presets } from "../src/presets/index.mjs";
import { corpusManifest, corpusSources, hash } from "./corpus.mjs";
import { verifyDirectMeasurements } from "./format-pipeline-comparison.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const name = process.argv[i];
    if (!["--input", "--commit", "--output"].includes(name) || args[name] || !process.argv[i + 1])
        throw new Error("Pass --input JSON --commit SHA [--output VERIFICATION_JSON]");
    args[name] = process.argv[i + 1];
}
assert.ok(args["--input"] && /^[a-f0-9]{40}$/.test(args["--commit"]));
const root = fileURLToPath(new URL("../", import.meta.url)),
    commit = args["--commit"];
const git = (...args) => execFileSync("git", args, { cwd: root, windowsHide: true });
const text = (...args) =>
    git(...args)
        .toString("utf8")
        .trim();
assert.equal(text("rev-parse", "HEAD"), commit, "Verify from the measured checkout");
assert.equal(
    text(
        "diff",
        "--name-only",
        commit,
        "--",
        "src",
        "scripts",
        "tests/fixtures/corpus",
        "package.json",
        "package-lock.json",
        ".github/workflows"
    ),
    "",
    "Verification inputs differ from the commit"
);
const artifact = JSON.parse(await fs.readFile(args["--input"], "utf8")),
    result = verifyDirectMeasurements(artifact);
const { manifest, measurement: report, preflight, ci } = artifact;
assert.equal(artifact.commit, commit);
assert.equal(artifact.clean, true);
assert.equal(ci.repository, "urffin/prettier-grundy-scss-order");
assert.ok(Number.isInteger(ci.runId) && ci.runId > 0 && Number.isInteger(ci.runAttempt) && ci.runAttempt > 0);
assert.ok(ci.workflowRef.startsWith(ci.repository + "/.github/workflows/format-pipeline.yml@"));
assert.equal(ci.job, "compare");
assert.equal(ci.runnerOS, "Linux");
assert.equal(ci.runnerArch, "X64");
assert.equal(result.runtime.platform, "linux");
assert.equal(result.runtime.arch, "x64");
assert.match(result.runtime.node, /^v24\./);
assert.deepEqual(report.options, { processes: 4, samples: 11, warmup: 5, memoryProcesses: 4 });
const packageJSON = JSON.parse(git("show", commit + ":package.json")),
    lock = JSON.parse(git("show", commit + ":package-lock.json"));
assert.equal(artifact.version, packageJSON.version);
assert.equal(manifest.version, packageJSON.version);
for (const [key, name] of [
    ["prettier", "prettier"],
    ["postcss", "postcss"],
    ["postcssScss", "postcss-scss"]
])
    assert.equal(result.runtime[key], lock.packages["node_modules/" + name].version);
assert.equal(report.dependencyLockHash, hash(git("show", commit + ":package-lock.json")));
assert.equal(report.manifestHash, hash(JSON.stringify(manifest, null, 2) + "\n"));
const sourceFiles = text("ls-tree", "-r", "--name-only", commit, "--", "src").split("\n");
assert.deepEqual(Object.keys(manifest.sourceHashes).sort(), sourceFiles.sort());
for (const [file, digest] of Object.entries(manifest.sourceHashes))
    assert.equal(digest, hash(git("show", commit + ":" + file)), file);
const toolFiles = [
    "research-format-pipeline.mjs",
    "format-pipeline-worker.mjs",
    "format-pipeline-variants.mjs",
    "processor-reference.mjs",
    "corpus.mjs",
    "benchmark-statistics.mjs"
];
assert.deepEqual(Object.keys(report.toolHashes).sort(), toolFiles.sort());
for (const [file, digest] of Object.entries(report.toolHashes))
    assert.equal(digest, hash(git("show", commit + ":scripts/" + file)), file);
const ciFiles = [
    "scripts/format-pipeline-comparison.mjs",
    "scripts/format-pipeline-ci-report.mjs",
    "scripts/verify-format-pipeline-ci.mjs",
    ".github/workflows/format-pipeline.yml"
];
assert.deepEqual(Object.keys(artifact.ciToolHashes).sort(), ciFiles.sort());
for (const [file, digest] of Object.entries(artifact.ciToolHashes))
    assert.equal(digest, hash(git("show", commit + ":" + file)), file);
const projects = corpusManifest().projects;
assert.deepEqual(
    manifest.projects,
    projects.map(p => ({ id: p.id, revision: p.revision, digest: p.digest, files: p.files.length }))
);
assert.equal(manifest.datasets.length, projects.length * 3);
const seen = new Set(),
    bundle = (files, outputs) => JSON.stringify(files.map((f, i) => [f.path, outputs[i]]));
const options = formatter => ({
    parser: "scss",
    ...(formatter === "plain" ? {} : { plugins: [stock], grundyScssSorterSafety: formatter })
});
let rebuiltReferences = 0;
for (const project of projects) {
    const original = corpusSources(project.id),
        ready = {};
    for (const formatter of ["strict", "loose"]) {
        ready[formatter] = [];
        for (const f of original) ready[formatter].push(await prettier.format(f.source, options(formatter)));
    }
    for (const input of ["original", "strict-ready", "loose-ready"]) {
        const files = original.map((f, i) => ({
            path: f.path,
            source: input === "original" ? f.source : ready[input.split("-")[0]][i]
        }));
        const d = manifest.datasets.find(d => d.project === project.id && d.input === input);
        assert.ok(d);
        assert.ok(!seen.has(d.file));
        seen.add(d.file);
        assert.equal(d.files, files.length);
        assert.equal(
            d.bytes,
            files.reduce((n, f) => n + Buffer.byteLength(f.source), 0)
        );
        assert.equal(
            d.inputHash,
            hash(
                bundle(
                    files,
                    files.map(f => f.source)
                )
            )
        );
        let plain;
        for (const formatter of ["plain", "loose", "strict"]) {
            const outputs = [];
            for (const f of files) {
                outputs.push(await prettier.format(f.source, options(formatter)));
                rebuiltReferences++;
            }
            plain ??= outputs;
            assert.equal(d.expected[formatter], hash(bundle(files, outputs)));
            assert.equal(d.changedFromInput[formatter], outputs.filter((s, i) => s !== files[i].source).length);
            assert.equal(d.equalityWithPlainFiles[formatter], outputs.filter((s, i) => s === plain[i]).length);
        }
    }
}
const fixtureDirs = await fs.readdir(path.join(root, "tests/fixtures/corpus/regressions"), { withFileTypes: true });
let fixtureCount = 2;
for (const f of fixtureDirs)
    if (f.isDirectory()) {
        try {
            await fs.access(path.join(root, "tests/fixtures/corpus/regressions", f.name, "input.scss"));
            fixtureCount++;
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
const files = projects.reduce((n, p) => n + p.files.length, 0),
    cases = files * 3 * 2 + fixtureCount * Object.keys(presets).length * 2 * 2 * 2;
assert.equal(preflight.fixtures, fixtureCount);
assert.equal(preflight.counts.direct.checked, cases);
assert.equal(preflight.baselineCases, files * 3 * 3);
assert.deepEqual(artifact.summary.stages, report.stages);
const verification = {
    ...result,
    commit,
    version: artifact.version,
    runId: ci.runId,
    runAttempt: ci.runAttempt,
    files,
    rebuiltReferences,
    exactOutputCases: cases,
    productionSourceHashesVerified: true,
    toolHashesVerified: true
};
if (args["--output"]) await fs.writeFile(args["--output"], JSON.stringify(verification, null, 2) + "\n");
console.log(JSON.stringify(verification, null, 2));
