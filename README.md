# prettier-grundy-scss-order [Русский](ru/README.md)

[![npm][npm-badge]][npm] [![GitHub Actions Workflow Status][ci-badge]][github-actions]

Keep SCSS readable as it grows. `prettier-grundy-scss-order` is a [Prettier](https://prettier.io/) plugin that puts declarations, variables, Sass directives, and nested rules in a predictable order every time you format a file.

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
npm install --save-dev prettier@3 prettier-grundy-scss-order
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

Default group priority (for statements that may be reordered):

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
            type: "decl",
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

| Option                        | Description                                                                         | Without a preset    |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| `grundyScssSorterSafety`      | `"strict"` preserves known dependencies; `"loose"` prioritizes configured ordering. | `"strict"`          |
| `grundyScssSorterGroupsOrder` | Group priority; omitted or empty arrays inherit the preset order.                   | See the order above |
| `grundyScssSorterWithRoot`    | Also sort root-level nodes.                                                         | `true`              |
| `grundyScssSorterSplitGroup`  | Separate groups with blank lines and honor `splitItems`.                            | `false`             |
| `grundyScssSorterGroups`      | JSON string containing group definitions.                                           | —                   |
| `grundyScssSorterPreset`      | Bundled preset name.                                                                | `default`           |

## Compatibility

Requires Prettier `>=3.8.1 <4`. CI covers Node.js 22, 24 and 26 with the minimum and latest Prettier 3.x on Linux, plus Node.js 24 with the latest Prettier 3.x on Windows; see the exact matrix in the [development guide](scripts/DEVELOPMENT.md).

The plugin registers only Prettier’s `scss` parser, selected automatically for `.scss` files. It does not replace the `css`, `less` or indented Sass parsers. It sorts source code rather than compiling Sass.

For browser bundles with Prettier standalone, load the native PostCSS printer before this plugin and honor package `browser` mappings. See the [browser setup and smoke check](scripts/BROWSER.md), including differences in source-map handling between Node.js and browsers.

## Presets

Start with a familiar convention, then override it only where your project differs:

```js
export default {
    plugins: ["prettier-grundy-scss-order"],
    grundyScssSorterPreset: "pepelsbey"
};
```

| Preset                                             | Purpose                                                                         | `WithRoot` | `SplitGroup` |
| -------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- | ------------ |
| [`default`](src/presets/default.mjs)               | Alphabetical declarations; used when no preset is selected.                     | `true`     | `false`      |
| [`csscomb`](src/presets/csscomb.mjs)               | Migrating from CSScomb’s default configuration.                                 | `false`    | `false`      |
| [`csscomb-yandex`](src/presets/csscomb-yandex.mjs) | Migrating from CSScomb’s Yandex configuration.                                  | `false`    | `false`      |
| [`csscomb-zen`](src/presets/csscomb-zen.mjs)       | Migrating from CSScomb’s Zen configuration.                                     | `false`    | `false`      |
| [`pepelsbey`](src/presets/pepelsbey.mjs)           | A comprehensive exact CSS-property order based on `stylelint-config-pepelsbey`. | `false`    | `true`       |

## Configuration precedence and validation

Options use this priority: explicit value → selected preset → default preset. Explicit `false` overrides `true`. Without a preset, root sorting defaults to `true` and group splitting to `false`. All four non-default presets disable root sorting; `pepelsbey` enables group splitting. Set `grundyScssSorterWithRoot: true` explicitly to sort the root with those presets.

Group definitions merge by name: defaults → preset → custom groups. A later definition replaces the entire group, rather than merging individual criteria. A non-empty `grundyScssSorterGroupsOrder` replaces the preset order; an omitted or empty array inherits it. Repeated group names and `oneOf` entries are allowed; their first occurrence determines priority.

Invalid JSON, non-object groups, unknown criteria or node types, wrong field types, unknown presets and references to undefined groups throw an error naming the option or group. `order: "exact"` requires a `oneOf` array. Empty lists are valid and match nothing; a group `{}` matches every sortable statement. Criteria within a group are combined with AND. Defined groups that match no statements are allowed.

Statements matching no listed group have lower priority than the configured groups; strict constraints can restrict this ordering. Unknown at-rules use `type: "atrule"`. Comments stay attached to statements and are not independently sorted.

See the [changelog](CHANGELOG.md) for behavior changes between releases.

If a statement matches several groups in `grundyScssSorterGroupsOrder`, the first one determines its ordering. All matching groups contribute to blank-line separation.

## Built-in groups

| Group                 | Matches                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `@use`                | Sass `@use` statements                                               |
| `@extend`             | Sass `@extend` statements                                            |
| `--variable`          | CSS custom properties                                                |
| `$variable`           | Sass variables                                                       |
| `@if`, `@else`        | Sass `@if` statements; matching `@else` blocks remain attached       |
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

`startsWith` and `oneOf` compare case-sensitive node names: the property name for declarations (including variable prefixes `--` or `$`), the selector for rules, and the **parameters** for at-rules, excluding the directive name. For example, `@include button` has name `button` and type `include`. Omitting `order` requests no alphabetical or exact ordering within the group; strict constraints still apply.

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

The order of `@forward` and `@use` can affect module configuration and emitted CSS. The sorter leaves invalid module placement for Sass to diagnose.

In `strict` mode, presets, group criteria, alphabetical/exact ordering, and blank-line settings apply within each sortable segment. They cannot override execution boundaries or property conflicts. Boundary groups still affect spacing. Conservative checks can prevent harmless moves too, especially for enclosing blocks and the `border`/`grid` families. Select `loose` explicitly when configured ordering should take priority.

In `strict`, declarations retain their original side of nested rules and CSS blocks such as `@media` when the block can emit a conflicting property. This includes shorthand resets, logical properties and dynamic names. Independent declarations may still cross the block; its contents are sorted recursively. Selector overlap is treated conservatively, so even disjoint selectors may restrict a conflicting declaration. `loose` permits configured reordering across these blocks.

The sorter does not evaluate Sass or prove equivalence for arbitrary stylesheets. Side effects hidden in function calls and cascade dependencies between two sibling rules or CSS blocks still require further analysis.

See the [reproducible Sass function-effect study](tests/fixtures/function-effects/README.md).

## Comments

Comments on their own line move with the following statement. Comments after a statement on the same line stay with that statement. Standalone comments at the end of a block remain there. Group separators are inserted before leading comments.

`// prettier-ignore` and `/* prettier-ignore */` protect the following statement and its contents from sorting. Other statements are sorted separately on each side of the ignored statement.

## Development

See the [development guide](scripts/DEVELOPMENT.md) for checks, benchmarks, memory measurements and corpus verification.

## Try it

**[Open the playground](https://grundyjs.ru/prettier-grundy-scss-order/playground/)** to experiment with groups and presets before adding them to your project.

[npm]: https://www.npmjs.com/package/prettier-grundy-scss-order
[npm-badge]: https://img.shields.io/npm/v/prettier-grundy-scss-order?color=blue
[ci-badge]: https://img.shields.io/github/actions/workflow/status/urffin/prettier-grundy-scss-order/ci.yml?branch=main&label=CI
[github-actions]: https://github.com/urffin/prettier-grundy-scss-order/actions/workflows/ci.yml
