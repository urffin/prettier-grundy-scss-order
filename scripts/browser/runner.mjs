import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { browserCases } from "./cases.mjs";
import { createBrowserRuntime } from "./runtime.mjs";
import { verifyBrowserResults } from "./verification.mjs";
import { validateDependencyOptions, dependencyRequests, consumerManifest, dependencyEvidence } from "./dependencies.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = promisify(execFile);
const require = createRequire(import.meta.url);
const digest = text => createHash("sha256").update(text).digest("hex");

export function parseBrowserArgs(args) {
    const options = { serve: false, output: path.resolve("browser-results.json") };
    for (let i = 0; i < args.length; i++) {
        const key = args[i];
        if (key === "--serve") options.serve = true;
        else if (["--output", "--package-root", "--postcss", "--postcss-scss"].includes(key)) {
            assert.ok(args[i + 1] && !args[i + 1].startsWith("--"), `Missing value: ${key}`);
            const name = {
                "--output": "output",
                "--package-root": "packageRoot",
                "--postcss": "postcss",
                "--postcss-scss": "postcssScss"
            }[key];
            assert.equal(options[name] === undefined || name === "output", true, `Duplicate option: ${key}`);
            const value = args[++i];
            options[name] = ["output", "packageRoot"].includes(name) ? path.resolve(value) : value;
        } else throw new Error(`Unknown argument: ${key}`);
    }
    validateDependencyOptions(options);
    return options;
}

async function installedPackage(temporary, options) {
    if (options.packageRoot) return { directory: options.packageRoot, kind: "existing-install" };
    assert.ok(process.env.npm_execpath, "Run with npm run test:browser, or supply --package-root for an existing install");
    const npm = (args, cwd) =>
        run(process.execPath, [process.env.npm_execpath, ...args], { cwd, maxBuffer: 8 * 1024 * 1024 });
    const { stdout } = await npm(["pack", "--json", "--pack-destination", temporary], root);
    const [packed] = JSON.parse(stdout);
    const pkg = require("../../package.json");
    const requests = dependencyRequests(pkg, options);
    const manifest = consumerManifest(
        pkg,
        path.join(temporary, packed.filename),
        require("prettier/package.json").version,
        requests
    );
    await writeFile(path.join(temporary, "package.json"), JSON.stringify(manifest));
    await npm(
        [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--registry=https://registry.npmjs.org/",
            "--fetch-retries=0",
            "--fetch-timeout=30000"
        ],
        temporary
    );
    return {
        directory: path.join(temporary, "node_modules/prettier-grundy-scss-order"),
        kind: "packed-install",
        integrity: packed.integrity,
        ...(requests ?
            {
                dependencyRequests: requests,
                consumerManifest: manifest,
                packageLock: JSON.parse(await readFile(path.join(temporary, "package-lock.json"), "utf8"))
            }
        :   {})
    };
}

export async function prepareBrowserSmoke(options, temporary) {
    validateDependencyOptions(options);
    const installed = await installedPackage(temporary, options);
    const { dependencyRequests: requests, consumerManifest: manifest, packageLock, ...target } = installed;
    const pkgRoot = target.directory;
    const consumer = createRequire(path.join(pkgRoot, "package.json"));
    const pkg = consumer("./package.json");
    assert.equal(pkg.name, "prettier-grundy-scss-order");
    const pp = path.dirname(consumer.resolve("prettier/package.json"));
    const imports = {
        plugin: path.join(pkgRoot, "src/index.mjs"),
        native: consumer.resolve("prettier/parser-postcss"),
        postcss: consumer.resolve("postcss"),
        scss: path.join(path.dirname(consumer.resolve("postcss-scss/package.json")), "lib/scss-syntax.mjs"),
        configuration: path.join(pkgRoot, "src/configuration.mjs"),
        sorter: path.join(pkgRoot, "src/grundy-prop-sorter.mjs"),
        runtime: fileURLToPath(new URL("./runtime.mjs", import.meta.url))
    };
    const versions = {
        node: process.version,
        prettier: consumer("prettier/package.json").version,
        postcss: consumer("postcss/package.json").version,
        postcssScss: consumer("postcss-scss/package.json").version,
        esbuild: require("esbuild/package.json").version
    };
    const dependencies = dependencyEvidence(requests, manifest, packageLock, versions);
    if (dependencies) {
        const syntaxConsumer = createRequire(consumer.resolve("postcss-scss/package.json"));
        assert.equal(
            syntaxConsumer.resolve("postcss"),
            imports.postcss,
            "SCSS syntax and plugin must load the same PostCSS"
        );
        const rootConsumer = createRequire(path.join(temporary, "package.json"));
        assert.equal(rootConsumer.resolve("postcss"), imports.postcss, "Selected PostCSS must reach the packed plugin");
        assert.equal(
            rootConsumer.resolve("postcss-scss"),
            consumer.resolve("postcss-scss"),
            "Selected SCSS syntax must reach the packed plugin"
        );
    }
    const load = file => import(pathToFileURL(file));
    const [prettier, plugin, native, postcss, scss, configuration, sorter] = await Promise.all([
        load(path.join(pp, "index.mjs")),
        load(imports.plugin),
        load(imports.native),
        load(imports.postcss),
        load(imports.scss),
        load(imports.configuration),
        load(imports.sorter)
    ]);
    const runtime = createBrowserRuntime({
        prettier: prettier.default,
        plugin: plugin.default,
        native: native.default,
        postcss: postcss.default,
        scss: scss.default,
        ...configuration,
        ...sorter
    });
    const cases = await browserCases();
    const nodeRows = [];
    for (const test of cases) nodeRows.push(await runtime.run(test));
    const spec = file => JSON.stringify(file.replaceAll("\\", "/"));
    const contents = `
import prettier from ${spec(path.join(pp, "standalone.mjs"))};
import plugin from ${spec(imports.plugin)};
import native from ${spec(imports.native)};
import postcss from ${spec(imports.postcss)};
import scss from ${spec(imports.scss)};
import { resolveConfiguration } from ${spec(imports.configuration)};
import { grundyPropSorter } from ${spec(imports.sorter)};
import { createBrowserRuntime } from ${spec(imports.runtime)};
export const runtime = createBrowserRuntime({prettier,plugin,native,postcss,scss,resolveConfiguration,grundyPropSorter});`;
    const built = await build({
        stdin: { contents, resolveDir: root, sourcefile: "browser-smoke-entry.mjs" },
        bundle: true,
        platform: "browser",
        format: "esm",
        target: "es2022",
        write: false,
        metafile: true,
        outfile: "bundle.mjs",
        logLevel: "silent"
    });
    assert.equal(built.metafile.outputs["bundle.mjs"].imports.length, 0, "Browser bundle must have no unresolved imports");
    const bundle = built.outputFiles[0].text;
    const sourceHashes = {};
    for (const [name, file] of Object.entries(imports)) sourceHashes[name] = digest(await readFile(file));
    return {
        cases,
        nodeRows,
        bundle,
        prettier: prettier.default,
        metadata: {
            target: { ...target, version: pkg.version },
            versions,
            ...(dependencies ? { dependencies } : {}),
            sourceHashes,
            bundleSHA256: digest(bundle),
            bundleBytes: Buffer.byteLength(bundle),
            inputsSHA256: digest(JSON.stringify(cases)),
            browserPolicy: "PostCSS package browser remaps; no Node polyfills or custom shims"
        }
    };
}

export async function serveBrowserSmoke(prepared, options) {
    const evidence = options.output.replace(/\.json$/i, "") + ".evidence";
    await mkdir(evidence, { recursive: true });
    await writeFile(path.join(evidence, "node-results.json"), JSON.stringify(prepared.nodeRows, null, 2));
    await writeFile(path.join(evidence, "cases.json"), JSON.stringify(prepared.cases, null, 2));
    await writeFile(path.join(evidence, "bundle.mjs"), prepared.bundle);
    await writeFile(path.join(evidence, "metadata.json"), JSON.stringify(prepared.metadata, null, 2));
    let finish;
    const completed = new Promise(resolve => {
        finish = resolve;
    });
    let posted = false;
    const server = createServer(async (request, response) => {
        try {
            const routes = {
                "/": [
                    "text/html",
                    '<!doctype html><html lang="en"><meta charset="utf-8"><title>SCSS browser smoke</title><h1>SCSS browser smoke</h1><p id="status">Loading</p><pre id="detail"></pre><script type="module" src="/page.mjs"></script></html>'
                ],
                "/cases.json": ["application/json", JSON.stringify(prepared.cases)],
                "/bundle.mjs": ["text/javascript", prepared.bundle],
                "/page.mjs": ["text/javascript", await readFile(new URL("./page.mjs", import.meta.url), "utf8")]
            };
            if (request.method === "GET" && routes[request.url]) {
                const [type, body] = routes[request.url];
                response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(body);
                return;
            }
            if (request.method !== "POST" || !["/results", "/failure"].includes(request.url) || posted) {
                response.writeHead(404).end();
                return;
            }
            assert.equal(
                request.headers.origin,
                `http://127.0.0.1:${server.address().port}`,
                "Results must come from this local page"
            );
            let body = "";
            for await (const part of request) {
                body += part;
                assert.ok(Buffer.byteLength(body) < 16 * 1024 * 1024, "Oversized report");
            }
            posted = true;
            if (request.url === "/failure") throw new Error(body);
            const browser = JSON.parse(body);
            await writeFile(path.join(evidence, "browser-results.json"), JSON.stringify(browser, null, 2));
            const verified = await verifyBrowserResults({ ...prepared, browser });
            const report = { schemaVersion: 1, ...prepared.metadata, ...verified };
            await writeFile(options.output, JSON.stringify(report, null, 2) + "\n");
            response.writeHead(200, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                    valid: true,
                    cases: verified.cases,
                    exactOutputCases: verified.exactOutputCases,
                    diagnostics: verified.diagnostics,
                    mapPolicyCases: verified.mapPolicyCases,
                    mapErrorPolicyCases: verified.mapErrorPolicyCases,
                    report: options.output
                })
            );
            finish(report);
        } catch (error) {
            const failed = { valid: false, error: error.stack || String(error) };
            await writeFile(options.output, JSON.stringify(failed, null, 2));
            response.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify(failed));
            finish(failed);
        }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    return { server, url: `http://127.0.0.1:${server.address().port}`, completed };
}

export async function main(args = process.argv.slice(2)) {
    if (args.includes("--help")) {
        console.log(
            "npm run test:browser -- [--output browser-results.json] [--serve] [--package-root /installed/package | --postcss minimum|latest --postcss-scss minimum|latest]\nDefault: pack/install current checkout and run headless Chromium. latest resolves within the declared runtime range; dependency selectors require a fresh tarball install. --serve: open the printed URL in a browser; no browser is launched or debugged by this command."
        );
        return;
    }
    const options = parseBrowserArgs(args);
    await mkdir(path.dirname(options.output), { recursive: true });
    const temporary = await mkdtemp(path.join(os.tmpdir(), "scss-browser-"));
    let host, browser, timeout;
    try {
        const prepared = await prepareBrowserSmoke(options, temporary);
        host = await serveBrowserSmoke(prepared, options);
        console.log(
            `Browser smoke: ${host.url} (${prepared.cases.length} cases; package ${prepared.metadata.target.version}; Prettier ${prepared.prettier.version})`
        );
        const deadline = new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Browser smoke timed out")), options.serve ? 600000 : 120000);
        });
        if (!options.serve) {
            const { chromium } = await import("playwright");
            browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            page.on("pageerror", error => console.error(error));
            await page.goto(host.url);
        }
        const report = await Promise.race([host.completed, deadline]);
        assert.equal(report.valid, true, report.error);
        console.log(
            `Browser smoke passed: ${report.cases} cases, ${report.exactOutputCases} exact outputs, ${report.diagnostics} diagnostics, ${report.mapPolicyCases + report.mapErrorPolicyCases} explicit map-policy cases.`
        );
    } finally {
        clearTimeout(timeout);
        await browser?.close();
        if (host) await new Promise(resolve => host.server.close(resolve));
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(temporary).startsWith("scss-browser-"));
        await rm(temporary, { recursive: true, force: true });
    }
}
