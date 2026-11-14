import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios } from "./benchmark-scenarios.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const worker = fileURLToPath(new URL("./benchmark-worker.mjs", import.meta.url));
const options = { warmup: 3, samples: 9, processes: 2 };
const keys = new Set(["compare", "output", "warmup", "samples", "processes", "scenario", "safety", "measurement"]);
const seen = new Set();
for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === "--help") {
        console.log(`Usage: npm run benchmark -- [options]
  --compare REV       Compare current checkout with a local Git commit/tag
  --output FILE       Save the JSON report (also printed to stdout)
  --warmup N          Warmup iterations per scenario/process (default 3)
  --samples N         Measured iterations per scenario/process (default 9)
  --processes N       Fresh processes per version/safety/measurement (default 2)
  --scenario ID       One of: ${scenarios.map(s => s.id).join(", ")}
  --safety MODE       strict or loose (default both)
  --measurement TYPE sort or format (default both)

Both revisions use this checkout's dependencies and Node.js (code-only comparison).
No historical install scripts run. Timings have no thresholds; output differences are reported.`);
        process.exit(0);
    }
    const key = flag.slice(2);
    if (!flag.startsWith("--") || !keys.has(key) || seen.has(key)) throw new Error(`Invalid option: ${flag}`);
    const value = process.argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    seen.add(key);
    options[key] = value;
}
for (const [key, min, max] of [
    ["warmup", 0, 100],
    ["samples", 1, 100],
    ["processes", 1, 10]
]) {
    const value = Number(options[key]);
    if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`${key} must be an integer in ${min}..${max}`);
    options[key] = value;
}
if (options.scenario && !scenarios.some(s => s.id === options.scenario)) throw new Error("Unknown benchmark scenario");
if (options.safety && !["strict", "loose"].includes(options.safety)) throw new Error("Unknown safety mode");
if (options.measurement && !["sort", "format"].includes(options.measurement)) throw new Error("Unknown measurement");
const modes = options.safety ? [options.safety] : ["strict", "loose"];
const measurements = options.measurement ? [options.measurement] : ["sort", "format"];
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
    const workers = [];
    for (let round = 0; round < options.processes; round++) {
        const order = round % 2 ? targets.slice().reverse() : targets;
        for (const safety of modes)
            for (const measurement of measurements)
                for (const target of order) {
                    process.stderr.write(
                        `Benchmark ${target.label}: ${safety}/${measurement}, process ${round + 1}/${options.processes}\n`
                    );
                    const config = {
                        target: target.root,
                        dependencies: root,
                        safety,
                        measurement,
                        warmup: options.warmup,
                        samples: options.samples,
                        scenario: options.scenario
                    };
                    // Sequential workers, one version/mode/measurement per fresh process.
                    const { stdout } = await run(process.execPath, [worker, JSON.stringify(config)], {
                        windowsHide: true,
                        timeout: 300_000,
                        maxBuffer: 16 * 1024 * 1024
                    });
                    workers.push({ target: target.label, round, ...JSON.parse(stdout) });
                }
    }
    const statistics = values => {
        const sorted = values.slice().sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const quantile = fraction => {
            const index = (sorted.length - 1) * fraction;
            const lower = Math.floor(index);
            return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
        };
        return {
            medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
            q1Ms: quantile(0.25),
            q3Ms: quantile(0.75),
            samplesMs: values
        };
    };
    const rows = [];
    for (const scenario of scenarios.filter(s => !options.scenario || s.id === options.scenario)) {
        for (const safety of modes)
            for (const measurement of measurements) {
                const row = { scenario: scenario.id, safety, measurement },
                    hashes = {};
                for (const target of targets) {
                    const records = workers
                        .filter(w => w.target === target.label && w.safety === safety && w.measurement === measurement)
                        .map(w => w.rows.find(r => r.scenario === scenario.id));
                    row[target.label] = statistics(records.flatMap(r => r.samplesMs));
                    hashes[target.label] = [...new Set(records.map(r => r.outputHash))];
                    if (hashes[target.label].length !== 1)
                        throw new Error(`Unstable output across processes: ${target.label}/${scenario.id}`);
                }
                if (row.baseline) {
                    row.changePercent =
                        row.baseline.medianMs > 0 ? (row.current.medianMs / row.baseline.medianMs - 1) * 100 : null;
                    row.outputMatches = hashes.current[0] === hashes.baseline[0];
                }
                rows.push(row);
            }
    }
    const report = {
        schemaVersion: 1,
        method: {
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
            interpretation:
                "No timing thresholds. Negative changePercent means current is faster. Output differences are reported, not performance failures."
        },
        targets: await Promise.all(
            targets.map(async t => ({
                label: t.label,
                commit: t.commit,
                dirty: t.dirty,
                packageVersion: JSON.parse(await readFile(path.join(t.root, "package.json"), "utf8")).version
            }))
        ),
        runtime: workers[0].runtime,
        rows,
        workers
    };
    const json = JSON.stringify(report, null, 2) + "\n";
    if (options.output) await writeFile(path.resolve(options.output), json);
    console.log(json.trimEnd());
    if (process.env.GITHUB_STEP_SUMMARY) {
        const table = rows
            .map(
                r =>
                    `| ${r.scenario} | ${r.safety} | ${r.measurement} | ${r.current.medianMs.toFixed(3)} | ${r.baseline ? r.baseline.medianMs.toFixed(3) : "—"} | ${r.baseline && r.changePercent !== null ? r.changePercent.toFixed(1) + "%" : "—"} | ${r.baseline ? r.outputMatches : "—"} |`
            )
            .join("\n");
        await appendFile(
            process.env.GITHUB_STEP_SUMMARY,
            `### Sorting benchmark\n\nNode ${report.runtime.node}, Prettier ${report.runtime.prettier}. ${options.processes} fresh processes per version/mode/measurement, ${options.warmup} warmups + ${options.samples} samples each. Current dependencies shared across revisions; timings have no thresholds. Sort excludes parse/print; format includes the full pipeline.\n\n| Scenario | Safety | Measurement | Current, ms | Baseline, ms | Change | Output matches |\n| --- | --- | --- | ---: | ---: | ---: | --- |\n${table}\n`
        );
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
