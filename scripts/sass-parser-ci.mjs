import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseReadinessArgs, runReadiness } from "./research-sass-parser.mjs";

const latestURL = "https://registry.npmjs.org/sass-parser/latest";
const modes = new Set(["workflow_dispatch", "schedule"]);
function envelope(options, selection, report) {
    return {
        schemaVersion: 1,
        kind: "sass-parser-readiness-ci",
        status: report.status,
        completed: report.completed,
        context: options.context ?? {},
        selection,
        report
    };
}
function errorReport(phase, error, requestedVersion) {
    return {
        schemaVersion: 1,
        completed: false,
        status: "error",
        requestedVersion,
        migrationApproved: false,
        error: { phase, name: error.name, message: error.message }
    };
}
async function save(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}
export function bootstrapReport(options) {
    const requestedVersion = options.eventName === "schedule" ? null : (options.version ?? null);
    return envelope(
        options,
        { source: options.eventName === "schedule" ? "npm-latest" : "manual", requestedVersion, version: null },
        errorReport(
            "bootstrap",
            new Error("The probe has not run; inspect the dependency installation or preceding workflow steps."),
            requestedVersion
        )
    );
}
export async function selectReadinessVersion(options, fetchRegistry = fetch) {
    assert(modes.has(options.eventName), "Unsupported workflow event");
    if (options.eventName === "workflow_dispatch") {
        const { version } = parseReadinessArgs(["--version", options.version ?? ""]);
        return { source: "manual", requestedVersion: version, version };
    }
    const response = await fetchRegistry(latestURL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`npm latest lookup failed: HTTP ${response.status}`);
    const metadata = await response.json();
    assert.equal(metadata.name, "sass-parser", "Unexpected registry package");
    const { version } = parseReadinessArgs(["--version", metadata.version]);
    assert(
        !version.split("+")[0].includes("-"),
        "npm latest points to a prerelease; select it explicitly with a manual run"
    );
    assert.match(metadata.dist?.integrity ?? "", /^sha512-[A-Za-z0-9+/]+={0,2}$/, "Missing npm integrity");
    return {
        source: "npm-latest",
        requestedVersion: null,
        version,
        registryURL: latestURL,
        integrity: metadata.dist.integrity
    };
}
export async function validateReadinessCIReport(report, version) {
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.requestedVersion, version);
    assert.equal(report.migrationApproved, false);
    if (report.completed === false) {
        assert.equal(report.status, "error");
        assert.equal(typeof report.error?.phase, "string");
        assert.equal(typeof report.error?.message, "string");
        return;
    }
    assert.equal(report.completed, true);
    const { readinessFixtures, hash } = await import("./sass-parser-readiness.mjs");
    const fixtures = await readinessFixtures();
    assert.equal(report.candidate?.name, "sass-parser");
    assert.equal(report.candidate.version, version);
    assert.equal(report.inputsSHA256, hash(JSON.stringify(fixtures.map(f => [f.id, f.sha256]))));
    assert.equal(report.rows.length, fixtures.length);
    const checks = [];
    for (const [index, fixture] of fixtures.entries()) {
        const row = report.rows[index];
        assert.equal(row.id, fixture.id);
        assert.equal(row.input, fixture.input);
        assert.equal(row.inputSHA256, fixture.sha256);
        const expectedChecks = [
            "parse",
            "stringify",
            "printed-scss",
            "comments-first",
            "reparse",
            "comments-second",
            "stable-roundtrip"
        ];
        if (fixture.ignoredSelector) expectedChecks.push("ignored-subtree");
        if (fixture.rawsBefore) expectedChecks.push("raws-before");
        assert.deepEqual(
            row.checks.map(check => check.name).sort(),
            expectedChecks.sort(),
            "Complete, non-duplicated check coverage"
        );
        for (const check of row.checks) assert(["pass", "fail", "skipped"].includes(check.status));
        assert(["pass", "fail"].includes(row.checks.find(check => check.name === "parse").status));
        if (row.checks.some(check => check.status === "skipped")) assert(row.checks.some(check => check.status === "fail"));
        assert.equal(
            row.passed,
            row.checks.every(check => check.status === "pass")
        );
        checks.push(...row.checks);
    }
    assert.equal(report.fixtures, fixtures.length);
    assert.equal(report.passedFixtures, report.rows.filter(row => row.passed).length);
    assert.equal(report.failedChecks, checks.filter(check => check.status === "fail").length);
    assert.equal(report.skippedChecks, checks.filter(check => check.status === "skipped").length);
    const passed = report.rows.every(row => row.passed);
    assert.equal(report.minimumChecksPassed, passed);
    assert.equal(report.readyForCorpus, passed);
    assert.equal(report.status, passed ? "passed" : "blocked");
}
export async function runReadinessCI(options, { probe = runReadiness, fetchRegistry = fetch } = {}) {
    let selection = bootstrapReport(options).selection;
    let phase = "selection",
        report;
    // Keep raw research evidence separate from the CI envelope, including on failures.
    const rawOutput = options.output.replace(/\.json$/i, "") + ".probe.json";
    try {
        selection = await selectReadinessVersion(options, fetchRegistry);
        phase = "probe";
        report = await probe({ version: selection.version, output: rawOutput, requirePass: false });
        phase = "validation";
        await validateReadinessCIReport(report, selection.version);
        if (report.completed && selection.integrity)
            assert.equal(
                report.installation?.packageLock?.packages?.["node_modules/sass-parser"]?.integrity,
                selection.integrity,
                "Installed package integrity differs from npm selection"
            );
    } catch (error) {
        report = errorReport(
            phase,
            error,
            selection.version ?? (options.eventName === "schedule" ? null : (options.version ?? null))
        );
    }
    const result = envelope(options, selection, report);
    await save(options.output, result);
    return result;
}
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function readinessSummary(result) {
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.kind, "sass-parser-readiness-ci");
    assert(["passed", "blocked", "error"].includes(result.status));
    assert.equal(result.status, result.report.status);
    assert.equal(result.completed, result.report.completed);
    const report = result.report;
    const version = escape(result.selection.version ?? result.selection.requestedVersion ?? "unresolved");
    const text = [
        "## Sass parser readiness",
        "",
        `Version: <code>${version}</code>`,
        "",
        `**Status: ${result.status}**`,
        ""
    ];
    if (result.status === "error") {
        assert.equal(report.completed, false);
        text.push(
            "Readiness was not evaluated because setup or execution failed.",
            "",
            `<pre>${escape(report.error.phase + ": " + report.error.message)}</pre>`
        );
    } else {
        assert.equal(report.completed, true);
        text.push(
            result.status === "blocked" ?
                "Research completed; minimal blockers remain."
            :   "Minimal checks passed; the pinned full corpus is the next investigation.",
            "",
            `Fixtures passed: ${report.passedFixtures}/${report.fixtures}. Failed checks: ${report.failedChecks}; skipped: ${report.skippedChecks}.`,
            "",
            "| Fixture | Result | Failed checks |",
            "| --- | --- | --- |"
        );
        for (const row of report.rows)
            text.push(
                `| ${escape(row.id)} | ${row.passed ? "passed" : "blocked"} | ${escape(
                    row.checks
                        .filter(check => check.status === "fail")
                        .map(check => check.name)
                        .join(", ")
                )} |`
            );
    }
    text.push(
        "",
        "Migration is not approved by this workflow. See the downloadable JSON for exact inputs, dependencies and diagnostics.",
        ""
    );
    return text.join("\n");
}
export const readinessCIExitCode = result => (result.status === "error" ? 1 : 0);
export async function main(args = process.argv.slice(2), env = process.env) {
    if (args.some(arg => !["--initialize", "--summarize"].includes(arg)) || args.length > 1)
        throw new Error("Expected --initialize, --summarize or no arguments");
    const options = {
        eventName: env.GITHUB_EVENT_NAME ?? "workflow_dispatch",
        version: env.SASS_PARSER_VERSION,
        output: path.resolve(
            env.SASS_PARSER_REPORT ?? path.join(env.RUNNER_TEMP ?? ".", "sass-parser-readiness-results.json")
        ),
        context: {
            repository: env.GITHUB_REPOSITORY ?? null,
            commit: env.GITHUB_SHA ?? null,
            runId: env.GITHUB_RUN_ID ?? null,
            runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
            eventName: env.GITHUB_EVENT_NAME ?? "workflow_dispatch"
        }
    };
    if (args[0] === "--initialize") {
        await save(options.output, bootstrapReport(options));
        return;
    }
    if (args[0] === "--summarize") {
        const result = JSON.parse(await fs.readFile(options.output, "utf8"));
        const text = readinessSummary(result);
        if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, text);
        else console.log(text);
        if (env.GITHUB_OUTPUT) await fs.appendFile(env.GITHUB_OUTPUT, `status=${result.status}\n`);
        return;
    }
    const result = await runReadinessCI(options);
    console.log(`Sass parser readiness: ${result.status}; JSON: ${options.output}`);
    process.exitCode = readinessCIExitCode(result);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
