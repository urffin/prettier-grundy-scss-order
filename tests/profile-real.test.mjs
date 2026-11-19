import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "uvu";
import * as assert from "uvu/assert";
import scss from "postcss-scss";
import prettier from "prettier";
import plugin from "../src/index.mjs";
import { grundyPropSorter } from "../src/grundy-prop-sorter.mjs";
import { instrument, snapshot } from "../scripts/profile-real-instrument.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "scss-profile-test-"));
const targets = {};
test.before(async () => {
    for (const mode of ["counts", "phases"]) {
        const folder = path.join(directory, mode);
        await snapshot(root, folder, mode);
        targets[mode] = {
            plugin: (await import(pathToFileURL(path.join(folder, "src/index.mjs")))).default,
            sort: (await import(pathToFileURL(path.join(folder, "src/grundy-prop-sorter.mjs")))).grundyPropSorter,
            profile: (await import(pathToFileURL(path.join(folder, "src/__profile.mjs")))).profile
        };
    }
});
test.after(async () => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory));
    if (
        !relative ||
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        !path.basename(directory).startsWith("scss-profile-test-")
    )
        throw new Error("Invalid cleanup target");
    await fs.rm(directory, { recursive: true, force: true });
});
function observed(source, mode, safety = "strict") {
    const tree = scss.parse(source),
        { sort, profile } = targets[mode];
    profile.reset();
    profile.enabled = true;
    const start = performance.now();
    sort({ safety }).OnceExit(tree);
    const elapsed = performance.now() - start;
    profile.enabled = false;
    const original = scss.parse(source);
    grundyPropSorter({ safety }).OnceExit(original);
    assert.is(tree.toString(scss.stringify), original.toString(scss.stringify), "Profile copy changed sorting");
    return { ...profile.result(), elapsed };
}
test("Profiler counts actual short-path pairs, nested dependencies and per-file cache misses", () => {
    const short = observed(".a { color:red; width:1px; height:2px; color:blue; }", "counts");
    assert.is(short.counts.directPairVisits, 6);
    assert.is(short.counts.predicateChecks, 6);
    assert.is(short.counts.propertyEdges, 1);
    assert.is(short.counts.uniqueUnorderedPairs, 4);
    const nested = observed(".a { color:red; @media (min-width:1px) { color:blue; } color:green; }", "counts");
    assert.is(nested.counts.directPairVisits, 3);
    assert.is(nested.counts.nullPredicateChecks, 2);
    assert.is(nested.counts.predicateChecks, 4);
    assert.is(nested.counts.crossingCheckerCalls, 2);
    assert.is(nested.counts.crossingCacheMisses, 1);
    assert.is(nested.counts.propertyEdges, 1);
    assert.is(nested.counts.additionalEdges, 2);
    assert.is(nested.segments.find(s => s.units === 3).propertyEdges, 1);
});
test("Profiler distinguishes sparse roots, dense fallback and transitive skips", () => {
    const dense = observed(`.a { ${Array.from({ length: 40 }, (_, i) => `border-${i}:0;`).join("")} }`, "counts");
    assert.is(dense.counts.denseFallbacks, 1);
    assert.is(dense.counts.indexedPairVisits, 496);
    assert.is(dense.counts.densePairVisits, 284);
    assert.is(dense.counts.transitiveSkips, 276);
    assert.is(dense.counts.propertyEdges, 504);
    assert.is(dense.counts.denseBitsetBytes, 320);
    const sparse = observed(Array.from({ length: 50 }, (_, i) => `.a${i} { color:red; }`).join(""), "counts");
    assert.is(sparse.counts.noDeclarationGraphs, 1);
    assert.is(sparse.counts.predicateChecks ?? 0, 0);
    assert.is(sparse.counts.heapSelections, 1);
});
test("Exclusive phase clocks preserve both modes and do not double-count recursive time", () => {
    for (const safety of ["strict", "loose"]) {
        const source = ".a { /* before */ width:1px; height:2px; @if $ok { color:red; } @else { color:blue; } // footer\n }";
        const result = observed(source, "phases", safety);
        assert.ok(result.phases.collectUnits.calls > 0 && result.phases.prepareKeys.calls > 0);
        const sum = Object.values(result.phases).reduce((n, p) => n + p.exclusiveMs, 0);
        assert.ok(sum >= 0 && sum <= result.elapsed + 0.1);
        assert.is(!!result.phases.graphBuild, safety === "strict");
    }
    assert.throws(
        () => instrument("function namesConflict(first, second) {}", "property-conflicts.mjs", "counts"),
        /anchor changed/
    );
});

test("Full-format profile measures direct parse/serialize and map fallback once", async () => {
    const { plugin: observed, profile } = targets.phases;
    for (const source of [
        ".a { width:1px; color:red; }",
        ".a { width:1px; color:red; } /*# sourceMappingURL=__scss_profile_missing__.map */"
    ]) {
        const options = { parser: "scss" };
        const expected = await prettier.format(source, { ...options, plugins: [plugin] });
        profile.reset();
        profile.enabled = true;
        let actual;
        try {
            actual = await prettier.format(source, { ...options, plugins: [observed] });
        } finally {
            profile.enabled = false;
        }
        assert.is(actual, expected);
        const { phases } = profile.result();
        for (const name of ["postcssParse", "postcssSerialize", "prettierParse", "pluginIntegration"])
            assert.is(phases[name].calls, 1, name);
    }
});
test.run();
