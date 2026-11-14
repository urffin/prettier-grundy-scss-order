import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { scenarios } from "./benchmark-scenarios.mjs";
const config = JSON.parse(process.argv[2]);
const require = createRequire(path.join(config.dependencies, "package.json"));
const scss = require("postcss-scss"),
    prettier = require("prettier");
const { grundyPropSorter } = await import(pathToFileURL(path.join(config.target, "src/grundy-prop-sorter.mjs")));
const plugin = (await import(pathToFileURL(path.join(config.target, "src/index.mjs")))).default;
// Legacy aliases also support comparisons with releases before strict/loose.
const choices = plugin.options?.grundyScssSorterSafety?.choices.map(choice => choice.value) ?? [];
const safety =
    choices.includes(config.safety) ? config.safety
    : config.safety === "strict" ? "conservative"
    : "structural";
if (!choices.includes(safety)) throw new Error(`Target does not support ${config.safety} safety (requires 0.3.0 or later)`);
const rows = [];
for (const scenario of scenarios.filter(s => !config.scenario || s.id === config.scenario)) {
    const samplesMs = [];
    let result;
    for (let round = 0; round < config.warmup + config.samples; round++) {
        const tree = config.measurement === "sort" ? scss.parse(scenario.source) : undefined;
        const start = performance.now();
        if (tree) {
            grundyPropSorter({ safety }).OnceExit(tree);
            result = tree;
        } else
            result = await prettier.format(scenario.source, {
                parser: "scss",
                plugins: [plugin],
                grundyScssSorterSafety: safety
            });
        const elapsed = performance.now() - start;
        if (round >= config.warmup) samplesMs.push(elapsed);
    }
    // Serialization/hashing is outside the timed section.
    const output = typeof result === "string" ? result : result.toString(scss.stringify);
    rows.push({
        scenario: scenario.id,
        inputHash: createHash("sha256").update(scenario.source).digest("hex"),
        outputHash: createHash("sha256").update(output).digest("hex"),
        samplesMs
    });
}
console.log(
    JSON.stringify({
        pid: process.pid,
        safety: config.safety,
        resolvedSafety: safety,
        measurement: config.measurement,
        packageVersion: JSON.parse(await readFile(path.join(config.target, "package.json"), "utf8")).version,
        runtime: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            cpu: cpus()[0]?.model ?? null,
            prettier: prettier.version,
            postcss: require("postcss/package.json").version,
            postcssScss: require("postcss-scss/package.json").version
        },
        rows
    })
);
