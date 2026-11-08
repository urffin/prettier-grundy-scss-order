import prettier from "prettier";
import { test } from "uvu";
import * as assert from "uvu/assert";
import plugin from "../src/index.mjs";
import { grundyPropSorter } from "../src/grundy-prop-sorter.mjs";
import { resolveConfiguration } from "../src/configuration.mjs";

const format = (source, options = {}) => prettier.format(source, { parser: "scss", plugins: [plugin], ...options });
async function rejects(options, pattern) {
    try {
        await format(".a { color: red; }", options);
    } catch (error) {
        assert.match(error.message, pattern);
        return;
    }
    assert.unreachable("Expected a configuration error");
}

for (const value of ["{", "", "null", "[]", "false", '"text"']) {
    test(`Rejects invalid groups JSON/object: ${value}`, () =>
        rejects({ grundyScssSorterGroups: value }, /grundyScssSorterGroups/));
}
const badGroups = [
    [{ bad: null }, /"bad".*object/],
    [{ bad: [] }, /"bad".*object/],
    [{ "": {} }, /non-empty/],
    [{ bad: { typo: true } }, /typo.*unknown/],
    [{ bad: { type: "declaration" } }, /type.*must be one of/],
    [{ bad: { startsWith: 4 } }, /startsWith.*string/],
    [{ bad: { oneOf: "color" } }, /oneOf.*array/],
    [{ bad: { oneOf: ["color", 1] } }, /oneOf.*array/],
    [{ bad: { order: "random" } }, /order.*exact/],
    [{ bad: { order: "exact" } }, /requires oneOf/],
    [{ bad: { splitItems: "false" } }, /splitItems.*boolean/]
];
for (const [groups, pattern] of badGroups) {
    test(`Validates criteria: ${JSON.stringify(groups)}`, () =>
        rejects({ grundyScssSorterGroups: JSON.stringify(groups) }, pattern));
}
for (const preset of ["missing", "", "../index", "constructor", "__proto__"]) {
    test(`Rejects unknown preset ${JSON.stringify(preset)} without fallback`, () =>
        rejects({ grundyScssSorterPreset: preset }, /Unknown SCSS sorter preset.*Available presets/));
}
test("Unknown group references report the name", () =>
    rejects({ grundyScssSorterGroupsOrder: ["typo"] }, /unknown group "typo"/));

for (const preset of [undefined, "default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"]) {
    for (const explicit of [undefined, false, true]) {
        test(`Root precedence through Prettier: preset ${preset}, explicit ${explicit}`, async () => {
            const options = {
                grundyScssSorterPreset: preset,
                grundyScssSorterGroups: JSON.stringify({ blocks: { type: "rule", order: "alphabetical" } }),
                grundyScssSorterGroupsOrder: ["blocks", "decl"],
                ...(explicit === undefined ? {} : { grundyScssSorterWithRoot: explicit })
            };
            const output = await format(".z { z-index: 1; color: red; } .a { color: blue; }", options);
            const rootEnabled = explicit ?? (preset === undefined || preset === "default");
            assert.equal(output.startsWith(".a"), rootEnabled);
            assert.ok(output.indexOf("color: red") < output.indexOf("z-index: 1"));
            assert.equal(await format(output, options), output);
        });
    }
}

test("Explicit false overrides preset group splitting through Prettier", async () => {
    const source = ".a { color: red; --x: 1; }";
    const inherited = await format(source, { grundyScssSorterPreset: "pepelsbey" });
    const enabled = await format(source, { grundyScssSorterPreset: "pepelsbey", grundyScssSorterSplitGroup: true });
    const disabled = await format(source, { grundyScssSorterPreset: "pepelsbey", grundyScssSorterSplitGroup: false });
    assert.equal(inherited, enabled);
    assert.ok(enabled.includes("\n\n"));
    assert.not.ok(disabled.includes("\n\n"));
});

test("Omitted and empty group orders inherit the preset; explicit order replaces it", async () => {
    const source = ".a { display: block; position: relative; }";
    const options = { grundyScssSorterPreset: "pepelsbey" };
    const inherited = await format(source, options);
    assert.equal(await format(source, { ...options, grundyScssSorterGroupsOrder: [] }), inherited);
    assert.ok(inherited.indexOf("position:") < inherited.indexOf("display:"));
    const overridden = await format(source, { ...options, grundyScssSorterGroupsOrder: ["decl"] });
    assert.ok(overridden.indexOf("display:") < overridden.indexOf("position:"));
});

test("Custom groups replace a whole definition, including preset and default definitions", async () => {
    const groups = { decl: { type: "decl", oneOf: ["width", "color"], order: "exact" } };
    const output = await format(".a { color: red; width: 1px; }", {
        grundyScssSorterPreset: "csscomb",
        grundyScssSorterGroups: JSON.stringify(groups),
        grundyScssSorterGroupsOrder: ["decl"]
    });
    assert.ok(output.indexOf("width:") < output.indexOf("color:"));
    const presetOverride = await format(".a { color: red; aa-unknown: 0; z-index: 1; }", {
        grundyScssSorterPreset: "pepelsbey",
        grundyScssSorterGroups: JSON.stringify({ "order-props": { type: "decl", order: "alphabetical" } })
    });
    assert.ok(presetOverride.indexOf("aa-unknown:") < presetOverride.indexOf("color:"));
    assert.ok(presetOverride.indexOf("color:") < presetOverride.indexOf("z-index:"));
    const resolved = await resolveConfiguration({
        grundyScssSorterPreset: "pepelsbey",
        grundyScssSorterSafety: "loose"
    });
    assert.is(resolved.safety, "loose");
});

test("Empty catch-all groups, empty exact lists and duplicate ranks remain configurable", async () => {
    const options = {
        grundyScssSorterGroups: JSON.stringify({ nothing: { oneOf: [], order: "exact" }, all: { order: "alphabetical" } }),
        grundyScssSorterGroupsOrder: ["nothing", "all", "all"]
    };
    assert.equal(await format(".a { width: 1px; color: red; }", options), ".a {\n  color: red;\n  width: 1px;\n}\n");
});

test("Group names matching Object prototype keys are ordinary own group names", async () => {
    const output = await format(".a { width: 1px; color: red; }", {
        grundyScssSorterGroups: '{"__proto__":{"type":"decl","order":"alphabetical"},"constructor":{}}',
        grundyScssSorterGroupsOrder: ["__proto__", "constructor"]
    });
    assert.equal(output, ".a {\n  color: red;\n  width: 1px;\n}\n");
    assert.is({}.type, undefined);
});

test("Unmatched directives remain stable after configured groups", async () => {
    const output = await format(".a { @unknown z; color: red; @unknown a; }", {
        grundyScssSorterGroupsOrder: ["decl"],
        grundyScssSorterSafety: "loose"
    });
    assert.ok(output.indexOf("color:") < output.indexOf("@unknown z"));
    assert.ok(output.indexOf("@unknown z") < output.indexOf("@unknown a"));
});

test("Direct sorter callers receive validation before visiting the AST", () => {
    assert.throws(() => grundyPropSorter({ groups: { bad: { order: "exact" } } }), /requires oneOf/);
    assert.throws(() => grundyPropSorter({ groups: null }), /must be an object/);
    assert.throws(() => grundyPropSorter({ order: ["missing"] }), /unknown group/);
    assert.throws(() => grundyPropSorter({ order: "decl" }), /array of strings/);
    assert.throws(() => grundyPropSorter({ withRoot: "false" }), /booleans/);
});

test("SCSS configuration validation does not interfere with other Prettier parsers", async () => {
    assert.equal(
        await prettier.format('{"a":1}', {
            parser: "json",
            plugins: [plugin],
            grundyScssSorterGroups: "{",
            grundyScssSorterPreset: "missing"
        }),
        '{ "a": 1 }\n'
    );
});

test.run();
