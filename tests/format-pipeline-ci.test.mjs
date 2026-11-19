import { test } from "uvu";
import * as assert from "uvu/assert";
import nodeAssert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
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
        for (const stage of ["prepare", "prepare-direct"])
            await nodeAssert.rejects(
                promisify(execFile)(process.execPath, [
                    fileURLToPath(new URL("../scripts/research-format-pipeline.mjs", import.meta.url)),
                    "--stage",
                    stage,
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

test("Direct preparation and workers bypass prototypes and reject public mismatches", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scss-pipeline-direct-"));
    const script = fileURLToPath(new URL("../scripts/research-format-pipeline.mjs", import.meta.url));
    const root = fileURLToPath(new URL("../", import.meta.url));
    const execute = promisify(execFile);
    try {
        const loader = path.join(directory, "isolation-loader.mjs");
        await writeFile(
            loader,
            `
export async function load(url, context, nextLoad) {
    if (url.endsWith('/format-pipeline-variants.mjs')) throw new Error('Historical prototypes blocked');
    const result = await nextLoad(url, context);
    if (url === ${JSON.stringify(new URL("../src/index.mjs", import.meta.url).href)} && process.env.SCSS_TEST_PUBLIC_MISMATCH) {
        result.source += \`\nconst parse = parsers.scss.parse;
parsers.scss.parse = function(text, options) {
    if (text.includes('sourceMappingURL=missing.css.map')) throw new Error('Injected public parse failure');
    return parse(text, options);
};\`;
    }
    return result;
}
`
        );
        const env = {
            ...process.env,
            NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-loader=${pathToFileURL(loader).href}`
        };
        const run = (stage, output = directory, extraEnv = {}) =>
            execute(
                process.execPath,
                [
                    script,
                    "--stage",
                    stage,
                    "--project",
                    "landos-new",
                    "--output",
                    output,
                    "--processes",
                    "1",
                    "--warmup",
                    "0",
                    "--samples",
                    "1",
                    "--memory-processes",
                    "1"
                ],
                { env: { ...env, ...extraEnv }, windowsHide: true }
            );
        await run("prepare-direct");
        const read = async name => JSON.parse(await readFile(path.join(directory, name), "utf8"));
        const preflight = await read("preflight.json"),
            manifest = await read("manifest.json");
        assert.equal(Object.keys(preflight.counts), ["direct"]);
        assert.equal(preflight.eligible, ["direct"]);
        const cases = manifest.datasets.reduce((n, d) => n + d.files * 2, 0) + preflight.fixtures * 5 * 2 * 2 * 2;
        assert.equal(preflight.counts.direct, { checked: cases, matched: cases, different: 0, errors: 0 });
        assert.ok(preflight.cases.every(c => c.serialized === 0 && c.skipped === 0));
        const tools = await readdir(path.join(directory, "executed-tools"));
        assert.is(tools.length, 5);
        assert.ok(tools.includes("processor-reference.mjs") && !tools.includes("format-pipeline-variants.mjs"));
        for (const implementation of ["stock", "direct"]) {
            const config = {
                root,
                stage: "direct",
                implementation,
                metric: "time",
                formatter: "strict",
                warmup: 0,
                samples: 1,
                dataset: path.join(directory, manifest.datasets[0].file)
            };
            const { stdout } = await execute(
                process.execPath,
                [fileURLToPath(new URL("../scripts/format-pipeline-worker.mjs", import.meta.url)), JSON.stringify(config)],
                { env, windowsHide: true }
            );
            assert.is(JSON.parse(stdout).outputHash, manifest.datasets[0].expected.strict);
        }
        await nodeAssert.rejects(run("variants"), /Use --stage prepare in a fresh output directory/);
        assert.equal(await read("manifest.json"), manifest);
        await nodeAssert.rejects(run("prepare", path.join(directory, "historical")), /Historical prototypes blocked/);
        const failed = path.join(directory, "failed");
        await nodeAssert.rejects(
            run("prepare-direct", failed, { SCSS_TEST_PUBLIC_MISMATCH: "1" }),
            /Public direct failed the Processor exact-output gate/
        );
        const failure = JSON.parse(await readFile(path.join(failed, "preflight.json"), "utf8"));
        assert.ok(failure.counts.direct.errors > 0);
        assert.equal(failure.eligible, []);
    } finally {
        nodeAssert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
        nodeAssert.ok(path.basename(directory).startsWith("scss-pipeline-direct-"));
        await rm(directory, { recursive: true, force: true });
    }
});

test.run();
