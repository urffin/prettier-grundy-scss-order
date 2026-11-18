// Stable CLI and programmatic entry point; browser tooling lives in one directory.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./browser/runner.mjs";

export { main, parseBrowserArgs, prepareBrowserSmoke, serveBrowserSmoke } from "./browser/runner.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
