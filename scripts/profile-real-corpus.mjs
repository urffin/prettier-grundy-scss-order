import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { snapshot } from "./profile-real-instrument.mjs";
import { corpusManifest, corpusProject, hash } from "./corpus.mjs";

const run = promisify(execFile),
    root = fileURLToPath(new URL("../", import.meta.url));
const args = {},
    valid = new Set([
        "output",
        "stage",
        "project",
        "measurement",
        "safety",
        "processes",
        "samples",
        "warmup",
        "cpu-sort-repetitions",
        "cpu-format-repetitions"
    ]);
for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].slice(2),
        value = process.argv[i + 1];
    if (!process.argv[i].startsWith("--") || !valid.has(key) || args[key] || !value || value.startsWith("--"))
        throw new Error("Invalid/missing profiling argument");
    args[key] = value;
}
const options = {
    stage: args.stage ?? "all",
    measurement: args.measurement ?? "all",
    safety: args.safety ?? "all",
    processes: Number(args.processes ?? 2),
    samples: Number(args.samples ?? 9),
    warmup: Number(args.warmup ?? 3),
    cpuSortRepetitions: Number(args["cpu-sort-repetitions"] ?? 200),
    cpuFormatRepetitions: Number(args["cpu-format-repetitions"] ?? 12)
};
for (const [key, choices] of [
    ["stage", ["all", "counts", "timing", "cpu"]],
    ["measurement", ["all", "sort", "format"]],
    ["safety", ["all", "strict", "loose"]]
])
    if (!choices.includes(options[key])) throw new Error(`Invalid ${key}`);
for (const key of ["processes", "samples", "warmup", "cpuSortRepetitions", "cpuFormatRepetitions"])
    if (!Number.isInteger(options[key]) || options[key] < (key === "warmup" ? 0 : 1) || options[key] > 1000)
        throw new Error(`Invalid ${key}`);
const output = args.output ? path.resolve(args.output) : await fs.mkdtemp(path.join(os.tmpdir(), "scss-real-profile-"));
await fs.mkdir(output, { recursive: true });
const projects = args.project ? [corpusProject(args.project)] : corpusManifest().projects;
const measurements = options.measurement === "all" ? ["sort", "format"] : [options.measurement];
const modes = options.safety === "all" ? ["strict", "loose"] : [options.safety];
const stages = options.stage === "all" ? ["counts", "timing", "cpu"] : [options.stage];
const snapshots = {};
try {
    for (const variant of ["stock", "counts", "phases"]) {
        const destination = await fs.mkdtemp(path.join(os.tmpdir(), "scss-profile-snapshot-"));
        snapshots[variant] = { directory: destination };
        snapshots[variant].hashes = await snapshot(root, destination, variant);
    }
    const report = {
        schemaVersion: 1,
        options,
        output,
        commit: (await run("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })).stdout.trim(),
        projects: projects.map(p => ({ id: p.id, revision: p.revision, digest: p.digest, files: p.files.length })),
        runtimeSources: snapshots.stock.hashes,
        profilerSources: {},
        workers: [],
        methodology:
            "Counters, phase timings and stock CPU sampling are separate lanes. Phase times are exclusive nested wall clocks with instrumentation overhead; compare with stock and corroborate using CPU samples. Sort excludes parse/serialization. CPU sort profiles include preparation, filtered separately. No speed thresholds or production changes."
    };
    for (const name of [
        "profile-real-corpus.mjs",
        "profile-real-worker.mjs",
        "profile-real-instrument.mjs",
        "profile-real-runtime.mjs"
    ])
        report.profilerSources[`scripts/${name}`] = hash(await fs.readFile(new URL(name, import.meta.url)));
    await fs.cp(path.join(root, "src"), path.join(output, "runtime-source/src"), { recursive: true });
    for (const stage of stages) {
        const rounds = stage === "timing" ? options.processes : 1;
        for (let round = 0; round < rounds; round++)
            for (const project of projects)
                for (const safety of modes) {
                    if (stage === "cpu" && safety !== "strict") continue;
                    for (const measurement of stage === "counts" ? ["sort"] : measurements) {
                        const variants =
                            stage === "counts" ? ["counts"]
                            : stage === "cpu" ? ["stock"]
                            : round % 2 ? ["phases", "stock"]
                            : ["stock", "phases"];
                        for (const variant of variants) {
                            const config = {
                                repositoryRoot: root,
                                target: snapshots[variant].directory,
                                project: project.id,
                                stage,
                                variant,
                                safety,
                                measurement,
                                round,
                                warmup: options.warmup,
                                samples: options.samples,
                                repetitions:
                                    measurement === "sort" ? options.cpuSortRepetitions : options.cpuFormatRepetitions,
                                cpuPath: path.join(output, `${project.id}-${measurement}.cpuprofile`)
                            };
                            process.stderr.write(
                                `Profile ${stage}/${project.id}/${safety}/${measurement}/${variant}/${round + 1}\n`
                            );
                            const { stdout } = await run(
                                process.execPath,
                                [fileURLToPath(new URL("profile-real-worker.mjs", import.meta.url)), JSON.stringify(config)],
                                { windowsHide: true, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 }
                            );
                            const worker = JSON.parse(stdout);
                            const previous = report.workers.find(
                                w => w.project === worker.project && w.safety === safety && w.measurement === measurement
                            );
                            if (
                                previous &&
                                (previous.inputHash !== worker.inputHash || previous.outputHash !== worker.outputHash)
                            )
                                throw new Error("Instrumentation output differs from stock");
                            report.workers.push(worker);
                            await fs.writeFile(path.join(output, "profile.json"), JSON.stringify(report, null, 2) + "\n");
                        }
                    }
                }
    }
    console.log(
        JSON.stringify({ output, workers: report.workers.length, projects: report.projects, commit: report.commit }, null, 2)
    );
} finally {
    for (const { directory } of Object.values(snapshots)) {
        const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory));
        if (
            !relative ||
            relative.startsWith("..") ||
            path.isAbsolute(relative) ||
            !path.basename(directory).startsWith("scss-profile-snapshot-")
        )
            throw new Error("Unsafe snapshot cleanup");
        await fs.rm(directory, { recursive: true, force: true });
    }
}
