import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const worker = fileURLToPath(new URL("./sass-parser-worker.mjs", import.meta.url));
const registry = "https://registry.npmjs.org/";
export function parseReadinessArgs(args) {
    const options = { output: path.resolve("sass-parser-results.json"), requirePass: false };
    for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (flag === "--require-pass") options.requirePass = true;
        else if (["--version", "--output", "--package-root"].includes(flag)) {
            const value = args[++index];
            if (!value || value.startsWith("--")) throw new Error(`Missing value: ${flag}`);
            if (flag === "--version") options.version = value;
            else options[flag === "--output" ? "output" : "packageRoot"] = path.resolve(value);
        } else throw new Error(`Unknown argument: ${flag}`);
    }
    const number = "(?:0|[1-9][0-9]*)";
    if (
        options.version?.trim() !== options.version ||
        !new RegExp(
            `^${number}\\.${number}\\.${number}(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`
        ).test(options.version ?? "")
    )
        throw new Error(
            "--version must be an exact published version, for example 0.5.3; tags, ranges, URLs and paths are not accepted"
        );
    return options;
}
export const readinessExitCode = (report, requirePass) =>
    !report.completed ? 1
    : requirePass && !report.minimumChecksPassed ? 2
    : 0;

export async function runReadiness(options) {
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "scss-sass-parser-"));
    let phase = "install",
        report;
    let installation = {
        kind: options.packageRoot ? "existing-package" : "isolated-install",
        registry: options.packageRoot ? null : registry
    };
    try {
        let packageRoot = options.packageRoot;
        if (!packageRoot) {
            assert.ok(
                process.env.npm_execpath,
                "Run with npm run research:sass-parser, or supply --package-root for an existing installation"
            );
            const manifest = {
                name: "scss-sass-parser-probe",
                private: true,
                dependencies: { "sass-parser": options.version }
            };
            await fs.writeFile(path.join(temporary, "package.json"), JSON.stringify(manifest, null, 2));
            await run(
                process.execPath,
                [
                    process.env.npm_execpath,
                    "install",
                    "--ignore-scripts",
                    "--no-audit",
                    "--no-fund",
                    "--registry",
                    registry,
                    "--fetch-retries=0",
                    "--fetch-timeout=30000"
                ],
                {
                    cwd: temporary,
                    timeout: 120000,
                    maxBuffer: 2 * 1024 * 1024,
                    windowsHide: true
                }
            );
            const lockText = await fs.readFile(path.join(temporary, "package-lock.json"), "utf8");
            const packageLock = JSON.parse(lockText);
            installation = {
                ...installation,
                packageJSON: manifest,
                packageLock,
                lockJSONSHA256: createHash("sha256").update(JSON.stringify(packageLock)).digest("hex")
            };
            packageRoot = path.join(temporary, "node_modules/sass-parser");
        }
        phase = "worker";
        const target = path.join(temporary, "worker.json");
        const processResult = await run(process.execPath, [worker, packageRoot, options.version, target], {
            timeout: 60000,
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true
        });
        report = { ...JSON.parse(await fs.readFile(target, "utf8")), installation };
        if (processResult.stdout || processResult.stderr)
            report.workerLogs = { stdout: processResult.stdout, stderr: processResult.stderr };
    } catch (error) {
        report = {
            schemaVersion: 1,
            completed: false,
            status: "error",
            migrationApproved: false,
            installation,
            error: { phase, name: error.name, message: error.message }
        };
    } finally {
        // Only remove our own verified directory inside the OS temp root.
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(temporary).startsWith("scss-sass-parser-"));
        await fs.rm(temporary, { recursive: true, force: true });
    }
    report.requestedVersion = options.version;
    await fs.writeFile(options.output, JSON.stringify(report, null, 2) + "\n");
    return report;
}
export async function main(args = process.argv.slice(2)) {
    if (args.includes("--help")) {
        console.log(
            "npm run research:sass-parser -- --version 0.5.3 [--output sass-parser-results.json] [--require-pass] [--package-root /installed/sass-parser]\nExact version required. Fresh isolated npm install; lifecycle scripts disabled. --package-root checks an existing installation in a fresh worker. Exit 0: completed research (may be blocked); 1: infrastructure error; 2: measured blockers with --require-pass."
        );
        return;
    }
    const options = parseReadinessArgs(args);
    const report = await runReadiness(options);
    console.log(
        `sass-parser ${options.version}: ${report.status}; ${report.passedFixtures ?? 0}/${report.fixtures ?? 0} fixtures passed. JSON: ${options.output}`
    );
    if (report.error) console.error(`${report.error.phase}: ${report.error.message}`);
    process.exitCode = readinessExitCode(report, options.requirePass);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
