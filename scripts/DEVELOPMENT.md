# Development and benchmarks [Русский](DEVELOPMENT.ru.md)

Run these commands from the root of a cloned repository, rather than a project consuming the npm package. [Plugin documentation](../README.md).

## Supported matrix

The CI matrix covers current patch releases of Node.js 22, 24 and 26 with Prettier 3.8.1 (the minimum supported version) and the latest stable 3.x. All six combinations run on Linux; Node.js 24 with the latest Prettier 3.x also runs on Windows. The moving `3` selector stays within the supported peer dependency range and does not opt into Prettier 4 or prereleases.

Pushes and pull requests run runtime tests, `npm run test:types`, and `npm run test:package`. The package check installs the actual tarball in a temporary consumer project and verifies public exports, all presets, both safety modes, configuration, comments, idempotence and the installed declarations. Release publishing waits for the same reusable checks.

Run `npm ci`, `npm test`, `npm run test:types`, and `npm run test:package` locally. The package check needs registry access. Development checks use Sass and TypeScript as dev dependencies; neither is added to the published runtime dependencies.

The Node.js 24/Linux matrix also runs the [standalone browser smoke](BROWSER.md) with minimum/latest Prettier 3.x, comparing both modes and all presets against Node.js and saving separate JSON artifacts. esbuild and Playwright are development-only dependencies.

Four additional runtime-dependency jobs cover the full minimum/latest cross-product of PostCSS and postcss-scss with locked Prettier. Each installs a fresh plugin tarball, verifies the resolved dependency graph and runs the same Node/browser smoke, including both modes, comments, direct/fallback and maps. Artifacts record exact versions, selection and installation lockfile. See the [selectors and JSON evidence](BROWSER.md#runtime-dependency-matrix).

## Benchmark

`npm run benchmark` covers seven synthetic scenarios (independent/conflicting declarations, nested blocks, comments and if/else chains) and five real-file batches: `real-grundyjs`, `real-grundyjs-6f9645c`, `real-landos`, `real-falcon`, `real-eywa`. The pinned corpus contains 212 whole files, including the updated site snapshot (60 files: 58 CSS/two SCSS) and its unchanged archived baseline (53 files: 51 CSS/two SCSS). Each file is processed separately; measurements cover the entire project batch. Both `strict` and `loose` run by default. `sort` measures sorter construction and ordering on prepared ASTs, excluding parsing and serialization; `format` measures the complete `prettier.format` pipeline. Results for all files remain live through the final memory snapshot.

By default `--metric all` measures time and memory in separate sequential processes. Timing uses two processes per version/safety/measurement, with three warmups and nine samples per scenario in each process. Timing workers do not force GC. No worker loads two code versions. Process rounds alternate version order during comparisons. Reports contain medians, quartiles, raw samples, process IDs and time origins (`timeOriginMs`, to distinguish reused PIDs), runtime/package versions, Git revisions and output hashes. These measurements describe the measured machine and workload; a small difference is not a general speed or memory guarantee.

Memory uses three fresh processes per **version/safety/measurement/scenario**, one cold operation each, without warmups. Each worker runs with `--expose-gc`: two GC calls before the baseline snapshot and two after the operation. The result AST/string remains live through the final snapshot; hashing and AST serialization happen afterwards. For `sort`, the input AST is prepared before the baseline; `format` includes the entire formatting pipeline. Separate processes per scenario prevent an earlier scenario from contributing to `maxRSS`.

```sh
npm run benchmark -- --output benchmark-results.json
npm run benchmark -- --compare v0.4.7 --output benchmark-results.json
npm run benchmark -- --scenario comments --safety strict --measurement format
npm run benchmark -- --scenario real-grundyjs --output benchmark-results.json
npm run benchmark -- --metric memory --compare v0.4.7 --memory-processes 3 --output benchmark-results.json
npm run benchmark -- --metric time --scenario independent-1000
npm run benchmark -- --help
```

In Windows PowerShell, use `npm.cmd run benchmark -- ...` if the `npm.ps1` shim consumes the `--` separator. Direct invocation also works, for example `node scripts/benchmark.mjs --scenario comments` (no separator needed).

`--compare` takes a locally available Git commit or tag (fetch it first if needed). It snapshots runtime sources into a temporary directory and uses the current checkout's installed dependencies and Node.js for both versions. This compares code, not historical dependency trees; no historical install scripts run and the checkout is untouched. Comparisons require safety-mode support (0.3.0 or later). Output differences appear as `outputMatches: false` and do not invalidate the measurements. Negative `changePercent` means the current checkout is faster. `--warmup`, `--samples`, and `--processes` control time measurements; `--memory-processes` controls independent memory samples. Very short runs are useful for checking the harness, not drawing performance conclusions.

JSON **schema version 2** keeps timing data in `rows`/`workers` and adds `memoryRows`/`memoryWorkers` (the unselected metric has empty arrays). Memory rows contain `before`, `after`, `afterGC`, `deltaAfter` and `deltaAfterGC`, with `medianBytes`, quartiles and `samplesBytes` for each field; raw snapshots stay in the workers. Deltas are computed within each process before aggregation and may be negative. Version comparisons add `changeBytes` (current minus baseline median) for heap after, heap after GC and maxRSS. Input/output hashes must agree between time and memory for the same version; differences between code versions remain informational.

Memory fields are `rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers` and `maxRSS`, all in **bytes**. `arrayBuffers` is already included in `external`; do not add them together. Node's `maxRSS` is converted from KiB to bytes and records the process high-water mark through the final snapshot, including startup, imports, input preparation and GC. These snapshots are not allocation counts or exact heap peaks, and maxRSS is not an operation-only peak. See the [Node.js memory APIs](https://nodejs.org/docs/latest-v22.x/api/process.html#processmemoryusage) and [resource usage](https://nodejs.org/docs/latest-v22.x/api/process.html#processresourceusage).

JSON `inputs` identifies synthetic/real scenarios, file counts, bytes and input hashes. Real batches also record the source commit, corpus digest and individual file hashes; hashes include file boundaries. Compare performance only with the same inputs. The default 12 scenarios produce 48 timing and 48 memory rows per comparison, with statistics for each selected version.

CI compares the current revision with pinned commit `dad2aa8dd42553c15dd7c021043a04d214f1ad37` on the same runner, using the same dependencies. Both versions run in separate sequential processes, with their order reversed in the second round. It measures both modes, sort/full format and time/memory, writes comparison tables (memory displayed in MiB) and uploads the combined `benchmark-results.json` for 14 days. Each row includes `current`/`baseline` statistics, output equality and percentage/byte differences. Values have no pass/fail thresholds; execution errors still fail the job. The report, corpus and benchmark scripts are excluded from the npm package.

`npm test` includes 18 SCSS regression fixtures across all presets and modes. `npm run test:corpus -- --output corpus-results.json` verifies snapshot hashes, idempotence, comments, AST inventory and byte-identical output against the Processor reference on all real files (4240 cases, including the preserved archive); CI saves its separate report. It does not compile standalone application files or prove general CSS equivalence. Update evolving site inputs explicitly with `npm run corpus:update -- --project grundyjs.ru --root /path/to/grundyjs.ru --check`, then remove `--check` to refresh from committed Git styles. Working-tree edits never enter the snapshot. See [corpus provenance, regression guarantees and refresh workflow](../tests/fixtures/corpus/README.md).

For opt-in phase timings, pair/edge counters and stock CPU profiles on the pinned real corpus, run `npm run profile:real -- --output /external/directory`. See the [profiling method and findings](./PROFILE_REAL.md); instrumentation is confined to temporary source snapshots. Implementation lives in `scripts/profile/`; the existing CLI/import paths and report formats remain supported, and tool hashes cover both entry points and implementations.

To compare plain Prettier, public `loose`/`strict` and the Processor reference on original and already formatted corpus files, run `npm run research:format-pipeline -- --output /external/directory`. The [pipeline comparison guide](./RESEARCH_FORMAT_PIPELINE.md) describes warmed timings, separate cold/warm memory observations and the frozen checkout for historical transformation/phase experiments. Those prototypes are no longer maintained against current runtime sources.

The Prettier plugin calls SCSS parse, sorting and serialization directly before using Prettier's parser and printer. It retains Processor for parsed source maps and root `sourceMappingURL` annotations. Both sorting modes use this internal path; no additional option is required. The PostCSS plugin entry point is unchanged.

## Official Sass parser readiness

Run `npm run research:sass-parser -- --version 0.5.3 --output /external/directory/sass-parser-results.json` to reproduce the minimal migration blockers with an isolated exact-version candidate. See the [readiness method, JSON and exit codes](SASS_PARSER_READINESS.md). A completed report can be blocked; passing the minimal fixtures does not approve production migration.

The separate Sass parser readiness Actions workflow supports a manual exact version and a Monday weekly npm-latest check. It uploads a JSON report even for setup/probe errors, distinguishes green `blocked` research from red execution failures, and does not run on push/PR.
