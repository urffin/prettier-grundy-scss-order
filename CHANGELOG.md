# Changelog

## Unreleased

- Avoid argument-limit errors when writing back very wide sorting segments; rebuild child lists in one preallocated array without spread or an intermediate flattened array.

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
