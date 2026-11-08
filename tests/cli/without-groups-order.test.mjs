import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

import { test } from "uvu";
import * as assert from "uvu/assert";

const execFileAsync = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(directory, "../..");
const prettierCli = path.resolve(rootDirectory, "node_modules/prettier/bin/prettier.cjs");

test("Should format non-SCSS files when groups order is not configured", async () => {
    const { stdout } = await execFileAsync(process.execPath, [prettierCli, "--check", "package.json"], {
        cwd: rootDirectory
    });

    assert.match(stdout, /All matched files use Prettier code style/);
});

test("CLI honours preset defaults and explicit root overrides", async () => {
    const args = [
        prettierCli,
        "--no-config",
        "--plugin",
        "./src/index.mjs",
        "--parser",
        "scss",
        "--grundy-scss-sorter-preset",
        "csscomb",
        "--grundy-scss-sorter-groups-order",
        "rule",
        "--grundy-scss-sorter-groups",
        '{"rule":{"type":"rule","order":"alphabetical"}}'
    ];
    async function format(extra) {
        const child = execFile(process.execPath, [...args, ...extra], { cwd: rootDirectory });
        let stdout = "",
            stderr = "";
        child.stdout.on("data", chunk => (stdout += chunk));
        child.stderr.on("data", chunk => (stderr += chunk));
        const finished = new Promise((resolve, reject) => {
            child.on("error", reject);
            child.on("close", code => (code === 0 ? resolve(stdout) : reject(new Error(stderr))));
        });
        child.stdin.end(".z { color: red; } .a { color: blue; }");
        return finished;
    }
    assert.ok((await format([])).startsWith(".z"));
    assert.ok((await format(["--grundy-scss-sorter-with-root"])).startsWith(".a"));
    assert.ok((await format(["--no-grundy-scss-sorter-with-root"])).startsWith(".z"));
});

test.run();
