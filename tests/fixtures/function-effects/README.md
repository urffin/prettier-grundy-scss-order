# Sass function side-effect examples and archived research

This directory retains 31 authored, self-contained examples: 22 CSS/evaluation hazards, one diagnostic-order hazard and eight controls. They are not claimed to be occurrences in the pinned real corpus. Supporting modules are under `modules/`. The historical results below describe the unchanged 0.4.6 runtime on 2026-11-14; the current command only reproduces public plugin behavior.

## Current public reproducer

Run with the repository's installed dependencies:

```sh
npm run research:function-effects -- --output /external/path/function-effects
npm run research:function-effects -- --case direct-counter --skip-corpus --output /external/path/direct-counter
```

In PowerShell use `npm.cmd` if its shim consumes `--`. Without `--output`, the script creates an OS temporary directory and keeps its results for inspection. Use a fresh output directory for each run. It writes before/strict/loose SCSS and CSS (or a Sass error), `report.json` and a concise summary. Metadata includes actual dependency versions, the checkout commit/dirty state and hashes of the fixtures, modules, manifest, script, runtime sources and dependency lock.

The current report is **schema version 2**, kind `function-effect-examples`. It compares the public `strict` and `loose` paths with the default preset, root sorting enabled and group spacing disabled; fixture-specific options still apply. It retains per-case `before`, `defaultStrict` and `defaultLoose` results, including CSS projection, errors, non-deprecation diagnostics and formatting idempotence. It does not contain the old `matrix`, `prototypes`, `manual` or `corpus` sections. The five heuristic policies and corpus candidate analysis are no longer implemented in the current script. `--skip-corpus` remains accepted for compatibility; this command never scans the corpus.

A successful exit means sources compiled, strict controls and formatting idempotence held, and observations were collected. It does not mean that sorting preserved Sass semantics: known unsafe outcomes are recorded rather than required as desired behavior. A future fix may make them disappear. The controls are strict controls: loose with root sorting may move function definitions across their uses even for pure functions, and those outcomes remain observations. Ordinary tests preserve the eight strict controls across all five presets/root/group-spacing settings, the strict whole-rule ignore workaround across all 31 examples, and the direct-counter property-order/assignment workarounds. They do not require hazards to remain unsafe.

## Full historical research

The complete study is preserved at published commit `dad2aa8dd42553c15dd7c021043a04d214f1ad37`, including its original script, fixtures, modules, pinned real corpus and lockfile. Reproduce the completed policies in a separate checkout:

```sh
git worktree add --detach ../scss-order-function-study dad2aa8dd42553c15dd7c021043a04d214f1ad37
cd ../scss-order-function-study
npm ci --ignore-scripts --no-audit --no-fund
npm run research:function-effects -- --output /external/path/function-effects-full-study
```

That frozen command produces the original schema-version-1 report: 620 strict configurations, five heuristic policies, manual-workaround observations and corpus candidate counts. Its `--case` and `--skip-corpus` flags can limit a replay. Preserve `report.json`, generated SCSS/CSS/errors, runtime versions and source hashes with the replay. This is historical evidence, not a purity engine or an option supported by the current sorter. The current warning-only decision below is unchanged.

## Reproduction

`direct-counter.scss` contains:

```scss
$n: 0;
@function tick() {
  $n: $n + 1 !global;
  @return $n * 1px;
}
.a { width: tick(); height: tick(); }
```

Before sorting, Sass emits `width: 1px; height: 2px`. Default strict sorts height first and emits `height: 1px; width: 2px`. Both CSS property values change. The function declaration remains a boundary because its body contains assignments and `@return`; the calls themselves are not boundaries.

The current core classifies assignments/directives and their enclosing blocks. The adapter's property conflict view examines declaration names, not the evaluation of values, selectors or at-rule parameters. This leaves hidden effects across otherwise independent properties and nested blocks.

Sass explicitly permits global-variable side effects in functions, while recommending mixins for side effects and functions for computing values. Its identifiers equate hyphens and underscores. Function values can be invoked indirectly with `meta.call()`, including through a module alias. Sources: [functions](https://sass-lang.com/documentation/at-rules/function/), [imperative variables and scope](https://sass-lang.com/documentation/variables/), [sass:meta](https://sass-lang.com/documentation/modules/meta/).

## Historical results

Environment: Node 22.17.0, Sass 1.107.1, Prettier 3.8.1, Windows x64. All five presets × root sorting off/on × group spacing off/on give 620 strict runs. Outcomes: 118 successful compilations with changed CSS values, four compilation errors and four changed diagnostic sequences. All 620 strict outputs are idempotent, demonstrating that idempotence alone does not establish semantic preservation. All 23 hazard examples fail with default strict; some presets happen to retain their source order. All eight controls preserve CSS values in all 160 configurations.

Coverage includes direct and indirect calls, state readers, default arguments, hyphen/underscore aliases, escaped identifiers, lexical shadowing, modules and `@forward`, `@use ... as *`, dynamic function values, nested CSS arguments, nested rules, media conditions, selector/value/custom-property interpolation, root rule ordering, `@error` and `@warn`. The root rule example uses explicit alphabetical rule ordering; it studies Sass evaluation, not selector-overlap analysis.

CSS is compared both as text and as ordered per-property value sequences keyed by selector/at-rule context. This projection permits independent declaration order in these controlled examples. It is not a general CSS cascade-equivalence checker. Errors and non-deprecation diagnostics are compared separately. Unseeded randomness and host-provided compiler callbacks are outside the measured set.

## Archived experimental policies

The frozen research script injects candidate boundaries through a temporary adapter into the recursive boundary mechanism. The current script does not construct these adapters or run the predicates. Production core, adapter and public options are unchanged. The historical lexical predicates are deliberately incomplete and are not a Sass parser or a proof of purity.

| Prototype                                              | Hazard examples preserved, of 23 | Controls with additional ordering restrictions, of 8 | Important limitation                                                         |
| ------------------------------------------------------ | -------------------------------: | ---------------------------------------------------: | ---------------------------------------------------------------------------- |
| Any `(` in statement header                            |                               23 |                                                    8 | Also freezes CSS functions, strings, grouped expressions and selectors       |
| Regex function-like calls                              |                               22 |                                                    8 | Misses fully escaped `\74()`                                                 |
| Calls matching local function names                    |                               17 |                                                    6 | Misses module/dynamic calls and escaped names; freezes pure functions        |
| Local write/diagnostic summaries with transitive calls |                               15 |                                                    3 | Lacks lexical scope resolution, modules and dynamic dispatch                 |
| Summaries plus qualified/opaque calls                  |                               19 |                                                    4 | Still misses escapes, shadowing and star imports; also blocks pure built-ins |

The summaries account for `!global`, qualified assignments, diagnostics and transitive calls/default arguments; a flat name registry is insufficient when local functions shadow global ones. Regex matching also sees `"tick()"`, `url("tick().svg")` and raw `--token: tick()` as calls. Raw custom-property values do not evaluate that function; `--token: #{tick()}` does. The prototypes preserve all control CSS values, but change their otherwise valid sorting behavior.

On the same pinned 152-file corpus:

| Prototype                      | Candidate statements | Files containing candidates | Files formatted differently |
| ------------------------------ | -------------------: | --------------------------: | --------------------------: |
| Any `(`                        |                 1816 |                         128 |                         103 |
| Regex calls                    |                 1678 |                         125 |                         100 |
| Local function names           |                    0 |                           0 |                           0 |
| Local effect summaries         |                    0 |                           0 |                           0 |
| Summaries plus qualified calls |                    2 |                           1 |                           1 |

There are no `@function` definitions or explicit `!global` assignments in those snapshots. External application dependencies are incomplete, so this is not proof that the original projects have no stateful imported functions. Both qualified candidates are legacy CSS `DXImageTransform.Microsoft.gradient(...)` filters in landos-new, not Sass module calls. Thus a dot-based namespace heuristic also has real false positives. These are counts and formatting comparisons, not performance measurements.

## Workarounds and decision

Existing options already help when the author knows the effect:

- An exact `width, height` property group preserves the direct counter example. This is a case-specific order, not function-effect analysis.
- Evaluate the calls into explicit Sass assignments before declarations: `$width: tick(); $height: tick(); width: $width; height: $height;`. Existing strict assignment boundaries preserve the example.
- `prettier-ignore` on the enclosing executing style rule preserves all 31 examples. Ignoring only the called declaration inside a nested rule does **not** stop the parent rule from moving across an external state read; `nested-rule` records this failing narrower workaround.

A blanket automatic barrier would remove substantial legitimate sorting. A local-only purity analysis would still leave module and dynamic calls unsafe. A complete automatic solution needs Sass-aware expression/name/scope handling and a policy for unknown imports/functions; swapping parsers alone supplies no compiler/module environment. Built-in modules must not simply be assumed pure as a whole (for example, random/stateful built-ins require separate treatment).

Decision: document this strict limitation and keep the existing manual workarounds. Function-effect configuration and group API extensions are not planned as part of this work. Production sorting, defaults and loose mode retain their existing behavior. The experimental policies above are research tools only.

## Existing groups

For the two-property `direct-counter` example, this configuration already works:

```js
export default {
  plugins: ["prettier-grundy-scss-order"],
  grundyScssSorterSafety: "strict",
  grundyScssSorterGroups: JSON.stringify({
    decl: { type: "decl", oneOf: ["width", "height"], order: "exact" }
  })
};
```

This fixes an explicit property order, not the original evaluation order in arbitrary input. It also replaces the entire default declaration group, so other declarations no longer match that group. Current `type`, `startsWith` and `oneOf` inspect node type/name (a declaration's property name), not calls inside values. A group can rank statements; it cannot pin them at their original position or prevent their enclosing blocks from moving. The same width/height group still fails the `nested-rule` example.

Preserving only the relative order of matched calls is insufficient: a plain `$n` read can cross a call even if two calls keep their order. Boundary behavior is therefore distinct from `order: "exact"` or a stable group. Documentation warnings and the existing workarounds are the supported solution.
