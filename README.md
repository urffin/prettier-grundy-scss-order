# prettier-grundy-scss-order [Русский](ru/README.md)

[![npm][npm-badge]][npm] [![GitHub Actions Workflow Status][npm-build]][github-actions]

Keep SCSS readable as it grows. `prettier-grundy-scss-order` is a [Prettier](https://prettier.io/) plugin that puts declarations, variables, Sass directives, and nested rules in a predictable order every time you format a file.

It is designed for real SCSS codebases: place layout properties consistently, separate logical sections with blank lines, and migrate from established property orders while keeping variable assignments and mixin calls in place.

## Why use it?

- **One format command, one team-wide style.** No more review comments about property order.
- **SCSS-aware sorting.** Group CSS custom properties, declarations, Sass directives, and nested rules while respecting variable assignments and mixin calls as sorting boundaries.
- **Adopt an existing convention.** Choose `csscomb`, `csscomb-yandex`, `csscomb-zen`, or `pepelsbey`.
- **Make the order yours.** Create groups by node type, property prefix, or an explicit list of properties.

## Before and after

```scss
.card {
    padding: 16px;
    color: white;
    --card-color: #222;
    display: flex;
}
```

```scss
.card {
    --card-color: #222;
    color: white;
    display: flex;
    padding: 16px;
}
```

## Quick start

Install Prettier and the plugin:

```bash
npm install --save-dev prettier prettier-grundy-scss-order
```

Add it to `prettier.config.mjs`:

```js
export default {
    plugins: ["prettier-grundy-scss-order"]
};
```

Then format your SCSS as usual:

```bash
npx prettier --write "src/**/*.scss"
```

The default order is:

```text
@use → @extend → CSS custom properties → Sass variables → @if → declarations → @include → @mixin → nested rules
```

Declarations inside the `decl` group are sorted alphabetically. By default, conflict constraints and execution boundaries limit reordering at the root level and inside nested rules. Explicitly select `loose` mode to allow your configured order across these boundaries.

## Configuration

Set options in your Prettier configuration:

```js
export default {
    plugins: ["prettier-grundy-scss-order"],
    grundyScssSorterSplitGroup: true,
    grundyScssSorterGroupsOrder: ["--variable", "$variable", "layout", "typography", "decl", "@include", "rule"],
    grundyScssSorterGroups: JSON.stringify({
        layout: {
            oneOf: ["display", "position", "inset", "width", "height", "margin", "padding"],
            order: "exact"
        },
        typography: {
            startsWith: "font",
            type: "decl"
        }
    })
};
```

| Option                        | Description                                                                                   | Default                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `grundyScssSorterGroupsOrder` | Group names in the desired order. Nodes not matching a listed group are placed after them.    | `[@use, @extend, --variable, $variable, @if, decl, @include, @mixin, rule]` |
| `grundyScssSorterWithRoot`    | Sort root-level nodes as well as declarations inside rules.                                   | `true`                                                                      |
| `grundyScssSorterSplitGroup`  | Add a blank line between groups. Groups marked as split also separate their individual items. | `false`                                                                     |
| `grundyScssSorterGroups`      | JSON string with custom groups. Custom definitions extend the built-in groups.                | —                                                                           |
| `grundyScssSorterPreset`      | A bundled property-order preset.                                                              | —                                                                           |

## Compatibility and checks

### Upgrading to 0.4.0

Invalid configuration now produces errors: check preset and group names, group JSON, node types and criteria, and provide `oneOf` for `order: "exact"`. Options follow explicit value → preset → default. With `csscomb`, `csscomb-yandex`, `csscomb-zen` or `pepelsbey`, omitted `grundyScssSorterWithRoot` now inherits `false`; set it explicitly to `true` to preserve the previous root-sorting behavior. Without a preset it remains `true`. Explicit `grundyScssSorterSplitGroups: false` overrides the `pepelsbey` preset's `true`. The default safety mode remains `strict`; `loose` remains an explicit choice. See [the changelog](./CHANGELOG.md) for details.

### Supported matrix

The CI matrix covers current patch releases of Node.js 22, 24 and 26 with Prettier 3.8.1 (the minimum supported version) and the latest stable 3.x. All six combinations run on Linux; Node.js 24 with the latest Prettier 3.x also runs on Windows. The moving `3` selector stays within the supported peer dependency range and does not opt into Prettier 4 or prereleases.

Pushes and pull requests run runtime tests, `npm run test:types`, and `npm run test:package`. The package check installs the actual tarball in a temporary consumer project and verifies public exports, all presets, both safety modes, configuration, comments, idempotence and the installed declarations. Release publishing waits for the same reusable checks.

Run `npm ci`, `npm test`, `npm run test:types`, and `npm run test:package` locally. The package check needs registry access. Development checks use Sass and TypeScript as dev dependencies; neither is added to the published runtime dependencies.

### Benchmark

`npm run benchmark` covers seven synthetic scenarios (independent/conflicting declarations, nested blocks, comments and if/else chains) and four real-file batches: `real-grundyjs`, `real-landos`, `real-falcon`, `real-eywa`. The pinned corpus contains 152 whole files, including 51 CSS and two SCSS files from the evolving grundyjs.ru styles. Each file is processed separately; measurements cover the entire project batch. Both `strict` and `loose` run by default. `sort` measures sorter construction and ordering on prepared ASTs, excluding parsing and serialization; `format` measures the complete `prettier.format` pipeline. Results for all files remain live through the final memory snapshot.

By default `--metric all` measures time and memory in separate sequential processes. Timing uses two processes per version/safety/measurement, with three warmups and nine samples per scenario in each process. Timing workers do not force GC. No worker loads two code versions. Process rounds alternate version order during comparisons. Reports contain medians, quartiles, raw samples, process IDs and time origins (`timeOriginMs`, to distinguish reused PIDs), runtime/package versions, Git revisions and output hashes. These measurements describe the measured machine and workload; a small difference is not a general speed or memory guarantee.

Memory uses three fresh processes per **version/safety/measurement/scenario**, one cold operation each, without warmups. Each worker runs with `--expose-gc`: two GC calls before the baseline snapshot and two after the operation. The result AST/string remains live through the final snapshot; hashing and AST serialization happen afterwards. For `sort`, the input AST is prepared before the baseline; `format` includes the entire formatting pipeline. Separate processes per scenario prevent an earlier scenario from contributing to `maxRSS`.

```sh
npm run benchmark -- --output benchmark-results.json
npm run benchmark -- --compare v0.4.3 --output benchmark-results.json
npm run benchmark -- --scenario comments --safety strict --measurement format
npm run benchmark -- --scenario real-grundyjs --output benchmark-results.json
npm run benchmark -- --metric memory --compare v0.4.5 --memory-processes 3 --output benchmark-results.json
npm run benchmark -- --metric time --scenario independent-1000
npm run benchmark -- --help
```

In Windows PowerShell, use `npm.cmd run benchmark -- ...` if the `npm.ps1` shim consumes the `--` separator. Direct invocation also works, for example `node scripts/benchmark.mjs --scenario comments` (no separator needed).

`--compare` takes a locally available Git commit or tag (fetch it first if needed). It snapshots runtime sources into a temporary directory and uses the current checkout's installed dependencies and Node.js for both versions. This compares code, not historical dependency trees; no historical install scripts run and the checkout is untouched. Comparisons require safety-mode support (0.3.0 or later). Output differences appear as `outputMatches: false` and do not invalidate the measurements. Negative `changePercent` means the current checkout is faster. `--warmup`, `--samples`, and `--processes` control time measurements; `--memory-processes` controls independent memory samples. Very short runs are useful for checking the harness, not drawing performance conclusions.

JSON **schema version 2** keeps timing data in `rows`/`workers` and adds `memoryRows`/`memoryWorkers` (the unselected metric has empty arrays). Memory rows contain `before`, `after`, `afterGC`, `deltaAfter` and `deltaAfterGC`, with `medianBytes`, quartiles and `samplesBytes` for each field; raw snapshots stay in the workers. Deltas are computed within each process before aggregation and may be negative. Version comparisons add `changeBytes` (current minus baseline median) for heap after, heap after GC and maxRSS. Input/output hashes must agree between time and memory for the same version; differences between code versions remain informational.

Memory fields are `rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers` and `maxRSS`, all in **bytes**. `arrayBuffers` is already included in `external`; do not add them together. Node's `maxRSS` is converted from KiB to bytes and records the process high-water mark through the final snapshot, including startup, imports, input preparation and GC. These snapshots are not allocation counts or exact heap peaks, and maxRSS is not an operation-only peak. See the [Node.js memory APIs](https://nodejs.org/docs/latest-v22.x/api/process.html#processmemoryusage) and [resource usage](https://nodejs.org/docs/latest-v22.x/api/process.html#processresourceusage).

JSON `inputs` identifies synthetic/real scenarios, file counts, bytes and input hashes. Real batches also record the source commit, corpus digest and individual file hashes; hashes include file boundaries. Compare performance only with the same inputs. The default 11 scenarios produce 44 timing and 44 memory rows per comparison, with statistics for each selected version.

CI runs both metrics for the current version, writes time and memory tables (memory displayed in MiB) and uploads the combined `benchmark-results.json` as an artifact for 14 days. Values have no pass/fail thresholds; execution errors still fail the job. The report, corpus and benchmark scripts are excluded from the npm package.

`npm test` includes 15 SCSS regression fixtures across all presets and modes. `npm run test:corpus -- --output corpus-results.json` verifies snapshot hashes, idempotence, comments and AST inventory on all real files (3040 cases); CI saves its separate report. It does not compile standalone application files or prove general CSS equivalence. Update evolving site inputs explicitly with `npm run corpus:update -- --project grundyjs.ru --root /path/to/grundyjs.ru --check`, then remove `--check` to refresh from committed Git styles. Working-tree edits never enter the snapshot. See [corpus provenance, regression guarantees and refresh workflow](tests/fixtures/corpus/README.md).

## Presets

Start with a familiar convention, then override it only where your project differs:

```js
export default {
    plugins: ["prettier-grundy-scss-order"],
    grundyScssSorterPreset: "pepelsbey"
};
```

| Preset                                             | Best for                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`csscomb`](src/presets/csscomb.mjs)               | Migrating from CSScomb’s default configuration.                                 |
| [`csscomb-yandex`](src/presets/csscomb-yandex.mjs) | Migrating from CSScomb’s Yandex configuration.                                  |
| [`csscomb-zen`](src/presets/csscomb-zen.mjs)       | Migrating from CSScomb’s Zen configuration.                                     |
| [`pepelsbey`](src/presets/pepelsbey.mjs)           | A comprehensive exact CSS-property order based on `stylelint-config-pepelsbey`. |

## Configuration precedence and validation

Options use this priority: explicit value → selected preset → default preset. Explicit `false` overrides `true`. Without a preset, root sorting defaults to `true` and group splitting to `false`. All four non-default presets disable root sorting; `pepelsbey` enables group splitting. Set `grundyScssSorterWithRoot: true` explicitly to sort the root with those presets.

Group definitions merge by name: defaults → preset → custom groups. A later definition replaces the entire group, rather than merging individual criteria. A non-empty `grundyScssSorterGroupsOrder` replaces the preset order; an omitted or empty array inherits it. Repeated group names and `oneOf` entries are allowed; their first occurrence determines priority.

Invalid JSON, non-object groups, unknown criteria or node types, wrong field types, unknown presets and references to undefined groups throw an error naming the option or group. `order: "exact"` requires a `oneOf` array. Empty lists are valid and match nothing; a group `{}` matches every sortable statement. Criteria within a group are combined with AND. Defined groups that match no statements are allowed.

Statements matching no listed group retain their relative order after the configured groups, subject to the safety mode. Unknown at-rules use `type: "atrule"`. Comments stay attached to statements and are not independently sorted.

This changes two formerly silent behaviors: misspelled configuration now fails, and omitted root sorting respects the preset. Explicit `loose` mode remains available.

## Built-in groups

| Group                 | Matches                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `@use`                | Sass `@use` statements                                               |
| `@extend`             | Sass `@extend` statements                                            |
| `--variable`          | CSS custom properties                                                |
| `$variable`           | Sass variables                                                       |
| `@if`                 | Sass `@if` statements; matching `@else` blocks remain attached       |
| `decl`                | CSS declarations, sorted alphabetically by default                   |
| `@include`            | Sass `@include` statements                                           |
| `@mixin`              | Sass `@mixin` declarations                                           |
| `rule`                | Nested selectors and rules                                           |
| `@media`, `@supports` | Media and feature-query at-rules; add them to your order when needed |

## Custom groups

Each group can combine these criteria:

| Criterion    | Meaning                                                                            | Example                                              |
| ------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `type`       | Matches an SCSS node type.                                                         | `{ type: "decl" }`                                   |
| `startsWith` | Matches a node name starting with a string.                                        | `{ startsWith: "font", type: "decl" }`               |
| `oneOf`      | Matches one of the listed node names.                                              | `{ oneOf: ["position", "inset"] }`                   |
| `order`      | Sorts a group using `"alphabetical"` or the array order in `oneOf` with `"exact"`. | `{ oneOf: ["display", "position"], order: "exact" }` |
| `splitItems` | Separates items in this group with blank lines when group splitting is enabled.    | `{ type: "include", splitItems: true }`              |

Supported values for `type`: `use`, `extend`, `mixin`, `include`, `if`, `else`, `atrule`, `rule`, `decl`, `$variable`, `variable`, `media`, `supports`, and `comment`. Comment attachment takes precedence over group ordering.

> Use `type: "decl"` with `startsWith` or `oneOf` when the group should contain only CSS properties. Without it, the criterion can also match the name or parameters of another SCSS node.

## Safety mode

`grundyScssSorterSafety` accepts `"strict"` (default) or `"loose"`. The old names `"conservative"` and `"structural"` remain supported aliases for `"strict"` and `"loose"`, respectively, including in CLI options. Existing configurations need no changes. A preset or custom group alone never changes the mode. Strict mode enforces the library's known constraints; it does not guarantee semantic equivalence for arbitrary SCSS.

> **Warning:** Even in `strict`, reordering calls to Sass functions that change state, for example through `!global`, can change generated CSS or cause a compilation error. Prefer explicit Sass assignments or mixin calls for these effects, or protect the enclosing style rule with `prettier-ignore`. Ignoring only a nested declaration may not protect its parent. Ordinary groups do not recognize function calls or create execution boundaries.

```js
export default {
    plugins: ["prettier-grundy-scss-order"],
    grundyScssSorterSafety: "loose",
    grundyScssSorterGroupsOrder: ["$variable", "decl", "@include", "rule"]
};
```

`loose` applies configured ordering without execution boundaries or property conflict constraints. It can move variables, calls, conditions, and modules, and reorder shorthand/longhand properties. The caller is responsible for the resulting SCSS behavior. Both modes keep comments attached, preserve complete `if`/`else` chains, terminate line comments, and honor `prettier-ignore`. Root sorting and group spacing options work in both modes. Invalid mode names are rejected.

The following conflict and execution protections describe `strict` mode.

## Conflicting properties

The source order of potentially conflicting declarations takes priority over presets and custom groups. This preserves shorthand/longhand overrides (such as `margin-top` followed by `margin`), repeated fallback declarations, aliases, and overlapping logical/physical properties. Independent declarations still follow the configured order.

Independent physical offsets (`top`, `right`, `bottom`, `left`), border strokes/images versus corner radii, and known grid properties with disjoint longhands may follow the configured order. Overlapping shorthands, logical/physical mappings and the `border` reset of `border-image` remain protected. Unknown family extensions still use conservative checks. Interpolated or escaped property names and nested Sass property blocks keep their position relative to other declarations.

## Execution boundaries

Sass assignments (`$value: ...`, including `!default`, `!global`, and `theme.$value: ...`), `@include`, `@content`, control flow (`@if`/`@else`, `@for`, `@each`, `@while`, `@return`), diagnostics (`@warn`, `@debug`, `@error`), and module loads (`@use`, `@forward`, `@import`) stay in their original position. Statements cannot cross these boundaries, even when a preset or custom group requests a different order. CSS custom properties (`--value`) remain sortable declarations.

Enclosing blocks containing these operations also stay in place, and each `@if`/`@else` chain is kept together at its original position. Their contents are still sorted recursively between boundaries; `prettier-ignore` additionally protects the entire subtree. Comments remain attached, and group spacing still applies.

This intentionally changes earlier formatting that hoisted assignments, conditions, or module loads. In particular, `@forward` and `@use` are never regrouped: their order can affect module configuration and emitted CSS. Invalid module placement is left in place for Sass to diagnose.

In `strict` mode, presets, group criteria, alphabetical/exact ordering, and blank-line settings apply within each sortable segment. They cannot override execution boundaries or property conflicts. Boundary groups still affect spacing. Conservative checks can prevent harmless moves too, especially for enclosing blocks and the `border`/`grid` families. Select `loose` explicitly when configured ordering should take priority.

In `strict`, declarations retain their original side of nested rules and CSS blocks such as `@media` when the block can emit a conflicting property. This includes shorthand resets, logical properties and dynamic names. Independent declarations may still cross the block; its contents are sorted recursively. Selector overlap is treated conservatively, so even disjoint selectors may restrict a conflicting declaration. `loose` permits configured reordering across these blocks.

The sorter does not evaluate Sass or prove equivalence for arbitrary stylesheets. Side effects hidden in function calls and cascade dependencies between two sibling rules or CSS blocks still require further analysis.

Stateful function calls in values, interpolations, selectors or at-rule parameters are currently not execution boundaries. Explicit Sass assignments or `prettier-ignore` on the enclosing style rule can preserve known evaluation order. See the [reproducible function-effect research and policy comparison](tests/fixtures/function-effects/README.md).

## Comments

Comments on their own line move with the following statement. Comments after a statement on the same line stay with that statement. Standalone comments at the end of a block remain there. Group separators are inserted before leading comments.

`// prettier-ignore` and `/* prettier-ignore */` protect the following statement and its contents from sorting. Other statements are sorted separately on each side of the ignored statement.

## Try it

**[Open the playground](https://grundyjs.ru/prettier-grundy-scss-order/playground/)** to experiment with groups and presets before adding them to your project.

[npm]: https://www.npmjs.com/package/prettier-grundy-scss-order
[npm-badge]: https://img.shields.io/npm/v/prettier-grundy-scss-order?color=blue
[npm-build]: https://img.shields.io/github/actions/workflow/status/urffin/grundy-scss-order/npm-publish.yml?label=build
[github-actions]: https://github.com/urffin/grundy-scss-order/actions/workflows/npm-publish.yml
