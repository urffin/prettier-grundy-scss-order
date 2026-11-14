import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "uvu";
import * as assert from "uvu/assert";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const script = path.join(root, "scripts/benchmark.mjs");

test("Benchmark compares revisions in fresh processes, saves samples and cleans its snapshot", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scss-benchmark-test-"));
    try {
        const output = path.join(directory, "report.json"),
            summary = path.join(directory, "summary.txt");
        const { stdout } = await run(
            process.execPath,
            [
                script,
                "--compare",
                "HEAD",
                "--scenario",
                "comments",
                "--warmup",
                "0",
                "--samples",
                "1",
                "--processes",
                "2",
                "--output",
                output
            ],
            {
                cwd: root,
                windowsHide: true,
                maxBuffer: 8 * 1024 * 1024,
                env: { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory, GITHUB_STEP_SUMMARY: summary }
            }
        );
        const report = JSON.parse(stdout);
        assert.equal(report, JSON.parse(await readFile(output, "utf8")));
        assert.is(report.rows.length, 4);
        assert.is(report.workers.length, 16);
        for (const row of report.rows) {
            const matchingWorkers = report.workers.filter(w => w.safety === row.safety && w.measurement === row.measurement);
            const current = matchingWorkers.find(w => w.target === "current").rows[0].outputHash;
            const baseline = matchingWorkers.find(w => w.target === "baseline").rows[0].outputHash;
            assert.is(row.outputMatches, current === baseline);
            assert.is(row.current.samplesMs.length, 2);
            assert.is(row.baseline.samplesMs.length, 2);
            assert.ok(Number.isFinite(row.current.medianMs));
            for (const stats of [row.current, row.baseline]) {
                assert.is(stats.medianMs, (stats.samplesMs[0] + stats.samplesMs[1]) / 2);
                assert.ok(stats.q1Ms <= stats.medianMs && stats.medianMs <= stats.q3Ms);
            }
        }
        for (const worker of report.workers) {
            assert.ok(worker.pid !== process.pid);
            assert.is(worker.runtime.node, process.version);
            assert.ok(worker.rows[0].inputHash && worker.rows[0].outputHash);
        }
        assert.equal(
            report.workers.slice(0, 2).map(w => w.target),
            ["current", "baseline"]
        );
        assert.equal(
            report.workers.slice(8, 10).map(w => w.target),
            ["baseline", "current"]
        );
        assert.ok((await readFile(summary, "utf8")).includes("| comments | strict | sort |"));
        assert.equal((await readdir(directory)).sort(), ["report.json", "summary.txt"]);
        let failure;
        try {
            await run(
                process.execPath,
                [
                    script,
                    "--compare",
                    "HEAD",
                    "--scenario",
                    "independent-100",
                    "--measurement",
                    "sort",
                    "--safety",
                    "loose",
                    "--warmup",
                    "0",
                    "--samples",
                    "1",
                    "--processes",
                    "1",
                    "--output",
                    path.join(directory, "missing", "report.json")
                ],
                {
                    cwd: root,
                    windowsHide: true,
                    env: { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory }
                }
            );
        } catch (caught) {
            failure = caught;
        }
        assert.ok(failure && failure.code !== 0);
        assert.equal((await readdir(directory)).sort(), ["report.json", "summary.txt"]);
    } finally {
        const relative = path.relative(path.resolve(tmpdir()), path.resolve(directory));
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
            throw new Error("Invalid test cleanup path");
        await rm(directory, { recursive: true, force: true });
    }
});

test("Benchmark rejects invalid arguments and missing revisions before starting workers", async () => {
    for (const args of [
        ["--samples", "0"],
        ["--scenario", "missing"],
        ["--safety", "off"],
        ["--compare", "HEAD~999999"]
    ]) {
        let error;
        try {
            await run(process.execPath, [script, ...args], { cwd: root, windowsHide: true });
        } catch (caught) {
            error = caught;
        }
        assert.ok(error && error.code !== 0);
        assert.not.ok(error.stderr.includes("Benchmark current:"));
    }
});
test.run();
