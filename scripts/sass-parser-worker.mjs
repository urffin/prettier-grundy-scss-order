// Always launched in a fresh process, keeping the candidate out of the plugin's process.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import * as sass from "sass";
import { readinessFixtures, evaluateReadiness } from "./sass-parser-readiness.mjs";

const [packageRoot, version, output] = process.argv.slice(2);
const hash = value => createHash("sha256").update(value).digest("hex");
let phase = "load";
let report;
try {
    const file = path.join(packageRoot, "package.json");
    const metadata = JSON.parse(await fs.readFile(file, "utf8"));
    if (metadata.name !== "sass-parser" || metadata.version !== version)
        throw new Error("Candidate package name/version differs from the requested sass-parser version");
    const require = createRequire(file);
    const entry = require.resolve("sass-parser");
    const imported = await import(pathToFileURL(entry));
    const api = imported.scss ?? imported.default?.scss;
    if (typeof api?.parse !== "function") throw new Error("Candidate must expose scss.parse");
    const dependencyVersion = async name => {
        let directory;
        try {
            directory = path.dirname(require.resolve(name));
        } catch {
            return null;
        }
        // Sass does not export package.json. Walk from the resolved entry rather
        // than mistaking an export restriction for an absent dependency.
        for (;;) {
            try {
                const pkg = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
                if (pkg.name === name) return pkg.version;
            } catch {}
            const parent = path.dirname(directory);
            if (parent === directory) return null;
            directory = parent;
        }
    };
    phase = "fixtures";
    const fixtures = await readinessFixtures();
    // These are valid Sass inputs; a broken fixture is an infrastructure error.
    for (const fixture of fixtures) sass.compileString(fixture.input, { logger: sass.Logger.silent });
    phase = "probe";
    report = {
        ...evaluateReadiness(source => api.parse(source), fixtures),
        candidate: {
            name: metadata.name,
            requestedVersion: version,
            version: metadata.version,
            entrySHA256: hash(await fs.readFile(entry)),
            packageJSONSHA256: hash(await fs.readFile(file)),
            dependencies: { sass: await dependencyVersion("sass"), postcss: await dependencyVersion("postcss") }
        },
        reference: {
            postcssScss: createRequire(import.meta.url)("postcss-scss/package.json").version,
            inputCompiler: sass.info
        },
        worker: { pid: process.pid, timeOriginMs: performance.timeOrigin, node: process.version }
    };
} catch (error) {
    report = {
        schemaVersion: 1,
        completed: false,
        status: "error",
        migrationApproved: false,
        error: { phase, name: error.name, message: error.message }
    };
}
await fs.writeFile(output, JSON.stringify(report, null, 2));
