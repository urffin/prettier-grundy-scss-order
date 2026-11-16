import { test } from "uvu";
import * as assert from "uvu/assert";
import nodeAssert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { statistics, summarizeMemory } from "../scripts/benchmark-statistics.mjs";
import { directComparisons, verifyDirectMeasurements } from "../scripts/format-pipeline-comparison.mjs";

function fixture() {
    const commit = "a".repeat(40),
        runtime = { node: "v24.0.0", platform: "linux", arch: "x64", cpu: "test", prettier: "3.8.1" };
    const manifest = {
        commit,
        eligible: ["direct"],
        datasets: ["original", "strict-ready", "loose-ready"].map(input => ({
            project: "test",
            input,
            inputHash: input,
            expected: { loose: "loose", strict: "strict" }
        }))
    };
    const options = { processes: 2, samples: 3, warmup: 1, memoryProcesses: 2 },
        workers = [];
    const contexts = [
        ["original", "loose"],
        ["original", "strict"],
        ["strict-ready", "strict"],
        ["loose-ready", "loose"]
    ];
    for (const [metric, memoryRegime] of [
        ["time", undefined],
        ["memory", "cold"],
        ["memory", "warm"]
    ])
        for (let round = 0; round < 2; round++)
            for (const [input, formatter] of contexts)
                for (const implementation of round % 2 ? ["direct", "stock"] : ["stock", "direct"]) {
                    const w = {
                        stage: "direct",
                        metric,
                        memoryRegime,
                        project: "test",
                        input,
                        formatter,
                        implementation,
                        round,
                        ...{ warmup: 1, samples: 3 },
                        pid: workers.length + 1,
                        timeOriginMs: 1000 + workers.length,
                        runtime,
                        inputHash: input,
                        outputHash: formatter,
                        gcExposed: metric === "memory"
                    };
                    if (metric === "time")
                        ((w.samplesMs = [0, 2, 4].map(v => v + round + (implementation === "direct" ? 10 : 20))),
                            (w.phases = []));
                    else {
                        const before = {
                            rss: 65536,
                            heapTotal: 8192,
                            heapUsed: 2048 + round * 10,
                            external: 64,
                            arrayBuffers: 32,
                            maxRSS: 131072
                        };
                        w.snapshots = {
                            before,
                            after: { ...before, heapUsed: before.heapUsed + 1024 },
                            afterGC: { ...before, heapUsed: before.heapUsed - (implementation === "direct" ? 128 : 64) }
                        };
                    }
                    workers.push(w);
                }
    const key = w => [w.metric, w.memoryRegime ?? "", w.project, w.input, w.formatter, w.implementation].join("/");
    const rows = [];
    for (const w of workers) {
        if (rows.some(r => key(r) === key(w))) continue;
        const records = workers.filter(r => key(r) === key(w));
        const row = {
            stage: "direct",
            metric: w.metric,
            memoryRegime: w.memoryRegime,
            project: w.project,
            input: w.input,
            formatter: w.formatter,
            implementation: w.implementation,
            inputHash: w.inputHash,
            outputHash: w.outputHash,
            runtime
        };
        if (w.metric === "time") {
            row.time = statistics(records.flatMap(w => w.samplesMs));
            row.roundMedians = records.map(w => ({ round: w.round, ...statistics(w.samplesMs) }));
        } else row.memory = summarizeMemory(records);
        rows.push(row);
    }
    const stages = { direct: { status: "complete" } },
        summary = { rows, stages };
    return {
        schemaVersion: 1,
        kind: "format-pipeline-direct",
        commit,
        manifest,
        preflight: { counts: { direct: { checked: 4, matched: 4, different: 0, errors: 0 } } },
        measurement: { schemaVersion: 1, commit, options, workers, stages },
        summary,
        comparisons: directComparisons(rows)
    };
}

test("Direct CI comparison preserves raw timing, signed memory deltas and paired rounds", () => {
    const artifact = fixture(),
        result = verifyDirectMeasurements(artifact);
    assert.is(result.workers, 48);
    assert.is(result.timeSamples, 48);
    assert.is(result.memorySamples, 32);
    assert.is(result.comparisons, 4);
    assert.is(artifact.comparisons[0].time.stock.medianMs, 22.5);
    assert.is(artifact.comparisons[0].time.direct.medianMs, 12.5);
    assert.ok(Math.abs(artifact.comparisons[0].time.changePercent + 44.44444444444444) < 1e-10);
    assert.is(artifact.comparisons[0].memory.warm.direct.deltaAfterGC.heapUsed.medianBytes, -128);
    assert.is(artifact.comparisons[0].memory.warm.changeBytes.deltaAfterGC.heapUsed, -64);
});

test("Direct CI verifier rejects broken isolation, output, coverage and GC evidence", () => {
    const mutations = [
        a => a.measurement.workers.reverse(),
        a => (a.measurement.workers[1].timeOriginMs = a.measurement.workers[0].timeOriginMs),
        a => (a.measurement.workers[0].outputHash = "changed"),
        a => (a.measurement.workers.find(w => w.metric === "memory").gcExposed = false),
        a => a.summary.rows.pop(),
        a => a.comparisons.pop()
    ];
    for (const mutate of mutations) {
        const a = fixture();
        mutate(a);
        nodeAssert.throws(() => verifyDirectMeasurements(a));
    }
});

test("Direct CI verifier independently detects forged quantiles, deltas and comparisons", () => {
    const mutations = [
        a => a.summary.rows[0].time.q1Ms++,
        a => a.measurement.workers[0].samplesMs[0]++,
        a => a.summary.rows.find(r => r.metric === "memory").memory.deltaAfterGC.heapUsed.medianBytes++,
        a => (a.comparisons[0].time.changePercent = 0),
        a => a.comparisons[0].time.rounds[0].directMs++,
        a => a.comparisons[0].memory.cold.changeBytes.afterGC.heapUsed++
    ];
    for (const mutate of mutations) {
        const a = fixture();
        mutate(a);
        nodeAssert.throws(() => verifyDirectMeasurements(a));
    }
});

test("Preparing pipeline inputs cannot overwrite existing measurement evidence", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scss-pipeline-evidence-"));
    try {
        await writeFile(path.join(directory, "report.json"), "preserve");
        await nodeAssert.rejects(
            promisify(execFile)(process.execPath, [
                fileURLToPath(new URL("../scripts/research-format-pipeline.mjs", import.meta.url)),
                "--stage",
                "prepare",
                "--output",
                directory
            ]),
            /preserve existing research evidence/
        );
        assert.is(await readFile(path.join(directory, "report.json"), "utf8"), "preserve");
    } finally {
        nodeAssert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
        nodeAssert.ok(path.basename(directory).startsWith("scss-pipeline-evidence-"));
        await rm(directory, { recursive: true, force: true });
    }
});

test.run();
