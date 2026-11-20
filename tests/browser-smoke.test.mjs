import { test } from "uvu";
import assert from "node:assert/strict";
import prettier from "prettier";
import { readFile } from "node:fs/promises";
import { browserCases } from "../scripts/browser/cases.mjs";
import { verifyBrowserResults, canonicalMapOutput } from "../scripts/browser/verification.mjs";
import { parseBrowserArgs } from "../scripts/test-browser.mjs";

const environment = {
    document: "object",
    window: "object",
    userAgent: "Chromium unit-test fixture",
    prettier: prettier.version,
    nodeProcess: "undefined",
    nodeRequire: "undefined",
    nodeBuffer: "undefined"
};
const output = ".a {\n  color: red;\n}\n";
function row(id, text = output, processes = 0) {
    const first = { output: text, calls: { parses: 1, processes } };
    return { id, first, reference: structuredClone(first), second: structuredClone(first) };
}
function sample() {
    const testCase = {
        id: "ordinary",
        source: ".a{color:red}",
        category: "same",
        path: { node: 0, browser: 0 },
        options: {}
    };
    return { cases: [testCase], nodeRows: [row(testCase.id)], browser: { environment, rows: [row(testCase.id)] }, prettier };
}

test("Browser runner rejects missing values and unsupported CLI flags", () => {
    assert.equal(parseBrowserArgs(["--serve"]).serve, true);
    assert.ok(parseBrowserArgs(["--output", "report.json"]).output.endsWith("report.json"));
    assert.throws(() => parseBrowserArgs(["--output"]), /Missing value/);
    assert.throws(() => parseBrowserArgs(["--package-root", "--serve"]), /Missing value/);
    assert.throws(() => parseBrowserArgs(["--unknown"]), /Unknown argument/);
});

test("Browser case set covers pinned regressions, presets, modes, aliases and map paths", async () => {
    const cases = await browserCases();
    assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
    const fixtures = cases.filter(c => c.expected);
    const manifest = JSON.parse(
        await readFile(new URL("fixtures/corpus/regressions/manifest.json", import.meta.url), "utf8")
    );
    const expected = manifest.fixtures.flatMap(f =>
        ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"].flatMap(preset =>
            ["strict", "loose"].map(mode => `fixture/${f.id}/${preset}/${mode}`)
        )
    );
    assert.deepEqual(fixtures.map(c => c.id).sort(), expected.sort());
    for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"])
        for (const mode of ["strict", "loose"])
            assert(
                fixtures.some(c => c.options.grundyScssSorterPreset === preset && c.options.grundyScssSorterSafety === mode)
            );
    for (const c of cases.filter(c => c.aliasOf)) assert(cases.some(other => other.id === c.aliasOf));
    assert(cases.some(c => c.path.node === 1 && c.path.browser === 0));
    assert(cases.some(c => c.category === "map-error-policy"));
    assert.equal(parseBrowserArgs(["--serve"]).serve, true);
    assert.throws(() => parseBrowserArgs(["--output"]), /Missing value/);
    assert.throws(() => parseBrowserArgs(["--unknown"]), /Unknown argument/);
});

test("Browser verifier rejects missing coverage, Node polyfills and wrong direct/fallback counts", async () => {
    assert.equal((await verifyBrowserResults(sample())).valid, true);
    for (const mutate of [
        input => {
            input.browser.rows = [];
        },
        input => {
            input.browser.rows[0].id = "wrong";
        },
        input => {
            input.browser.environment = { ...environment, nodeProcess: "object" };
        },
        input => {
            input.browser.rows[0].first.calls.processes = 1;
        },
        input => {
            input.browser.rows[0].first.calls.parses = 2;
        }
    ]) {
        const input = sample();
        mutate(input);
        await assert.rejects(verifyBrowserResults(input), assert.AssertionError);
    }
});

test("Browser verifier rejects lost comments, reference divergence and unstable formatting", async () => {
    for (const mutate of [
        input => {
            input.browser.rows[0].first.output = output + "/* lost reference */";
        },
        input => {
            input.browser.rows[0].reference.output = output + "/* different */";
        },
        input => {
            input.browser.rows[0].second.output = output + "\n";
        },
        input => {
            input.cases[0].expected = { strict: "different" };
            input.cases[0].options = { grundyScssSorterPreset: "default", grundyScssSorterSafety: "strict" };
        }
    ]) {
        const input = sample();
        mutate(input);
        await assert.rejects(verifyBrowserResults(input), assert.AssertionError);
    }
});

test("Map-policy exception permits only annotation differences and preserves CSS checks", async () => {
    const map = { version: 3, sources: ["input.scss"], names: [], mappings: "AAAA" };
    const annotation = value =>
        "/*# sourceMappingURL=data:application/json;base64," +
        Buffer.from(JSON.stringify(value)).toString("base64") +
        " */\n";
    const testCase = {
        id: "map/root-base64/default/strict",
        source: output + annotation(map),
        category: "map-policy",
        path: { node: 1, browser: 1 },
        options: {}
    };
    const data = {
        cases: [testCase],
        nodeRows: [row(testCase.id, output + annotation(map), 1)],
        browser: { environment, rows: [row(testCase.id, output, 1)] },
        prettier
    };
    assert.equal((await verifyBrowserResults(data)).mapPolicyCases, 1);
    const changed = structuredClone(data.browser);
    changed.rows[0] = row(testCase.id, output.replace("red", "blue"), 1);
    await assert.rejects(verifyBrowserResults({ ...data, browser: changed }), /CSS excluding maps/);
    const stale = structuredClone(data.browser);
    stale.rows[0] = row(testCase.id, output + annotation({ ...map, mappings: "AAAC" }), 1);
    await assert.rejects(verifyBrowserResults({ ...data, browser: stale }), /does not regenerate/);
    const generated = id => output + annotation({ ...map, sources: [`%3Cinput%20css%20${id}%3E`] });
    assert.equal(canonicalMapOutput(generated("one")), canonicalMapOutput(generated("two")));
    assert.notEqual(
        canonicalMapOutput(output + annotation(map)),
        canonicalMapOutput(output + annotation({ ...map, mappings: "AAAC" }))
    );
});

test.run();
