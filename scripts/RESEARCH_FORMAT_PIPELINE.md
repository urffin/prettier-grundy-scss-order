# Public formatting comparisons and archived pipeline research

The current tool compares public `prettier.format()` paths: plain Prettier, public strict/loose, and the independent pre-direct Processor reference. It contains no experimental parser factory, mutation tracker, native-AST view or coarse pipeline clocks. Production code and public sorter options are unchanged. Results belong outside the repository.

## Current commands

```sh
npm run research:format-pipeline -- --output /external/format-pipeline
```

Use `npm.cmd` in PowerShell if its shim consumes `--`. Default `all` prepares common inputs, then measures `main` (plain Prettier/public strict/loose) and `direct` (Processor/public strict/loose). Separate stages remain available:

```sh
node scripts/research-format-pipeline.mjs --stage prepare-direct --output /external/format-pipeline
node scripts/research-format-pipeline.mjs --stage main --output /external/format-pipeline
node scripts/research-format-pipeline.mjs --stage direct --output /external/format-pipeline
```

`prepare` is an alias for `prepare-direct`; both now prepare only public comparisons. `variants` and `phases` give a clear error pointing to the frozen study below. They are no longer supported against current runtime sources. Use a fresh directory for each run and a new directory to repeat a measured stage; existing observations cannot be overwritten. `--project`, `--processes`, `--samples`, `--warmup` and `--memory-processes` retain their meanings. Do not run CPU-heavy checks alongside measurement workers.

The Processor reference lives in `scripts/processor-reference.mjs`, also used by corpus checks and direct integration tests. In the `direct` stage, historical label `stock` means Processor and `direct` means the public plugin. In `main`, `stock` means the public plugin; `plain` uses no sorter. Preparation generates Processor references and ready inputs, requires exact public-output equality in both modes across corpus/configuration fixtures and checks reference idempotence. A mismatch preserves diagnostics and fails preparation. Selector/function side-effect limitations are not proved away by output equality.

`main` measures original, strict-ready and loose-ready inputs with all three formatters, including cross-mode ready inputs. `direct` measures original and each mode's own ready input. Sources, corpus revisions/digests, input/output hashes, tools and dependency lock are recorded. Once workers exist, changing measurement sources/tools/parameters is rejected. Exactly five tools accompany the snapshot: parent, worker, Processor reference, corpus helper and statistics helper.

## Paired CI comparison

The manual [Direct formatting pipeline workflow](https://github.com/urffin/prettier-grundy-scss-order/actions/workflows/format-pipeline.yml) keeps its `prepare-direct`/`direct` commands and artifact names. One Ubuntu/Node 24 job runs the two implementations sequentially on the same runner. Five pinned batches (four projects plus the site's archived snapshot) × both modes × original/own-ready input × Processor/public are covered. Four timing processes per case use five warmups and eleven samples. Four separate cold and four warm memory processes per case retain the newly produced output; implementation order reverses each round. Total: 480 fresh workers, 1760 timing samples, 320 memory samples/960 snapshots. Tests and verification run outside measurement.

```sh
node scripts/research-format-pipeline.mjs --stage prepare-direct --output /external/direct --processes 4 --warmup 5 --samples 11 --memory-processes 4
node scripts/research-format-pipeline.mjs --stage direct --output /external/direct --processes 4 --warmup 5 --samples 11 --memory-processes 4
```

Both direct cohorts load the same small Processor reference module, without historical prototypes. Cold memory includes imports; warm timing excludes them. Cold baselines precede imports/first formatting, while warm baselines follow one untimed batch. GC precedes the baseline and follows the measured operation. Heap/RSS snapshots and process-wide maxRSS are not total allocations or formatter-only peaks. Earlier reports importing the entire research factory have a different cold import scope; cross-run differences must not be attributed only to formatting.

CI retains one `format-pipeline-results.json` in artifact `format-pipeline-results` for 14 days. The paired JSON structure/schema version 1 are preserved: manifest, preflight, workers, summary and comparisons. Preflight has only `counts.direct` and `eligible: ["direct"]`. Reserved `serialized`/`skipped` fields remain zero because production mutations are not observed. Timing workers retain an empty `phases` array for schema compatibility; no phase-clock study is performed. The exact five-tool hash list is required by the verifier.

The independent verifier recalculates statistics/deltas/comparisons, checks the alternating worker schedule, runtime, measured source/tool/lock hashes against the clean commit and rebuilds corpus references. Download the artifact, check its ZIP digest against GitHub metadata, then verify from the matching checkout:

```sh
node scripts/verify-format-pipeline-ci.mjs --input /external/format-pipeline-results.json --commit FULL_SHA --output /external/verification.json
```

Only a direct-only measurement directory is eligible for this CI packer/verifier; a combined `all` report also contains `main` observations. There are no performance thresholds. Examine quartiles and all process medians; small pooled differences are not a universal performance guarantee. The real files contain no map annotations, so map fallback is covered separately by regression tests.

## Regression coverage

Useful former prototype inputs now live in `tests/direct-integration.test.mjs`: ten inputs across five presets, strict/loose and independent root/group-spacing flags (400 combinations), exact Processor equality and public idempotence. Ready-input bypass/parse counts and malformed-input diagnostics remain checked on public paths. Tests of the removed tracker and phase-clock implementation are historical; they are not product contracts. `tests/format-pipeline-ci.test.mjs` retains independent statistics/evidence checks and covers plain/public workers and rejection of retired configurations.

## Archived prototype and phase study

Reproduce the original research on published commit `9e186a5bb5f6b4a2b882621d19a8d18396b45e75`, which retains the factory, runner, tests, source, lock and pinned corpus together:

```sh
git worktree add --detach ../scss-order-pipeline-study 9e186a5bb5f6b4a2b882621d19a8d18396b45e75
cd ../scss-order-pipeline-study
npm ci --ignore-scripts --no-audit --no-fund
npm run research:format-pipeline -- --output /external/pipeline-study
```

In that frozen checkout, original `prepare`, `main`, `variants` and `phases` commands remain available; `all` runs the original full study. `--project` and sample/process counts can limit a replay. Keep generated manifests, preflight/counterexamples, raw reports, sources/tools/lock hashes and runtime metadata with observations. Historical timing values need not repeat exactly on another machine or runtime. Old JSON reports must be interpreted/verified with their matching historical checkout.

The remaining sections document that pre-direct study, its rejected prototypes and calibration results. They do not describe current default integration or a supported purity/AST API. Current phase profiling remains available separately through `npm run profile:real`.

## Inputs and timing

The pinned corpus has 152 files (411891 original bytes) from four projects. Each file is formatted separately; one observation covers all files in one project. The growing live site is not refreshed for this study.

Each project has three common inputs: original text, text already formatted by stock `strict`, and text already formatted by stock `loose`. All three formatters receive exactly the same input in each lane. This separates formatting overhead from input layout and sort order. Cross-mode ready inputs are measured too; they are not assumed to stay unchanged. The manifest records changed-file counts and output equality with plain Prettier.

Default timing uses three fresh processes per case, three untimed warmups and seven timed batch calls per process, without forced GC. Module loading happens before timing. Formatter order rotates across rounds; each worker loads one implementation and processes one project/input/mode. Reports retain every sample, pooled median/quartiles and per-process medians. They are descriptive statistics, not confidence bounds.

The prototype comparison reruns stock alongside the prototypes in its own stage. It covers original inputs in both modes and each mode's own ready input. Compare with that stage's stock observations, rather than an earlier stage's stock timing. Implementation order rotates across three rounds. Total work can differ from plain Prettier because sorting deliberately changes output order.

## Memory

Memory uses separate sequential `--expose-gc` processes, three per case and regime. Timing workers do not supply memory results. Both regimes read and hash the dataset before their baseline:

- **Cold first use:** force GC before importing Prettier/plugin, then load the formatter and format one batch. This includes lazy parser loading and plugin/module initialization. Plain workers never import the sorter or research plugin.
- **Warm batch:** load the formatter and format one untimed batch, discard its result, force GC and take the baseline, then format one measured batch. Modules and existing framework caches are resident.

Both take `before`, `after` and `afterGC` snapshots. Two explicit GC calls precede the baseline and follow the measured operation; the new output remains reachable. Signed deltas are calculated within each process before aggregation. The timing `warmup`/`samples` metadata is not used by memory workers: cold has no formatting warmup, warm has one batch, and each measures one operation.

`heapUsed`, RSS, external and ArrayBuffer values are snapshots, not allocation counts or exact peaks. GC can reclaim older data, giving negative warm deltas. `maxRSS` is the whole-process high-water mark, including startup, imports and the warmup when present. It is not a peak attributable solely to formatting. Absolute values and signed deltas must be distinguished; differences between three small memory samples are not a general memory guarantee.

Cold prototype observations also include loading the research module, which contains the alternative parser implementations and imports the stock plugin. They are not a prediction of a future production bundle's footprint. Warm baselines already include that module.

## Intermediate transformations

The current plugin resolves configuration, parses SCSS through PostCSS, sorts its tree, serializes SCSS, then calls Prettier's SCSS parser. Prettier prints its own AST. Research variants assess which intermediate steps could be removed:

| Variant          | Change                                                                                        | Correctness gate                               |
| ---------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `direct`         | Call SCSS parse, sorter core and stringify directly, bypassing Processor orchestration        | Exact output versus stock                      |
| `skip-unchanged` | Direct path plus tracking final child order and whitespace mutations; reuse text if unchanged | Exact output; check raw changes and line tails |
| `raw-handoff`    | Give the PostCSS root directly to the Prettier printer                                        | Expected incompatible AST diagnostic           |
| `native-view`    | Parse through Prettier once, sort a PostCSS-like view and update native child order           | Exact output versus stock; reject differences  |
| `roundtrip`      | Parse/stringify without sorting, then use Prettier                                            | Diagnostic plain-output control only           |

Skipping serialization still parses SCSS, builds/sorts the tree and performs the final Prettier parse/print. It adds mutation tracking; it is not a cached result or a shortcut based on presumed sorted input. Final whitespace values matter because temporary changes can be reversed. BOM removal follows stock behavior.

Processor also removes or regenerates sourcemap annotations. Both direct variants fall back to Processor when a parsed source map or root `# sourceMappingURL=` comment is present. A naive parse/sort/stringify replacement fails that boundary. This is part of integration behavior, not just printing whitespace.

Prettier's [plugin contract](https://github.com/prettier/prettier/blob/main/docs/plugins.md) requires a parser AST suitable for its printer. Its [API documentation](https://github.com/prettier/prettier/blob/main/docs/api.md) also warns that AST mutations can invalidate source positions used for blank lines and comments. Removing the second parse therefore needs more than passing PostCSS nodes or updating a child array. See also the [PostCSS API](https://postcss.org/api/) for Processor, parsing and stringification.

## Coarse phases

An independent stage wraps the stock path with nested exclusive clocks: configuration, sorter construction, PostCSS parse, sorting, serialization, Processor orchestration, materialization and final Prettier parse. Plain uses a clock around its native parse. Each case has one fresh process, two warmups and three samples. The remainder includes Prettier framework, printing and observer effects; it is not a printer-only measurement.

Phase clocks change call shapes and add observer costs. Their whole-call medians are compared with uninstrumented stock for calibration, not used as a correction factor. Phase medians need not sum to the median total. The uninstrumented prototype comparison decides whether less intermediate work gives an observed full-call improvement.

## Findings (pre-direct baseline)

### Public pipeline on 2026-11-16

Baseline: 0.4.7, commit `735e83e`, default preset and API options (`parser: "scss"`, plus the selected mode/plugin). Local environment: Windows x64, AMD FX-8350, Node 22.17.0, Prettier 3.8.1, PostCSS 8.5.8 and postcss-scss 4.0.9. These absolute times must not be compared with Linux CI runner times.

Median milliseconds per project batch on original files:

| Project              | Files | Plain Prettier |  Loose | Strict |
| -------------------- | ----: | -------------: | -----: | -----: |
| eywa-neo2            |    44 |         236.70 | 263.53 | 276.73 |
| falcon-frontend-main |    36 |         563.20 | 603.95 | 613.66 |
| grundyjs.ru          |    53 |         532.18 | 645.50 | 616.89 |
| landos-new           |    19 |         395.26 | 403.36 | 433.47 |

Loose overhead versus plain is approximately 2–21%; strict overhead is 9–17%. Strict versus loose ranges from about 4% faster to 7% slower in pooled medians. Process rounds overlap and sometimes reverse direction: this does not establish that strict is faster for the site corpus.

Each ready-input comparison below uses the same text for plain and the named mode. Strict-ready and loose-ready are separate datasets:

| Project              | Plain on strict-ready | Strict on strict-ready | Plain on loose-ready | Loose on loose-ready |
| -------------------- | --------------------: | ---------------------: | -------------------: | -------------------: |
| eywa-neo2            |                236.59 |                 264.31 |               244.77 |               255.87 |
| falcon-frontend-main |                568.23 |                 615.99 |               631.59 |               614.88 |
| grundyjs.ru          |                542.39 |                 599.24 |               557.77 |               619.58 |
| landos-new           |                368.35 |                 425.51 |               365.59 |               395.28 |

Already formatted input does not eliminate plugin overhead. In particular, the negative loose overhead for falcon is not evidence of free sorting: plain's process medians on that lane are 549/783/637 ms, versus loose's 628/618/579 ms. Other lanes also show appreciable process variation; small differences need an additional paired run before implementation decisions.

Plain leaves all 152 files unchanged in both ready lanes; each mode leaves its own ready input unchanged. Loose changes 85 strict-ready files. Strict leaves all loose-ready files unchanged in this corpus, which does not prove that the earlier loose transformations were semantically safe or that strict can undo them. On original inputs, stock strict output equals plain in 14 files, loose in eight; comparison with plain usually includes deliberately different output order.

### Memory

Heap-used delta after explicit GC, in MiB, with new output retained. Cold includes importing and initializing the formatter; warm has resident modules and one prior batch:

| Project              | Cold plain | Cold loose | Cold strict | Warm plain | Warm loose | Warm strict |
| -------------------- | ---------: | ---------: | ----------: | ---------: | ---------: | ----------: |
| eywa-neo2            |       4.08 |       6.04 |        6.18 |       0.41 |       0.64 |        0.57 |
| falcon-frontend-main |       4.48 |       6.49 |        6.64 |       0.49 |       0.47 |        0.51 |
| grundyjs.ru          |       4.64 |       6.73 |        6.88 |       0.40 |       0.48 |        0.51 |
| landos-new           |       4.38 |       6.52 |        6.64 |       0.29 |       0.35 |        0.50 |

Cold retained heap is approximately 2 MiB higher with the plugin. Warm post-GC deltas are much closer; they do not measure allocation volume. On original input the project medians of process maxRSS range from 65–101 MiB plain, 70–102 MiB loose and 72–104 MiB strict for cold runs; warm ranges are 75–102, 80–106 and 79–106 MiB respectively. RSS and before-GC heap do not show a consistent strict/loose ordering. Ready-input snapshots and raw samples are included in JSON too.

On each mode's own ready input, cold post-GC heap deltas are 6.06–6.88 MiB with the plugin versus 4.08–4.64 MiB plain; warm deltas are 0.34–0.58 versus 0.30–0.48 MiB. These are ranges of project medians, not statistical intervals. Preparation alone does not remove the plugin's first-use footprint.

### Correctness gates

Both direct variants match stock byte for byte in 1592 cases each: 152 real files × three inputs × two modes, plus 17 regression/boundary inputs × five presets × two modes × both root settings × both group-spacing settings. The plain parse/stringify control matches all 456 real-file cases. Every stock corpus output is checked for idempotence during preparation.

Raw PostCSS handoff fails all three attempted printer calls with an incompatible node type. Native-view produces 482 differences out of 1592 cases and is excluded from performance comparison. One saved real counterexample is `eywa-neo2/src/components/content/common/common-content.module.scss`: blank lines around declarations, an include and comments differ after updating native child order without fixing position information. This example does not classify every other difference.

The unchanged-text tracker skips serialization for 152/152 files in each mode's own ready lane, versus only 14/152 strict and 8/152 loose original files. It still parses and sorts them. Mutation tracking can cost more than the serialization it removes on changed inputs; fewer transformations alone are not evidence of a faster formatter.

This matrix checks selected valid inputs and options; it is not a complete compatibility proof for every Prettier option, plugin combination, parse-error diagnostic or sourcemap arrangement. A production change would need those integration boundaries checked separately.

Additional inline-map controls cover complete and sparse mappings. With sparse mappings, even two stock calls differ in generated URL-encoded `<input css ID>` source names. After normalizing only those generated names, CSS, decoded mappings, source contents and other map fields match between stock repetitions and both Processor-fallback variants. These controls are separate from the byte-identical corpus matrix. They check preservation of stock behavior, not the accuracy of source locations after final Prettier printing.

### Where full-call time goes

Coarse exclusive phase medians on original inputs, strict mode, in milliseconds:

| Project              | Instrumented total | Prettier parse | PostCSS parse | Sorting | Serialize | Processor | Remainder |
| -------------------- | -----------------: | -------------: | ------------: | ------: | --------: | --------: | --------: |
| eywa-neo2            |             302.45 |         164.28 |         13.78 |   12.19 |      1.76 |      9.43 |     96.25 |
| falcon-frontend-main |             656.53 |         397.99 |         23.04 |   27.86 |      2.83 |     15.74 |    185.42 |
| grundyjs.ru          |             702.59 |         403.27 |         17.48 |   18.49 |      2.74 |     17.00 |    220.58 |
| landos-new           |             416.05 |         253.96 |         13.25 |   19.48 |      2.08 |      7.85 |    115.25 |

Configuration, construction and materialization are retained in JSON but omitted from this table. Sorting is approximately 2.6–4.7% of these totals; initial SCSS parsing is 2.5–4.6%, serialization 0.4–0.6%, and Processor orchestration 1.9–3.1%. Prettier's parse plus the framework/printing remainder dominate. This gives the scale of removable work, not a predicted speedup or an allocation profile.

Across all 36 instrumented cases, whole-call medians differ from the main-stage stock observations by −8.8% to +33.4%. This includes temporal variation between stages as well as instrumentation/JIT effects. The phase split is approximate; especially small claimed savings need uninstrumented confirmation. Phase medians do not necessarily sum to the median total.

### Uninstrumented prototype comparison

Changes versus the **new stock run in the variants stage**, pooled medians; negative means less time. Each cell compares byte-identical outputs on the same input:

| Project              | Input        | Mode   | Direct | Skip unchanged |
| -------------------- | ------------ | ------ | -----: | -------------: |
| eywa-neo2            | original     | loose  | −5.42% |         −4.76% |
| eywa-neo2            | original     | strict | +1.64% |         +2.62% |
| eywa-neo2            | strict-ready | strict | −2.32% |         −2.28% |
| eywa-neo2            | loose-ready  | loose  | +6.05% |         −2.25% |
| falcon-frontend-main | original     | loose  | −5.93% |         −3.44% |
| falcon-frontend-main | original     | strict | −9.66% |        −12.24% |
| falcon-frontend-main | strict-ready | strict | −4.98% |         −6.84% |
| falcon-frontend-main | loose-ready  | loose  | −5.23% |         −9.03% |
| grundyjs.ru          | original     | loose  | −6.45% |        −10.69% |
| grundyjs.ru          | original     | strict | −4.39% |         −6.81% |
| grundyjs.ru          | strict-ready | strict | −1.29% |         −2.04% |
| grundyjs.ru          | loose-ready  | loose  | −3.81% |         −5.81% |
| landos-new           | original     | loose  | −5.63% |         −6.75% |
| landos-new           | original     | strict | −3.22% |         +2.43% |
| landos-new           | strict-ready | strict | −5.65% |        −12.22% |
| landos-new           | loose-ready  | loose  | +0.88% |         +9.56% |

Both variants have lower pooled medians in 13/16 contexts, but only direct has all three round medians lower in 6/16 contexts; skip has that direction in 4/16. Direction alone is not statistical significance. There are substantial outliers: direct on original site/loose has round changes −2.0%, −7.6%, +101.1%, despite its lower pooled median. Nothing is discarded. The full per-process medians and quartiles are essential to interpreting this table; no universal speedup is established.

Warm absolute heap after GC is 0.06–0.12 MiB lower for direct, but its operation delta after GC ranges from about 0.03 MiB lower to 0.13 MiB higher. Its warm maxRSS changes range from −3.93 to +3.16 MiB. Skip's warm absolute heap changes range from −0.15 to +0.06 MiB, operation deltas from about −0.05 to +0.17 MiB, and maxRSS from −3.62 to +2.22 MiB. These small or mixed results do not establish a general memory reduction; cold prototype loading has the additional research-module caveat above.

### Decision and verification

Keep production unchanged. Direct integration is the smaller next candidate: it removes Processor orchestration while preserving the existing parser/sorter/stringifier contracts and needs a Processor fallback for mapping behavior. Before adopting it, repeat a paired uninstrumented comparison on one CI runner, including both modes, original/ready inputs, output equality and memory, and check integration/error boundaries. Do not combine it with mutation tracking in that first change. Tracking to skip serialization adds complexity for a measured phase below 1% and did not consistently win, even on ready input. A single native AST is deferred until position/comment handling has a compatible design.

The complete run has 792 fresh workers: 1764 uninstrumented timed samples, 108 phase samples, 504 memory samples/1512 snapshots and 288 summary rows. An independent audit recalculated medians/quartiles/deltas, checked complete case coverage, runtime/tool/source/lock hashes and worker identities, and rebuilt all 1368 stock corpus references after measurements. All measured worker outputs match stock. The three added tests cover exact-output/idempotence across presets and trivia, unchanged-text observations, phase identity and failed-parse clock balance; the full suite passes 273/273.

Evidence is stored in the external study directory `format-pipeline/final`: `manifest.json`, `preflight.json`, inputs, counterexamples, `report.json`, `summary.json`, `analysis.json`, `analysis.md`, `verification.json`, `boundary-verification.json`, executed tools and source snapshots. The parent directory also contains the independent auditor and analysis/boundary helpers. Timing, memory and phase workers run sequentially; validation/tests run afterwards.

This research does not change the shipped parser, sorting behavior or public API, and does not prove general Sass/CSS semantic equivalence. In particular, the documented limitation for stateful Sass functions remains.
