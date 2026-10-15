# prettier-grundy-scss-order [Русский](ru/README.md)

[![npm][npm-badge]][npm] [![GitHub Actions Workflow Status][npm-build]][github-actions]

Keep SCSS readable as it grows. `prettier-grundy-scss-order` is a [Prettier](https://prettier.io/) plugin that puts declarations, variables, Sass directives, and nested rules in a predictable order every time you format a file.

It is designed for real SCSS codebases: keep variables together, place layout properties consistently, separate logical sections with blank lines, and migrate from established property orders without rewriting your styles by hand.

## Why use it?

- **One format command, one team-wide style.** No more review comments about property order.
- **SCSS-aware sorting.** Sort `$variables`, CSS custom properties, `@use`, `@extend`, `@include`, `@mixin`, conditions, and nested rules — not only declarations.
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

Declarations inside the `decl` group are sorted alphabetically. Sorting applies at the root level and inside nested rules.

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

Supported values for `type`: `use`, `extend`, `mixin`, `include`, `if`, `else`, `atrule`, `rule`, `decl`, `$variable`, `variable`, `media`, and `supports`.

> Use `type: "decl"` with `startsWith` or `oneOf` when the group should contain only CSS properties. Without it, the criterion can also match the name or parameters of another SCSS node.

## Try it

**[Open the playground](https://grundyjs.ru/prettier-grundy-scss-order/playground/)** to experiment with groups and presets before adding them to your project.

[npm]: https://www.npmjs.com/package/prettier-grundy-scss-order
[npm-badge]: https://img.shields.io/npm/v/prettier-grundy-scss-order?color=blue
[npm-build]: https://img.shields.io/github/actions/workflow/status/urffin/grundy-scss-order/npm-publish.yml?label=build
[github-actions]: https://github.com/urffin/grundy-scss-order/actions/workflows/npm-publish.yml
