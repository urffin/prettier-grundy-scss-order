import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios, scenarioInfo } from "./benchmark-scenarios.mjs";
import { statistics, summarizeMemory } from "./benchmark-statistics.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const worker = fileURLToPath(new URL("./benchmark-worker.mjs", import.meta.url));
const options = { warmup: 3, samples: 9, processes: 2, memoryProcesses: 3, metric: "all" };
const keys = new Set([
    "compare",
    "output",
    "warmup",
    "samples",
    "processes",
    "memory-processes",
    "metric",
    "scenario",
    "safety",
    "measurement"
]);
const seen = new Set();
for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === "--help") {
        console.log(`Usage: npm run benchmark -- [options]
  --compare REV       Compare current checkout with a local Git commit/tag
  --output FILE       Save the JSON report (also printed to stdout)
  --metric TYPE       time, memory or all (default all)
  --warmup N          Timing warmups per scenario/process (default 3)
  --samples N         Timing samples per scenario/process (default 9)
  --processes N       Timing processes per version/safety/measurement (default 2)
  --memory-processes N  Fresh memory processes per version/safety/measurement/scenario (default 3)
  --scenario ID       One of: ${scenarios.map(s => s.id).join(", ")}
  --safety MODE       strict or loose (default both)
  --measurement TYPE sort or format (default both)

Both revisions use this checkout's dependencies and Node.js (code-only comparison).
Memory workers use --expose-gc, one cold operation per process, and no timing samples.
No historical install scripts run. Time and memory have no thresholds; output differences are reported.`);
        process.exit(0);
    }
    const key = flag.slice(2);
    if (!flag.startsWith("--") || !keys.has(key) || seen.has(key)) throw new Error(`Invalid option: ${flag}`);
    const value = process.argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    seen.add(key);
    options[key === "memory-processes" ? "memoryProcesses" : key] = value;
}
for (const [key, min, max] of [
    ["warmup", 0, 100],
    ["samples", 1, 100],
    ["processes", 1, 10],
    ["memoryProcesses", 1, 10]
]) {
    const value = Number(options[key]);
    if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`${key} must be an integer in ${min}..${max}`);
    options[key] = value;
}
if (options.scenario && !scenarios.some(s => s.id === options.scenario)) throw new Error("Unknown benchmark scenario");
if (options.safety && !["strict", "loose"].includes(options.safety)) throw new Error("Unknown safety mode");
if (options.measurement && !["sort", "format"].includes(options.measurement)) throw new Error("Unknown measurement");
if (!["time", "memory", "all"].includes(options.metric)) throw new Error("Unknown benchmark metric");
const modes = options.safety ? [options.safety] : ["strict", "loose"];
const measurements = options.measurement ? [options.measurement] : ["sort", "format"];
const selected = scenarios.filter(s => !options.scenario || s.id === options.scenario);
async function git(args, encoding = "utf8") {
    return (await run("git", args, { cwd: root, encoding, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })).stdout;
}
async function revision() {
    try {
        return { commit: (await git(["rev-parse", "HEAD"])).trim(), dirty: !!(await git(["status", "--porcelain"])).trim() };
    } catch {
        return { commit: null, dirty: null };
    }
}
const targets = [{ label: "current", root, ...(await revision()) }];
let temporary;
try {
    if (options.compare) {
        const commit = (await git(["rev-parse", "--verify", "--end-of-options", `${options.compare}^{commit}`])).trim();
        if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error("Invalid resolved commit");
        temporary = await mkdtemp(path.join(tmpdir(), "scss-benchmark-"));
        // Copy runtime sources only; never alter the checkout or run historical install scripts.
        const entries = (await git(["ls-tree", "-r", "-z", commit, "--", "src", "package.json"]))
            .split("\0")
            .filter(Boolean);
        for (const entry of entries) {
            const match = /^(100644|100755) blob [a-f0-9]+\t(.+)$/.exec(entry);
            if (!match) throw new Error("Baseline contains an unsupported file type");
            const name = match[2],
                destination = path.resolve(temporary, name);
            const relative = path.relative(temporary, destination);
            if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid baseline path");
            await mkdir(path.dirname(destination), { recursive: true });
            await writeFile(destination, await git(["show", `${commit}:${name}`], "buffer"));
        }
        await symlink(
            path.join(root, "node_modules"),
            path.join(temporary, "node_modules"),
            process.platform === "win32" ? "junction" : "dir"
        );
        targets.push({ label: "baseline", root: temporary, commit, dirty: false });
    }
    const workers = [],
        memoryWorkers = [];
    async function launch(target, safety, measurement, metric, round, scenario) {
        const count = metric === "memory" ? options.memoryProcesses : options.processes;
        process.stderr.write(
            `Benchmark ${target.label}: ${metric}/${safety}/${measurement}${scenario ? "/" + scenario : ""}, process ${round + 1}/${count}\n`
        );
        const config = {
            target: target.root,
            dependencies: root,
            safety,
            measurement,
            metric,
            warmup: options.warmup,
            samples: options.samples,
            scenario
        };
        const args =
            metric === "memory" ? ["--expose-gc", worker, JSON.stringify(config)] : [worker, JSON.stringify(config)];
        const { stdout } = await run(process.execPath, args, {
            windowsHide: true,
            timeout: 300_000,
            maxBuffer: 16 * 1024 * 1024
        });
        return { target: target.label, round, ...JSON.parse(stdout) };
    }
    if (options.metric !== "memory")
        for (let round = 0; round < options.processes; round++) {
            const order = round % 2 ? targets.slice().reverse() : targets;
            for (const safety of modes)
                for (const measurement of measurements)
                    for (const target of order) {
                        workers.push(await launch(target, safety, measurement, "time", round, options.scenario));
                    }
        }
    // Every memory sample gets its own process/scenario. maxRSS is a lifetime
    // high-water mark; reusing a timing worker would mix earlier scenarios in.
    if (options.metric !== "time")
        for (let round = 0; round < options.memoryProcesses; round++) {
            const order = round % 2 ? targets.slice().reverse() : targets;
            for (const safety of modes)
                for (const measurement of measurements)
                    for (const scenario of selected)
                        for (const target of order)
                            memoryWorkers.push(await launch(target, safety, measurement, "memory", round, scenario.id));
        }
    function recordsFor(list, target, safety, measurement, scenario) {
        return list
            .filter(w => w.target === target && w.safety === safety && w.measurement === measurement)
            .flatMap(w => w.rows.filter(r => r.scenario === scenario));
    }
    function stableHash(records, field, context) {
        const hashes = [...new Set(records.map(r => r[field]))];
        if (hashes.length !== 1) throw new Error(`Unstable ${field} across processes: ${context}`);
        return hashes[0];
    }
    const rows = [];
    if (options.metric !== "memory")
        for (const scenario of selected) {
            for (const safety of modes)
                for (const measurement of measurements) {
                    const row = { scenario: scenario.id, safety, measurement },
                        hashes = {};
                    for (const target of targets) {
                        const records = recordsFor(workers, target.label, safety, measurement, scenario.id);
                        row[target.label] = statistics(records.flatMap(r => r.samplesMs));
                        hashes[target.label] = stableHash(records, "outputHash", `${target.label}/${scenario.id}`);
                    }
                    if (row.baseline) {
                        row.changePercent =
                            row.baseline.medianMs > 0 ? (row.current.medianMs / row.baseline.medianMs - 1) * 100 : null;
                        row.outputMatches = hashes.current === hashes.baseline;
                    }
                    rows.push(row);
                }
        }
    const memoryRows = [];
    if (options.metric !== "time")
        for (const scenario of selected)
            for (const safety of modes)
                for (const measurement of measurements) {
                    const row = { scenario: scenario.id, safety, measurement },
                        hashes = {};
                    for (const target of targets) {
                        const records = recordsFor(memoryWorkers, target.label, safety, measurement, scenario.id);
                        row[target.label] = summarizeMemory(records);
                        hashes[target.label] = stableHash(records, "outputHash", `${target.label}/${scenario.id}/memory`);
                        const timed = recordsFor(workers, target.label, safety, measurement, scenario.id);
                        if (timed.length) {
                            if (
                                hashes[target.label] !==
                                    stableHash(timed, "outputHash", `${target.label}/${scenario.id}/time`) ||
                                stableHash(records, "inputHash", scenario.id) !== stableHash(timed, "inputHash", scenario.id)
                            )
                                throw new Error(
                                    `Time/memory outputs differ: ${target.label}/${scenario.id}/${safety}/${measurement}`
                                );
                        }
                    }
                    if (row.baseline) {
                        row.outputMatches = hashes.current === hashes.baseline;
                        row.changeBytes = {
                            heapUsedAfter: row.current.after.heapUsed.medianBytes - row.baseline.after.heapUsed.medianBytes,
                            heapUsedAfterGC:
                                row.current.afterGC.heapUsed.medianBytes - row.baseline.afterGC.heapUsed.medianBytes,
                            maxRSS: row.current.afterGC.maxRSS.medianBytes - row.baseline.afterGC.maxRSS.medianBytes
                        };
                    }
                    memoryRows.push(row);
                }
    const report = {
        schemaVersion: 2,
        method: {
            metric: options.metric,
            warmup: options.warmup,
            samplesPerProcess: options.samples,
            processes: options.processes,
            statistics:
                "Pooled equal-size process samples; median averages the middle pair for even counts; quartiles use linear interpolation",
            isolation:
                "One code version, safety and measurement per sequential fresh process; alternate version order between process rounds",
            dependencies: "Current checkout dependencies for both revisions; code-only comparison",
            sort: "Sorter construction and AST ordering; parsing and serialization excluded",
            format: "Complete prettier.format, including plugin preprocessing, parsing and printing",
            memory: {
                processes: options.memoryProcesses,
                samplesPerProcess: 1,
                warmup: 0,
                units: "All raw memory values and statistics are bytes; resourceUsage.maxRSS KiB converted to bytes",
                isolation:
                    "One version/safety/measurement/scenario per fresh sequential --expose-gc process, after all timing workers",
                gc: "Two synchronous GC calls before baseline and two after the operation; none between before and after",
                input: "Sort ASTs prepared before baseline; format includes parsing and printing; real scenarios process batches of separate whole files",
                retention: "Result AST/string remains live through afterGC; serialization and hashing follow all snapshots",
                peak: "maxRSS through afterGC includes startup, imports, input preparation and GC; not an operation-only peak",
                caveats:
                    "Snapshots are not allocation counts or exact heap peaks. arrayBuffers is included in external. GC/JIT affect deltas; negatives are valid",
                comparison:
                    "changeBytes is current minus baseline median for after.heapUsed, afterGC.heapUsed and afterGC.maxRSS"
            },
            interpretation:
                "No time or memory thresholds. Negative changePercent/changeBytes means current is lower. Output differences are reported, not performance failures."
        },
        targets: await Promise.all(
            targets.map(async t => ({
                label: t.label,
                commit: t.commit,
                dirty: t.dirty,
                packageVersion: JSON.parse(await readFile(path.join(t.root, "package.json"), "utf8")).version
            }))
        ),
        runtime: (workers[0] ?? memoryWorkers[0]).runtime,
        inputs: selected.map(scenarioInfo),
        rows,
        workers,
        memoryRows,
        memoryWorkers
    };
    const json = JSON.stringify(report, null, 2) + "\n";
    if (options.output) await writeFile(path.resolve(options.output), json);
    console.log(json.trimEnd());
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(
            process.env.GITHUB_STEP_SUMMARY,
            `### Sorting benchmark\n\nNode ${report.runtime.node}, Prettier ${report.runtime.prettier}; metrics: ${options.metric}. Current dependencies shared across revisions; no time or memory thresholds.\n\n`
        );
        const table = rows
            .map(
                r =>
                    `| ${r.scenario} | ${r.safety} | ${r.measurement} | ${r.current.medianMs.toFixed(3)} | ${r.baseline ? r.baseline.medianMs.toFixed(3) : "—"} | ${r.baseline && r.changePercent !== null ? r.changePercent.toFixed(1) + "%" : "—"} | ${r.baseline ? r.outputMatches : "—"} |`
            )
            .join("\n");
        if (rows.length)
            await appendFile(
                process.env.GITHUB_STEP_SUMMARY,
                `Timing: ${options.processes} fresh processes per version/mode/measurement, ${options.warmup} warmups + ${options.samples} samples each. Sort excludes parse/print; format includes the full pipeline.\n\n| Scenario | Safety | Measurement | Current, ms | Baseline, ms | Change | Output matches |\n| --- | --- | --- | ---: | ---: | ---: | --- |\n${table}\n`
            );
        if (memoryRows.length) {
            const mib = stats => (stats.medianBytes / 1024 ** 2).toFixed(3);
            const comparison = (r, field) => (r.baseline ? (r.changeBytes[field] / 1024 ** 2).toFixed(3) : "—");
            const table = memoryRows
                .map(
                    r =>
                        `| ${r.scenario} | ${r.safety} | ${r.measurement} | ${mib(r.current.after.heapUsed)} | ${mib(r.current.afterGC.heapUsed)} | ${mib(r.current.afterGC.maxRSS)} | ${comparison(r, "heapUsedAfter")} | ${comparison(r, "heapUsedAfterGC")} | ${comparison(r, "maxRSS")} | ${r.baseline ? r.outputMatches : "—"} |`
                )
                .join("\n");
            await appendFile(
                process.env.GITHUB_STEP_SUMMARY,
                `\n### Memory benchmark\n\n${options.memoryProcesses} fresh processes per version/safety/measurement/scenario, one cold operation each. Two GC calls before baseline and after operation; result retained. Values below are median MiB (JSON uses bytes). maxRSS includes startup/input preparation/GC through the final snapshot, not just sorting. Snapshots are not heap peaks or allocation counts. Negative comparison deltas mean less memory; no thresholds.\n\n| Scenario | Safety | Measurement | Heap after, MiB | Heap after GC, MiB | maxRSS, MiB | Δ heap after vs baseline | Δ heap after GC | Δ maxRSS | Same output |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${table}\n`
            );
        }
    }
} finally {
    if (temporary) {
        const relative = path.relative(path.resolve(tmpdir()), path.resolve(temporary));
        if (
            !relative ||
            relative.startsWith("..") ||
            path.isAbsolute(relative) ||
            !path.basename(temporary).startsWith("scss-benchmark-")
        )
            throw new Error("Unsafe benchmark cleanup path");
        await rm(temporary, { recursive: true, force: true });
    }
}
