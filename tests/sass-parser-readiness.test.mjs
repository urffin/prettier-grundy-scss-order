import { test } from "uvu";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import scss from "postcss-scss";
import * as sass from "sass";
import { readinessFixtures, evaluateFixture, evaluateReadiness } from "../scripts/sass-parser-readiness.mjs";
import { parseReadinessArgs, readinessExitCode } from "../scripts/research-sass-parser.mjs";

const require = createRequire(import.meta.url);
const run = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/research-sass-parser.mjs", import.meta.url));
const preservingParser = source => {
    const tree = scss.parse(source);
    tree.toString = () => scss.parse(source).toString(scss.stringify);
    return tree;
};

test("Readiness fixtures cover all previous blockers and compile as independent Sass", async () => {
    const fixtures = await readinessFixtures();
    assert.deepEqual(
        fixtures.map(row => row.id),
        ["keyframes-percentages", "branch-comment", "footer-comment", "ignored-subtree", "leading-whitespace", "control"]
    );
    for (const fixture of fixtures) {
        sass.compileString(fixture.input, { logger: sass.Logger.silent });
        assert.match(fixture.sha256, /^[a-f0-9]{64}$/);
    }
    const result = evaluateReadiness(preservingParser, fixtures);
    assert.equal(result.status, "passed");
    assert.equal(result.readyForCorpus, true);
    assert.equal(result.migrationApproved, false);
    assert.equal(result.passedFixtures, fixtures.length);
    assert.throws(() => evaluateReadiness(preservingParser, []), /without fixtures/);
});

test("Round-trip checks detect parse failures and comments lost on either pass", async () => {
    const fixtures = await readinessFixtures();
    const parseFailure = evaluateFixture(() => {
        throw new Error("unsupported selector");
    }, fixtures[0]);
    assert.equal(parseFailure.passed, false);
    assert.equal(parseFailure.checks[0].status, "fail");
    assert(parseFailure.checks.some(check => check.status === "skipped"));
    const dropsFirst = evaluateFixture(source => preservingParser(source.replace("/* keep branch */", "")), fixtures[1]);
    assert.equal(dropsFirst.checks.find(check => check.name === "comments-first").status, "fail");
    let calls = 0;
    const dropsSecond = evaluateFixture(
        source => preservingParser(++calls === 1 ? source : source.replace("/* keep footer */", "")),
        fixtures[2]
    );
    assert.equal(dropsSecond.checks.find(check => check.name === "comments-first").status, "pass");
    assert.equal(dropsSecond.checks.find(check => check.name === "comments-second").status, "fail");
    assert.equal(dropsSecond.checks.find(check => check.name === "stable-roundtrip").status, "fail");
});

test("Readiness rejects rewritten ignore text and missing adapter whitespace metadata", async () => {
    const fixtures = await readinessFixtures();
    const ignored = evaluateFixture(source => preservingParser(source.replace("   color :", " color:")), fixtures[3]);
    assert.equal(ignored.checks.find(check => check.name === "ignored-subtree").status, "fail");
    const whitespace = evaluateFixture(source => {
        const tree = preservingParser(source);
        tree.first.nodes.forEach(node => {
            delete node.raws.before;
        });
        return tree;
    }, fixtures[4]);
    assert.equal(whitespace.checks.find(check => check.name === "raws-before").status, "fail");
});

test("Printer errors, invalid output and failed reparses cannot pass readiness", async () => {
    const fixture = (await readinessFixtures()).at(-1);
    const throws = evaluateFixture(
        () => ({
            toString() {
                throw new Error("printer");
            }
        }),
        fixture
    );
    assert.equal(throws.checks.find(check => check.name === "stringify").status, "fail");
    const invalid = evaluateFixture(() => ({ toString: () => ".a {" }), fixture);
    assert.equal(invalid.checks.find(check => check.name === "printed-scss").status, "fail");
    let calls = 0;
    const reparse = evaluateFixture(source => {
        if (++calls === 2) throw new Error("second parse");
        return preservingParser(source);
    }, fixture);
    assert.equal(reparse.checks.find(check => check.name === "reparse").status, "fail");
    assert.equal(reparse.passed, false);
});

test("CLI requires exact versions and distinguishes blockers from infrastructure errors", () => {
    for (const args of [
        [],
        ["--version", "latest"],
        ["--version", "^0.5.3"],
        ["--version", "0.5.3\n"],
        ["--version", "file:local"],
        ["--version", "https://example.com"],
        ["--version"],
        ["--other"]
    ])
        assert.throws(() => parseReadinessArgs(args));
    assert.equal(parseReadinessArgs(["--version", "0.5.3"]).version, "0.5.3");
    assert.equal(parseReadinessArgs(["--version", "0.6.0-beta.1", "--require-pass"]).requirePass, true);
    assert.equal(readinessExitCode({ completed: false }, false), 1);
    assert.equal(readinessExitCode({ completed: true, minimumChecksPassed: false }, false), 0);
    assert.equal(readinessExitCode({ completed: true, minimumChecksPassed: false }, true), 2);
    assert.equal(readinessExitCode({ completed: true, minimumChecksPassed: true }, true), 0);
});

test("Offline CLI uses a fresh worker, validates candidate version and writes JSON without changing repository dependencies", async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "scss-readiness-test-"));
    const packageFile = fileURLToPath(new URL("../package.json", import.meta.url));
    const lockFile = fileURLToPath(new URL("../package-lock.json", import.meta.url));
    const before = await Promise.all([fs.readFile(packageFile), fs.readFile(lockFile)]);
    try {
        const candidate = path.join(temporary, "candidate");
        await fs.mkdir(candidate);
        await fs.writeFile(
            path.join(candidate, "package.json"),
            JSON.stringify({ name: "sass-parser", version: "0.0.0-test", exports: "./index.cjs" })
        );
        const modulePath = require.resolve("postcss-scss");
        await fs.writeFile(
            path.join(candidate, "index.cjs"),
            `const scss=require(${JSON.stringify(modulePath)});exports.scss={parse(source){const tree=scss.parse(source);tree.toString=()=>scss.parse(source).toString(scss.stringify);return tree;}};`
        );
        const output = path.join(temporary, "passed.json");
        await run(process.execPath, [
            cli,
            "--version",
            "0.0.0-test",
            "--package-root",
            candidate,
            "--output",
            output,
            "--require-pass"
        ]);
        const report = JSON.parse(await fs.readFile(output, "utf8"));
        assert.equal(report.completed, true);
        assert.equal(report.minimumChecksPassed, true);
        assert.equal(report.candidate.version, "0.0.0-test");
        assert.equal(report.installation.kind, "existing-package");
        assert.notEqual(report.worker.pid, process.pid);
        // Exercise the actual CLI exit path for measured blockers without any
        // registry access or a production sass-parser dependency.
        await fs.writeFile(
            path.join(candidate, "index.cjs"),
            `const scss=require(${JSON.stringify(modulePath)});exports.scss={parse(source){source=source.replace("/* keep branch */","");const tree=scss.parse(source);tree.toString=()=>scss.parse(source).toString(scss.stringify);return tree;}};`
        );
        const blocked = path.join(temporary, "blocked.json");
        await assert.rejects(
            run(process.execPath, [
                cli,
                "--version",
                "0.0.0-test",
                "--package-root",
                candidate,
                "--output",
                blocked,
                "--require-pass"
            ]),
            error => error.code === 2
        );
        const blockedReport = JSON.parse(await fs.readFile(blocked, "utf8"));
        assert.equal(blockedReport.completed, true);
        assert.equal(blockedReport.readyForCorpus, false);
        assert.equal(blockedReport.migrationApproved, false);
        assert.equal(blockedReport.requestedVersion, "0.0.0-test");
        const wrong = path.join(temporary, "wrong.json");
        await assert.rejects(
            run(process.execPath, [cli, "--version", "0.0.1", "--package-root", candidate, "--output", wrong]),
            error => error.code === 1
        );
        const error = JSON.parse(await fs.readFile(wrong, "utf8"));
        assert.equal(error.completed, false);
        assert.equal(error.requestedVersion, "0.0.1");
        assert.equal(error.error.phase, "load");
        assert.match(error.error.message, /name\/version/);
        const after = await Promise.all([fs.readFile(packageFile), fs.readFile(lockFile)]);
        assert.deepEqual(after, before);
    } finally {
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(temporary).startsWith("scss-readiness-test-"));
        await fs.rm(temporary, { recursive: true, force: true });
    }
});

test.run();
