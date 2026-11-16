import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { cpus } from "node:os";

const config = JSON.parse(process.argv[2]);
const dataset = JSON.parse(await fs.readFile(config.dataset, "utf8"));
const hash = text => createHash("sha256").update(text).digest("hex");
const batch = texts => JSON.stringify(dataset.files.map((f, i) => [f.path, texts[i]]));
const inputHash = hash(batch(dataset.files.map(f => f.source)));
if (inputHash !== dataset.inputHash) throw new Error("Research input checksum mismatch");
const version = async name =>
    JSON.parse(await fs.readFile(path.join(config.root, "node_modules", name, "package.json"), "utf8")).version;
const runtime = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    prettier: await version("prettier"),
    postcss: await version("postcss"),
    postcssScss: await version("postcss-scss")
};
const metadata = { ...config, pid: process.pid, timeOriginMs: performance.timeOrigin, runtime, inputHash };

async function load() {
    const prettier = (await import(pathToFileURL(path.join(config.root, "node_modules/prettier/index.mjs")))).default;
    let plugin, clock;
    if (config.implementation === "profile") {
        const research = await import(new URL("./format-pipeline-variants.mjs", import.meta.url));
        clock = research.phaseClock();
        plugin = research.createPipelinePlugin(config.formatter === "plain" ? "profile-plain" : "profile", { clock });
    } else if (config.implementation !== "stock") {
        const research = await import(new URL("./format-pipeline-variants.mjs", import.meta.url));
        plugin = research.createPipelinePlugin(config.implementation);
    } else if (config.formatter !== "plain") {
        plugin = (await import(pathToFileURL(path.join(config.root, "src/index.mjs")))).default;
    }
    const options = {
        parser: "scss",
        ...(plugin ? { plugins: [plugin] } : {}),
        ...(config.formatter === "plain" ? {} : { grundyScssSorterSafety: config.formatter })
    };
    return {
        clock,
        async format() {
            const results = [];
            for (const file of dataset.files) results.push(await prettier.format(file.source, options));
            return results;
        }
    };
}

let result;
const record = { ...metadata };
if (config.metric === "memory") {
    if (!global.gc) throw new Error("Memory research requires --expose-gc");
    let formatter;
    if (config.memoryRegime === "warm") {
        formatter = await load();
        async function warm() {
            await formatter.format();
        }
        await warm();
    } else if (config.memoryRegime !== "cold") throw new Error("Invalid memory regime");
    const gc = () => {
        global.gc();
        global.gc();
    };
    const snapshot = () => ({ ...process.memoryUsage(), maxRSS: process.resourceUsage().maxRSS * 1024 });
    gc();
    const before = snapshot();
    formatter ??= await load();
    result = await formatter.format();
    const after = snapshot();
    gc();
    const afterGC = snapshot();
    record.snapshots = { before, after, afterGC };
    record.gcExposed = true;
} else {
    const formatter = await load();
    record.samplesMs = [];
    record.phases = [];
    for (let i = 0; i < config.warmup + config.samples; i++) {
        formatter.clock?.reset();
        const started = performance.now();
        result = await formatter.format();
        const elapsed = performance.now() - started;
        if (i >= config.warmup) {
            record.samplesMs.push(elapsed);
            if (formatter.clock) record.phases.push(formatter.clock.result);
        }
    }
    record.gcExposed = typeof global.gc === "function";
}
record.outputHash = hash(batch(result));
if (record.outputHash !== dataset.expected[config.formatter]) throw new Error("Research variant changed formatting output");
record.outputBytes = result.reduce((sum, text) => sum + Buffer.byteLength(text), 0);
console.log(JSON.stringify(record));
