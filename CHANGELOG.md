# Changelog

## Unreleased

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
