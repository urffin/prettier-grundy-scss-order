import { readFile } from "node:fs/promises";
import { test } from "uvu";
import * as assert from "uvu/assert";
import prettier from "prettier";
import { compileString } from "sass";
import plugin from "../src/index.mjs";
import { createPropertyConflictChecker, sortWithPropertyConstraints } from "../src/property-conflicts.mjs";

// Observe graph size and temporary storage without adding runtime exports or a
// public tuning option. The source is self-contained; the local typed-array
// binding records allocations without changing globals or other test suites.
const source = await readFile(new URL("../src/property-conflicts.mjs", import.meta.url), "utf8");
const observed = await import(
    `data:text/javascript;base64,${Buffer.from(
        `export const allocations = [];
const Uint32Array = class extends globalThis.Uint32Array {
    constructor(length) { super(length); allocations.push(length * 4); }
    static get [Symbol.species]() { return globalThis.Uint32Array; }
};
${source}
export { buildConstraints, normalize };`
    ).toString("base64")}`
);
function graph(properties) {
    observed.allocations.length = 0;
    const names = properties.map(raw =>
        raw === null ? null : { raw, name: raw.startsWith("--") ? raw : observed.normalize(raw) }
    );
    const successors = names.map(() => []),
        incoming = names.map(() => 0);
    observed.buildConstraints(names, successors, incoming);
    return { successors, incoming };
}

// Full conflict graph and independent linear selection are the oracle. Pair
// semantics come from the authoritative checker, not from candidate discovery
// or the reduced graph. Extra edges model dependencies across nested blocks.
function reference(properties, compare, extra = []) {
    const conflict = createPropertyConflictChecker(),
        successors = properties.map(() => []),
        incoming = properties.map(() => 0);
    function edge(i, j) {
        successors[i].push(j);
        incoming[j]++;
    }
    for (let i = 0; i < properties.length; i++)
        for (let j = i + 1; j < properties.length; j++)
            if (properties[i] !== null && properties[j] !== null && conflict(properties[i], properties[j])) edge(i, j);
    for (const [i, j] of extra) edge(i, j);
    const result = [];
    while (result.length < properties.length) {
        let best = -1;
        for (let i = 0; i < properties.length; i++)
            if (incoming[i] === 0 && (best === -1 || compare({ id: i }, { id: best }) < 0)) best = i;
        assert.ok(best !== -1);
        result.push(best);
        incoming[best] = -1;
        for (const j of successors[best]) incoming[j]--;
    }
    return result;
}
function check(properties, extra = []) {
    const units = properties.map((property, id) => ({ node: { property, id } }));
    for (const compare of [(a, b) => b.id - a.id, (a, b) => (a.id % 7) - (b.id % 7), () => 0]) {
        const result = sortWithPropertyConstraints(units, compare, n => n.property, extra);
        assert.equal(
            result.map(u => u.node.id),
            reference(properties, compare, extra)
        );
        for (const unit of result) assert.is(unit, units[unit.node.id]);
    }
}

test("Dense fallback keeps reachability with far fewer edges", () => {
    const properties = Array.from(
        { length: 500 },
        (_, i) => ["border", "border-top", "border-color", "border-image"][i % 4]
    );
    const { successors, incoming } = graph(properties);
    // A full clique has 124750 edges. The indexed prefix stays intact and the
    // dense suffix needs only paths, without timing-dependent assertions.
    assert.ok(successors.reduce((n, list) => n + list.length, 0) < 1000);
    assert.is(incoming[0], 0);
    for (let i = 1; i < properties.length; i++) {
        assert.ok(successors[i - 1].includes(i));
        assert.ok(incoming[i] > 0);
    }
    check(properties);
});

test("Bit boundaries preserve chains and independent choices", () => {
    for (const n of [31, 32, 33, 63, 64, 65, 95, 96, 97, 127, 128, 129]) {
        check(Array.from({ length: n }, (_, i) => ["margin-top", "margin", "margin-left", "color", null][i % 5]));
        // Guarantee dense activation on the first eligible position, including
        // the high bit of each 32-bit word and propagation into the next word.
        check(Array.from({ length: n }, (_, i) => (i % 17 === 0 ? "direction" : "all")));
    }
});

test("Late dense activation carries dependencies from the existing prefix", () => {
    const prefix = Array(16)
        .fill("color")
        .concat(Array.from({ length: 64 }, (_, i) => "property-" + i));
    check(prefix.concat(["all", "direction", "--Token", "--token", null], Array(50).fill("background")));
    // The same candidate family can contain no conflicting pairs.
    check(Array.from({ length: 96 }, (_, i) => "margin-unknown-" + i));
    check(Array.from({ length: 96 }, (_, i) => (i < 33 ? "border-" + i : "property-" + i)));
});

test("Reduced property paths coexist with duplicate nested-block dependencies", () => {
    const properties = Array(33)
        .fill("color")
        .concat(Array.from({ length: 63 }, (_, i) => [null, "direction", "--x", "all"][i % 4]));
    check(properties, [
        [0, 33],
        [32, 33],
        [32, 33],
        [33, 70],
        [45, 80],
        [63, 95]
    ]);
});

test("Short and sparse paths allocate no ancestor buffer and dense storage is bounded", () => {
    for (const n of [16, 31, 32]) {
        graph(Array(n).fill("color"));
        assert.equal(observed.allocations, []);
    }
    graph(Array.from({ length: 1000 }, (_, i) => "property-" + i));
    assert.equal(observed.allocations, []);
    graph(Array(65).fill("color"));
    assert.equal(observed.allocations, [65 * 3 * 4]);

    // Just above the 8 MiB budget. A short dense prefix triggers fallback;
    // null nodes keep the direct graph small despite the wide segment.
    const properties = Array(33)
        .fill("color")
        .concat(Array(8193 - 33).fill(null));
    observed.allocations.length = 0;
    const units = properties.map((property, id) => ({ node: { property, id } }));
    const sorted = observed.sortWithPropertyConstraints(
        units,
        (a, b) => b.id - a.id,
        n => n.property
    );
    assert.equal(observed.allocations, []);
    assert.equal(
        sorted.map(u => u.node.id),
        units
            .slice(33)
            .reverse()
            .concat(units.slice(0, 33))
            .map(u => u.node.id)
    );
});

test("Dense graphs match full constraints on deterministic mixed property sequences", () => {
    let seed = 0x672918ab;
    const next = n => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % n;
    };
    const pool = [
        null,
        "*",
        "all",
        "direction",
        "unicode-bidi",
        "--A",
        "--a",
        "color",
        "COLOR",
        "margin",
        "margin-left",
        "margin-inline",
        "border",
        "border-radius",
        "border-top",
        "border-image",
        "grid",
        "grid-row",
        "grid-column",
        "grid-template-rows",
        "top",
        "left",
        "inline-size",
        "width",
        "word-wrap",
        "overflow-wrap",
        "grid-gap",
        "gap",
        "-webkit-transform",
        "transform"
    ];
    for (let round = 0; round < 160; round++) {
        const properties = Array.from({ length: 33 + next(97) }, (_, i) =>
            round % 2 === 0 && i < 33 ? "border-top" : pool[next(pool.length)]
        );
        const extra = [];
        for (let i = 0; i < 8; i++) {
            const a = next(properties.length),
                b = next(properties.length);
            if (a !== b) extra.push([Math.min(a, b), Math.max(a, b)]);
        }
        check(properties, extra);
    }
});

test("Dense declarations retain compiled CSS, comments and media crossings", async () => {
    const declarations = Array.from(
        { length: 40 },
        (_, i) =>
            `// declaration ${i}\n${["border: 0", "border-top: 1px solid red", "border-color: blue", "border-image: none"][i % 4]};`
    ).join("\n");
    const input = `.a { ${declarations}\n// media\n@media (min-width: 600px) { border-color: red; }\n// after\nborder-color: green; }`;
    for (const split of [false, true]) {
        const options = { parser: "scss", plugins: [plugin], grundyScssSorterSplitGroup: split };
        const output = await prettier.format(input, options);
        assert.is(compileString(output).css, compileString(input).css);
        assert.is(await prettier.format(output, options), output);
        for (let i = 0; i < 40; i++) assert.ok(output.includes(`// declaration ${i}\n`));
        assert.ok(output.indexOf("@media") < output.indexOf("border-color: green"));
    }
});

test.run();
