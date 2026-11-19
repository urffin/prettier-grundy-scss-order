import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { corpusManifest, corpusSources, hash } from "./corpus.mjs";
import { statistics, summarizeMemory } from "./benchmark-statistics.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)),
    run = promisify(execFile);
const args = {},
    valid = new Set(["output", "stage", "project", "processes", "samples", "warmup", "memory-processes"]);
for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].slice(2),
        value = process.argv[i + 1];
    if (!process.argv[i].startsWith("--") || !valid.has(key) || args[key] || !value || value.startsWith("--"))
        throw new Error("Invalid research argument");
    args[key] = value;
}
if (!args.output) throw new Error("Pass --output EXTERNAL_DIRECTORY");
const output = path.resolve(args.output),
    stage = args.stage ?? "all";
if (!["all", "prepare", "main", "variants", "direct", "phases"].includes(stage)) throw new Error("Unknown research stage");
const options = {
    processes: Number(args.processes ?? 3),
    samples: Number(args.samples ?? 7),
    warmup: Number(args.warmup ?? 3),
    memoryProcesses: Number(args["memory-processes"] ?? 3)
};
for (const [key, value] of Object.entries(options))
    if (!Number.isInteger(value) || value < (key === "warmup" ? 0 : 1) || value > 20) throw new Error("Invalid " + key);
await fs.mkdir(output, { recursive: true });
const formatters = ["plain", "loose", "strict"],
    lanes = ["original", "strict-ready", "loose-ready"];
const bundle = (files, texts) => JSON.stringify(files.map((f, i) => [f.path, texts[i]]));
const write = (name, value) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2) + "\n");
const read = async name => JSON.parse(await fs.readFile(path.join(output, name), "utf8"));
async function sourceHashes() {
    const result = {};
    async function walk(directory, prefix) {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const name = prefix + entry.name;
            if (entry.isDirectory()) await walk(path.join(directory, entry.name), name + "/");
            else if (entry.isFile()) result[name] = hash(await fs.readFile(path.join(directory, entry.name)));
            else throw new Error("Source snapshot must not follow symlinks");
        }
    }
    await walk(path.join(root, "src"), "src/");
    return result;
}
async function prepare() {
    const prettier = (await import("prettier")).default;
    const stock = (await import("../src/index.mjs")).default;
    const { createPipelinePlugin } = await import("./format-pipeline-variants.mjs");
    const { presets } = await import("../src/presets/index.mjs");
    const projects = corpusManifest().projects.filter(p => !args.project || p.id === args.project);
    if (!projects.length) throw new Error("Unknown project");
    const proof = { counts: {}, failures: [], baselineCases: 0, originalBytes: 0, cases: [] };
    const variants = ["direct", "skip-unchanged", "native-view", "raw-handoff", "roundtrip"];
    const observations = {};
    const plugins = Object.fromEntries(
        variants.map(v => [
            v,
            createPipelinePlugin(v, {
                observe: row => {
                    const count = (observations[v] ??= { serialized: 0, skipped: 0 });
                    count[row.serialized ? "serialized" : "skipped"]++;
                }
            })
        ])
    );
    const baseOptions = formatter => ({
        parser: "scss",
        ...(formatter === "plain" ? {} : { plugins: [stock], grundyScssSorterSafety: formatter })
    });
    async function probe(source, expected, formatter, context, extra = {}) {
        for (const variant of variants) {
            if (variant === "raw-handoff" && proof.counts[variant]?.checked >= 3) continue;
            if (variant === "roundtrip" && formatter !== "plain") continue;
            if (variant !== "roundtrip" && formatter === "plain") continue;
            const summaryKey = `${variant}/${context.project ?? "fixtures"}/${context.input ?? "fixtures"}/${formatter}`;
            const row = (proof.counts[variant] ??= { checked: 0, matched: 0, different: 0, errors: 0 });
            const obsBefore = { ...observations[variant] };
            row.checked++;
            let actual, error;
            try {
                actual = await prettier.format(source, { ...baseOptions(formatter), ...extra, plugins: [plugins[variant]] });
            } catch (cause) {
                error = cause.message;
            }
            const matched = !error && actual === expected;
            row[
                matched ? "matched"
                : error ? "errors"
                : "different"
            ]++;
            const observation = {
                serialized: (observations[variant]?.serialized ?? 0) - (obsBefore.serialized ?? 0),
                skipped: (observations[variant]?.skipped ?? 0) - (obsBefore.skipped ?? 0)
            };
            const entry = proof.cases.find(c => c.key === summaryKey) ?? {
                key: summaryKey,
                checked: 0,
                matched: 0,
                serialized: 0,
                skipped: 0
            };
            if (!proof.cases.includes(entry)) proof.cases.push(entry);
            entry.checked++;
            entry.matched += Number(matched);
            entry.serialized += observation.serialized;
            entry.skipped += observation.skipped;
            if (!matched && proof.failures.filter(f => f.variant === variant).length < 8) {
                const id = `${variant}-${proof.failures.length}`;
                await fs.mkdir(path.join(output, "counterexamples", id), { recursive: true });
                await fs.writeFile(path.join(output, "counterexamples", id, "input.scss"), source);
                await fs.writeFile(path.join(output, "counterexamples", id, "expected.scss"), expected);
                if (actual !== undefined)
                    await fs.writeFile(path.join(output, "counterexamples", id, "actual.scss"), actual);
                proof.failures.push({
                    id,
                    variant,
                    formatter,
                    context,
                    extra,
                    error,
                    expectedHash: hash(expected),
                    actualHash: actual === undefined ? undefined : hash(actual)
                });
            }
        }
    }
    const datasets = [];
    for (const project of projects) {
        process.stderr.write("Prepare " + project.id + "\n");
        const original = corpusSources(project.id);
        proof.originalBytes += original.reduce((s, f) => s + Buffer.byteLength(f.source), 0);
        const sorted = {};
        for (const formatter of ["strict", "loose"]) {
            sorted[formatter] = [];
            for (const file of original) sorted[formatter].push(await prettier.format(file.source, baseOptions(formatter)));
        }
        for (const input of lanes) {
            const files = original.map((f, i) => ({
                path: f.path,
                source: input === "original" ? f.source : sorted[input.split("-")[0]][i]
            }));
            const expected = {},
                equality = {},
                changedFromInput = {};
            let plainOutputs;
            for (const formatter of formatters) {
                const results = [];
                for (const file of files) {
                    const text = await prettier.format(file.source, baseOptions(formatter));
                    if ((await prettier.format(text, baseOptions(formatter))) !== text)
                        throw new Error("Non-idempotent stock formatter");
                    results.push(text);
                    proof.baselineCases++;
                    await probe(file.source, text, formatter, { project: project.id, input, path: file.path });
                }
                expected[formatter] = hash(bundle(files, results));
                changedFromInput[formatter] = results.filter((text, i) => text !== files[i].source).length;
                plainOutputs ??= results;
                equality[formatter] = results.filter((text, i) => text === plainOutputs[i]).length;
            }
            const name = `inputs/${project.id}/${input}.json`;
            const dataset = {
                project: project.id,
                input,
                inputHash: hash(
                    bundle(
                        files,
                        files.map(f => f.source)
                    )
                ),
                expected,
                equalityWithPlainFiles: equality,
                changedFromInput,
                files
            };
            await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
            await write(name, dataset);
            datasets.push({
                project: project.id,
                input,
                file: name,
                files: files.length,
                bytes: files.reduce((s, f) => s + Buffer.byteLength(f.source), 0),
                inputHash: dataset.inputHash,
                expected,
                equalityWithPlainFiles: equality,
                changedFromInput
            });
        }
    }
    const fixtureRoot = path.join(root, "tests/fixtures/corpus/regressions");
    const fixtures = [];
    for (const folder of await fs.readdir(fixtureRoot, { withFileTypes: true }))
        if (folder.isDirectory()) {
            try {
                fixtures.push({
                    path: folder.name,
                    source: await fs.readFile(path.join(fixtureRoot, folder.name, "input.scss"), "utf8")
                });
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
        }
    fixtures.push({ path: "bom-crlf", source: "\ufeff.a {\r\n width:1px; // tail\r\n color:red;\r\n}" });
    fixtures.push({
        path: "map-annotation",
        source: ".a { width:1px; color:red; } /*# sourceMappingURL=missing.css.map */"
    });
    for (const fixture of fixtures) {
        for (const [preset] of Object.entries(presets))
            for (const formatter of ["strict", "loose"])
                for (const withRoot of [false, true])
                    for (const split of [false, true]) {
                        const extra = {
                            grundyScssSorterPreset: preset,
                            grundyScssSorterWithRoot: withRoot,
                            grundyScssSorterSplitGroup: split
                        };
                        const expected = await prettier.format(fixture.source, { ...baseOptions(formatter), ...extra });
                        await probe(fixture.source, expected, formatter, { fixture: fixture.path }, extra);
                    }
    }
    const eligible = ["direct", "skip-unchanged", "native-view"].filter(
        v => proof.counts[v] && proof.counts[v].matched === proof.counts[v].checked
    );
    await write("preflight.json", { ...proof, fixtures: fixtures.length, eligible });
    await write("manifest.json", {
        schemaVersion: 1,
        commit: (await run("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })).stdout.trim(),
        version: JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version,
        projects: projects.map(p => ({ id: p.id, revision: p.revision, digest: p.digest, files: p.files.length })),
        datasets,
        eligible,
        sourceHashes: await sourceHashes(),
        method: "Three common inputs: original, strict formatted, loose formatted. Plain, stock loose and stock strict run on every input. No equality assumption between modes. Prototypes must match stock output in corpus and configuration fixtures."
    });
    await fs.cp(path.join(root, "src"), path.join(output, "source-snapshot/src"), { recursive: true });
    process.stderr.write("Eligible research variants: " + eligible.join(", ") + "\n");
}

if (stage === "prepare" || stage === "all") {
    try {
        await fs.access(path.join(output, "report.json"));
        throw new Error("Use a new output directory to prepare inputs; preserve existing research evidence");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    await prepare();
}
const manifest = await read("manifest.json");
if (JSON.stringify(await sourceHashes()) !== JSON.stringify(manifest.sourceHashes))
    throw new Error("Production sources changed since preparation");
const reportPath = path.join(output, "report.json");
let report;
try {
    report = JSON.parse(await fs.readFile(reportPath, "utf8"));
} catch (error) {
    if (error.code !== "ENOENT") throw error;
}
report ??= {
    schemaVersion: 1,
    commit: manifest.commit,
    options,
    manifestHash: hash(await fs.readFile(path.join(output, "manifest.json"))),
    workers: [],
    stages: {},
    toolHashes: {}
};
if (JSON.stringify(report.options) !== JSON.stringify(options))
    throw new Error("Keep the same measurement options between stages");
if (report.manifestHash !== hash(await fs.readFile(path.join(output, "manifest.json"))))
    throw new Error("Research manifest changed");
for (const name of [
    "research-format-pipeline.mjs",
    "format-pipeline-worker.mjs",
    "format-pipeline-variants.mjs",
    "processor-reference.mjs",
    "corpus.mjs",
    "benchmark-statistics.mjs"
]) {
    const value = hash(await fs.readFile(new URL(name, import.meta.url)));
    if (report.workers.length && report.toolHashes[name] !== value)
        throw new Error("Research tools changed after measurements started");
    report.toolHashes[name] = value;
}
const lockHash = hash(await fs.readFile(path.join(root, "package-lock.json")));
if (report.dependencyLockHash && report.dependencyLockHash !== lockHash) throw new Error("Dependency lock changed");
report.dependencyLockHash = lockHash;
await fs.mkdir(path.join(output, "executed-tools"), { recursive: true });
for (const name of Object.keys(report.toolHashes))
    await fs.copyFile(new URL(name, import.meta.url), path.join(output, "executed-tools", name));
await fs.copyFile(path.join(root, "package.json"), path.join(output, "source-snapshot/package.json"));
await fs.copyFile(path.join(root, "package-lock.json"), path.join(output, "source-snapshot/package-lock.json"));
async function launch(config) {
    const full = {
        ...config,
        root,
        dataset: path.join(output, config.dataset),
        warmup: config.stage === "phases" ? 2 : options.warmup,
        samples: config.stage === "phases" ? 3 : options.samples
    };
    process.stderr.write(
        [
            full.stage,
            full.metric,
            full.project,
            full.input,
            full.formatter,
            full.implementation,
            full.memoryRegime ?? "",
            full.round + 1
        ].join("/") + "\n"
    );
    const flags = full.metric === "memory" ? ["--expose-gc"] : [];
    const { stdout } = await run(
        process.execPath,
        [...flags, fileURLToPath(new URL("format-pipeline-worker.mjs", import.meta.url)), JSON.stringify(full)],
        { windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 }
    );
    const worker = JSON.parse(stdout);
    if (report.workers.some(w => w.pid === worker.pid && w.timeOriginMs === worker.timeOriginMs))
        throw new Error("Reused worker instance");
    report.workers.push(worker);
    await write("report.json", report);
}
async function measure(currentStage) {
    if (report.stages[currentStage])
        throw new Error("Stage already exists; preserve its evidence and use a new output directory to repeat");
    report.stages[currentStage] = { status: "running", startedAt: new Date().toISOString() };
    await write("report.json", report);
    if (currentStage === "direct" && !manifest.eligible.includes("direct"))
        throw new Error("Direct pipeline failed the exact-output gate");
    const datasets = manifest.datasets;
    const listFor = (dataset, formatter) =>
        currentStage === "direct" ? ["stock", "direct"]
        : currentStage === "variants" ? ["stock", ...manifest.eligible]
        : currentStage === "phases" ? ["profile"]
        : ["stock"];
    const allowed = (d, f) =>
        !["variants", "direct"].includes(currentStage) ||
        (f !== "plain" && (d.input === "original" || d.input === f + "-ready"));
    const phases = currentStage === "phases";
    for (let round = 0; round < (phases ? 1 : options.processes); round++)
        for (let di = 0; di < datasets.length; di++) {
            const d = datasets[di];
            const order = formatters.slice((round + di) % 3).concat(formatters.slice(0, (round + di) % 3));
            for (const formatter of order)
                if (allowed(d, formatter)) {
                    const implementations = listFor(d, formatter),
                        offset = round % implementations.length;
                    const rotated = implementations.slice(offset).concat(implementations.slice(0, offset));
                    for (const implementation of rotated)
                        await launch({
                            stage: currentStage,
                            metric: phases ? "phases" : "time",
                            project: d.project,
                            input: d.input,
                            dataset: d.file,
                            formatter,
                            implementation,
                            round
                        });
                }
        }
    if (!phases)
        for (const memoryRegime of ["cold", "warm"])
            for (let round = 0; round < options.memoryProcesses; round++)
                for (let di = 0; di < datasets.length; di++) {
                    const d = datasets[di],
                        offset = (round + di) % 3;
                    for (const formatter of formatters.slice(offset).concat(formatters.slice(0, offset)))
                        if (allowed(d, formatter)) {
                            const impl = listFor(d, formatter),
                                at = round % impl.length;
                            for (const implementation of impl.slice(at).concat(impl.slice(0, at)))
                                await launch({
                                    stage: currentStage,
                                    metric: "memory",
                                    memoryRegime,
                                    project: d.project,
                                    input: d.input,
                                    dataset: d.file,
                                    formatter,
                                    implementation,
                                    round
                                });
                        }
                }
    if (JSON.stringify(await sourceHashes()) !== JSON.stringify(manifest.sourceHashes))
        throw new Error("Sources changed during measurements");
    report.stages[currentStage] = { ...report.stages[currentStage], status: "complete", endedAt: new Date().toISOString() };
    await write("report.json", report);
}
for (const currentStage of stage === "all" ? ["main", "variants", "phases"]
: stage === "prepare" ? []
: [stage])
    await measure(currentStage);
const rows = [];
for (const worker of report.workers) {
    const key = w => [w.stage, w.metric, w.memoryRegime ?? "", w.project, w.input, w.formatter, w.implementation].join("/");
    if (rows.some(r => r.key === key(worker))) continue;
    const matching = report.workers.filter(w => key(w) === key(worker));
    const row = {
        key: key(worker),
        stage: worker.stage,
        metric: worker.metric,
        memoryRegime: worker.memoryRegime,
        project: worker.project,
        input: worker.input,
        formatter: worker.formatter,
        implementation: worker.implementation,
        inputHash: worker.inputHash,
        outputHash: worker.outputHash,
        runtime: worker.runtime
    };
    if (matching.some(w => w.inputHash !== worker.inputHash || w.outputHash !== worker.outputHash))
        throw new Error("Inconsistent worker output");
    if (worker.metric === "memory") row.memory = summarizeMemory(matching);
    else {
        row.time = statistics(matching.flatMap(w => w.samplesMs));
        row.roundMedians = matching.map(w => ({ round: w.round, ...statistics(w.samplesMs) }));
        if (worker.metric === "phases") {
            const samples = matching.flatMap(w => w.phases),
                names = [...new Set(samples.flatMap(s => Object.keys(s)))];
            row.phases = Object.fromEntries(
                names.map(name => [name, statistics(samples.map(s => s[name]?.exclusiveMs ?? 0))])
            );
            row.remainder = statistics(
                matching.flatMap(w =>
                    w.samplesMs.map((v, i) => v - Object.values(w.phases[i]).reduce((n, p) => n + p.exclusiveMs, 0))
                )
            );
        }
    }
    rows.push(row);
}
await write("summary.json", { rows, stages: report.stages });
console.log(
    JSON.stringify(
        { output, stages: report.stages, workers: report.workers.length, rows: rows.length, eligible: manifest.eligible },
        null,
        2
    )
);
