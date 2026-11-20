import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { Session } from "node:inspector/promises";
import { cpus } from "node:os";
import { corpusSources, hash } from "../corpus.mjs";

const config = JSON.parse(process.argv[2]),
    require = createRequire(path.join(config.repositoryRoot, "package.json"));
const scss = require("postcss-scss"),
    prettier = require("prettier");
const { grundyPropSorter } = await import(pathToFileURL(path.join(config.target, "src/grundy-prop-sorter.mjs")));
const plugin = (await import(pathToFileURL(path.join(config.target, "src/index.mjs")))).default;
const { profile } = await import(pathToFileURL(path.join(config.target, "src/__profile.mjs")));
const sources = corpusSources(config.project),
    runtime = {
        node: process.version,
        prettier: prettier.version,
        postcss: require("postcss/package.json").version,
        postcssScss: require("postcss-scss/package.json").version,
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0]?.model
    };
const metadata = { ...config, pid: process.pid, timeOriginMs: performance.timeOrigin, runtime };
const text = values => JSON.stringify(sources.map((s, i) => [s.path, values[i]]));
const inputHash = hash(text(sources.map(s => s.source)));
const format = source =>
    prettier.format(source, { parser: "scss", plugins: [plugin], grundyScssSorterSafety: config.safety });
const sort = tree => grundyPropSorter({ safety: config.safety }).OnceExit(tree);
const serialize = results => results.map(r => (typeof r === "string" ? r : r.toString(scss.stringify)));

if (config.stage === "counts") {
    const files = [],
        output = [];
    for (const file of sources) {
        const tree = scss.parse(file.source);
        profile.reset();
        profile.enabled = true;
        sort(tree);
        profile.enabled = false;
        files.push({ path: file.path, ...profile.result() });
        output.push(tree.toString(scss.stringify));
    }
    console.log(JSON.stringify({ ...metadata, inputHash, outputHash: hash(text(output)), files }));
} else if (config.stage === "timing") {
    const samples = [],
        phases = [];
    let result;
    for (let round = 0; round < config.warmup + config.samples; round++) {
        const trees = config.measurement === "sort" ? sources.map(s => scss.parse(s.source)) : undefined;
        profile.reset();
        profile.enabled = config.variant === "phases";
        const start = performance.now();
        if (trees) {
            for (const tree of trees) sort(tree);
            result = trees;
        } else {
            result = [];
            for (const file of sources) result.push(await format(file.source));
        }
        const elapsed = performance.now() - start;
        profile.enabled = false;
        if (round >= config.warmup) {
            samples.push(elapsed);
            phases.push(profile.result().phases);
        }
    }
    console.log(
        JSON.stringify({ ...metadata, inputHash, outputHash: hash(text(serialize(result))), samplesMs: samples, phases })
    );
} else if (config.stage === "cpu") {
    for (let i = 0; i < 3; i++)
        for (const file of sources) {
            if (config.measurement === "sort") sort(scss.parse(file.source));
            else await format(file.source);
        }
    const session = new Session();
    session.connect();
    let result;
    try {
        await session.post("Profiler.enable");
        await session.post("Profiler.setSamplingInterval", { interval: 1000 });
        await session.post("Profiler.start");
        for (let i = 0; i < config.repetitions; i++) {
            if (config.measurement === "sort") {
                result = sources.map(s => scss.parse(s.source));
                for (const tree of result) sort(tree);
            } else {
                result = [];
                for (const file of sources) result.push(await format(file.source));
            }
        }
        const { profile: cpu } = await session.post("Profiler.stop");
        await fs.writeFile(config.cpuPath, JSON.stringify(cpu));
        console.log(
            JSON.stringify({
                ...metadata,
                inputHash,
                outputHash: hash(text(serialize(result))),
                cpuPath: config.cpuPath,
                samples: cpu.samples.length,
                durationUs: cpu.endTime - cpu.startTime
            })
        );
    } finally {
        session.disconnect();
    }
} else throw new Error("Unknown profiling stage");
