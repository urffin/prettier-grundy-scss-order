import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statistics } from "../benchmark-statistics.mjs";

export function summarizeCounts(worker) {
    const counts = {},
        segments = [],
        files = [];
    for (const file of worker.files) {
        for (const [name, value] of Object.entries(file.counts)) counts[name] = (counts[name] ?? 0) + value;
        for (const segment of file.segments) segments.push({ file: file.path, ...segment });
        files.push({ file: file.path, counts: file.counts, graphs: file.segments.filter(s => s.units >= 2).length });
    }
    const graphs = segments.filter(s => s.units >= 2);
    return {
        project: worker.project,
        safety: worker.safety,
        counts,
        graphs: graphs.length,
        maxSegment: Math.max(0, ...segments.map(s => s.units)),
        emptyEdgeGraphs: graphs.filter(s => s.propertyEdges + s.extraEdges === 0).length,
        segmentSizes: Object.fromEntries(
            [
                [0, 1],
                [2, 7],
                [8, 15],
                [16, 31],
                [32, Infinity]
            ].map(([lo, hi]) => [
                hi === Infinity ? `${lo}+` : `${lo}-${hi}`,
                segments.filter(s => s.units >= lo && s.units <= hi).length
            ])
        ),
        largest: graphs.toSorted((a, b) => b.predicateChecks - a.predicateChecks).slice(0, 12),
        files: files.toSorted((a, b) => (b.counts.predicateChecks ?? 0) - (a.counts.predicateChecks ?? 0))
    };
}

const basename = url => url.replaceAll("\\", "/").split("/").at(-1);
function frameCategory(frame) {
    const file = basename(frame.url),
        name = frame.functionName;
    if (file === "sorter-core.mjs") {
        if (["compileGroups", "createSorter"].includes(name)) return "configuration";
        if (name === "collectUnits") return "collectUnits";
        if (["prepareNodes", "checkCriteria"].includes(name)) return "prepareKeys";
        if (name === "hasExecutionBoundary") return "executionBoundaries";
        if (["declarationCrossings", "emittedProperties"].includes(name)) return "nestedCrossings";
        if (name === "sortContainer") return "containerTraversalAndWriteBack";
    }
    if (file === "property-conflicts.mjs") {
        if (name === "namesConflict") return "propertyPredicate";
        if (
            [
                "buildConstraints",
                "addDirectConstraints",
                "addDenseConstraints",
                "prefixes",
                "families",
                "addToIndex"
            ].includes(name)
        )
            return "graphBuildOther";
        if (["before", "push", "pop", "siftDown", "AvailableQueue"].includes(name)) return "selectionQueue";
        if (name === "sortWithPropertyConstraints") return "graphPrepareAndLinearSelection";
    }
    return null;
}
export function summarizeCPU(cpu) {
    const nodes = new Map(cpu.nodes.map(n => [n.id, n])),
        parents = new Map();
    for (const node of cpu.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
    const categories = {},
        hot = new Map();
    let totalUs = 0,
        sorterUs = 0,
        gcUs = 0;
    for (let i = 0; i < cpu.samples.length; i++) {
        const node = nodes.get(cpu.samples[i]),
            weight = cpu.timeDeltas[i];
        totalUs += weight;
        const stack = [];
        for (let current = node; current; current = nodes.get(parents.get(current.id))) stack.push(current.callFrame);
        const inside = stack.some(
            f => ["sortContainer", "createSorter"].includes(f.functionName) && basename(f.url) === "sorter-core.mjs"
        );
        const gc = node.callFrame.functionName === "(garbage collector)";
        let category = gc ? "garbageCollection" : null;
        if (inside && !gc) {
            sorterUs += weight;
            category = stack.map(frameCategory).find(Boolean) ?? "sorterOther";
            if (category === "propertyPredicate" && stack.some(f => f.functionName === "declarationCrossings"))
                category = "nestedCrossings";
            const frame = stack.find(f => f.url.includes("/src/") && f.url.endsWith(".mjs")) ?? node.callFrame;
            const key = `${basename(frame.url)}:${frame.functionName || "<anonymous>"}:${frame.lineNumber + 1}`;
            hot.set(key, (hot.get(key) ?? 0) + weight);
        } else if (!category) {
            const urls = stack.map(f => f.url);
            category =
                urls.some(u => /prettier[\/].*postcss|prettier[\/]plugins[\/]postcss/.test(u)) ? "prettierPostcssPlugin"
                : urls.some(u => u.includes("prettier")) ? "prettierFrameworkOther"
                : urls.some(u => u.includes("postcss")) ? "postcssParseOrSerialize"
                : "other";
        }
        if (gc) gcUs += weight;
        categories[category] = (categories[category] ?? 0) + weight;
    }
    return {
        samples: cpu.samples.length,
        totalSampledMs: totalUs / 1000,
        sorterSampledMs: sorterUs / 1000,
        gcSampledMs: gcUs / 1000,
        categoriesMs: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v / 1000])),
        hotSorterFrames: [...hot]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([frame, us]) => ({ frame, ms: us / 1000, percentOfSorter: (us / sorterUs) * 100 }))
    };
}

export async function summarize(reports) {
    const workers = reports.flatMap(r => r.workers),
        timings = [],
        cpu = [];
    for (const worker of workers.filter(w => w.stage === "timing")) {
        if (
            timings.some(
                r =>
                    r.project === worker.project &&
                    r.safety === worker.safety &&
                    r.measurement === worker.measurement &&
                    r.variant === worker.variant
            )
        )
            continue;
        const matching = workers.filter(
            w =>
                w.stage === "timing" &&
                w.project === worker.project &&
                w.safety === worker.safety &&
                w.measurement === worker.measurement &&
                w.variant === worker.variant
        );
        const samples = matching.flatMap(w => w.samplesMs),
            phaseSamples = matching.flatMap(w => w.phases);
        const names = [...new Set(phaseSamples.flatMap(p => Object.keys(p)))];
        const phases = Object.fromEntries(
            names.map(name => [name, statistics(phaseSamples.map(p => p[name]?.exclusiveMs ?? 0))])
        );
        if (worker.variant === "phases")
            phases.uninstrumentedRemainder = statistics(
                samples.map((value, i) => value - Object.values(phaseSamples[i]).reduce((sum, p) => sum + p.exclusiveMs, 0))
            );
        timings.push({
            project: worker.project,
            safety: worker.safety,
            measurement: worker.measurement,
            variant: worker.variant,
            total: statistics(samples),
            phases
        });
    }
    for (const worker of workers.filter(w => w.stage === "cpu"))
        cpu.push({
            project: worker.project,
            measurement: worker.measurement,
            repetitions: worker.repetitions,
            ...summarizeCPU(JSON.parse(await fs.readFile(worker.cpuPath, "utf8")))
        });
    const calibration = timings
        .filter(t => t.variant === "phases")
        .map(t => {
            const stock = timings.find(
                s =>
                    s.variant === "stock" &&
                    s.project === t.project &&
                    s.safety === t.safety &&
                    s.measurement === t.measurement
            );
            return {
                project: t.project,
                safety: t.safety,
                measurement: t.measurement,
                observedRatio: t.total.medianMs / stock.total.medianMs,
                note: "Instrumented/stock medians, not a debiasing factor; wrappers also change JIT and allocation behavior."
            };
        });
    return { counts: workers.filter(w => w.stage === "counts").map(summarizeCounts), timings, calibration, cpu };
}
export async function main(files = process.argv.slice(2)) {
    if (!files.length) throw new Error("Pass one or more profile.json files");
    const result = await summarize(await Promise.all(files.map(async f => JSON.parse(await fs.readFile(f, "utf8")))));
    const target = path.join(path.dirname(files.at(-1)), "summary.json");
    await fs.writeFile(target, JSON.stringify(result, null, 2) + "\n");
    console.log(
        JSON.stringify(
            {
                summary: target,
                counts: result.counts.map(({ project, safety, counts, graphs, emptyEdgeGraphs, maxSegment }) => ({
                    project,
                    safety,
                    counts,
                    graphs,
                    emptyEdgeGraphs,
                    maxSegment
                })),
                timingRows: result.timings.length,
                cpuProfiles: result.cpu.length
            },
            null,
            2
        )
    );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
