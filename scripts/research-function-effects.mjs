import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import prettier from "prettier";
import * as sass from "sass";
import postcss from "postcss";
import scss from "postcss-scss";
import plugin from "../src/index.mjs";
import { createSorter } from "../src/sorter-core.mjs";
import { postcssAdapter } from "../src/postcss-adapter.mjs";
import { resolveConfiguration } from "../src/configuration.mjs";
import { presets } from "../src/presets/index.mjs";
import { corpusManifest, corpusSources, hash } from "./corpus.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixturesRoot = path.join(root, "tests/fixtures/function-effects");
const policies = [
    "all-parentheses",
    "all-call-syntax",
    "local-call-syntax",
    "local-effect-summary",
    "local-effects-and-qualified-calls"
];
const common = { parser: "scss", printWidth: 100, tabWidth: 2, endOfLine: "lf" };
const canonical = name => name.replaceAll("_", "-");

// Deliberately lexical research probes, NOT a Sass expression parser or purity
// analysis. Strings, comments, raw custom properties and escapes are limitations
// demonstrated by the fixtures. Production uses none of these predicates.
export function calls(text) {
    return [...text.matchAll(/([a-zA-Z_-][\w.-]*)\s*\(/g)].map(m => canonical(m[1]));
}
function header(node) {
    if (node.type === "decl") return `${node.prop}: ${node.value}`;
    if (node.type === "rule") return node.selector;
    return node.type === "atrule" ? node.params : "";
}
function analyze(tree) {
    const functions = new Map();
    tree.walkAtRules("function", node => {
        const name = /^([^\s(]+)\s*\(/.exec(node.params)?.[1];
        if (!name) return;
        const text = node.toString();
        let writes = false;
        node.walkDecls(decl => {
            writes ||= postcssAdapter.isAssignment(decl) && (/!global\b/.test(decl.value) || decl.prop.includes("."));
        });
        node.walkAtRules(rule => {
            writes ||= ["warn", "debug", "error"].includes(rule.name);
        });
        functions.set(canonical(name), { direct: writes, calls: calls(text) });
    });
    const close = opaque => {
        const effects = new Set(
            [...functions]
                .filter(([, fn]) => fn.direct || (opaque && fn.calls.some(c => c.includes(".") || c === "call")))
                .map(([name]) => name)
        );
        let changed;
        do {
            changed = false;
            for (const [name, fn] of functions)
                if (!effects.has(name) && fn.calls.some(c => effects.has(c))) {
                    effects.add(name);
                    changed = true;
                }
        } while (changed);
        return effects;
    };
    return { functions, effects: close(false), opaqueEffects: close(true) };
}
function predicate(policy, analysis) {
    return node => {
        if (node.type === "comment") return false;
        if (policy === "all-parentheses") return header(node).includes("(");
        const names = calls(header(node));
        if (policy === "all-call-syntax") return names.length > 0;
        if (policy === "local-call-syntax") return names.some(n => analysis.functions.has(n));
        if (policy === "local-effect-summary") return names.some(n => analysis.effects.has(n));
        if (policy === "local-effects-and-qualified-calls")
            return names.some(n => analysis.opaqueEffects.has(n) || n.includes(".") || n === "call");
        return false;
    };
}
async function prototype(source, options, policy) {
    const tree = scss.parse(source),
        marked = predicate(policy, analyze(tree));
    // Research-only injection into the existing recursive boundary mechanism.
    // This models effect barriers and ancestor propagation; it does not redefine
    // assignment semantics in the production adapter or add a public option.
    const adapter = { ...postcssAdapter, isAssignment: node => postcssAdapter.isAssignment(node) || marked(node) };
    createSorter(await resolveConfiguration(options), adapter)(tree);
    return prettier.format(tree.toString(scss.stringify), { ...common, plugins: [] });
}
function projection(css) {
    const records = new Map();
    postcss.parse(css).walkDecls(node => {
        const context = [];
        for (let parent = node.parent; parent.type !== "root"; parent = parent.parent)
            context.unshift(parent.type === "rule" ? parent.selector : `@${parent.name} ${parent.params}`);
        const key = JSON.stringify([context, node.prop]);
        if (!records.has(key)) records.set(key, []);
        records.get(key).push([node.value, !!node.important]);
    });
    return [...records].sort(([a], [b]) => a.localeCompare(b));
}
function compile(source, file) {
    const diagnostics = [];
    try {
        const result = sass.compileString(source, {
            url: pathToFileURL(file),
            style: "expanded",
            logger: {
                warn(message, options) {
                    if (!options.deprecation) diagnostics.push(["warn", message]);
                },
                debug(message) {
                    diagnostics.push(["debug", message]);
                }
            }
        });
        return { success: true, css: result.css, projection: projection(result.css), diagnostics };
    } catch (error) {
        return { success: false, error: error.sassMessage ?? error.message, diagnostics };
    }
}
function compare(before, after) {
    return {
        compiles: after.success,
        cssTextEqual: after.success && before.css === after.css,
        cssValuesEqual: after.success && JSON.stringify(before.projection) === JSON.stringify(after.projection),
        diagnosticsEqual: JSON.stringify(before.diagnostics) === JSON.stringify(after.diagnostics)
    };
}
const preserved = result => result.compiles && result.cssValuesEqual && result.diagnosticsEqual;
const setting = (fixture, preset = "default", withRoot = true, split = false, safety = "strict") => ({
    ...common,
    plugins: [plugin],
    ...fixture.options,
    ...(fixture.options.grundyScssSorterGroups ?
        { grundyScssSorterGroups: JSON.stringify(fixture.options.grundyScssSorterGroups) }
    :   {}),
    grundyScssSorterPreset: preset,
    grundyScssSorterWithRoot: withRoot,
    grundyScssSorterSplitGroup: split,
    grundyScssSorterSafety: safety
});
async function save(directory, name, contents) {
    await fs.writeFile(path.join(directory, name), contents);
}

export async function research({ output, caseId, skipCorpus = false }) {
    const manifest = JSON.parse(await fs.readFile(path.join(fixturesRoot, "manifest.json"), "utf8"));
    const fixtures = manifest.cases.filter(f => !caseId || f.id === caseId);
    assert.ok(fixtures.length, "Unknown or empty case selection");
    await fs.mkdir(output, { recursive: true });
    const report = {
        schemaVersion: 1,
        commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(),
        runtime: { node: process.version, sass: /^dart-sass\s+(\S+)/.exec(sass.info)?.[1], prettier: prettier.version },
        sourceHashes: {},
        runtimeSourceHashes: {},
        methodology:
            "Authored deterministic Sass examples. CSS projection preserves per-context property value sequences, allowing independent declaration order only in these controlled cases; not general cascade equivalence. Diagnostics compared separately. Prototype regexes are deliberately incomplete; no production behavior changes or speed claims.",
        cases: [],
        matrix: [],
        prototypes: [],
        manual: [],
        corpus: null
    };
    for (const name of ["modules/_counter.scss", "modules/_api.scss", "manifest.json"])
        report.sourceHashes[name] = hash(await fs.readFile(path.join(fixturesRoot, name)));
    for (const name of [
        "scripts/research-function-effects.mjs",
        ...execFileSync("git", ["ls-files", "src"], { cwd: root, encoding: "utf8", windowsHide: true }).trim().split("\n")
    ])
        report.runtimeSourceHashes[name] = hash(await fs.readFile(path.join(root, name)));
    for (const fixture of fixtures) {
        const file = path.join(fixturesRoot, fixture.file),
            source = await fs.readFile(file, "utf8"),
            before = compile(source, file);
        assert.ok(before.success, `${fixture.id} source must compile: ${before.error}`);
        report.sourceHashes[fixture.file] = hash(source);
        const directory = path.join(output, fixture.id);
        await fs.mkdir(directory, { recursive: true });
        await save(directory, "before.scss", source);
        await save(directory, "before.css", before.css);
        const entry = { id: fixture.id, kind: fixture.kind, before, defaultStrict: null, defaultLoose: null };
        for (const preset of Object.keys(presets))
            for (const withRoot of [false, true])
                for (const split of [false, true]) {
                    const options = setting(fixture, preset, withRoot, split),
                        formatted = await prettier.format(source, options),
                        after = compile(formatted, file);
                    const row = {
                        id: fixture.id,
                        preset,
                        withRoot,
                        split,
                        ...compare(before, after),
                        idempotent: (await prettier.format(formatted, options)) === formatted
                    };
                    assert.ok(row.idempotent, `Not idempotent: ${fixture.id}/${preset}`);
                    report.matrix.push(row);
                    if (preset === "default" && withRoot && !split) {
                        entry.defaultStrict = { formatted, after, ...row };
                        await save(directory, "strict.scss", formatted);
                        await save(
                            directory,
                            after.success ? "strict.css" : "strict.error.txt",
                            after.success ? after.css : after.error
                        );
                        assert.equal(
                            await prototype(source, options, "none"),
                            formatted,
                            "Prototype baseline must match the real plugin"
                        );
                    }
                    if (fixture.kind === "control") assert.ok(preserved(row), `Control changed: ${fixture.id}/${preset}`);
                }
        const looseOptions = setting(fixture, "default", true, false, "loose"),
            loose = await prettier.format(source, looseOptions),
            looseResult = compile(loose, file);
        entry.defaultLoose = { formatted: loose, after: looseResult, ...compare(before, looseResult) };
        await save(directory, "loose.scss", loose);
        await save(
            directory,
            looseResult.success ? "loose.css" : "loose.error.txt",
            looseResult.success ? looseResult.css : looseResult.error
        );
        const options = setting(fixture);
        for (const policy of policies) {
            const formatted = await prototype(source, options, policy),
                after = compile(formatted, file),
                result = compare(before, after);
            assert.equal(
                await prototype(formatted, options, policy),
                formatted,
                `Prototype not idempotent: ${fixture.id}/${policy}`
            );
            report.prototypes.push({
                id: fixture.id,
                kind: fixture.kind,
                policy,
                ...result,
                outputDiffersFromStrict: formatted !== entry.defaultStrict.formatted,
                after,
                formatted
            });
        }
        // Existing opt-out: ignore complete executing style rules, not just a
        // declaration deep inside a nested block whose parent can still move.
        const ignoredTree = scss.parse(source);
        for (const node of [...ignoredTree.nodes])
            if (node.type === "rule")
                ignoredTree.insertBefore(node, postcss.comment({ text: "prettier-ignore", raws: { before: "\n" } }));
        const ignored = await prettier.format(ignoredTree.toString(scss.stringify), options);
        const ignoredResult = compare(before, compile(ignored, file));
        assert.ok(preserved(ignoredResult), `Whole-rule ignore workaround failed: ${fixture.id}`);
        report.manual.push({ id: fixture.id, strategy: "ignore-whole-rule", ...ignoredResult });
        if (fixture.id === "direct-counter") {
            const exact = await prettier.format(source, {
                ...options,
                grundyScssSorterGroups: JSON.stringify({
                    decl: { type: "decl", oneOf: ["width", "height"], order: "exact" }
                })
            });
            const exactResult = compare(before, compile(exact, file));
            assert.ok(preserved(exactResult));
            report.manual.push({ id: fixture.id, strategy: "exact-width-height", ...exactResult });
            await save(directory, "manual-exact.scss", exact);
            const assignments = source.replace(
                "width: tick(); height: tick();",
                "$width: tick(); $height: tick(); width: $width; height: $height;"
            );
            const assignmentResult = compare(before, compile(await prettier.format(assignments, options), file));
            assert.ok(preserved(assignmentResult));
            report.manual.push({ id: fixture.id, strategy: "explicit-assignments", ...assignmentResult });
        }
        if (fixture.id === "nested-rule") {
            const leaf = scss.parse(source);
            leaf.walkDecls(node => {
                if (!postcssAdapter.isAssignment(node) && calls(node.value).includes("tick"))
                    node.parent.insertBefore(node, postcss.comment({ text: "prettier-ignore", raws: { before: "\n" } }));
            });
            const formatted = await prettier.format(leaf.toString(scss.stringify), options);
            const leafResult = compare(before, compile(formatted, file));
            report.manual.push({ id: fixture.id, strategy: "ignore-only-nested-leaf", ...leafResult });
            await save(directory, "ignore-only-leaf.scss", formatted);
        }
        report.cases.push(entry);
        process.stderr.write(`Function effects: ${fixture.id}\n`);
    }
    if (!skipCorpus) {
        const corpus = {
            projects: [],
            files: 0,
            functions: 0,
            globalAssignments: 0,
            qualifiedCandidates: [],
            policies: Object.fromEntries(policies.map(p => [p, { candidates: 0, files: 0, changedFiles: 0 }]))
        };
        const options = setting({ options: {} });
        for (const project of corpusManifest().projects) {
            corpus.projects.push({
                id: project.id,
                revision: project.revision,
                digest: project.digest,
                files: project.files.length
            });
            for (const file of corpusSources(project.id)) {
                corpus.files++;
                const tree = scss.parse(file.source),
                    analysis = analyze(tree);
                corpus.functions += analysis.functions.size;
                tree.walkDecls(decl => {
                    if (postcssAdapter.isAssignment(decl) && /!global\b/.test(decl.value)) corpus.globalAssignments++;
                });
                const baseline = await prototype(file.source, options, "none");
                for (const policy of policies) {
                    const matches = [];
                    tree.walk(node => {
                        if (!postcssAdapter.isAssignment(node) && predicate(policy, analysis)(node)) matches.push(node);
                    });
                    const stats = corpus.policies[policy];
                    stats.candidates += matches.length;
                    if (policy === "local-effects-and-qualified-calls")
                        for (const node of matches)
                            corpus.qualifiedCandidates.push({
                                project: project.id,
                                file: file.path,
                                line: node.source.start.line,
                                names: calls(header(node)),
                                text: header(node)
                            });
                    if (matches.length) stats.files++;
                    if ((await prototype(file.source, options, policy)) !== baseline) stats.changedFiles++;
                }
            }
        }
        report.corpus = corpus;
    }
    report.summary = {
        cases: report.cases.length,
        strictMatrixRows: report.matrix.length,
        strictCSSChanges: report.matrix.filter(r => r.compiles && !r.cssValuesEqual).length,
        strictDiagnosticChanges: report.matrix.filter(r => !r.diagnosticsEqual).length,
        strictCompileErrors: report.matrix.filter(r => !r.compiles).length,
        defaultChangedCases: report.cases.filter(c => !preserved(c.defaultStrict)).map(c => c.id),
        policies: policies.map(policy => ({
            policy,
            preservesEffectCases: report.prototypes.filter(r => r.policy === policy && r.kind !== "control" && preserved(r))
                .length,
            missedEffectCases: report.prototypes
                .filter(r => r.policy === policy && r.kind !== "control" && !preserved(r))
                .map(r => r.id),
            changedControls: report.prototypes
                .filter(r => r.policy === policy && r.kind === "control" && r.outputDiffersFromStrict)
                .map(r => r.id),
            changedControlCSS: report.prototypes
                .filter(r => r.policy === policy && r.kind === "control" && !preserved(r))
                .map(r => r.id)
        }))
    };
    await save(output, "report.json", JSON.stringify(report, null, 2) + "\n");
    return { output, runtime: report.runtime, ...report.summary, corpus: report.corpus };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    try {
        const args = {},
            valid = new Set(["--output", "--case"]);
        for (let i = 2; i < process.argv.length; i++) {
            const flag = process.argv[i];
            if (flag === "--skip-corpus" && !args.skipCorpus) {
                args.skipCorpus = true;
                continue;
            }
            assert.ok(
                valid.has(flag) && !args[flag] && process.argv[i + 1] && !process.argv[i + 1].startsWith("--"),
                "Usage: --output DIRECTORY [--case ID] [--skip-corpus]"
            );
            args[flag] = process.argv[++i];
        }
        const output =
            args["--output"] ?
                path.resolve(args["--output"])
            :   await fs.mkdtemp(path.join(os.tmpdir(), "scss-function-effects-"));
        console.log(
            JSON.stringify(await research({ output, caseId: args["--case"], skipCorpus: args.skipCorpus }), null, 2)
        );
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
