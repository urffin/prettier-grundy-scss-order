import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import nodeAssert from "node:assert/strict";
import { test } from "uvu";
import * as assert from "uvu/assert";
import prettier from "prettier";
import postcss from "postcss";
import scss from "postcss-scss";
import { presets } from "../src/presets/index.mjs";
import { compile, compare, formatOptions } from "../scripts/research-function-effects.mjs";

const root = fileURLToPath(new URL("fixtures/function-effects/", import.meta.url));
const fixtures = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).cases;
const source = fixture => readFileSync(path.join(root, fixture.file), "utf8");
const preserved = result => result.compiles && result.cssValuesEqual && result.diagnosticsEqual;

test("Function-effect comparisons retain property sequences, contexts, diagnostics and errors", () => {
    const file = path.join(root, "example.scss");
    const before = compile(".a { width:1px; width:2px; height:3px; }", file);
    const reordered = compare(before, compile(".a { height:3px; width:1px; width:2px; }", file));
    assert.ok(reordered.cssValuesEqual && !reordered.cssTextEqual);
    assert.is(compare(before, compile(".a { width:2px; width:1px; height:3px; }", file)).cssValuesEqual, false);
    assert.is(compare(before, compile(".b { width:1px; width:2px; height:3px; }", file)).cssValuesEqual, false);
    const diagnostics = compile('@warn "first"; @debug "second"; .a { color:red; }', file);
    assert.equal(diagnostics.diagnostics, [
        ["warn", "first"],
        ["debug", "second"]
    ]);
    assert.is(
        compare(diagnostics, compile('@debug "second"; @warn "first"; .a { color:red; }', file)).diagnosticsEqual,
        false
    );
    const failed = compile('@error "expected";', file);
    assert.is(failed.success, false);
    assert.is(compare(before, failed).compiles, false);
});

test("Pure function controls preserve CSS and diagnostics across presets, roots and groups", async () => {
    const controls = fixtures.filter(f => f.kind === "control");
    assert.is(controls.length, 8);
    let cases = 0;
    for (const fixture of controls) {
        const input = source(fixture),
            file = path.join(root, fixture.file),
            before = compile(input, file);
        assert.ok(before.success);
        for (const preset of Object.keys(presets))
            for (const withRoot of [false, true])
                for (const split of [false, true]) {
                    const options = {
                        ...formatOptions(fixture),
                        grundyScssSorterPreset: preset,
                        grundyScssSorterWithRoot: withRoot,
                        grundyScssSorterSplitGroup: split
                    };
                    const formatted = await prettier.format(input, options);
                    assert.ok(
                        preserved(compare(before, compile(formatted, file))),
                        `${fixture.id}/${preset}/${withRoot}/${split}`
                    );
                    assert.is(await prettier.format(formatted, options), formatted);
                    cases++;
                }
    }
    assert.is(cases, 160);
});

test("Ignoring complete executing rules preserves all authored function-effect examples", async () => {
    assert.is(fixtures.length, 31);
    for (const fixture of fixtures) {
        const input = source(fixture),
            file = path.join(root, fixture.file),
            tree = scss.parse(input);
        for (const node of tree.nodes.slice())
            if (node.type === "rule")
                tree.insertBefore(node, postcss.comment({ text: "prettier-ignore", raws: { before: "\n" } }));
        const formatted = await prettier.format(tree.toString(scss.stringify), formatOptions(fixture));
        assert.ok(preserved(compare(compile(input, file), compile(formatted, file))), fixture.id);
    }
});

test("Explicit property order and assignments preserve the direct counter workaround", async () => {
    const fixture = fixtures.find(f => f.id === "direct-counter"),
        input = source(fixture),
        file = path.join(root, fixture.file);
    const before = compile(input, file),
        options = formatOptions(fixture);
    const exact = await prettier.format(input, {
        ...options,
        grundyScssSorterGroups: JSON.stringify({ decl: { type: "decl", oneOf: ["width", "height"], order: "exact" } })
    });
    assert.ok(preserved(compare(before, compile(exact, file))));
    const assignments = input.replace(
        "width: tick(); height: tick();",
        "$width: tick(); $height: tick(); width: $width; height: $height;"
    );
    assert.is.not(assignments, input);
    assert.ok(preserved(compare(before, compile(await prettier.format(assignments, options), file))));
});

test("The public reproducer keeps CLI selection and emits examples without heuristic reports", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scss-function-examples-test-"));
    const script = fileURLToPath(new URL("../scripts/research-function-effects.mjs", import.meta.url));
    const run = args => promisify(execFile)(process.execPath, [script, ...args], { windowsHide: true });
    try {
        const { stdout } = await run(["--case", "pure-local", "--skip-corpus", "--output", directory]);
        assert.is(JSON.parse(stdout).cases, 1);
        const report = JSON.parse(await readFile(path.join(directory, "report.json"), "utf8"));
        assert.is(report.schemaVersion, 2);
        assert.is(report.kind, "function-effect-examples");
        assert.equal(
            report.cases.map(c => c.id),
            ["pure-local"]
        );
        for (const field of ["policies", "prototypes", "matrix", "corpus"]) assert.is(field in report, false);
        for (const key of ["defaultStrict", "defaultLoose"]) {
            assert.ok(report.cases[0][key].idempotent);
            assert.equal(
                compare(report.cases[0].before, report.cases[0][key].after),
                Object.fromEntries(
                    ["compiles", "cssTextEqual", "cssValuesEqual", "diagnosticsEqual"].map(field => [
                        field,
                        report.cases[0][key][field]
                    ])
                )
            );
            const safety = key === "defaultStrict" ? "strict" : "loose";
            const after = report.cases[0][key].after;
            assert.is(
                await readFile(
                    path.join(directory, "pure-local", `${safety}.${after.success ? "css" : "error.txt"}`),
                    "utf8"
                ),
                after.success ? after.css : after.error
            );
        }
        assert.ok(preserved(report.cases[0].defaultStrict));
        await nodeAssert.rejects(
            run(["--case", "unknown", "--output", path.join(directory, "unknown")]),
            /Unknown or empty case selection/
        );
        for (const args of [["--output"], ["--policy", "all-parentheses"], ["--case", "pure-local", "--case", "pure-local"]])
            await nodeAssert.rejects(run(args), /Usage:/);
    } finally {
        nodeAssert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
        nodeAssert.ok(path.basename(directory).startsWith("scss-function-examples-test-"));
        await rm(directory, { recursive: true, force: true });
    }
});

test.run();
