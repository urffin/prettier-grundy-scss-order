import prettier from "prettier";
import plugin from "../src/index.mjs";
import { sortWithPropertyConstraints } from "../src/property-conflicts.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

const independent = [
    ["top", "left"],
    ["top", "right"],
    ["top", "bottom"],
    ["right", "bottom"],
    ["right", "left"],
    ["bottom", "left"],
    ["border", "border-radius"],
    ["border-top", "border-top-left-radius"],
    ["border-image", "border-radius"],
    ["border-inline-start-color", "border-start-start-radius"],
    ["-webkit-border-radius", "border"],
    ["grid-template-columns", "grid-template-areas"],
    ["grid-template-rows", "grid-template-columns"],
    ["grid-row", "grid-column"],
    ["grid-row-start", "grid-row-end"],
    ["grid-template", "grid-auto-rows"],
    ["grid", "grid-area"],
    ["grid-auto-flow", "grid-auto-columns"]
];
const conflicting = [
    ["top", "inset"],
    ["left", "inset-inline-start"],
    ["top", "inset-block"],
    ["top", "top"],
    ["border", "border-image-source"],
    ["border-top", "border-color"],
    ["border-left-color", "border-inline-start-color"],
    ["border-radius", "border-top-left-radius"],
    ["border-radius", "border-start-start-radius"],
    ["border-top-left-radius", "border-start-start-radius"],
    ["border-radius", "border-future-extension"],
    ["border-radius", "border-top-start"],
    ["grid", "grid-template-columns"],
    ["grid", "grid-auto-flow"],
    ["grid", "grid-auto-rows"],
    ["grid-template", "grid-template-areas"],
    ["grid-area", "grid-column-end"],
    ["grid-area", "grid-row"],
    ["grid-row", "grid-row-start"],
    ["grid-column", "grid-column-end"],
    ["grid", "grid-future-extension"],
    ["all", "border-radius"],
    ["all", "top"],
    ["grid-template-columns", "GRID-TEMPLATE-COLUMNS"]
];
for (const [label, pairs, locked] of [
    ["independent", independent, false],
    ["conflicting", conflicting, true]
]) {
    test(`Preserves ${label} pair semantics in direct and indexed paths, in both directions`, () => {
        for (const pair of pairs)
            for (const props of [pair, [...pair].reverse()])
                for (const count of [2, 40]) {
                    const units = Array.from({ length: count }, (_, id) => ({
                        node: { id, prop: props[id] ?? `unrelated-${id}` }
                    }));
                    const result = sortWithPropertyConstraints(
                        units,
                        (a, b) => b.id - a.id,
                        node => node.prop
                    );
                    assert.equal(
                        result.filter(u => u.node.id < 2).map(u => u.node.id),
                        locked ? [0, 1] : [1, 0],
                        `${props} / ${count}`
                    );
                }
    });
}

test("Real checkbox and grid declarations obey exact ordering with comments and remain idempotent", async () => {
    const cases = [
        ["border-radius: 8px; /* stroke */ border: 1px solid #ceaf6e;", ["border", "border-radius"]],
        ["top: 3px; left: 6px;", ["left", "top"]],
        [
            'grid-template-columns: 48px auto; grid-template-areas: "icon title" "icon sub";',
            ["grid-template-areas", "grid-template-columns"]
        ]
    ];
    for (const [declarations, order] of cases)
        for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"]) {
            const options = {
                parser: "scss",
                plugins: [plugin],
                grundyScssSorterSafety: "strict",
                grundyScssSorterPreset: preset,
                grundyScssSorterGroupsOrder: ["decl"],
                grundyScssSorterGroups: JSON.stringify({ decl: { type: "decl", order: "exact", oneOf: order } })
            };
            const result = await prettier.format(`.a { ${declarations} }`, options);
            assert.ok(result.indexOf(order[0] + ":") < result.indexOf(order[1] + ":"));
            if (declarations.includes("/* stroke */")) assert.ok(result.includes("/* stroke */"));
            assert.is(await prettier.format(result, options), result);
            assert.is(
                await prettier.format(`.a { ${declarations} }`, { ...options, grundyScssSorterSafety: "conservative" }),
                result
            );
        }
});

test("A shared shorthand still orders independent longhands in mixed chains", () => {
    for (const prefix of [[], Array.from({ length: 35 }, (_, i) => `unrelated-${i}`)]) {
        const props = [...prefix, "grid-row-start", "grid-column-start", "grid-area", "grid-row-end", "grid-column-end"];
        const units = props.map((prop, id) => ({ node: { prop, id } }));
        const result = sortWithPropertyConstraints(
            units,
            (a, b) => b.id - a.id,
            n => n.prop
        )
            .map(u => u.node.prop)
            .filter(p => p.startsWith("grid"));
        assert.equal(result, ["grid-column-start", "grid-row-start", "grid-area", "grid-column-end", "grid-row-end"]);
    }
});
test.run();
