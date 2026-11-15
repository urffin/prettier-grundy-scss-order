import fs from "node:fs/promises";
import { test } from "uvu";
import * as assert from "uvu/assert";
import scss from "postcss-scss";
import { compileString } from "sass";
import { createSorter } from "../src/sorter-core.mjs";
import { postcssAdapter } from "../src/postcss-adapter.mjs";
import { presets } from "../src/presets/index.mjs";

// Freeze the old all-pairs crossing algorithm independently of candidate filtering.
// Only replace this function: parsing, CSS conflict policy and ordering stay shared.
const source = await fs.readFile(new URL("../src/sorter-core.mjs", import.meta.url), "utf8");
const referenceFunction = await fs.readFile(new URL("./fixtures/declaration-crossings-v046.txt", import.meta.url), "utf8");
const start = source.indexOf("    function declarationCrossings(segment) {");
const end = source.indexOf("\n    /**", start);
assert.ok(start >= 0 && end > start);
const referenceSource = (source.slice(0, start) + referenceFunction.trimEnd() + "\n" + source.slice(end)).replace(
    /from (["'])(\.[^"']+)\1/g,
    (_, quote, relative) =>
        `from ${quote}${new URL(relative, new URL("../src/sorter-core.mjs", import.meta.url)).href}${quote}`
);
const { createSorter: reference } = await import(
    `data:text/javascript;base64,${Buffer.from(referenceSource).toString("base64")}`
);
const fillers = count => Array.from({ length: count }, (_, i) => `.empty-${i} {}`).join("\n");
function sorted(input, options = {}, factory = createSorter) {
    const tree = scss.parse(input);
    factory(options, postcssAdapter)(tree);
    return tree.toString(scss.stringify);
}
function equivalent(input, options = {}) {
    const actual = sorted(input, options);
    assert.is(actual, sorted(input, options, reference));
    assert.is(sorted(actual, options), sorted(actual, options, reference), "repeated sorting");
    return actual;
}

test("Wide repeated blocks preserve the compiled cascade on both sides", () => {
    const blocks = Array.from({ length: 40 }, (_, i) => `/* block ${i} */ & { color: rgb(${i}, 0, 0); }`).join("\n");
    const input = `.a { color: blue; ${blocks} color: green; }`;
    for (const preset of Object.values(presets)) {
        const output = equivalent(input, { presetGroups: preset.groups, order: preset.order });
        assert.is(compileString(output).css, compileString(input).css);
    }
});

test("Candidate filtering retains real conflicts and permits independent properties", () => {
    const pairs = [
        ["margin", "margin-top", true],
        ["margin-inline", "margin-left", true],
        ["padding-block", "padding-top", true],
        ["scroll-margin-inline", "scroll-margin-left", true],
        ["overflow-inline", "overflow-y", true],
        ["top", "inset-inline-start", true],
        ["min-width", "min-inline-size", true],
        ["font", "line-height", true],
        ["columns", "column-height", true],
        ["grid-gap", "row-gap", true],
        ["word-wrap", "overflow-wrap", true],
        ["page-break-before", "break-before", true],
        ["place-items", "align-items", true],
        ["white-space", "text-wrap", true],
        ["text-spacing", "text-autospace", true],
        ["line-clamp", "max-lines", true],
        ["vertical-align", "baseline-source", true],
        ["border", "border-image", true],
        ["border-mystery", "border-color", true],
        ["-WEBKIT-transform", "transform", true],
        ["--Token", "--Token", true],
        ["#{'color'}", "color", true],
        ["all", "width", true],
        ["all", "--Token", false],
        ["all", "direction", false],
        ["all", "unicode-bidi", false],
        ["--Token", "--token", false],
        ["border-radius", "border-color", false],
        ["grid-template-rows", "grid-template-columns", false],
        ["top", "left", false],
        ["width", "height", false],
        ["color", "padding", false]
    ];
    for (const [inner, outer, conflicts] of pairs) {
        for (const [a, b] of [
            [inner, outer],
            [outer, inner]
        ]) {
            const options = {
                groups: { declarations: { oneOf: [a, b] }, blocks: { type: "rule" } },
                order: ["declarations", "blocks"],
                splitGroups: false
            };
            const input = `.a { .nested { ${a}: initial; } ${fillers(35)} ${b}: inherit; }`;
            const output = equivalent(input, options);
            const tree = scss.parse(output).first;
            const declaration = tree.nodes.findIndex(node => node.type === "decl");
            const block = tree.nodes.findIndex(node => node.selector === ".nested");
            assert.is(block < declaration, conflicts, `${a}/${b}`);
        }
    }
});

test("Wide mixed units match direct crossings across presets, modes, spacing and root settings", () => {
    const input = `.a {
        color: red;
        /* attached */ @media (min-width: 1px) { & { color: blue; margin-inline: 0; } }
        color: green; // trailing
        ${fillers(36)}
        .nested { font: { size: 2px; } --Token: red; }
        line-height: 1; --Token: blue;
        @if $flag { & { color: yellow; } } @else { & { color: black; } }
        ${fillers(36)}
        /* prettier-ignore */ .ignored { color:red; }
        ${fillers(36)}
        @supports (display: grid) { color: pink; } color: purple;
    }`;
    for (const preset of Object.values(presets))
        for (const safety of ["strict", "loose", "conservative", "structural"])
            for (const withRoot of [false, true])
                for (const splitGroups of [false, true])
                    equivalent(input, { presetGroups: preset.groups, order: preset.order, safety, withRoot, splitGroups });
});

test("Candidate positions belong to their own segment and are rebuilt for edited trees", () => {
    const input = `.a { ${fillers(35)} .x { color: red; } color: blue; }
        .b { width: 1px; ${fillers(35)} .x { height: 2px; } height: 3px; }`;
    const tree = scss.parse(input);
    const sort = createSorter({}, postcssAdapter);
    sort(tree);
    const declaration = tree.last.nodes.find(node => node.prop === "height");
    declaration.prop = "color";
    declaration.value = "purple";
    const nested = tree.last.nodes.find(node => node.selector === ".x").first;
    nested.prop = "color";
    const before = tree.toString(scss.stringify);
    sort(tree);
    assert.is(tree.toString(scss.stringify), sorted(before, {}, reference));
    equivalent(input);
});

test("Repeated names, empty matches and broad resets agree with direct crossings at the threshold", () => {
    let seed = 591236;
    const random = n => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
    const names = [
        "color",
        "width",
        "height",
        "margin",
        "margin-left",
        "margin-inline",
        "all",
        "--A",
        "--a",
        "grid-row",
        "grid-column",
        "#{'width'}"
    ];
    for (const count of [30, 31, 32, 33, 48, 80]) {
        for (let iteration = 0; iteration < 8; iteration++) {
            const nodes = Array.from({ length: count }, (_, i) => {
                const name = names[random(names.length)];
                if (i % 4 === 0) return `${name}: initial;`;
                if (i % 4 === 1) return `/* c${i} */ @media (min-width: ${i}px) { ${name}: inherit; color: red; }`;
                return `.n${i} { ${name}: initial; }`;
            });
            equivalent(`.a { ${nodes.join("\n")} }`);
        }
    }
});

test.run();
