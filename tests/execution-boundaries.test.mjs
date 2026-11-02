import prettier from "prettier";
import plugin from "../src/index.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

async function check(source, expected = source, options = {}) {
    const config = { parser: "scss", plugins: [plugin], ...options };
    const result = await prettier.format(source, config);
    assert.equal(result, await prettier.format(expected, { parser: "scss" }));
    assert.equal(await prettier.format(result, config), result, "Formatting must be idempotent");
    return result;
}

test("Keeps reads on the correct side of a variable reassignment", async () => {
    await check(".a { $value: 1px; width: $value; $value: 2px; height: $value; }");
});

test("Sorts declarations separately before and after an assignment", async () => {
    await check(
        ".a { $value: 1px; width: $value; color: red; $value: 2px; padding: $value; display: block; }",
        ".a { $value: 1px; color: red; width: $value; $value: 2px; display: block; padding: $value; }"
    );
});

test("Preserves dependent variable declarations even with alphabetical variable groups", async () => {
    await check("$z: 1px; $a: $z; $z: 2px; .a { width: $a; }", undefined, {
        grundyScssSorterGroups: JSON.stringify({ $variable: { type: "$variable", order: "alphabetical" } })
    });
});

for (const assignment of ["$value: 2px !default", "$value: 2px !global", "theme.$value: 2px"]) {
    test(`Treats ${assignment} as an assignment boundary`, async () => {
        await check(`.a { width: 1px; ${assignment}; height: 2px; }`);
    });
}

test("Does not hoist a root assignment past an earlier rule", async () => {
    await check("$color: red; .before { color: $color; } $color: blue; .after { color: $color; }");
});

test("Keeps a mixin call between surrounding declarations", async () => {
    await check(".a { color: red; @include paint; color: blue; }");
});

test("Sorts each declaration segment around namespaced mixin calls", async () => {
    await check(
        ".a { width: 1px; color: red; @include theme.paint($color); padding: 0; display: block; }",
        ".a { color: red; width: 1px; @include theme.paint($color); display: block; padding: 0; }"
    );
});

test("Preserves consecutive mixin calls despite custom exact ordering", async () => {
    await check(".a { @include zeta; @include alpha; color: red; }", undefined, {
        grundyScssSorterGroupsOrder: ["decl", "@include"],
        grundyScssSorterGroups: JSON.stringify({ "@include": { type: "include", oneOf: ["alpha", "zeta"], order: "exact" } })
    });
});

test("Sorts inside a mixin content block without moving the call", async () => {
    await check(
        ".a { z-index: 1; @include wrap using ($value) { width: $value; color: red; $value: 2px; padding: $value; display: block; } color: blue; }",
        ".a { z-index: 1; @include wrap using ($value) { color: red; width: $value; $value: 2px; display: block; padding: $value; } color: blue; }"
    );
});

test("Treats @content as a mixin callback boundary", async () => {
    await check("@mixin paint { color: red; @content; color: blue; }");
});

test("Keeps a conditional with an assignment in its else branch in place", async () => {
    await check(".a { width: $value; @if $flag { color: red; }\n // fallback\n @else { $value: 2px; } height: $value; }");
});

test("Keeps enclosing rules and at-rules with effects in place", async () => {
    await check(".a { width: 1px; .nested { @include paint; } height: 2px; }");
    await check(".a { width: $value; @media screen { $value: 2px !global; } height: $value; }");
});

test("Preserves effects inside otherwise ignored subtrees", async () => {
    await check(".a { width: 1px;\n // prettier-ignore\n .b { @include paint; width:1px; color:red; }\n height: 2px; }");
});

test("Every preset respects assignments and calls", async () => {
    for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"]) {
        await check(".a { width: 1px; $value: 2px; @include paint; color: red; }", undefined, {
            grundyScssSorterPreset: preset,
            grundyScssSorterSplitGroup: false
        });
    }
});

test("Keeps comments attached to boundaries when splitting groups", async () => {
    await check(
        ".a { width: 1px;\n // assignment\n $value: 2px; // value\n // mixin\n @include paint; // call\n color: red; }",
        ".a { width: 1px;\n\n // assignment\n $value: 2px; // value\n\n // mixin\n @include paint; // call\n\n color: red; }",
        { grundyScssSorterSplitGroup: true }
    );
});

test("Still applies boundaries inside rules when root sorting is disabled", async () => {
    await check(".a { width: 1px; $value: 2px; height: $value; @include paint; color: red; }", undefined, {
        grundyScssSorterWithRoot: false
    });
});

test("CSS custom properties remain sortable declarations", async () => {
    await check(
        ".a { width: 1px; --token: red; color: var(--token); }",
        ".a { --token: red; color: var(--token); width: 1px; }"
    );
});

test("Pins namespaced assignments relative to rules as well as declarations", async () => {
    await check(".before { color: theme.$color; } theme.$color: blue; .after { color: theme.$color; }");
});

test.run();
