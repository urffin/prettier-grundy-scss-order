// Stable CLI and imports; summary implementation lives in scripts/profile/.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./profile/summary.mjs";

export { summarizeCounts, summarizeCPU, summarize } from "./profile/summary.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
