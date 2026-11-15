import fs from "node:fs/promises";
import path from "node:path";
import { parsers } from "prettier/plugins/babel";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const hash = value => createHash("sha256").update(value).digest("hex");
function replace(source, from, to, expected = 1) {
    const count = source.split(from).length - 1;
    if (count !== expected) throw new Error(`Profiling anchor changed (${count}/${expected}): ${from.slice(0, 90)}`);
    return source.replaceAll(from, to);
}
function wrapFunctions(source, selected) {
    const parsed = parsers.babel.parse(source),
        edits = [],
        found = new Set();
    function visit(node) {
        if (!node || typeof node !== "object") return;
        if (node.type === "FunctionDeclaration" && node.id && selected[node.id.name]) {
            const phase = selected[node.id.name];
            found.add(node.id.name);
            edits.push([node.body.start + 1, `\nconst __profileFrame = __profile.enter(${JSON.stringify(phase)}); try {\n`]);
            edits.push([node.body.end - 1, "\n} finally { __profile.leave(__profileFrame); }\n"]);
        }
        for (const [key, child] of Object.entries(node))
            if (!["loc", "comments", "tokens", "extra"].includes(key)) {
                if (Array.isArray(child)) child.forEach(visit);
                else if (typeof child === "object") visit(child);
            }
    }
    visit(parsed);
    for (const name of Object.keys(selected)) if (!found.has(name)) throw new Error(`Missing profile function: ${name}`);
    for (const [at, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, at) + text + source.slice(at);
    return source;
}
export function instrument(source, file, mode) {
    source = source.replaceAll("\r\n", "\n");
    if (source.includes("__profile")) throw new Error("Profiling identifier already present");
    if (mode === "stock") return source;
    if (!["counts", "phases"].includes(mode)) throw new Error(`Unknown instrumentation: ${mode}`);
    if (mode === "counts") {
        if (file === "sorter-core.mjs") {
            for (const [from, to] of [
                [
                    "const { units, footer } = collectUnits(children, adapter);",
                    "const { units, footer } = collectUnits(children, adapter); __profile.inc('containers'); __profile.inc('units', units.length); __profile.inc('footerComments', footer.length);"
                ],
                [
                    "if (executionBoundaries.has(node)) return executionBoundaries.get(node);",
                    "__profile.inc('boundaryLookups'); if (executionBoundaries.has(node)) { __profile.inc('boundaryCacheHits'); return executionBoundaries.get(node); }"
                ],
                [
                    "executionBoundaries.set(node, boundary);",
                    "executionBoundaries.set(node, boundary); if (boundary) __profile.inc('boundaryNodes');"
                ],
                ["for (const group of groups) {", "for (const group of groups) { __profile.inc('groupCriteriaChecks');"],
                ["return (a, b) => {", "return (a, b) => { __profile.inc('orderingComparisons');"],
                [
                    "edges.push([Math.min(i, j), Math.max(i, j)]);",
                    "__profile.inc('crossingEdgesFound'); edges.push([Math.min(i, j), Math.max(i, j)]);"
                ],
                [
                    "for (const j of positions) {",
                    "for (const j of positions) { __profile.inc('crossingBlockDeclarationVisits');"
                ]
            ])
                source = replace(source, from, to);
        }
        if (file === "property-conflicts.mjs") {
            for (const [from, to, count = 1] of [
                [
                    "function namesConflict(first, second) {",
                    "function namesConflict(first, second) { __profile.inc('predicateChecks'); __profile.pair(first, second); if (first === null || second === null) __profile.inc('nullPredicateChecks');"
                ],
                ["function normalize(property) {", "function normalize(property) { __profile.inc('normalizations');"],
                [
                    "if (!pairs.has(first)) pairs.set(first, new Map());",
                    "__profile.inc('crossingCheckerCalls'); if (!pairs.has(first)) pairs.set(first, new Map());"
                ],
                [
                    "if (!matches.has(second)) matches.set(second, namesConflict(prepare(first), prepare(second)));",
                    "if (!matches.has(second)) { __profile.inc('crossingCacheMisses'); matches.set(second, namesConflict(prepare(first), prepare(second))); }"
                ],
                [
                    "for (let j = Math.max(i + 1, start); j < names.length; j++) {",
                    "for (let j = Math.max(i + 1, start); j < names.length; j++) { __profile.inc('directPairVisits');"
                ],
                [
                    "for (let i = j - 1; i >= 0; i--) {",
                    "for (let i = j - 1; i >= 0; i--) { __profile.inc('densePairVisits');"
                ],
                [
                    "if (covered[word] & bit) continue;",
                    "if (covered[word] & bit) { __profile.inc('transitiveSkips'); continue; }"
                ],
                ["successors[i].push(j);", "__profile.inc('propertyEdges'); successors[i].push(j);", 3],
                ["successors[before].push(after);", "__profile.inc('additionalEdges'); successors[before].push(after);"],
                ["if (names.length < 32) {", "if (names.length < 32) { __profile.inc('shortGraphSegments');"],
                ["const exact = new Map();", "__profile.inc('indexedGraphSegments'); const exact = new Map();"],
                [
                    "const candidates = new Set(opaque);",
                    "__profile.inc('candidateSets'); const candidates = new Set(opaque);"
                ],
                [
                    "if (j >= 32 && candidates.size * 2 >= j) {",
                    "__profile.inc('candidateItems', candidates.size); if (j >= 32 && candidates.size * 2 >= j) { __profile.inc('denseFallbacks');"
                ],
                ["for (const i of candidates) {", "for (const i of candidates) { __profile.inc('indexedPairVisits');"],
                [
                    "if (names.length * words * 4 > 8 * 1024 * 1024) {",
                    "if (names.length * words * 4 > 8 * 1024 * 1024) { __profile.inc('denseBudgetFallbacks');"
                ],
                [
                    "const bits = new Uint32Array(names.length * words);",
                    "__profile.inc('denseBitsetBytes', names.length * words * 4); const bits = new Uint32Array(names.length * words);"
                ],
                [
                    "if (units.length < 2) return units.slice();",
                    "const __profileSegment = __profile.segment(units, propertyName, additionalEdges); if (units.length < 2) { __profile.finishSegment(__profileSegment); return units.slice(); }"
                ],
                ["    return sorted;\n}", "    __profile.finishSegment(__profileSegment); return sorted;\n}"],
                [
                    "const available = units.length < 16 ? null : new AvailableQueue(units, compare, incoming);",
                    "__profile.inc(units.length < 16 ? 'linearSelections' : 'heapSelections'); const available = units.length < 16 ? null : new AvailableQueue(units, compare, incoming);"
                ],
                [
                    "for (let i = 0; i < units.length; i++) {",
                    "for (let i = 0; i < units.length; i++) { __profile.inc('linearScanPositions');"
                ],
                ["before(first, second) {", "before(first, second) { __profile.inc('queueComparisons');"],
                ["pop() {", "pop() { __profile.inc('queuePops');"],
                ["push(value) {", "push(value) { __profile.inc('queuePushes');"]
            ])
                source = replace(source, from, to, count);
        }
    } else {
        const selected =
            file === "sorter-core.mjs" ?
                {
                    createSorter: "configuration",
                    collectUnits: "collectUnits",
                    prepareNodes: "prepareKeys",
                    sortContainer: "traversalAndBoundaries",
                    declarationCrossings: "nestedCrossings",
                    splitGroupsInternal: "groupSpacing"
                }
            : file === "property-conflicts.mjs" ?
                { buildConstraints: "graphBuild", sortWithPropertyConstraints: "graphPrepare" }
            : file === "configuration.mjs" ? { resolveConfiguration: "resolveConfiguration" }
            : file === "index.mjs" ? { grundyParseSorter: "pluginIntegration" }
            : {};
        if (file === "property-conflicts.mjs") {
            source = replace(
                source,
                "const available = units.length < 16 ? null : new AvailableQueue(units, compare, incoming);",
                "const __selectionFrame = __profile.enter('selection'); try {\nconst available = units.length < 16 ? null : new AvailableQueue(units, compare, incoming);"
            );
            source = replace(
                source,
                "    return sorted;\n}",
                "    return sorted;\n} finally { __profile.leave(__selectionFrame); }\n}"
            );
        }
        if (file === "sorter-core.mjs") {
            source = replace(
                source,
                "            if (splitGroups) splitGroupsInternal",
                "            const __writeFrame = __profile.enter('writeBack'); try {\n            if (splitGroups) splitGroupsInternal"
            );
            source = replace(
                source,
                "            adapter.finishContainer(container);",
                "            adapter.finishContainer(container);\n} finally { __profile.leave(__writeFrame); }"
            );
        }
        if (file === "index.mjs") {
            source = replace(
                source,
                "syntax: postcssScss",
                "syntax: { parse: (...args) => __profile.measure('postcssParse', () => postcssScss.parse(...args)), stringify: (...args) => __profile.measure('postcssSerialize', () => postcssScss.stringify(...args)) }"
            );
            source = replace(
                source,
                "return prettierPostcss.parsers[options.parser].parse(sortedCss, [options.parser], options);",
                "return await __profile.async('prettierParse', () => prettierPostcss.parsers[options.parser].parse(sortedCss, [options.parser], options));"
            );
        }
        source = wrapFunctions(source, selected);
    }
    return `import { profile as __profile } from './__profile.mjs';\n${source}`;
}

export async function snapshot(repositoryRoot, destination, mode = "stock") {
    await fs.mkdir(path.join(destination, "src"), { recursive: true });
    const hashes = {};
    async function copy(directory, relative = "") {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const name = path.join(relative, entry.name),
                original = path.join(directory, entry.name),
                target = path.join(destination, "src", name);
            if (entry.isDirectory()) {
                await fs.mkdir(target, { recursive: true });
                await copy(original, name);
            } else if (entry.isFile()) {
                const source = await fs.readFile(original, "utf8");
                hashes[`src/${name.replaceAll(path.sep, "/")}`] = hash(source);
                await fs.writeFile(target, relative ? source : instrument(source, entry.name, mode));
            } else throw new Error("Profiling snapshot must not follow source symlinks");
        }
    }
    await copy(path.join(repositoryRoot, "src"));
    await fs.copyFile(path.join(repositoryRoot, "package.json"), path.join(destination, "package.json"));
    await fs.copyFile(
        fileURLToPath(new URL("profile-real-runtime.mjs", import.meta.url)),
        path.join(destination, "src/__profile.mjs")
    );
    await fs.symlink(
        path.join(repositoryRoot, "node_modules"),
        path.join(destination, "node_modules"),
        process.platform === "win32" ? "junction" : "dir"
    );
    return hashes;
}
