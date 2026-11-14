import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { test } from "uvu";
import * as assert from "uvu/assert";
import prettier from "prettier";
import * as sass from "sass";
import postcss from "postcss";
import scss from "postcss-scss";
import plugin from "../src/index.mjs";
import { corpusManifest } from "../scripts/corpus.mjs";

const root = fileURLToPath(new URL("fixtures/corpus/regressions/", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const read = name => readFileSync(path.join(root, name), "utf8");
const common = { parser: "scss", printWidth: 100, tabWidth: 2, endOfLine: "lf" };
const presets = ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"];
const compile = (source, entry) =>
    sass.compileString(source, {
        url: pathToFileURL(path.join(root, entry)),
        logger: sass.Logger.silent,
        style: "expanded"
    }).css;
function comments(source) {
    const result = [];
    scss.parse(source).walkComments(node => result.push(node.text.replace(/\s+/g, " ").trim()));
    return result.sort();
}
// Only fixtures explicitly marked "projection" may reorder independent CSS
// declarations. Values of each property still keep their cascade order.
function projection(css) {
    const records = new Map();
    postcss.parse(css).walkDecls(decl => {
        const context = [];
        for (let node = decl.parent; node.type !== "root"; node = node.parent)
            context.unshift(node.type === "rule" ? node.selector : `@${node.name} ${node.params}`);
        const property = decl.prop.startsWith("--") ? decl.prop : decl.prop.replace(/^-(webkit|moz|ms|o)-/, "");
        const key = JSON.stringify([context, property]);
        if (!records.has(key)) records.set(key, []);
        records.get(key).push([decl.prop, decl.value, !!decl.important]);
    });
    return [...records].sort(([a], [b]) => a.localeCompare(b));
}

test("Regression manifest covers corpus adaptations and missing SCSS constructs", () => {
    assert.is(manifest.oracle.version, "0.4.6");
    assert.is(new Set(manifest.fixtures.map(f => f.id)).size, manifest.fixtures.length);
    const features = new Set(manifest.fixtures.flatMap(f => f.features));
    for (const feature of [
        "comments",
        "group-separators",
        "legacy-import",
        "use",
        "forward",
        "modules",
        "variables",
        "mixins",
        "content",
        "using",
        "media",
        "nested-rules",
        "nested-properties",
        "if-else",
        "for",
        "each",
        "while",
        "functions",
        "default",
        "global",
        "interpolation",
        "custom-properties",
        "vendor-properties",
        "conflicts",
        "logical-properties",
        "shorthands",
        "all",
        "ignore",
        "keyframes"
    ])
        assert.ok(features.has(feature), `Missing fixture feature: ${feature}`);
    const corpus = corpusManifest();
    for (const fixture of manifest.fixtures) {
        assert.ok(["exact", "projection"].includes(fixture.strictCSS));
        if (fixture.origin.kind !== "adapted") continue;
        const project = corpus.projects.find(p => p.id === fixture.origin.project);
        assert.ok(project, fixture.id);
        for (const file of fixture.origin.files)
            assert.ok(
                project.files.some(f => f.path === file),
                file
            );
    }
});

for (const fixture of manifest.fixtures) {
    test(`Corpus regression: ${fixture.id}`, async () => {
        const source = read(fixture.entry),
            beforeCSS = compile(source, fixture.entry),
            beforeComments = comments(source);
        for (const preset of presets)
            for (const safety of ["strict", "loose"])
                for (const split of [false, true]) {
                    const label = `${fixture.id}/${preset}/${safety}/split=${split}`;
                    const options = {
                        ...common,
                        plugins: [plugin],
                        grundyScssSorterPreset: preset,
                        grundyScssSorterSafety: safety,
                        grundyScssSorterSplitGroup: split,
                        grundyScssSorterWithRoot: true
                    };
                    const output = await prettier.format(source, options);
                    assert.is(await prettier.format(output, options), output, `${label}: idempotence`);
                    assert.equal(comments(output), beforeComments, `${label}: comments`);
                    for (const fragment of fixture.verbatim ?? [])
                        assert.ok(output.includes(fragment), `${label}: ignored text`);
                    if (preset === "default" && !split) {
                        // The checked-in order is an oracle; only printer whitespace
                        // is normalized for the installed supported Prettier version.
                        const expected = await prettier.format(read(fixture.expected[safety]), { ...common, plugins: [] });
                        assert.is(output, expected, `${label}: frozen order`);
                        if (safety === "loose") {
                            let compiles = true;
                            try {
                                compile(output, fixture.entry);
                            } catch {
                                compiles = false;
                            }
                            assert.is(compiles, fixture.defaultLooseCompiles, `${label}: explicit loose outcome`);
                        }
                    }
                    if (safety === "strict") {
                        const afterCSS = compile(output, fixture.entry);
                        if (fixture.strictCSS === "exact") assert.is(afterCSS, beforeCSS, `${label}: compiled CSS`);
                        else assert.equal(projection(afterCSS), projection(beforeCSS), `${label}: property value sequences`);
                    }
                }
    });
}

test.run();
