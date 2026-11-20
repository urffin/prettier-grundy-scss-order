# Real-corpus sorting profile

The profiling commands use the pinned whole-file corpus. They create temporary source snapshots and never edit production modules or change the sorting API. Reports and CPU profiles belong outside the repository. All files of a project are processed separately; times cover the entire project batch.

Full-format phase clocks follow the current direct parse/serialize path and measure Processor fallback for maps without parsing twice. Recorded findings below retain their original baseline commit; they are not measurements of the new default integration.

```sh
npm run profile:real -- --output /external/profile
npm run profile:real -- --stage counts --project grundyjs.ru --output /external/counts
npm run profile:real -- --stage timing --measurement sort --output /external/timing
npm run profile:real -- --stage cpu --safety strict --output /external/cpu
node scripts/profile-real-summary.mjs /external/profile/profile.json
```

Implementation modules live together in `scripts/profile/`: `runner.mjs`, `worker.mjs`, `instrument.mjs`, `runtime.mjs` and `summary.mjs`. The five existing `scripts/profile-real-*.mjs` paths remain compatibility entry points or named re-exports. The npm command and summary CLI above are unchanged; importing the legacy summary module still exposes `summarizeCounts`, `summarizeCPU` and `summarize` without running the CLI. `node scripts/profile/summary.mjs` also accepts the same report arguments.

Report schema version 1, top-level fields, worker records and the `summary.json` format are unchanged. CPU files retain their `<project>-sort.cpuprofile` / `<project>-format.cpuprofile` names and native Node inspector JSON format. Sample values, temporary snapshot paths and internal tool frame URLs can vary; CPU stacks now point to the grouped implementation where appropriate.

`profilerSources` remains a path-to-SHA-256 map. Its original four path keys are retained and now hash the compatibility entry points; new entries hash all five implementations, the summary entry point, `corpus.mjs` and `benchmark-statistics.mjs` (twelve entries total). Hash values reflect the actual files at capture time. `runtimeSources` and `runtime-source/src` continue to describe the production sources, and snapshots copy the complete `runtime.mjs` into `src/__profile.mjs`. Reproduce a report with its matching Git revision and recorded tool/dependency versions; older reports keep their original hash map.

Use `npm.cmd` in PowerShell if its shim consumes `--`. Defaults: both modes, sort/format, two fresh processes, three warmups/nine samples; CPU sampling is strict only, 200 sort repetitions/12 format repetitions. `--processes`, `--warmup`, `--samples`, `--cpu-sort-repetitions` and `--cpu-format-repetitions` control the run. Stages run sequentially. Do not run CPU-heavy checks alongside measurement workers.

## Method

Three separate lanes keep structural counts distinct from performance evidence:

- **Counts:** a guarded source snapshot records real predicate calls, pair visits, actual stored property/additional edges, graph paths, segment sizes, queue activity, crossing-cache calls/misses and group work. Per-file pair sets measure repeated work; they are not added to production. Null pairs are reported separately. Dense covered-pair visits are distinct from predicates skipped by transitive reachability.
- **Phase clocks:** Babel from the installed Prettier locates function bodies; guarded edits add nested wall clocks. Exclusive times subtract child intervals, including recursive containers. Categories cover configuration, units, keys, boundaries/traversal, crossings, graph preparation/build, selection and write-back. Full formatting also measures PostCSS parse/serialize, the final Prettier parser call and plugin integration. The remainder includes Prettier framework/printing and observer overhead, not printing alone.
- **Stock CPU sampling:** a same-process Node inspector session samples the unchanged snapshot, without opening a debugger port. Sort preparation remains in the raw profile and is separated by stack context; sort phase timing excludes preparation. Full profiles include the whole format call. GC has its own unassigned bucket: it cannot be attributed to the sorter just because it occurs between sorts. The Prettier PostCSS plugin contains both parser and printer code, so filename-only CPU attribution names their combined plugin; the explicit parser clock is separate.

Raw wall-clock phase data includes observer costs and possible GC pauses. Wrappers also change JIT shape and allocation behavior. The report compares instrumented and stock medians, but that ratio is not a correction factor. Use phase clocks for approximate breakdown and confirm hotspots with stock sampling. Medians of phases need not sum to the median total. CPU `timeDeltas` are sampled interval weights, not precise operation timers or allocation counts.

Protocol references: [Node inspector CPU profiling](https://nodejs.org/docs/latest-v22.x/api/inspector.html#cpu-profiler), [Profiler samples and microsecond intervals](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/).

The parent checks byte-identical input/output hashes between counted, timed and original snapshots. Each process has its own PID/time origin; no process loads two code versions. JSON retains raw samples, phase records, source/tool hashes, source revisions, corpus digests and CPU paths. A copy of production sources accompanies the profile for source-line lookup after temporary executable snapshots are removed. Source anchors fail visibly if the implementation changes.

## Findings on 2026-11-14

Production baseline: 0.4.6, commit `dad2aa8`. Corpus: 152 files/411891 bytes, four project digests recorded in the report. Local environment: Windows x64, Node 22.17.0, Prettier 3.8.1, PostCSS 8.5.8/postcss-scss 4.0.9, AMD FX-8350. These local times are not directly comparable with GitHub's Linux/EPYC measurements.

The recorded phase study uses two processes × five warmups/eleven samples for each project/mode/operation/snapshot. Counts run once per project/mode; stock CPU profiles use 200 sort or 12 format repetitions. That is 80 separate worker processes, 704 timed samples and eight CPU profiles.

| Project              | Nontrivial graphs | Graph predicate calls | Crossing checker calls (cache misses) | Property edges | Crossing edges | Graphs without edges |
| -------------------- | ----------------: | --------------------: | ------------------------------------: | -------------: | -------------: | -------------------: |
| eywa-neo2            |               351 |                  3863 |                             381 (356) |             10 |             30 |                  333 |
| falcon-frontend-main |               871 |                 16211 |                           5776 (1900) |             91 |            379 |                  657 |
| grundyjs.ru          |               895 |                 10503 |                                 5 (5) |             38 |              0 |                  857 |
| landos-new           |               783 |                  6774 |                          15900 (2777) |             89 |           1133 |                  683 |

Of 2900 nontrivial graphs, 2882 use the short direct path and 18 the index. **Dense fallback: zero calls and zero reachability buffers.** Queue selection uses a heap in only 65 graphs. There are 2530 graphs without edges (87.2%), yet a post-build shortcut is not free: graph construction has already happened, and most remaining selections are tiny.

Actual `namesConflict` invocations: 42389, including 12362 null pairs. This is 37351 graph predicates plus 5038 crossing-cache misses. The existing crossing cache serves 22062 requests, with 17024 hits. Do not count those hits as new predicate work. Actual stored edges: 228 property edges plus 1542 crossing edges. The unordered-pair count, summed separately per file, is 14435 against 30027 non-null predicate invocations; it suggests memoization opportunities but is not a performance guarantee.

Approximate exclusive phase medians for strict sort from the instrumented snapshot, milliseconds per whole project batch:

| Project              | Units | Keys | Nested crossings | Graph preparation | Graph build | Selection | Traversal/boundaries | Write-back |
| -------------------- | ----: | ---: | ---------------: | ----------------: | ----------: | --------: | -------------------: | ---------: |
| eywa-neo2            |  0.60 | 1.75 |             1.54 |              1.26 |        2.90 |      0.80 |                 3.16 |       0.41 |
| falcon-frontend-main |  1.00 | 4.12 |             5.40 |              2.57 |        7.39 |      1.96 |                 5.91 |       0.92 |
| grundyjs.ru          |  0.91 | 3.90 |             0.88 |              2.18 |        5.14 |      1.60 |                 5.32 |       0.68 |
| landos-new           |  0.72 | 2.42 |             9.35 |              2.30 |        3.75 |      1.51 |                 4.17 |       0.62 |

Configuration adds about 0.38–0.69 ms. Instrumented sort medians are approximately 9–28% above stock; full-format calibration ranges from about 12% below stock to 2% above it, exposing JIT/process variability. Therefore these clocks do not establish exact stock costs or speedups.

Stock CPU sampling corroborates the useful priorities. Graph predicate/index work occupies roughly 17–28% of attributed sorter intervals; key preparation about 8–18%; nested crossings about 4–42%, highest in landos-new. Heap-specific work is below 2%. In full-format profiles, sorter frames occupy about 3–5% of sampled intervals, while the Prettier PostCSS plugin accounts for about 66–74%. The explicit Prettier parser clock alone has medians of approximately 146/384/383/269 ms for eywa/falcon/grundyjs/landos. That final parse and framework/printing dominate the complete pipeline.

### Files for a focused follow-up

File-level counters identify useful inputs for the next experiment; these counts are not per-file CPU timings:

- `landos-new/client/src/ui/TelSelector/styles.scss`: 10916 crossing-checker requests, only 371 cache misses. Repeated cached requests still require candidate traversal and cache lookups. This makes filtering crossing candidates before the inner property loop a stronger follow-up than adding another global pair cache.
- `falcon-frontend-main/src/components/App/components/dashboard/modalDashboard/modalDashboard.module.scss`: 4027 actual predicates including crossing-cache misses. Its 28-unit segment contains no direct declarations, yet makes 378 null-pair checks. Bypassing these checks is logically attractive, but the tested whole-graph shortcut did not show a universal speedup.
- `grundyjs.ru/components/site/Site.module.css`: 1392 actual predicates, the largest per-file predicate count in this project. The tree-cache experiment regresses this project despite potential pair reuse elsewhere.

Candidate filtering must preserve wildcard/opaque, custom, shorthand/longhand and logical-property conflicts, plus dependencies through nested rules and at-rules. It has not been implemented or measured in this study.

## Archived optimization study

The five optimization prototypes are retired from the current checkout. Reproduce them on the published study commit `6d1749993526e09f055899059530f522109daa9e`, which retains the runner, patches, profiler, lockfile and pinned corpus together. Its production sources and lockfile are byte-identical to the recorded `dad2aa8` baseline. Run from a separate checkout, without applying historical patches to the current runtime:

```sh
git worktree add --detach ../scss-order-profile-study 6d1749993526e09f055899059530f522109daa9e
cd ../scss-order-profile-study
npm ci --ignore-scripts --no-audit --no-fund
```

Then use the original commands in that frozen checkout:

```sh
node scripts/profile-real-variants.mjs --output /external/variants
node scripts/profile-real-variants.mjs --variants stock,single-node-emissions,tree-cache-1024 --measurement all --processes 4 --warmup 5 --samples 9 --output /external/final-variants
```

These historical source transformations are experimental, not public sorting settings:

- `edge-free-sort`: after construction, graphs with no incoming edges use native stable sorting.
- `no-pair-graph`: avoid graph construction when fewer than two declarations and no additional edges exist.
- `index-16`: lower the direct-pair cutoff from 32 to 16.
- `tree-cache-1024`: memoize symmetric raw-name pairs up to 1024 entries per root. This adds bounded Maps; its memory cost has not been benchmarked here. A production implementation would need explicit ownership/lifetime review.
- `single-node-emissions`: reuse the emitted-property summary when a unit contains only its main node; attached-comment/multiple-node units retain the existing `flatMap` path.

The frozen harness rotates the starting variant every two rounds and reverses alternating rounds, so a two-variant comparison does not accidentally always run stock first. The initial three-round/five-variant sort exploration is exploratory evidence only; differences changed sign in several process rounds. Every comparison checks original output hashes. Historical differential tests exercise ties, opaque/custom/logical/shorthand properties, extra edges, comments and all presets/modes for the emission shortcut. Reproduction checks the method and output equality; a different machine or Node version is not expected to reproduce the timings below exactly. Keep the generated `variants.json`, source/variant hashes and runtime metadata with new observations.

Current regression coverage lives in `tests/dense-conflicts.test.mjs` (the same 72 seeded graphs, checked against a full-graph/linear-selection reference) and `tests/sorting-units.test.mjs` (the same five SCSS inputs across five presets, both modes, root and group-spacing settings: 200 cases). The latter uses fixed raw outputs captured from published commit `402f156e25f5fec03d840908ab57507285768f78` in `tests/fixtures/sorting-units.json`, checks the public formatter against those outputs printed by plain Prettier, and checks public formatting idempotence. Expected sorting is not generated by a second implementation during the test. The active profiler tests remain in `tests/profile-real.test.mjs`, including the original counters/phase/fallback cases plus compatibility imports and an end-to-end CLI check of reports, tool hashes, CPU files, alternating rounds and snapshot cleanup. The migrated assertions call production sorting directly without generating or comparing optimization variants. The current `profile:real` commands at the top of this document remain supported.

Dense fallback and the heap are low-priority targets for this corpus. Predicate reuse, nested crossing work and group preparation are better candidates, but reducing work counters alone does not establish an end-to-end gain. The final comparison report records medians, quartiles and per-process differences; choose production changes only after assessing regressions and the full-format effect. This profiling task introduces no production optimization, new safety restriction or change to the warning-only function-effect decision.

Final comparison: four fresh processes per project/variant/operation, five warmups and nine measured samples per process. Negative percentages mean faster than the stock snapshot; each cell is **sort / full format**. These are pooled median differences, not confidence bounds.

| Project              | Single-node emitted-property summary | Bounded tree pair cache |
| -------------------- | -----------------------------------: | ----------------------: |
| eywa-neo2            |                        −6.6% / −7.0% |           −4.4% / −2.4% |
| falcon-frontend-main |                       +12.2% / +7.8% |          −10.7% / −2.1% |
| grundyjs.ru          |                        −2.4% / −1.0% |          +16.9% / +1.3% |
| landos-new           |                        −9.7% / +1.4% |           −7.2% / +1.3% |

The cache's falcon sort improvement and grundyjs sort regression retain their signs in all four process rounds. The single-node shortcut regresses falcon sort in all four rounds. Full-format differences often change sign between rounds and have overlapping interquartile ranges; the landos sort improvement does not establish a format improvement. The initial edge-free/no-pair/cutoff exploration also changes sign across projects/rounds. None is justified as a general production optimization from this study.

Recommendation: retain the current implementation. If pursuing another optimization, investigate short-path predicate costs, default group matching or nested crossing candidate filtering with focused regression cases and a new full-format comparison. For a larger end-to-end improvement, study the parser/printing pipeline separately; these measurements do not establish that replacing a parser will help. Keep the dense fallback and priority queue unchanged on this evidence.

## Nested crossing candidate reuse on 2026-11-15

The initial study above describes the unchanged `dad2aa8` implementation. This follow-up implements one focused optimization: in strict segments of at least 32 units, each emitted property name is resolved once to the external declaration positions with which it actually conflicts. Repeated nested blocks reuse those candidates, including empty matches. A per-block union prevents duplicate edges, stops once all declarations are covered and emits dependencies in the previous position order. The cache belongs to one segment and is discarded when its crossings are finished. Short segments retain direct discovery; loose does not call this path. CSS conflict policy and public configuration are unchanged.

Counts on the pinned real corpus: landos-new crossing-checker requests fall from 15900 to 5054 (−68.2%), and `TelSelector/styles.scss` from 10916 to 449 (−95.9%). Other project request counts are unchanged. All 1542 crossing edges and all property-graph edges are identical per file/segment. The optimization removes repeated traversal/cache lookups rather than establishing fewer unique conflicts: crossing-cache misses increase from 2777 to 2837 in landos, because preparing a reusable match list sometimes checks positions the old per-declaration `some` would skip. This tradeoff is included in the stock measurements below.

Full standard benchmark: 11 scenarios, strict/loose, sort/full format, two fresh timing processes per version/mode/operation with three warmups and nine samples each; three fresh memory processes per version/mode/operation/scenario. Baseline is `dad2aa8`, current is the local source snapshot, both use the same dependencies. There are 280 workers, 1584 timing samples and 264 memory samples. Version order reverses in the second round. Measurements are sequential and run after correctness checks. An earlier incomplete run crossed a computer suspension and timed out; it is excluded entirely.

Pooled medians in milliseconds per scenario (whole-file batch for real projects). Negative percentages mean lower time. Loose columns are sort / full format differences; they are controls, not an intended optimization.

| Scenario         | Strict sort, before → after | Strict full format, before → after | Loose changes, sort / format |
| ---------------- | --------------------------: | ---------------------------------: | ---------------------------: |
| independent-100  |       1.862 → 1.750 (-6.0%) |            19.607 → 19.095 (-2.6%) |                +9.1% / -2.4% |
| independent-1000 |       7.790 → 8.396 (+7.8%) |            79.908 → 83.426 (+4.4%) |               +22.2% / +3.0% |
| conflicts-500    |      4.417 → 3.910 (-11.5%) |            42.377 → 43.188 (+1.9%) |                +0.4% / +1.4% |
| nested-media     |      7.247 → 5.991 (-17.3%) |            53.645 → 51.449 (-4.1%) |               +31.7% / -1.6% |
| deep-35          |      0.125 → 0.157 (+25.3%) |              6.671 → 6.441 (-3.5%) |              -43.3% / +20.8% |
| comments         |      4.949 → 4.340 (-12.3%) |            69.374 → 66.808 (-3.7%) |               -15.4% / +6.6% |
| if-else-comments |       0.778 → 0.814 (+4.6%) |            16.341 → 17.570 (+7.5%) |               +15.7% / +2.3% |
| real-grundyjs    |     20.323 → 20.269 (-0.3%) |          637.174 → 661.875 (+3.9%) |                -4.4% / +5.8% |
| real-landos      |     24.716 → 22.991 (-7.0%) |          405.758 → 421.255 (+3.8%) |                -4.1% / -1.4% |
| real-falcon      |     33.938 → 30.631 (-9.7%) |          667.741 → 650.517 (-2.6%) |                -6.2% / +0.2% |
| real-eywa        |     9.953 → 11.185 (+12.4%) |         278.183 → 315.471 (+13.4%) |                -4.8% / -6.6% |

Memory below shows current minus baseline medians in KiB for strict sort. These are snapshots, not allocation counts or an isolated heap peak. maxRSS includes process startup, parsing/preparation and GC. Full-format memory and all loose records remain in the JSON.

| Scenario      | Heap after | Heap after GC | maxRSS |
| ------------- | ---------: | ------------: | -----: |
| nested-media  |    -3567.8 |           1.8 |  276.0 |
| real-grundyjs |      111.9 |           7.0 |  396.0 |
| real-landos   |       60.1 |           4.1 |  868.0 |
| real-falcon   |       97.2 |          12.4 |  516.0 |
| real-eywa     |      -83.8 |          27.5 |   92.0 |

Correctness: 270 unit tests, installed-package/type checks (20 packed files), 3040 corpus invariant/idempotence cases and 6080 exact before/after core comparisons over all files, five presets, both modes, root and spacing settings. New regressions compare with the frozen pre-optimization all-pairs crossing function, covering 32 property pairs in both directions, repeated names, broad/empty matches, custom/opaque/logical/vendor/alias properties, both sides of the 32-unit cutoff, comments/ignore/control boundaries and edited-tree reuse. Controlled wide repeated-block examples preserve compiled Sass CSS across all presets. Every timing and memory output hash agrees with baseline and with each other.

Raw evidence lives outside the repository in `nested-crossing-filter/`: `benchmark-full.json`, `comparison.json`, `verification.json`, `equivalence.json`, `corpus-results.json`, counted profiles and before/after runtime sources. The JSON retains quartiles and per-process samples; pooled percentages are not confidence bounds. Use per-round signs and overlapping ranges when interpreting small changes.

The targeted paths improve in the full run: strict sort is 17.3% lower for `nested-media` (both round medians about 21% lower) and 7.0% lower for landos (round medians 6.4% and 11.4% lower). Full-format changes are mixed: `nested-media` −4.1%, landos +3.8%, with changing signs between rounds. The falcon sort improvement is not attributed to candidate reuse: counted discovery work there is unchanged. Some pooled comparisons even have the opposite sign to both per-round medians, showing that process distributions differ enough to make small pooled percentages unreliable.

The full run's eywa strict-format increase of 13.4% prompted a separate control with only that project, both modes/operations, four fresh processes per version/mode/operation, five warmups and fifteen samples. Its 32 workers/480 samples all preserve output hashes. Strict format is 262.616 → 262.158 ms (−0.2%; round differences −1.2%, −1.4%, −1.6%, −0.5%), while strict sort is 11.933 → 12.054 ms (+1.0%, mixed signs). Interquartile ranges overlap. Loose controls are also variable: pooled sort +7.6% with round differences from −36.3% to +31.7%, full format +3.1% versus −6.6% in the complete run. The large eywa strict slowdown is not reproduced. See `eywa-control.json` and `eywa-control-summary.json` rather than treating the complete run as precise causal attribution.

Retain this focused optimization for repeated nested-block discovery, with no claim of a general full-format speedup. Strict-sort heap-after-GC differences on real projects are approximately +4–28 KiB. Full-format maxRSS differences span about −0.4 to +4.7 MiB on those projects; this process high-water mark is not the candidate cache's allocation size. Further tuning should require another full comparison and loose controls. Public options, conflict rules and the warning-only function-effects decision remain unchanged.
