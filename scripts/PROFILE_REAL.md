# Real-corpus sorting profile

The profiling commands use the pinned whole-file corpus. They create temporary source snapshots and never edit production modules or change the sorting API. Reports and CPU profiles belong outside the repository. All files of a project are processed separately; times cover the entire project batch.

```sh
npm run profile:real -- --output /external/profile
npm run profile:real -- --stage counts --project grundyjs.ru --output /external/counts
npm run profile:real -- --stage timing --measurement sort --output /external/timing
npm run profile:real -- --stage cpu --safety strict --output /external/cpu
node scripts/profile-real-summary.mjs /external/profile/profile.json
```

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

## Research optimization snapshots

```sh
node scripts/profile-real-variants.mjs --output /external/variants
node scripts/profile-real-variants.mjs --variants stock,single-node-emissions,tree-cache-1024 --measurement all --processes 4 --warmup 5 --samples 9 --output /external/final-variants
```

These are optional source transformations for an experiment, not public sorting settings:

- `edge-free-sort`: after construction, graphs with no incoming edges use native stable sorting.
- `no-pair-graph`: avoid graph construction when fewer than two declarations and no additional edges exist.
- `index-16`: lower the direct-pair cutoff from 32 to 16.
- `tree-cache-1024`: memoize symmetric raw-name pairs up to 1024 entries per root. This adds bounded Maps; its memory cost has not been benchmarked here. A production implementation would need explicit ownership/lifetime review.
- `single-node-emissions`: reuse the emitted-property summary when a unit contains only its main node; attached-comment/multiple-node units retain the existing `flatMap` path.

The final harness rotates the starting variant every two rounds and reverses alternating rounds, so a two-variant comparison does not accidentally always run stock first. The initial three-round/five-variant sort exploration is exploratory evidence only; differences changed sign in several process rounds. Every comparison checks original output hashes. Differential tests exercise ties, opaque/custom/logical/shorthand properties, extra edges, comments and all presets/modes for the emission shortcut.

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
