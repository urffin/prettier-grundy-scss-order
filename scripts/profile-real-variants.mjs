// Research-only source snapshots. No production module is edited.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { snapshot } from "./profile-real-instrument.mjs";
import { corpusManifest, corpusProject, hash } from "./corpus.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)),
    run = promisify(execFile);
function replace(source, before, after) {
    if (source.split(before).length !== 2) throw new Error(`Variant source anchor changed: ${before.slice(0, 80)}`);
    return source.replace(before, after);
}
export function variantSource(source, variant) {
    if (variant === "stock" || variant === "single-node-emissions") return source;
    if (variant === "edge-free-sort")
        return replace(
            source,
            "    // Most real SCSS segments are short.",
            "    if (incoming.every(n => n === 0)) return units.slice().sort((a, b) => compare(a.node, b.node));\n    // Most real SCSS segments are short."
        );
    if (variant === "no-pair-graph")
        return replace(
            source,
            "    const successors = units.map(() => []);",
            "    let declarations = 0;\n    for (const name of names) if (name !== null && ++declarations === 2) break;\n    if (declarations < 2 && additionalEdges.length === 0) return units.slice().sort((a, b) => compare(a.node, b.node));\n    const successors = units.map(() => []);"
        );
    if (variant === "index-16") return replace(source, "if (names.length < 32)", "if (names.length < 16)");
    if (variant === "tree-cache-1024") {
        source = replace(
            source,
            "function namesConflict(first, second) {",
            "function uncachedNamesConflict(first, second) {"
        );
        return (
            source +
            `
let treePairs = new Map(), treePairCount = 0;
export function resetProfilePairCache() { treePairs = new Map(); treePairCount = 0; }
function namesConflict(first, second) {
    if (first === null || second === null) return false;
    const a = first.raw < second.raw ? first.raw : second.raw;
    const b = first.raw < second.raw ? second.raw : first.raw;
    let row = treePairs.get(a);
    const cached = row?.get(b);
    if (cached !== undefined) return cached;
    const value = uncachedNamesConflict(first, second);
    if (treePairCount < 1024) {
        if (!row) { row = new Map(); treePairs.set(a, row); }
        row.set(b, value); treePairCount++;
    }
    return value;
}
`
        );
    }
    throw new Error(`Unknown variant: ${variant}`);
}
export function variantCoreSource(source, variant) {
    if (variant === "single-node-emissions")
        return replace(
            source,
            "const properties = segment[i].nodes.flatMap(emittedProperties);",
            "const properties = segment[i].nodes.length === 1 ? emittedProperties(segment[i].node) : segment[i].nodes.flatMap(emittedProperties);"
        );
    if (variant === "tree-cache-1024")
        return (
            `import { resetProfilePairCache } from './property-conflicts.mjs';\n` +
            replace(
                source,
                "        executionBoundaries = new WeakMap();",
                "        if (safety === 'strict') resetProfilePairCache();\n        executionBoundaries = new WeakMap();"
            )
        );
    return source;
}
const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
        const key = process.argv[i].slice(2),
            value = process.argv[i + 1];
        if (
            !process.argv[i].startsWith("--") ||
            !["output", "measurement", "processes", "samples", "warmup", "variants", "project"].includes(key) ||
            args[key] ||
            !value ||
            value.startsWith("--")
        )
            throw new Error("Invalid variant argument");
        args[key] = value;
    }
    if (!args.output) throw new Error("Pass --output DIRECTORY");
    const output = path.resolve(args.output),
        variants = (args.variants ?? "stock,edge-free-sort,no-pair-graph,index-16,tree-cache-1024").split(",");
    if (new Set(variants).size !== variants.length) throw new Error("Duplicate variants");
    if (args.measurement && !["all", "sort", "format"].includes(args.measurement)) throw new Error("Invalid measurement");
    const processes = Number(args.processes ?? 3),
        samples = Number(args.samples ?? 15),
        warmup = Number(args.warmup ?? 5);
    for (const n of [processes, samples])
        if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("Invalid positive count");
    if (!Number.isInteger(warmup) || warmup < 0 || warmup > 100) throw new Error("Invalid warmup");
    const measurements =
        args.measurement === "format" ? ["format"]
        : args.measurement === "all" ? ["sort", "format"]
        : ["sort"];
    const projects = args.project ? [corpusProject(args.project)] : corpusManifest().projects;
    await fs.mkdir(output, { recursive: true });
    const targets = {},
        report = {
            schemaVersion: 1,
            options: { variants, processes, samples, warmup, measurements },
            workers: [],
            sourceHashes: {},
            variantHashes: {},
            note: "Research snapshots only. Bounded memoization resets at each root; no production/public API change. Process order rotates and reverses. Current dependencies shared."
        };
    try {
        for (const variant of variants) {
            const target = await fs.mkdtemp(path.join(os.tmpdir(), "scss-profile-variant-"));
            targets[variant] = target;
            report.sourceHashes = await snapshot(root, target);
            const file = path.join(target, "src/property-conflicts.mjs"),
                original = await fs.readFile(file, "utf8");
            const patched = variantSource(original, variant);
            await fs.writeFile(file, patched);
            const coreFile = path.join(target, "src/sorter-core.mjs");
            const core = variantCoreSource(await fs.readFile(coreFile, "utf8"), variant);
            await fs.writeFile(coreFile, core);
            report.variantHashes[variant] = { propertyConflicts: hash(patched), sorterCore: hash(core) };
        }
        for (let round = 0; round < processes; round++) {
            const offset = Math.floor(round / 2) % variants.length;
            let order = variants.slice(offset).concat(variants.slice(0, offset));
            if (round % 2) order.reverse();
            for (const project of projects)
                for (const measurement of measurements)
                    for (const variant of order) {
                        const config = {
                            repositoryRoot: root,
                            target: targets[variant],
                            project: project.id,
                            stage: "timing",
                            variant,
                            safety: "strict",
                            measurement,
                            round,
                            warmup,
                            samples
                        };
                        process.stderr.write(`Variant ${project.id}/${measurement}/${variant}/${round + 1}\n`);
                        const result = await run(
                            process.execPath,
                            [fileURLToPath(new URL("profile-real-worker.mjs", import.meta.url)), JSON.stringify(config)],
                            { windowsHide: true, timeout: 600_000, maxBuffer: 16 * 1024 * 1024 }
                        );
                        const worker = JSON.parse(result.stdout),
                            before = report.workers.find(w => w.project === worker.project && w.measurement === measurement);
                        if (before && (before.outputHash !== worker.outputHash || before.inputHash !== worker.inputHash))
                            throw new Error("Variant output differs");
                        report.workers.push(worker);
                        await fs.writeFile(path.join(output, "variants.json"), JSON.stringify(report, null, 2));
                    }
        }
        console.log(JSON.stringify({ output, variants, workers: report.workers.length }));
    } finally {
        for (const target of Object.values(targets)) {
            const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(target));
            if (
                !relative ||
                relative.startsWith("..") ||
                path.isAbsolute(relative) ||
                !path.basename(target).startsWith("scss-profile-variant-")
            )
                throw new Error("Invalid variant cleanup");
            await fs.rm(target, { recursive: true, force: true });
        }
    }
}
