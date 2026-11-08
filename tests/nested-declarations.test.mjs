import prettier from "prettier";
import { compileString } from "sass";
import plugin from "../src/index.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

async function format(source, options = {}) {
    const config = { parser: "scss", plugins: [plugin], ...options };
    const output = await prettier.format(source, config);
    assert.is(await prettier.format(output, config), output);
    return output;
}

for (const block of [
    "& { color: red; }",
    "&:hover { color: red; }",
    "@media (min-width: 600px) { color: red; }",
    "@supports (display: grid) { color: red; }",
    "@container (min-width: 600px) { color: red; }"
]) {
    test(`Preserves compiled cascade on both sides of ${block}`, async () => {
        for (const body of [`${block} color: blue;`, `color: blue; ${block}`]) {
            const source = `.a { ${body} }`;
            for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"]) {
                for (const order of [
                    ["decl", "blocks"],
                    ["blocks", "decl"]
                ]) {
                    const output = await format(source, {
                        grundyScssSorterPreset: preset,
                        grundyScssSorterGroupsOrder: order,
                        grundyScssSorterGroups: JSON.stringify({
                            decl: { type: "decl", order: "alphabetical" },
                            blocks: { oneOf: ["&", "&:hover", "(min-width: 600px)", "(display: grid)"] }
                        })
                    });
                    assert.is(compileString(output).css, compileString(source).css);
                }
            }
        }
    });
}

test("Detects nested shorthand, logical properties, resets and opaque names", async () => {
    for (const [inner, outer] of [
        ["margin: 0", "margin-top: 1px"],
        ["margin-inline: 0", "margin-left: 1px"],
        ["border: 0", "border-image: none"],
        ["all: unset", "color: blue"],
        ["#{'color'}: red", "color: blue"],
        ["--Token: red", "--Token: blue"]
    ]) {
        const source = `.a { @media (min-width: 600px) { & { ${inner}; } } ${outer}; }`;
        assert.is(compileString(await format(source)).css, compileString(source).css);
    }
});

test("Independent declarations can cross blocks while their own contents still sort", async () => {
    const result = await format(".a { &:hover { z-index: 1; color: red; } width: 1px; }");
    assert.is(result, await prettier.format(".a { width: 1px; &:hover { color: red; z-index: 1; } }", { parser: "scss" }));
});

test("Comments, split groups and ignore remain stable around mixed declarations", async () => {
    const source =
        ".a { // media\n @media (min-width: 600px) { color: red; } // end\n /* after */ color: blue;\n // prettier-ignore\n &:hover {width:1px;color:red;} }";
    const output = await format(source, { grundyScssSorterSplitGroup: true });
    assert.ok(output.indexOf("@media") < output.indexOf("color: blue"));
    for (const text of ["// media", "// end", "/* after */", "&:hover {width:1px;color:red;}"])
        assert.ok(output.includes(text));
});

test("Large indexed segments preserve crossings and allow unrelated declarations", async () => {
    const padding = Array.from({ length: 40 }, (_, i) => `property-${i}: 0;`).join("");
    const output = await format(`.a { @media (min-width: 600px) { color: red; } ${padding} color: blue; }`);
    assert.ok(output.indexOf("@media") < output.indexOf("color: blue"));
    assert.ok(output.indexOf("property-0:") < output.indexOf("@media"));
});

test("Loose and its alias retain explicit reordering; strict alias preserves cascade", async () => {
    const source = ".a { @media (min-width: 600px) { color: red; } color: blue; }";
    const strict = await format(source);
    assert.is(await format(source, { grundyScssSorterSafety: "conservative" }), strict);
    const loose = await format(source, { grundyScssSorterSafety: "loose" });
    assert.is(await format(source, { grundyScssSorterSafety: "structural" }), loose);
    assert.ok(loose.indexOf("color: blue") < loose.indexOf("@media"));
    assert.not.equal(compileString(strict).css, compileString(loose).css);
});
test.run();
