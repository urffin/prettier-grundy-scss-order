import { test } from "uvu";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir, copyFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import scss from "postcss-scss";
import { readinessFixtures, evaluateReadiness } from "../scripts/sass-parser-readiness.mjs";
import {
    selectReadinessVersion,
    validateReadinessCIReport,
    runReadinessCI,
    bootstrapReport,
    readinessSummary,
    readinessCIExitCode,
    main
} from "../scripts/sass-parser-ci.mjs";

const version = "0.5.3";
const integrity = "sha512-Zml4dHVyZQ==";
const registryReply = async () => ({ ok: true, json: async () => ({ name: "sass-parser", version, dist: { integrity } }) });
async function candidateReport(blocked = false) {
    const fixtures = await readinessFixtures();
    const parse = source => {
        if (blocked) source = source.replace("/* keep branch */", "");
        const tree = scss.parse(source);
        tree.toString = () => scss.parse(source).toString(scss.stringify);
        return tree;
    };
    return {
        ...evaluateReadiness(parse, fixtures),
        requestedVersion: version,
        candidate: { name: "sass-parser", version },
        installation: { packageLock: { packages: { "node_modules/sass-parser": { integrity } } } }
    };
}
async function temporary(action) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "scss-parser-ci-test-"));
    try {
        await action(directory);
    } finally {
        assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("scss-parser-ci-test-"));
        await rm(directory, { recursive: true, force: true });
    }
}
const options = directory => ({
    eventName: "workflow_dispatch",
    version,
    output: path.join(directory, "report.json"),
    context: { commit: "a".repeat(40), runId: "42" }
});

test("Manual selection never queries npm latest; untrusted version strings are rejected", async () => {
    const fetchNever = () => {
        throw new Error("Unexpected network");
    };
    assert.deepEqual(await selectReadinessVersion({ eventName: "workflow_dispatch", version }, fetchNever), {
        source: "manual",
        requestedVersion: version,
        version
    });
    for (const value of ["latest", "^0.5.3", "0.5.3\n", "$(touch example)", "file:./package"])
        await assert.rejects(selectReadinessVersion({ eventName: "workflow_dispatch", version: value }, fetchNever));
    await assert.rejects(selectReadinessVersion({ eventName: "push", version }, fetchNever), /Unsupported/);
});

test("Scheduled selection resolves an exact stable npm version and records integrity", async () => {
    const selected = await selectReadinessVersion({ eventName: "schedule", version: "ignored-input" }, async (url, init) => {
        assert.equal(url, "https://registry.npmjs.org/sass-parser/latest");
        assert(init.signal instanceof AbortSignal);
        return registryReply();
    });
    assert.equal(selected.source, "npm-latest");
    assert.equal(selected.version, version);
    assert.equal(selected.integrity, integrity);
    for (const response of [
        { ok: false, status: 503 },
        { ok: true, json: async () => ({ name: "other", version }) },
        { ok: true, json: async () => ({ name: "sass-parser", version: "0.6.0-beta.1", dist: { integrity } }) },
        { ok: true, json: async () => ({ name: "sass-parser", version }) }
    ])
        await assert.rejects(selectReadinessVersion({ eventName: "schedule" }, async () => response));
});

test("Readiness CI accepts passed and measured-blocked research without approving migration", async () => {
    for (const blocked of [false, true])
        await temporary(async directory => {
            const result = await runReadinessCI(options(directory), {
                probe: async input => {
                    assert.equal(input.version, version);
                    assert.equal(input.requirePass, false);
                    assert.notEqual(input.output, options(directory).output);
                    return candidateReport(blocked);
                }
            });
            assert.equal(result.status, blocked ? "blocked" : "passed");
            assert.equal(result.completed, true);
            assert.equal(result.report.migrationApproved, false);
            assert.equal(readinessCIExitCode(result), 0);
            assert.deepEqual(JSON.parse(await readFile(options(directory).output, "utf8")), result);
            assert.match(
                readinessSummary(result),
                blocked ? /Research completed; minimal blockers remain/ : /Minimal checks passed/
            );
        });
});

test("Infrastructure, lookup and forged-report errors yield red status and a JSON artifact", async () => {
    const cases = [
        {
            probe: async () => {
                throw new Error("worker did not start");
            }
        },
        {
            probe: async () => ({
                schemaVersion: 1,
                requestedVersion: version,
                completed: false,
                status: "error",
                migrationApproved: false,
                error: { phase: "install", message: "registry down" }
            })
        },
        {
            probe: async () => {
                const report = await candidateReport(true);
                report.status = "passed";
                return report;
            }
        },
        {
            probe: async () => {
                const report = await candidateReport();
                report.rows[0].checks.pop();
                return report;
            }
        },
        {
            probe: async () => {
                const report = await candidateReport();
                report.failedChecks++;
                return report;
            }
        }
    ];
    for (const dependencies of cases)
        await temporary(async directory => {
            const result = await runReadinessCI(options(directory), dependencies);
            assert.equal(result.status, "error");
            assert.equal(result.completed, false);
            assert.equal(readinessCIExitCode(result), 1);
            assert.match(readinessSummary(result), /Readiness was not evaluated/);
            assert.equal(JSON.parse(await readFile(options(directory).output, "utf8")).status, "error");
        });
    await temporary(async directory => {
        const result = await runReadinessCI(
            { ...options(directory), eventName: "schedule" },
            {
                fetchRegistry: async () => {
                    throw new Error("network unavailable");
                },
                probe: () => {
                    throw new Error("Must not probe");
                }
            }
        );
        assert.equal(result.report.error.phase, "selection");
        assert.equal(result.status, "error");
    });
});

test("Scheduled candidate must match registry selection; missing checks cannot become green", async () => {
    await temporary(async directory => {
        const result = await runReadinessCI(
            { ...options(directory), eventName: "schedule" },
            {
                fetchRegistry: registryReply,
                probe: async () => {
                    const report = await candidateReport();
                    report.installation.packageLock.packages["node_modules/sass-parser"].integrity = "sha512-other";
                    return report;
                }
            }
        );
        assert.equal(result.status, "error");
        assert.match(result.report.error.message, /integrity differs/);
    });
    const report = await candidateReport();
    report.rows[0].checks = [{ name: "invented", status: "pass" }];
    await assert.rejects(validateReadinessCIReport(report, version), /check coverage/);
});

test("Bootstrap report survives failed setup and summary escapes data without workflow commands", async () => {
    await temporary(async directory => {
        const opts = options(directory);
        const initial = bootstrapReport(opts);
        assert.equal(initial.status, "error");
        assert.equal(initial.report.error.phase, "bootstrap");
        const env = {
            SASS_PARSER_REPORT: opts.output,
            SASS_PARSER_VERSION: version,
            GITHUB_EVENT_NAME: "workflow_dispatch",
            GITHUB_SHA: opts.context.commit,
            GITHUB_OUTPUT: path.join(directory, "outputs"),
            GITHUB_STEP_SUMMARY: path.join(directory, "summary")
        };
        await main(["--initialize"], env);
        const artifact = JSON.parse(await readFile(opts.output, "utf8"));
        artifact.report.error.message = "<script>example</script>\n::notice::example";
        await writeFile(opts.output, JSON.stringify(artifact));
        await main(["--summarize"], env);
        assert.equal(await readFile(env.GITHUB_OUTPUT, "utf8"), "status=error\n");
        const summary = await readFile(env.GITHUB_STEP_SUMMARY, "utf8");
        assert(!summary.includes("<script>"));
        assert(summary.includes("&lt;script&gt;"));
        assert.equal(JSON.parse(await readFile(opts.output, "utf8")).status, "error");
    });
});

test("Initialization and error summary work before node_modules exists", async () => {
    await temporary(async directory => {
        const scripts = path.join(directory, "scripts");
        await mkdir(scripts);
        for (const name of ["sass-parser-ci.mjs", "research-sass-parser.mjs"])
            await copyFile(new URL("../scripts/" + name, import.meta.url), path.join(scripts, name));
        const env = {
            ...process.env,
            RUNNER_TEMP: directory,
            SASS_PARSER_VERSION: version,
            GITHUB_EVENT_NAME: "workflow_dispatch",
            GITHUB_STEP_SUMMARY: path.join(directory, "summary"),
            GITHUB_OUTPUT: path.join(directory, "output")
        };
        delete env.SASS_PARSER_REPORT;
        await promisify(execFile)(process.execPath, [path.join(scripts, "sass-parser-ci.mjs"), "--initialize"], {
            cwd: directory,
            env
        });
        await promisify(execFile)(process.execPath, [path.join(scripts, "sass-parser-ci.mjs"), "--summarize"], {
            cwd: directory,
            env
        });
        const result = JSON.parse(await readFile(path.join(directory, "sass-parser-readiness-results.json"), "utf8"));
        assert.equal(result.status, "error");
        assert.equal(result.report.error.phase, "bootstrap");
        assert.equal(await readFile(env.GITHUB_OUTPUT, "utf8"), "status=error\n");
    });
});

test("Workflow stays opt-in or weekly, passes manual input via env and uploads failure evidence", async () => {
    const input = await readFile(new URL("../.github/workflows/sass-parser-readiness.yml", import.meta.url), "utf8");
    assertWorkflow(input.replaceAll("\r\n", "\n"));
    assertWorkflow(input.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
    for (const text of [input.replaceAll("\r\n", "\n"), input.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")])
        assert.throws(() => assertWorkflow(text.replaceAll("if: always()", "if: success()")));
});

function assertWorkflow(input) {
    // Checkout line endings do not change YAML semantics. Exercise both above.
    const source = input.replaceAll("\r\n", "\n");
    assert.match(source, /workflow_dispatch:/);
    assert.match(source, /cron: "23 6 \* \* 1"/);
    assert(!/^ {4}(push|pull_request|release):/m.test(source));
    assert.match(source, /SASS_PARSER_VERSION: \$\{\{ inputs.version \}\}/);
    assert(!/run:.*\$\{\{ inputs.version/.test(source));
    assert.match(source, /contents: read/);
    assert(!source.includes("continue-on-error"));
    assert(source.indexOf("--initialize") < source.indexOf("run: npm ci"));
    assert.match(source, /if: always\(\)\n\s+run: node scripts\/sass-parser-ci.mjs --summarize/);
    assert.match(source, /uses: actions\/upload-artifact@v7\n\s+if: always\(\)/);
    assert.match(source, /sass-parser-readiness-results\*\.json/);
}

test.run();
