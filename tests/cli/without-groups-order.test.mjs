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
    const { stdout } = await execFileAsync(process.execPath, [prettierCli, "--check", "package.json"], { cwd: rootDirectory });

    assert.match(stdout, /All matched files use Prettier code style/);
});

test.run();
