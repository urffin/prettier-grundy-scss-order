# Changelog

## Unreleased

- Group browser smoke tooling under `scripts/browser/`, retaining `scripts/test-browser.mjs` as the CLI/programmatic entry point. Preserve commands, report schemas, evidence paths and CI artifact names.

- Classify five Sass parser migration blockers against upstream work: distinguish syntax/comment-loss candidates from ignore/trivia adapter requirements. Add a standalone reproduction collector and three unpublished issue drafts. Keep the production parser and readiness gate unchanged.

- Add a blocking CI matrix for all minimum/latest combinations of supported PostCSS and postcss-scss, using fresh tarball consumers and the existing Node/standalone browser smoke. Verify both modes, comments/ignore, direct/fallback and map policy; record exact versions, dependency selection, integrity and installation lockfiles in JSON artifacts. Add offline regression tests. Runtime code, dependency ranges, repository lockfile and defaults are unchanged.

- Add a separate manual/weekly Sass parser readiness workflow with exact-version selection, npm-latest polling on Mondays, downloadable JSON and job summaries. Measured blockers remain informational; setup/execution errors fail the job. Bootstrap evidence is prepared before dependency installation. Add offline workflow regression tests; production parsing and dependencies remain unchanged.

- Add an opt-in exact-version `sass-parser` readiness probe with isolated installation/worker, six minimal fixtures, JSON evidence and offline regression tests. Distinguish measured blockers from infrastructure failures and reserve migration approval for a later full-corpus/adapter/browser investigation. Production parsing and dependencies are unchanged.

- Add a browser smoke check against Node.js using Prettier standalone, all presets and both safety modes. Verify comment/ignore fixtures, idempotence, direct/Processor fallback calls and configuration diagnostics. CI tests the minimum and latest Prettier 3.x on Chromium and uploads JSON reports. Build tooling is development-only; runtime code and defaults are unchanged.
- Document the browser's PostCSS source-map policy: maps are not decoded or regenerated under its browser remaps. Annotation retention follows the installed Processor version; matching sorted CSS does not establish source-map accuracy.

## 0.4.8 — 2026-11-16

The Prettier plugin now parses SCSS, invokes the existing sorter and serializes directly, bypassing PostCSS Processor orchestration for ordinary files. It still uses `postcss-scss` and then Prettier's native parser/printer; this is not a parser migration. Processor remains the fallback for parsed source maps and root `sourceMappingURL` annotations, using the already parsed tree and preserving the installed PostCSS version's map policy. Configuration validation still precedes parsing.

No migration or new option is required. Sorting rules, public API, types, dependencies and configuration defaults are unchanged: `strict` remains the default, `loose` stays explicit, and `conservative` / `structural` remain aliases. The documented limitation for stateful Sass functions remains.

- Add integration regressions for map handling and diagnostics, BOM/line endings, comments/ignore, explicit Prettier options, pragmas, ranges/cursor formatting and parser wrappers. Keep map expectations compatible with supported PostCSS versions.

- Require byte-identical output against the retained Processor reference in all 3040 real-corpus cases. Independent checks also matched the prior implementation on original and ready inputs. Corpus invariants and output identity do not prove general Sass/CSS semantic equivalence.

- Add an opt-in full-pipeline study and a manual same-runner CI comparison of the public direct path with the explicit Processor reference: both modes, original/own-ready inputs, alternating process order, separate cold/warm memory workers and a verified downloadable JSON report. Update profiling clocks for the direct path. Research tools and fixtures are excluded from the npm package.

In the [paired reference CI run](https://github.com/urffin/prettier-grundy-scss-order/actions/runs/43844171313), warmed full-format pooled medians were 0.26–6.62% lower for direct across all 16 project/input/mode contexts; all four process medians were lower in eight contexts. The study used 152 pinned files from four projects, four timing processes per case, five warmups and eleven samples per process on Node 24.22.2 / Prettier 3.8.1 / PostCSS 8.5.8. These are workload-specific descriptive results, not confidence bounds or a promise that every SCSS input is faster. Module loading is excluded from timing. Runtime and measurement sources are identical to the implementation prepared for this release; absolute timings from other runners or the earlier prototype study are not directly comparable. The regular benchmark's `dad2aa8` baseline includes other changes and does not isolate direct alone.

Memory uses four fresh processes per cold/warm case. Warm absolute heap after GC was 0.036–0.182 MiB lower, but the operation delta after GC ranged from 0.018 MiB lower to 0.025 MiB higher, and process maxRSS changed in both directions. Snapshots depend on GC, do not count all allocations or exact peaks, and retain formatted output; maxRSS includes startup, imports and warmup. Both comparison cohorts load the research module, so these footprints are not a prediction of an installed consumer's memory use. No general memory reduction is claimed. See the [full pipeline method and findings](scripts/RESEARCH_FORMAT_PIPELINE.md).

## 0.4.7 — 2026-11-16

Strict mode reuses conflicting declaration positions for property names repeated across nested blocks in segments of at least 32 units. The conflict predicate, resulting sort order, short-segment path and loose behavior are preserved. No configuration changes or migration steps are required: `strict` remains the default, `loose` remains explicit, and `conservative` / `structural` remain aliases.

- Add regression tests for repeated nested blocks, property conflicts and independent properties, comments, execution boundaries, threshold sizes and edited-tree reuse.

- Add 15 SCSS regression fixtures and a pinned 152-file CSS/SCSS corpus from four projects. Check corpus hashes, idempotence, comments and AST inventory in CI; provide an explicit refresh command for evolving committed site styles.

- Extend the benchmark with real-file batches and cold-process memory snapshots for both modes and sort/full format. JSON schema 2 retains raw samples, heap/RSS statistics, per-process memory deltas and output hashes. CI compares both versions with pinned baseline `dad2aa8` on one runner, using the same dependencies and separate sequential processes with reversed version order in the second round.

- Add opt-in real-corpus profiling with separate counters, exclusive phase clocks and unchanged-source CPU sampling, plus research-only optimization snapshots and output-equivalence checks. Research scripts, fixtures and reports are excluded from the npm package.

- Add reproducible Sass function side-effect research and a RU/EN warning: even `strict` can change CSS values or compilation behavior when movable statements evaluate stateful Sass functions. Document existing assignments/mixins and ignoring the enclosing rule as manual workarounds; no new API or automatic restriction is introduced.

Performance evidence is workload-specific. In the paired [reference CI run](https://github.com/urffin/prettier-grundy-scss-order/actions/runs/43746215145), strict landos sorting improved from 12.011 to 11.051 ms (about 8%); full formatting improved by 1.9%. For `nested-media`, sorting was effectively unchanged (+0.1%, with opposite signs between process rounds), while full formatting improved by 7.4%. No general speedup across the real corpus is claimed, and the earlier local nested-sort improvement was not reproduced in that CI run. Both versions produced identical output hashes in all 44 comparison pairs.

These are pooled medians from two timing processes per version/mode/operation, with three warmups and nine samples each; they are not confidence bounds. Memory uses three fresh cold processes per case. Landos strict-sort heap after GC was about 0.20 MiB lower, while other real strict-sort cases changed by less than 0.01 MiB. Heap snapshots depend on GC timing and do not measure all allocations or exact peaks; maxRSS includes process startup, input preparation and GC. No general reduction in memory consumption is claimed. See the [profiling method and findings](scripts/PROFILE_REAL.md) for scope and limitations.

## 0.4.6 — 2026-11-14

- In strict mode, skip conflict checks and redundant edges already implied by dependency paths inside the dense fallback. Keep the short and sparse paths, with bounded temporary ancestor storage and the direct fallback for unusually wide segments. Sorting behavior, configuration and loose mode are unchanged.

## 0.4.5 — 2026-11-14

- Use a priority queue for large strict sorting segments, with original positions breaking equal-priority ties. Short segments keep linear selection to avoid heap overhead. Dependency construction and sorting results are unchanged.

- Expand the informational benchmark with nested media queries, deep rules, comments and if/else chains. Measure both safety modes and the full formatting pipeline in sequential isolated processes, with optional Git-revision comparisons using the same dependencies. Save raw samples, output hashes and GitHub Actions reports.

## 0.4.4 — 2026-11-14

- Avoid argument-limit errors when writing back very wide sorting segments; rebuild child lists directly without spread or an intermediate flattened array.
- Reuse pending comment arrays when collecting sortable units, preserving comments, `if`/`else` chains and `prettier-ignore`. Sorting behavior and configuration are unchanged. Performance effects vary by workload; this release makes no general speed or memory-reduction guarantee.

## 0.4.3 — 2026-11-12

Strict mode now preserves the original side of a declaration relative to a nested CSS block that can write a conflicting property. For example, `@media (...) { color: red; } color: blue;` keeps that order, preserving the final blue color when the query matches. Formatting may differ from 0.4.2 where declarations were hoisted across such blocks. Independent declarations can still move; `loose` and its `structural` alias continue to honor configured reordering. This does not add selector-overlap analysis or change the ordering policy between two sibling rules.

- Cache nested-block property sets and property-conflict checks within each strict sorting pass, skipping collection when no declaration can cross a block. Sorting results and loose behavior are unchanged.

- In strict mode, preserve declarations on their original side of nested rules and CSS blocks (including media queries) when their emitted properties conflict. Independent declarations remain sortable across blocks, and loose retains configured reordering.

## 0.4.2 — 2026-11-08

- Allow strict sorting of independent physical inset properties, border strokes/images versus radii, and known grid properties with disjoint longhands. Preserve real shorthand, reset and logical-property conflicts, with conservative fallback for unknown family extensions.

## 0.4.1 — 2026-11-08

- Rename safety modes to `strict` (default) and `loose`. Keep `conservative` as an alias for `strict` and `structural` as an alias for `loose` in the API, CLI and TypeScript types. Sorting behavior is unchanged; existing configurations continue to work.

## 0.4.0 — 2026-11-08

### Upgrading from 0.3.x

Configuration is now validated instead of silently accepting invalid settings. Unknown presets and group references, malformed group JSON, invalid node types or criteria, and `order: "exact"` without `oneOf` produce errors. Correct these settings before upgrading; TypeScript declarations enforce preset/node names and the required exact-order list too. Empty catch-all groups, empty `oneOf` lists and duplicate order entries remain supported.

Options now consistently follow **explicit value → preset → default**. Without a preset, root sorting remains enabled. With `csscomb`, `csscomb-yandex`, `csscomb-zen` or `pepelsbey`, an omitted `grundyScssSorterWithRoot` now inherits `false`, so top-level constructs retain their order. Set `grundyScssSorterWithRoot: true` explicitly to preserve the previous root-sorting behavior with these presets. Explicit `false` still disables it.

`pepelsbey` enables group splitting by default; explicit `grundyScssSorterSplitGroups: false` takes precedence. Safety defaults remain unchanged: `conservative` is the default and `structural` is an explicit opt-in. Parsing still uses `postcss-scss`; no Dart Sass parser migration is included.

### Changes

- Add push/PR compatibility checks for Node.js 22/24/26 and Prettier 3.8.1/latest 3.x, plus a Windows job. Release publishing reuses the same checks.
- Verify installed tarballs and their TypeScript declarations in isolated consumer projects; add an informational sorting benchmark.

- Validate group JSON, criteria, node types and group references; report unknown presets instead of silently falling back. Exact ordering now requires `oneOf`. Empty match-all groups, empty lists and duplicate order entries remain supported.
- Apply option precedence consistently: explicit value, then preset, then defaults. In particular, omitted `grundyScssSorterWithRoot` now respects presets that disable root sorting. Set it explicitly to `true` to retain the previous root behavior with those presets.
- Add precise preset/node type unions and require `oneOf` for exact ordering in TypeScript, with a separate type-check command.
- Index candidate property conflicts and separate sorting policy from the PostCSS AST adapter.

## 0.3.0

### Sorting safety and configuration

- Add `grundyScssSorterSafety`: `conservative` (default) and explicitly selected `structural`.
- Preserve the order of conflicting declarations, including shorthand/longhand overrides, fallbacks, aliases, and overlapping logical/physical properties in conservative mode.
- Keep Sass assignments, mixin calls, control flow, diagnostics, and module loads as execution boundaries in conservative mode, including enclosing blocks.
- Allow configured ordering to override semantic protections in structural mode. Users choosing this mode are responsible for changes to Sass behavior and CSS output.

### Fixes

- Keep leading, trailing, and footer comments attached correctly; preserve line-comment termination and `prettier-ignore` subtrees.
- Preserve complete `@if`/`@else` chains in both safety modes.
- Make group spacing stable when existing blank lines contain whitespace, including CRLF input.

### Performance

- Precompute group priorities, exact-order ranks, membership sets, and normalized property names without changing sorting results.

### Upgrading from 0.2.x

The default mode now prioritizes conservative safety over configured ordering. Assignments, module loads, and other execution boundaries are no longer hoisted, and conflicting properties retain their relative order. To explicitly prioritize manual ordering, set `grundyScssSorterSafety: "structural"`. Comments, `@if`/`@else` chains, and `prettier-ignore` remain protected in both modes.

Conservative mode does not prove semantic equivalence for arbitrary SCSS: function side effects and general cascade dependencies between nested rules or CSS at-rules remain limitations. Parsing still uses `postcss-scss`; this release does not migrate to Dart Sass.
