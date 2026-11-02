import prettier from "prettier";
import plugin from "../src/index.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

async function check(source, expected = source, options = {}) {
    const config = { parser: "scss", plugins: [plugin], ...options };
    const result = await prettier.format(source, config);
    assert.equal(result, await prettier.format(expected, { parser: "scss" }));
    assert.equal(await prettier.format(result, config), result, "Formatting must be idempotent");
}

const conflicts = [
    ["margin-top: 1px", "margin: 0"],
    ["padding-inline-start: 1px", "padding: 0"],
    ["border-top: 1px solid red", "border-color: blue"],
    ["border-image: none", "border: 0"],
    ["background-color: red", "background: none"],
    ["line-height: 2", "font: 16px serif"],
    ["flex-grow: 1", "flex: none"],
    ["grid-template-columns: 1fr", "grid: none"],
    ["animation-name: fade", "animation: none"],
    ["transition-property: color", "transition: none"],
    ["list-style-type: square", "list-style: none"],
    ["column-width: 10px", "columns: auto"],
    ["row-gap: 1px", "gap: 0"],
    ["grid-gap: 1px", "gap: 0"],
    ["justify-items: start", "place-items: center"],
    ["white-space: nowrap", "text-wrap-mode: wrap"],
    ["word-wrap: break-word", "overflow-wrap: normal"],
    ["page-break-before: always", "break-before: auto"],
    ["top: 1px", "inset: 0"],
    ["margin-left: 1px", "margin-inline-start: 0"],
    ["width: 1px", "inline-size: 2px"],
    ["min-width: 1px", "min-inline-size: 2px"],
    ["overflow-y: hidden", "overflow: auto"],
    ["overflow-inline: hidden", "overflow-y: auto"],
    ["overscroll-behavior-inline: contain", "overscroll-behavior-y: auto"],
    ["text-wrap: wrap", "white-space: nowrap"],
    ["COLOR: red", "color: blue"],
    ["transform: none", "-webkit-transform: translateX(1px)"],
    ["color: red", "all: unset"]
];

for (const [first, second] of conflicts) {
    test(`Preserves both source orders of ${first.split(":")[0]} and ${second.split(":")[0]}`, async () => {
        await check(`.a { ${first}; ${second}; }`);
        await check(`.a { ${second}; ${first}; }`);
    });
}

test("Sorts independent declarations around an ordered chain of conflicts", async () => {
    await check(
        ".a { z-index: 1; margin-top: 1px; display: block; margin: 0; color: red; margin-left: 2px; }",
        ".a { color: red; display: block; margin-top: 1px; margin: 0; margin-left: 2px; z-index: 1; }"
    );
});

test("Preserves fallback declarations and important values", async () => {
    await check(
        ".a { display: -webkit-box; width: 1px; display: flex; margin-top: 1px !important; margin: 0 !important; }",
        ".a { display: -webkit-box; display: flex; margin-top: 1px !important; margin: 0 !important; width: 1px; }"
    );
});

test("Conflict constraints take priority over custom groups and exact order", async () => {
    await check(".a { margin-top: 1px; margin: 0; }", undefined, {
        grundyScssSorterGroupsOrder: ["shorthand", "longhand"],
        grundyScssSorterGroups: JSON.stringify({
            shorthand: { oneOf: ["margin"], order: "exact" },
            longhand: { oneOf: ["margin-top"], order: "exact" }
        })
    });
});

test("Every preset respects conflict constraints", async () => {
    for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"]) {
        await check(".a { margin-top: 1px; margin: 0; }", undefined, { grundyScssSorterPreset: preset });
    }
});

test("Keeps comments attached when preserving conflicts and splitting groups", async () => {
    await check(
        ".a {\n // top\n margin-top: 1px; // fallback\n margin: 0;\n // token\n --color: red; }",
        ".a {\n // token\n --color: red;\n\n // top\n margin-top: 1px; // fallback\n margin: 0; }",
        { grundyScssSorterSplitGroup: true }
    );
});

test("Preserves repeated custom properties without conflating case-sensitive names", async () => {
    await check(".a { --b: 1; --a: 1; --b: 2; --A: 2; }", ".a { --A: 2; --a: 1; --b: 1; --b: 2; }", {
        grundyScssSorterGroups: JSON.stringify({ "--variable": { type: "variable", order: "alphabetical" } })
    });
});

test("Does not treat custom properties as shorthand families", async () => {
    await check(".a { --a-b: 1; --a: 2; }", ".a { --a: 2; --a-b: 1; }", {
        grundyScssSorterGroups: JSON.stringify({ "--variable": { type: "variable", order: "alphabetical" } })
    });
});

test("Does not move declarations across interpolated property names", async () => {
    await check(".a { z-index: 1; #{$property}: 0; color: red; }");
});

test("Keeps nested Sass property blocks in order with declarations", async () => {
    await check(".a { font: { size: 1em; } font-size: 2em; }");
});

test("Still sorts independent longhands with a common prefix", async () => {
    await check(
        ".a { font-weight: bold; font-size: 1em; font-family: serif; margin-top: 1px; margin-left: 2px; }",
        ".a { font-family: serif; font-size: 1em; font-weight: bold; margin-left: 2px; margin-top: 1px; }"
    );
});

test("All does not reset custom properties, direction, or unicode-bidi", async () => {
    await check(
        ".a { direction: rtl; --x: 1; unicode-bidi: isolate; all: unset; }",
        ".a { --x: 1; all: unset; direction: rtl; unicode-bidi: isolate; }"
    );
});

test("Preserves conflicts at the root and inside nested rules", async () => {
    await check("margin-top: 1px; margin: 0; .a { .b { padding-top: 1px; padding: 0; } }");
});

test.run();
