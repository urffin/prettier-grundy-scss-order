import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import scss from "postcss-scss";

export const hash = value => createHash("sha256").update(value).digest("hex");
const fixtureRoot = new URL("../tests/fixtures/sass-parser/", import.meta.url);
export async function readinessFixtures() {
    const manifest = JSON.parse(await readFile(new URL("manifest.json", fixtureRoot), "utf8"));
    if (manifest.schemaVersion !== 1) throw new Error("Unsupported readiness fixture schema");
    if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) throw new Error("Missing readiness fixtures");
    const ids = new Set();
    return Promise.all(
        manifest.fixtures.map(async fixture => {
            if (!/^[\w-]+$/.test(fixture.id) || ids.has(fixture.id) || !/^[\w-]+\.scss$/.test(fixture.file))
                throw new Error("Invalid readiness fixture");
            ids.add(fixture.id);
            const input = await readFile(new URL(fixture.file, fixtureRoot), "utf8");
            return { ...fixture, input, sha256: hash(input) };
        })
    );
}
function comments(source) {
    const items = [];
    scss.parse(source).walkComments(node => items.push([!!node.raws.inline, node.text.replace(/\s+/g, " ").trim()]));
    return items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
const errorInfo = error => ({ name: error.name, message: error.message });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function beforeRows(tree) {
    const rule = tree.nodes?.find(node => node.type === "rule" && node.selector === ".probe");
    return (
        rule?.nodes?.map(node => ({
            type: node.type,
            name: node.type === "decl" ? node.prop : node.text,
            before: node.raws?.before ?? null
        })) ?? null
    );
}

export function evaluateFixture(parse, fixture) {
    const row = { id: fixture.id, file: fixture.file, input: fixture.input, inputSHA256: fixture.sha256, checks: [] };
    const check = (name, passed, detail = {}) => row.checks.push({ name, status: passed ? "pass" : "fail", ...detail });
    const skip = names => names.forEach(name => row.checks.push({ name, status: "skipped" }));
    const baselineComments = comments(fixture.input);
    let ast;
    try {
        ast = parse(fixture.input);
        check("parse", true);
    } catch (error) {
        check("parse", false, { error: errorInfo(error) });
        skip(["stringify", "printed-scss", "comments-first", "reparse", "comments-second", "stable-roundtrip"]);
        if (fixture.ignoredSelector) skip(["ignored-subtree"]);
        if (fixture.rawsBefore) skip(["raws-before"]);
        return finish(row);
    }
    if (fixture.rawsBefore) {
        const expected = beforeRows(scss.parse(fixture.input)),
            actual = beforeRows(ast);
        check("raws-before", equal(expected, actual), { expected, actual });
    }
    try {
        row.first = ast.toString();
        if (typeof row.first !== "string") throw new Error("Parser stringifier did not return a string");
        check("stringify", true);
    } catch (error) {
        check("stringify", false, { error: errorInfo(error) });
        skip(["printed-scss", "comments-first", "reparse", "comments-second", "stable-roundtrip"]);
        if (fixture.ignoredSelector) skip(["ignored-subtree"]);
        return finish(row);
    }
    let firstValid = true;
    try {
        const actual = comments(row.first);
        check("printed-scss", true);
        check("comments-first", equal(baselineComments, actual), { expected: baselineComments, actual });
    } catch (error) {
        firstValid = false;
        check("printed-scss", false, { error: errorInfo(error) });
        skip(["comments-first"]);
    }
    if (fixture.ignoredSelector) {
        const node = scss
            .parse(fixture.input)
            .nodes.find(node => node.type === "rule" && node.selector === fixture.ignoredSelector);
        if (!node) throw new Error("Missing ignored fixture selector");
        const expected = node.toString(scss.stringify);
        check("ignored-subtree", row.first.includes(expected), { expected });
    }
    try {
        row.second = parse(row.first).toString();
        if (typeof row.second !== "string") throw new Error("Parser stringifier did not return a string");
        check("reparse", true);
    } catch (error) {
        check("reparse", false, { error: errorInfo(error) });
        skip(["comments-second", "stable-roundtrip"]);
        return finish(row);
    }
    try {
        const actual = comments(row.second);
        check("comments-second", equal(baselineComments, actual), { expected: baselineComments, actual });
    } catch (error) {
        check("comments-second", false, { error: errorInfo(error) });
    }
    check("stable-roundtrip", row.first === row.second && firstValid);
    row.exactInputRoundTrip = fixture.input === row.first;
    return finish(row);
}
function finish(row) {
    row.passed = row.checks.every(check => check.status === "pass");
    return row;
}
export function evaluateReadiness(parse, fixtures) {
    if (!fixtures.length) throw new Error("Cannot establish readiness without fixtures");
    const rows = fixtures.map(fixture => evaluateFixture(parse, fixture));
    const checks = rows.flatMap(row => row.checks);
    const minimumChecksPassed = rows.every(row => row.passed);
    return {
        schemaVersion: 1,
        completed: true,
        status: minimumChecksPassed ? "passed" : "blocked",
        minimumChecksPassed,
        readyForCorpus: minimumChecksPassed,
        migrationApproved: false,
        nextStep:
            minimumChecksPassed ?
                "Run the pinned corpus, then adapter and browser checks."
            :   "Resolve the failed minimal checks before running the full corpus.",
        fixtures: rows.length,
        passedFixtures: rows.filter(row => row.passed).length,
        failedChecks: checks.filter(check => check.status === "fail").length,
        skippedChecks: checks.filter(check => check.status === "skipped").length,
        inputsSHA256: hash(JSON.stringify(fixtures.map(fixture => [fixture.id, fixture.sha256]))),
        rows
    };
}
