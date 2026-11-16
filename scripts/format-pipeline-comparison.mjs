import assert from "node:assert/strict";

const fields = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers", "maxRSS"];
const stages = ["before", "after", "afterGC", "deltaAfter", "deltaAfterGC"];
const key = w => [w.metric, w.memoryRegime ?? "", w.project, w.input, w.formatter, w.implementation].join("/");
const contextKey = w => [w.project, w.input, w.formatter].join("/");
const percent = (next, previous) => (next / previous - 1) * 100;

export function directComparisons(rows) {
    const result = [];
    for (const stock of rows.filter(r => r.stage === "direct" && r.metric === "time" && r.implementation === "stock")) {
        const find = (metric, implementation, regime) => {
            const row = rows.find(
                r =>
                    r.stage === "direct" &&
                    contextKey(r) === contextKey(stock) &&
                    r.metric === metric &&
                    r.implementation === implementation &&
                    r.memoryRegime === regime
            );
            if (!row) throw new Error("Incomplete direct comparison");
            return row;
        };
        const direct = find("time", "direct");
        result.push({
            project: stock.project,
            input: stock.input,
            formatter: stock.formatter,
            inputHash: stock.inputHash,
            outputHash: stock.outputHash,
            outputMatches: stock.outputHash === direct.outputHash,
            time: {
                stock: stock.time,
                direct: direct.time,
                changePercent: percent(direct.time.medianMs, stock.time.medianMs),
                rounds: stock.roundMedians.map(s => {
                    const d = direct.roundMedians.find(r => r.round === s.round);
                    return {
                        round: s.round,
                        stockMs: s.medianMs,
                        directMs: d.medianMs,
                        changePercent: percent(d.medianMs, s.medianMs)
                    };
                })
            },
            memory: Object.fromEntries(
                ["cold", "warm"].map(regime => {
                    const s = find("memory", "stock", regime).memory,
                        d = find("memory", "direct", regime).memory;
                    const changeBytes = Object.fromEntries(
                        stages.map(stage => [
                            stage,
                            Object.fromEntries(
                                Object.keys(s[stage]).map(f => [f, d[stage][f].medianBytes - s[stage][f].medianBytes])
                            )
                        ])
                    );
                    return [regime, { stock: s, direct: d, changeBytes }];
                })
            )
        });
    }
    return result;
}

// Deliberately recalculate quantiles and per-process deltas independently of
// benchmark-statistics.mjs and the report builder.
export function verifyDirectMeasurements(artifact) {
    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.kind, "format-pipeline-direct");
    const { measurement: report, manifest, summary, preflight } = artifact;
    assert.equal(report.schemaVersion, 1);
    assert.deepEqual(Object.keys(report.stages), ["direct"]);
    assert.equal(report.stages.direct.status, "complete");
    assert.equal(report.commit, manifest.commit);
    assert.equal(artifact.commit, manifest.commit);
    assert.ok(manifest.eligible.includes("direct"));
    assert.equal(preflight.counts.direct.checked, preflight.counts.direct.matched);
    assert.equal(preflight.counts.direct.different, 0);
    assert.equal(preflight.counts.direct.errors, 0);
    const { processes, samples, warmup, memoryProcesses } = report.options;
    for (const n of [processes, samples, memoryProcesses]) assert.ok(Number.isInteger(n) && n > 0);
    assert.ok(Number.isInteger(warmup) && warmup >= 0);
    const expected = [];
    const append = (metric, regime, rounds) => {
        for (let round = 0; round < rounds; round++)
            for (let di = 0; di < manifest.datasets.length; di++) {
                const d = manifest.datasets[di],
                    formats = ["plain", "loose", "strict"],
                    offset = (round + di) % 3;
                for (const formatter of formats.slice(offset).concat(formats.slice(0, offset))) {
                    if (formatter === "plain" || (d.input !== "original" && d.input !== formatter + "-ready")) continue;
                    const impl = round % 2 ? ["direct", "stock"] : ["stock", "direct"];
                    for (const implementation of impl)
                        expected.push({
                            metric,
                            memoryRegime: regime,
                            project: d.project,
                            input: d.input,
                            formatter,
                            implementation,
                            round
                        });
                }
            }
    };
    append("time", undefined, processes);
    for (const regime of ["cold", "warm"]) append("memory", regime, memoryProcesses);
    assert.equal(report.workers.length, expected.length);
    const instances = new Set(),
        groups = new Map();
    let lastStart = 0,
        timeSamples = 0,
        memorySamples = 0;
    for (let i = 0; i < expected.length; i++) {
        const w = report.workers[i],
            e = expected[i];
        for (const f of Object.keys(e)) assert.equal(w[f], e[f], "Worker scheduling: " + f);
        assert.equal(w.stage, "direct");
        assert.deepEqual(w.runtime, report.workers[0].runtime);
        assert.ok(Number.isInteger(w.pid) && w.pid > 0 && w.timeOriginMs > lastStart);
        lastStart = w.timeOriginMs;
        const id = w.pid + "/" + w.timeOriginMs;
        assert.ok(!instances.has(id));
        instances.add(id);
        const d = manifest.datasets.find(d => d.project === w.project && d.input === w.input);
        assert.equal(w.inputHash, d.inputHash);
        assert.equal(w.outputHash, d.expected[w.formatter]);
        assert.equal(w.warmup, warmup);
        assert.equal(w.samples, samples);
        assert.equal(w.gcExposed, w.metric === "memory");
        if (w.metric === "memory") {
            memorySamples++;
            let max = 0;
            for (const stage of ["before", "after", "afterGC"]) {
                const s = w.snapshots[stage];
                for (const f of fields) assert.ok(Number.isFinite(s[f]) && s[f] >= 0);
                assert.ok(s.heapUsed <= s.heapTotal && s.maxRSS >= max && s.maxRSS % 1024 === 0);
                max = s.maxRSS;
            }
            assert.equal(w.samplesMs, undefined);
        } else {
            assert.equal(w.samplesMs.length, samples);
            assert.deepEqual(w.phases, []);
            assert.ok(w.samplesMs.every(v => Number.isFinite(v) && v > 0));
            timeSamples += samples;
        }
        const g = groups.get(key(w)) ?? [];
        g.push(w);
        groups.set(key(w), g);
    }
    const close = (a, b) =>
        assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 + Math.abs(b) * 1e-12, `${a} != ${b}`);
    const checkStats = (s, values, unit) => {
        assert.deepEqual(s["samples" + unit], values);
        const sorted = values.toSorted((a, b) => a - b);
        for (const [name, p] of [
            ["median", 0.5],
            ["q1", 0.25],
            ["q3", 0.75]
        ]) {
            const index = (sorted.length - 1) * p,
                low = Math.floor(index);
            close(s[name + unit], sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low));
        }
    };
    assert.equal(summary.rows.length, groups.size);
    const seen = new Set();
    for (const row of summary.rows) {
        const k = key(row),
            records = groups.get(k);
        assert.ok(records && !seen.has(k));
        seen.add(k);
        assert.equal(row.stage, "direct");
        assert.equal(row.inputHash, records[0].inputHash);
        assert.equal(row.outputHash, records[0].outputHash);
        assert.deepEqual(row.runtime, records[0].runtime);
        if (row.metric === "time") {
            checkStats(
                row.time,
                records.flatMap(w => w.samplesMs),
                "Ms"
            );
            assert.equal(row.roundMedians.length, records.length);
            for (let i = 0; i < records.length; i++) {
                assert.equal(row.roundMedians[i].round, records[i].round);
                checkStats(row.roundMedians[i], records[i].samplesMs, "Ms");
            }
        } else {
            for (const stage of ["before", "after", "afterGC"])
                for (const f of fields)
                    checkStats(
                        row.memory[stage][f],
                        records.map(w => w.snapshots[stage][f]),
                        "Bytes"
                    );
            for (const [stage, delta] of [
                ["after", "deltaAfter"],
                ["afterGC", "deltaAfterGC"]
            ])
                for (const f of fields.filter(f => f !== "maxRSS"))
                    checkStats(
                        row.memory[delta][f],
                        records.map(w => w.snapshots[stage][f] - w.snapshots.before[f]),
                        "Bytes"
                    );
        }
    }
    const comparisons = new Set();
    const get = (c, metric, implementation, regime) =>
        summary.rows.find(
            r =>
                contextKey(r) === contextKey(c) &&
                r.metric === metric &&
                r.implementation === implementation &&
                r.memoryRegime === regime
        );
    for (const c of artifact.comparisons) {
        const k = contextKey(c);
        assert.ok(!comparisons.has(k));
        comparisons.add(k);
        const s = get(c, "time", "stock"),
            d = get(c, "time", "direct");
        assert.ok(s && d);
        assert.equal(c.inputHash, s.inputHash);
        assert.equal(c.outputHash, s.outputHash);
        assert.equal(c.outputMatches, true);
        assert.equal(s.outputHash, d.outputHash);
        assert.deepEqual(c.time.stock, s.time);
        assert.deepEqual(c.time.direct, d.time);
        close(c.time.changePercent, (d.time.medianMs / s.time.medianMs - 1) * 100);
        assert.equal(c.time.rounds.length, processes);
        for (let i = 0; i < processes; i++) {
            const r = c.time.rounds[i];
            assert.equal(r.round, i);
            close(r.stockMs, s.roundMedians[i].medianMs);
            close(r.directMs, d.roundMedians[i].medianMs);
            close(r.changePercent, 100 * (r.directMs / r.stockMs - 1));
        }
        for (const regime of ["cold", "warm"]) {
            const m = c.memory[regime],
                a = get(c, "memory", "stock", regime).memory,
                b = get(c, "memory", "direct", regime).memory;
            assert.deepEqual(m.stock, a);
            assert.deepEqual(m.direct, b);
            for (const stage of stages)
                for (const f of Object.keys(a[stage]))
                    close(m.changeBytes[stage][f], b[stage][f].medianBytes - a[stage][f].medianBytes);
        }
    }
    assert.equal(comparisons.size, groups.size / 6);
    return {
        valid: true,
        workers: instances.size,
        timeSamples,
        memorySamples,
        memorySnapshots: memorySamples * 3,
        summaryRows: groups.size,
        comparisons: comparisons.size,
        runtime: report.workers[0].runtime
    };
}
