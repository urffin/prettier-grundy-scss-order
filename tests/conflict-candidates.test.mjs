import { readFile } from "node:fs/promises";
import { test } from "uvu";
import * as assert from "uvu/assert";
import { sortWithPropertyConstraints } from "../src/property-conflicts.mjs";

// Frozen release implementation is an independent all-pairs oracle. Keep it
// unchanged when optimizing candidate discovery or topological ordering.
const referenceSource = await readFile(new URL("./fixtures/property-conflicts-v030.txt", import.meta.url), "utf8");
const { sortWithPropertyConstraints: reference } = await import(
    `data:text/javascript;base64,${Buffer.from(referenceSource).toString("base64")}`
);
const properties = [
    "all",
    "direction",
    "unicode-bidi",
    "color",
    "background",
    "background-color",
    "font",
    "font-size",
    "line-height",
    "columns",
    "column-width",
    "column-count",
    "column-height",
    "gap",
    "row-gap",
    "column-gap",
    "grid-gap",
    "grid-row-gap",
    "grid-column-gap",
    "place-content",
    "align-content",
    "justify-content",
    "place-items",
    "align-items",
    "justify-items",
    "place-self",
    "align-self",
    "justify-self",
    "white-space",
    "text-wrap",
    "text-wrap-mode",
    "text-spacing",
    "text-autospace",
    "line-clamp",
    "max-lines",
    "block-ellipsis",
    "continue",
    "vertical-align",
    "alignment-baseline",
    "baseline-shift",
    "baseline-source",
    "border",
    "border-color",
    "border-top",
    "border-image",
    "grid",
    "grid-area",
    "grid-row",
    "margin",
    "margin-left",
    "margin-right",
    "margin-inline-start",
    "padding",
    "padding-top",
    "padding-block-end",
    "scroll-margin",
    "scroll-margin-top",
    "scroll-margin-inline",
    "scroll-padding",
    "scroll-padding-left",
    "scroll-padding-block",
    "overflow",
    "overflow-x",
    "overflow-y",
    "overflow-inline",
    "overscroll-behavior",
    "overscroll-behavior-x",
    "overscroll-behavior-block",
    "top",
    "right",
    "bottom",
    "left",
    "inset",
    "inset-inline-start",
    "width",
    "height",
    "inline-size",
    "block-size",
    "min-width",
    "max-height",
    "min-inline-size",
    "max-block-size",
    "word-wrap",
    "overflow-wrap",
    "page-break-before",
    "break-before",
    "page-break-after",
    "break-after",
    "page-break-inside",
    "break-inside",
    "transform",
    "COLOR",
    "-webkit-transform",
    "-moz-transform",
    "-ms-transform",
    "-o-transform",
    "--Token",
    "--token",
    "--all",
    "-webkit---token",
    "-webkit---Token",
    "$variable",
    "theme.$variable",
    "#{dynamic}",
    "escaped\\name",
    "property-0000",
    "property-0001",
    "property",
    "property-",
    "-",
    "_name"
];
const names = [...new Set([...properties, ...properties.filter(p => !p.startsWith("--")).map(p => p + "-suffix")])];
const declaration = prop => ({ type: "decl", prop });
const variants = [
    ...names.map(declaration),
    { type: "rule", selector: "font:" },
    { type: "rule", selector: ".ordinary" },
    { type: "atrule", name: "media" },
    { type: "decl", prop: "font", nodes: [] }
];
function check(nodes, compare) {
    const units = nodes.map((node, id) => ({ node: { ...node, id } }));
    const ids = result => result.map(unit => unit.node.id);
    assert.equal(ids(sortWithPropertyConstraints(units, compare)), ids(reference(units, compare)));
}

test("Candidate index matches release 0.3.0 for both directions of every property pair", () => {
    for (const first of variants) {
        for (const second of variants) {
            check([first, second], (a, b) => b.id - a.id);
            // Force the indexed path too: short segments use direct comparisons.
            const units = [first, second, ...Array(30).fill({ type: "rule", selector: ".padding" })].map((node, id) => ({
                node: { ...node, id }
            }));
            const compare = (a, b) => b.id - a.id;
            assert.equal(
                sortWithPropertyConstraints(units, compare)
                    .filter(unit => unit.node.id < 2)
                    .map(unit => unit.node.id),
                reference(units.slice(0, 2), compare).map(unit => unit.node.id)
            );
        }
    }
});

test("Indexed constraints preserve stable choices through mixed dependency chains", () => {
    let seed = 73219;
    const next = limit => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % limit;
    };
    for (let round = 0; round < 500; round++) {
        const nodes = Array.from({ length: 40 }, () => variants[next(variants.length)]);
        check(nodes, (a, b) => b.id - a.id);
        check(nodes, (a, b) => (a.id % 7) - (b.id % 7));
        check(nodes, () => 0);
    }
});

test("Broad resets, opaque names and repeated families retain dense constraints", () => {
    for (const prop of ["all", "#{dynamic}", "border-top", "--token", "color"]) {
        check(
            Array.from({ length: 100 }, (_, i) => declaration(i % 3 ? prop : "direction")),
            (a, b) => b.id - a.id
        );
    }
});

test.run();
