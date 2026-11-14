import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "uvu";
import * as assert from "uvu/assert";
import { memoryFields, statistics, summarizeMemory } from "../scripts/benchmark-statistics.mjs";

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
                "--memory-processes",
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
        assert.is(report.schemaVersion, 2);
        assert.is(report.method.metric, "all");
        assert.is(report.rows.length, 4);
        assert.is(report.workers.length, 16);
        assert.is(report.memoryRows.length, 4);
        assert.is(report.memoryWorkers.length, 16);
        assert.is(new Set([...report.workers, ...report.memoryWorkers].map(w => `${w.pid}:${w.timeOriginMs}`)).size, 32);
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
        for (const worker of [...report.workers, ...report.memoryWorkers]) {
            assert.ok(worker.pid !== process.pid);
            assert.ok(Number.isFinite(worker.timeOriginMs) && worker.timeOriginMs > 0);
            assert.is(worker.runtime.node, process.version);
            assert.ok(worker.rows[0].inputHash && worker.rows[0].outputHash);
            assert.is(worker.gcExposed, worker.metric === "memory");
            if (worker.metric === "memory") {
                assert.is(worker.rows.length, 1);
                assert.is(worker.scenario, "comments");
                assert.is(worker.rows[0].samplesMs, undefined);
                const snapshots = worker.rows[0].snapshots;
                for (const stage of ["before", "after", "afterGC"])
                    for (const field of memoryFields)
                        assert.ok(Number.isFinite(snapshots[stage][field]) && snapshots[stage][field] >= 0);
                assert.ok(snapshots.after.maxRSS >= snapshots.before.maxRSS);
                assert.ok(snapshots.afterGC.maxRSS >= snapshots.after.maxRSS);
            }
        }
        for (const row of report.memoryRows) {
            const select = list => list.filter(w => w.safety === row.safety && w.measurement === row.measurement);
            for (const target of ["current", "baseline"]) {
                const records = select(report.memoryWorkers)
                    .filter(w => w.target === target)
                    .map(w => w.rows[0]);
                assert.is(records.length, 2);
                assert.equal(row[target], summarizeMemory(records));
                const timed = select(report.workers).find(w => w.target === target).rows[0];
                for (const record of records) {
                    assert.is(record.outputHash, timed.outputHash);
                    assert.is(record.inputHash, timed.inputHash);
                }
            }
            assert.ok(row.outputMatches);
            assert.equal(row.changeBytes, {
                heapUsedAfter: row.current.after.heapUsed.medianBytes - row.baseline.after.heapUsed.medianBytes,
                heapUsedAfterGC: row.current.afterGC.heapUsed.medianBytes - row.baseline.afterGC.heapUsed.medianBytes,
                maxRSS: row.current.afterGC.maxRSS.medianBytes - row.baseline.afterGC.maxRSS.medianBytes
            });
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
        assert.equal(
            report.memoryWorkers.slice(0, 2).map(w => w.target),
            ["current", "baseline"]
        );
        assert.equal(
            report.memoryWorkers.slice(8, 10).map(w => w.target),
            ["baseline", "current"]
        );
        assert.ok((await readFile(summary, "utf8")).includes("### Memory benchmark"));
        assert.ok((await readFile(summary, "utf8")).includes("Δ maxRSS"));
        assert.equal((await readdir(directory)).sort(), ["report.json", "summary.txt"]);
        let failure;
        try {
            await run(
                process.execPath,
                [
                    script,
                    "--compare",
                    "HEAD",
                    "--metric",
                    "memory",
                    "--memory-processes",
                    "1",
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
        ["--metric", "rss"],
        ["--memory-processes", "0"],
        ["--memory-processes", "1.5"],
        ["--metric", "time", "--metric", "memory"],
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
test("Memory samples isolate every scenario and safety mode; time-only skips memory", async () => {
    const { stdout } = await run(
        process.execPath,
        [script, "--metric", "memory", "--measurement", "sort", "--memory-processes", "1"],
        { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    );
    const report = JSON.parse(stdout);
    assert.equal(report.rows, []);
    assert.equal(report.workers, []);
    assert.is(report.memoryRows.length, 14);
    assert.is(report.memoryWorkers.length, 14);
    assert.is(new Set(report.memoryWorkers.map(w => `${w.pid}:${w.timeOriginMs}`)).size, 14);
    assert.is(new Set(report.memoryWorkers.map(w => w.scenario)).size, 7);
    assert.equal([...new Set(report.memoryWorkers.map(w => w.safety))].sort(), ["loose", "strict"]);
    for (const worker of report.memoryWorkers) {
        assert.is(worker.rows.length, 1);
        assert.is(worker.rows[0].scenario, worker.scenario);
        assert.is(worker.metric, "memory");
        assert.ok(worker.gcExposed);
    }
    const timed = JSON.parse(
        (
            await run(
                process.execPath,
                [
                    script,
                    "--metric",
                    "time",
                    "--scenario",
                    "independent-100",
                    "--safety",
                    "loose",
                    "--measurement",
                    "sort",
                    "--warmup",
                    "0",
                    "--samples",
                    "1",
                    "--processes",
                    "1"
                ],
                { cwd: root, windowsHide: true }
            )
        ).stdout
    );
    assert.is(timed.rows.length, 1);
    assert.is(timed.workers.length, 1);
    assert.equal(timed.memoryRows, []);
    assert.equal(timed.memoryWorkers, []);
    assert.not.ok(timed.workers[0].gcExposed);
});

test("Memory statistics retain signed per-process deltas and byte units", () => {
    const records = [
        [0, 50, 20],
        [100, 1, 2],
        [101, 102, 100]
    ].map(values => ({
        snapshots: Object.fromEntries(
            ["before", "after", "afterGC"].map((stage, i) => [
                stage,
                Object.fromEntries(memoryFields.map(field => [field, values[i]]))
            ])
        )
    }));
    const stats = summarizeMemory(records);
    assert.equal(stats.deltaAfter.heapUsed.samplesBytes, [50, -99, 1]);
    assert.is(stats.deltaAfter.heapUsed.medianBytes, 1);
    assert.is(stats.after.heapUsed.medianBytes - stats.before.heapUsed.medianBytes, -50);
    assert.equal(stats.deltaAfterGC.heapUsed.samplesBytes, [20, -98, -1]);
    assert.is(stats.deltaAfterGC.heapUsed.medianBytes, -1);
    assert.is(stats.deltaAfter.maxRSS, undefined);
    assert.equal(statistics([-10, 0, 10, 20], "Bytes"), {
        medianBytes: 5,
        q1Bytes: -2.5,
        q3Bytes: 12.5,
        samplesBytes: [-10, 0, 10, 20]
    });
});

test("Memory worker refuses to run without explicit GC support", async () => {
    let error;
    try {
        await run(
            process.execPath,
            [
                path.join(root, "scripts/benchmark-worker.mjs"),
                JSON.stringify({ metric: "memory", scenario: "independent-100" })
            ],
            { cwd: root, windowsHide: true }
        );
    } catch (caught) {
        error = caught;
    }
    assert.ok(error && error.code !== 0);
    assert.ok(error.stderr.includes("Memory worker requires --expose-gc"));
});

test.run();
