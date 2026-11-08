import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, copyFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const prettierVersion = require("prettier/package.json").version;
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run this check with npm run test:package");
function run(script, args, cwd, capture = false) {
    const result = spawnSync(process.execPath, [script, ...args], {
        cwd,
        encoding: "utf8",
        stdio: capture ? "pipe" : "inherit",
        env: { ...process.env, SCSS_PACKAGE_VERSION: pkg.version }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Command failed (${result.status}): ${args.join(" ")}\n${result.stderr ?? ""}`);
    return result.stdout;
}
const temporary = await mkdtemp(path.join(os.tmpdir(), "scss-package-"));
try {
    const [packed] = JSON.parse(run(npmCli, ["pack", "--json", "--pack-destination", temporary], root, true));
    const files = new Set(packed.files.map(file => file.path));
    for (const required of [
        "src/index.mjs",
        "src/configuration.mjs",
        "src/postcss-adapter.mjs",
        "src/sorter-core.mjs",
        "src/presets/index.mjs",
        "types/prettier-grundy-scss-order.d.ts",
        "types/prettier-grundy-scss-order-presets.d.ts"
    ]) {
        assert.ok(files.has(required), `Package must contain ${required}`);
    }
    for (const file of files) assert.ok(!/^(tests|scripts|\.github)\//.test(file), `Unexpected packed file: ${file}`);
    await writeFile(
        path.join(temporary, "package.json"),
        JSON.stringify({
            name: "scss-package-consumer",
            private: true,
            type: "module",
            dependencies: { [pkg.name]: `file:${path.join(temporary, packed.filename)}`, prettier: prettierVersion }
        })
    );
    run(npmCli, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], temporary);
    await copyFile(new URL("./package-smoke.mjs", import.meta.url), path.join(temporary, "smoke.mjs"));
    run(path.join(temporary, "smoke.mjs"), [], temporary);
    await copyFile(path.join(root, "tests/types/configuration.mts"), path.join(temporary, "configuration.mts"));
    await copyFile(path.join(root, "tests/types/tsconfig.json"), path.join(temporary, "tsconfig.json"));
    const tsRoot = path.dirname(require.resolve("typescript/package.json"));
    run(
        path.join(tsRoot, require("typescript/package.json").bin.tsc),
        ["-p", path.join(temporary, "tsconfig.json")],
        temporary
    );
    console.log(`Package content and installed TypeScript declarations passed (${files.size} files).`);
} finally {
    // Delete only the directory created for this check, inside the OS temp root.
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temporary));
    assert.ok(
        relative &&
            !relative.startsWith("..") &&
            !path.isAbsolute(relative) &&
            path.basename(temporary).startsWith("scss-package-")
    );
    await rm(temporary, { recursive: true, force: true });
}
