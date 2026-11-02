import prettier from "prettier";
import plugin from "../src/index.mjs";
import { grundyPropSorter } from "../src/grundy-prop-sorter.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

async function check(source, expected, options = {}) {
    const config = { parser: "scss", plugins: [plugin], grundyScssSorterSafety: "structural", ...options };
    const result = await prettier.format(source, config);
    assert.equal(result, await prettier.format(expected, { parser: "scss" }));
    assert.equal(await prettier.format(result, config), result);
}

test("Structural explicitly permits moving assignments, calls and conflicting properties", async () => {
    await check(
        ".a { margin-top: 1px; @include paint; $x: 2; margin: 0; }",
        ".a { $x: 2; margin: 0; margin-top: 1px; @include paint; }"
    );
});

test("Structural moves if/else as one unit with comments regardless of custom groups", async () => {
    await check(
        ".a { z-index: 1; @if $a { width: 1px; color: red; }\n // alternative\n @else if $b { color: blue; } @else { color: green; } }",
        ".a { @if $a { color: red; width: 1px; }\n // alternative\n @else if $b { color: blue; } @else { color: green; } z-index: 1; }",
        { grundyScssSorterGroups: JSON.stringify({ "@else": { type: "decl" } }) }
    );
});

test("Structural keeps trailing line comments valid after moving declarations", async () => {
    await check(".a { z-index: 1; // layer\n color: red; }", ".a { color: red; z-index: 1; // layer\n }");
});

test("Structural still honors prettier-ignore boundaries and subtrees", async () => {
    await check(
        ".a { z-index: 1; color: red;\n // prettier-ignore\n .b { z-index:1; color:red; }\n width: 1px; display: block; }",
        ".a { color: red; z-index: 1;\n // prettier-ignore\n .b { z-index:1; color:red; }\n display: block; width: 1px; }"
    );
});

test("Structural allows explicit module ordering", async () => {
    await check('@use "zeta"; @use "alpha";', '@use "alpha"; @use "zeta";', {
        grundyScssSorterGroups: JSON.stringify({ "@use": { type: "use", order: "alphabetical" } })
    });
});

test("Conservative remains the default even with presets and explicit group order", async () => {
    const source = ".a { margin-top: 1px; @include paint; $x: 2; margin: 0; }";
    for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"]) {
        await check(source, source, {
            grundyScssSorterSafety: "conservative",
            grundyScssSorterPreset: preset,
            grundyScssSorterSplitGroup: false,
            grundyScssSorterGroupsOrder: ["$variable", "decl", "@include"]
        });
    }
    const config = { parser: "scss", plugins: [plugin] };
    assert.equal(
        await prettier.format(source, config),
        await prettier.format(source, { ...config, grundyScssSorterSafety: "conservative" })
    );
});

test("Rejects invalid modes instead of silently weakening safety", async () => {
    assert.throws(() => grundyPropSorter({ safety: "off" }), /Unknown SCSS sorter safety mode/);
    let error;
    try {
        await prettier.format(".a { color: red; }", { parser: "scss", plugins: [plugin], grundyScssSorterSafety: "off" });
    } catch (caught) {
        error = caught;
    }
    assert.ok(error);
    assert.match(error.message, /grundyScssSorterSafety/);
});

test.run();
