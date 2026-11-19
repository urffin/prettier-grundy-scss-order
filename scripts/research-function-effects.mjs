// Public behavior examples only; the completed heuristic study is pinned in Git.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import prettier from "prettier";
import * as sass from "sass";
import postcss from "postcss";
import plugin from "../src/index.mjs";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url)),
    fixturesRoot = path.join(root, "tests/fixtures/function-effects"),
    require = createRequire(import.meta.url);
const hash = value => createHash("sha256").update(value).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();

// Controlled-fixture projection, not a general cascade-equivalence checker.
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
export function compile(source, file) {
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
export function compare(before, after) {
    return {
        compiles: after.success,
        cssTextEqual: after.success && before.css === after.css,
        cssValuesEqual: after.success && JSON.stringify(before.projection) === JSON.stringify(after.projection),
        diagnosticsEqual: JSON.stringify(before.diagnostics) === JSON.stringify(after.diagnostics)
    };
}
export const formatOptions = (fixture, safety = "strict") => ({
    parser: "scss",
    printWidth: 100,
    tabWidth: 2,
    endOfLine: "lf",
    plugins: [plugin],
    ...fixture.options,
    ...(fixture.options.grundyScssSorterGroups ?
        { grundyScssSorterGroups: JSON.stringify(fixture.options.grundyScssSorterGroups) }
    :   {}),
    grundyScssSorterWithRoot: true,
    grundyScssSorterSplitGroup: false,
    grundyScssSorterSafety: safety
});
const preserved = result => result.compiles && result.cssValuesEqual && result.diagnosticsEqual;

export async function research({ output, caseId }) {
    const manifest = JSON.parse(await fs.readFile(path.join(fixturesRoot, "manifest.json"), "utf8"));
    const fixtures = manifest.cases.filter(f => !caseId || f.id === caseId);
    assert.ok(fixtures.length, "Unknown or empty case selection");
    await fs.mkdir(output, { recursive: true });
    const report = {
        schemaVersion: 2,
        kind: "function-effect-examples",
        commit: git("rev-parse", "HEAD"),
        dirty: !!git("status", "--porcelain"),
        runtime: {
            node: process.version,
            sass: /^dart-sass\s+(\S+)/.exec(sass.info)?.[1],
            prettier: prettier.version,
            postcss: require("postcss/package.json").version,
            postcssScss: require("postcss-scss/package.json").version
        },
        methodology:
            "Public strict/loose, default preset, root sorting on, group spacing off. CSS projection permits independent declaration order only in controlled authored fixtures; not general cascade equivalence. Known unsafe outcomes are observations, not desired behavior. No heuristic prototypes or corpus scan.",
        sourceHashes: {},
        runtimeSourceHashes: {},
        cases: []
    };
    for (const name of ["modules/_counter.scss", "modules/_api.scss", "manifest.json", ...fixtures.map(f => f.file)])
        report.sourceHashes[name] = hash(await fs.readFile(path.join(fixturesRoot, name)));
    for (const name of ["scripts/research-function-effects.mjs", "package-lock.json", ...git("ls-files", "src").split("\n")])
        report.runtimeSourceHashes[name] = hash(await fs.readFile(path.join(root, name)));
    for (const fixture of fixtures) {
        const file = path.join(fixturesRoot, fixture.file),
            source = await fs.readFile(file, "utf8"),
            before = compile(source, file);
        assert.ok(before.success, `${fixture.id} source must compile: ${before.error}`);
        const directory = path.join(output, fixture.id);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, "before.scss"), source);
        await fs.writeFile(path.join(directory, "before.css"), before.css);
        const entry = { id: fixture.id, kind: fixture.kind, before };
        for (const safety of ["strict", "loose"]) {
            const options = formatOptions(fixture, safety),
                formatted = await prettier.format(source, options),
                after = compile(formatted, file);
            const result = {
                formatted,
                after,
                ...compare(before, after),
                idempotent: (await prettier.format(formatted, options)) === formatted
            };
            assert.ok(result.idempotent, `Not idempotent: ${fixture.id}/${safety}`);
            if (fixture.kind === "control" && safety === "strict")
                assert.ok(preserved(result), `Control changed: ${fixture.id}/${safety}`);
            entry[safety === "strict" ? "defaultStrict" : "defaultLoose"] = result;
            await fs.writeFile(path.join(directory, `${safety}.scss`), formatted);
            await fs.writeFile(
                path.join(directory, `${safety}.${after.success ? "css" : "error.txt"}`),
                after.success ? after.css : after.error
            );
        }
        report.cases.push(entry);
        process.stderr.write(`Function effects: ${fixture.id}\n`);
    }
    report.summary = { cases: report.cases.length };
    for (const safety of ["strict", "loose"]) {
        const rows = report.cases.map(c => c[safety === "strict" ? "defaultStrict" : "defaultLoose"]);
        report.summary[safety] = {
            cssValueChanges: rows.filter(r => r.compiles && !r.cssValuesEqual).length,
            compilationErrors: rows.filter(r => !r.compiles).length,
            diagnosticChanges: rows.filter(r => !r.diagnosticsEqual).length
        };
    }
    await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return { output, runtime: report.runtime, ...report.summary };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    try {
        const args = {};
        for (let i = 2; i < process.argv.length; i++) {
            const flag = process.argv[i];
            // Compatibility with old commands; the current runner never scans the corpus.
            if (flag === "--skip-corpus" && !args.skipCorpus) {
                args.skipCorpus = true;
                continue;
            }
            assert.ok(
                ["--output", "--case"].includes(flag) &&
                    !args[flag] &&
                    process.argv[i + 1] &&
                    !process.argv[i + 1].startsWith("--"),
                "Usage: --output DIRECTORY [--case ID] [--skip-corpus]"
            );
            args[flag] = process.argv[++i];
        }
        const output =
            args["--output"] ?
                path.resolve(args["--output"])
            :   await fs.mkdtemp(path.join(os.tmpdir(), "scss-function-effects-"));
        console.log(JSON.stringify(await research({ output, caseId: args["--case"] }), null, 2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
