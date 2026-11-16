import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { directComparisons, verifyDirectMeasurements } from "./format-pipeline-comparison.mjs";

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--output")
    throw new Error("Pass --input DIRECTORY --output JSON");
const input = path.resolve(args[1]),
    output = path.resolve(args[3]),
    root = fileURLToPath(new URL("../", import.meta.url));
const read = async name => JSON.parse(await fs.readFile(path.join(input, name), "utf8"));
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const hash = text => createHash("sha256").update(text).digest("hex");
const manifest = await read("manifest.json"),
    measurement = await read("report.json"),
    summary = await read("summary.json"),
    preflight = await read("preflight.json");
if (git(["rev-parse", "HEAD"]) !== manifest.commit || git(["status", "--porcelain"]))
    throw new Error("CI report requires a clean checkout at the measured commit");
for (const [file, value] of Object.entries({
    ...measurement.toolHashes,
    ...Object.fromEntries(Object.entries(manifest.sourceHashes).map(([k, v]) => ["../" + k, v]))
}))
    if (hash(await fs.readFile(new URL(file, import.meta.url))) !== value)
        throw new Error("Measured source/tool changed before packaging");
const ciToolHashes = {};
for (const file of [
    "scripts/format-pipeline-comparison.mjs",
    "scripts/format-pipeline-ci-report.mjs",
    "scripts/verify-format-pipeline-ci.mjs",
    ".github/workflows/format-pipeline.yml"
])
    ciToolHashes[file] = hash(await fs.readFile(path.join(root, file)));
const artifact = {
    schemaVersion: 1,
    kind: "format-pipeline-direct",
    commit: manifest.commit,
    version: manifest.version,
    clean: true,
    ci: {
        repository: process.env.GITHUB_REPOSITORY,
        runId: Number(process.env.GITHUB_RUN_ID),
        runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
        workflowRef: process.env.GITHUB_WORKFLOW_REF,
        job: process.env.GITHUB_JOB,
        runnerOS: process.env.RUNNER_OS,
        runnerArch: process.env.RUNNER_ARCH
    },
    method: "Sequential isolated stock/direct workers on one runner; reverse implementation order each round. Warm timing excludes imports. Separate cold-first-use and one-batch-warm memory snapshots retain new output. maxRSS is process-wide; no performance thresholds.",
    ciToolHashes,
    manifest,
    preflight,
    measurement,
    summary,
    comparisons: directComparisons(summary.rows)
};
const verified = verifyDirectMeasurements(artifact);
await fs.writeFile(output, JSON.stringify(artifact, null, 2) + "\n");
console.log(JSON.stringify(verified, null, 2));
