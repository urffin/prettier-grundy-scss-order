# Upstream triage and standalone reproductions

Checked **2026-11-18**, with npm **sass-parser 0.5.6**, **Sass 1.108.2**, **PostCSS 8.5.32**. Upstream source: [6019767566da18474530d1eda8578eee9ac4355d](https://github.com/sass/dart-sass/tree/6019767566da18474530d1eda8578eee9ac4355d/pkg/sass-parser). Nothing here has been submitted. Production code and the readiness gate are unchanged.

The [upstream README](https://github.com/sass/dart-sass/blob/6019767566da18474530d1eda8578eee9ac4355d/pkg/sass-parser/README.md) warns against production use and documents missing original-formatting metadata. Formatting differences are expected; comment-content loss and rejection of valid syntax require separate investigation.

## Five blockers, different ownership

| Fixture                 | Independent observation                                                                                                                       | Ownership and upstream mapping                                                                                                                                    | Action                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `keyframes-percentages` | Sass compiles it; `scss.parse()` rejects `0%`. A `from`/`to` control parses.                                                                  | Valid-syntax support gap. [Selector parsing PR #2670](https://github.com/sass/dart-sass/pull/2670) is related history, not a matching report or demonstrated fix. | [Unpublished draft](drafts/keyframes.md).                                          |
| `branch-comment`        | The inter-branch comment is absent from the initial comment walk and first print.                                                             | Parser/AST information loss. No exact matching issue found in the recorded search.                                                                                | [Unpublished draft](drafts/branch-comment.md).                                     |
| `footer-comment`        | Initial AST and first print retain the footer; reparsing the first print loses it. The first print omits the preceding declaration semicolon. | Parser/stringifier interaction causing content loss, beyond whitespace normalization. No exact matching issue found.                                              | [Unpublished draft](drafts/footer-comment.md).                                     |
| `ignored-subtree`       | Printing normalizes spaces and `red` to `#ff0000`; the original rule's source span still contains the exact text.                             | Formatter/adapter contract. A general parser need not implement Prettier directives. This normalization alone is not a parser bug.                                | Preserve ignored source text in a future adapter; no new upstream issue proposed.  |
| `leading-whitespace`    | Declaration/comment `raws.before` is absent; source offsets and the original input remain available.                                          | Documented missing raws plus the current adapter's trivia contract.                                                                                               | Track raws work; consider deriving trivia from spans. No duplicate issue proposed. |

The broad AST request [#88](https://github.com/sass/dart-sass/issues/88) is background, not a report of these failures. Closed [#2545](https://github.com/sass/dart-sass/issues/2545) concerns a 0.4.15 expression-visitor failure; closed [#2099](https://github.com/sass/dart-sass/issues/2099) concerns compilation after removing line breaks around `//`. Neither matches these comment/roundtrip cases.

The unchanged readiness gate measures the **unmodified candidate** against this integration's requirements. `blocked` therefore does not prove that a source-preserving adapter is impossible. Fixing the three syntax/comment cases would justify considering a separately authorized adapter study for ignored text and trivia; that study needs its own correctness checks rather than silently relaxing the existing gate.

## Scope of the current raws work

[PR #2915](https://github.com/sass/dart-sass/pull/2915) was open and unmerged at head `9b34322bee65e717b397ae4e2d066648aa8f0653`. The inspected patch computes lazy **Root** `raws.after` and `raws.semicolon`. It does not populate declaration/comment `raws.before`. This is relevant progress, not evidence that our whitespace fixture or nested footer case passes. No unpublished upstream code was executed.

## Reproduce without this library

In a disposable directory, copy [reproduce.cjs.txt](reproduce.cjs.txt) as `reproduce.cjs`, then run:

```sh
npm init -y
npm install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/ sass-parser@0.5.6 sass@1.108.2 postcss@8.5.32
node reproduce.cjs > reproductions.json
```

The repository stores this as text so `uvu tests` does not execute it as a test or load an experimental parser. When copied as `reproduce.cjs`, only Node built-ins, `sass-parser` and its Sass dependency are loaded. The collector compiles every input first, then records three parse/print passes, comment inventories/marker survival, source spans, exact versions and parser entry hash. Parse failures are JSON observations; exit 0 is not readiness approval. Install/load/compiler failures terminate execution. Future fixed versions are not required to reproduce today's failures.

The first six inputs copy the existing minimal fixtures. Two added controls distinguish percentage selectors from `from`/`to` and try a one-time `rule.raws.semicolon = true`. That intervention retains the footer on the next pass, but the third print loses it. It is diagnostic, not a stable fix.

For the exact prior dependency tree, restore `installation.packageJSON` and `installation.packageLock` from the [0.5.6 readiness artifact](https://github.com/urffin/prettier-grundy-scss-order/actions/runs/44204550203/artifacts/14382404087), run `npm ci --ignore-scripts` separately, and copy the collector there. Top-level pins alone are not a complete transitive lock.

In 0.5.6, source offsets `[19, 58)` recover the exact ignored rule. Whitespace gaps also remain in the unchanged input. These observations are **not** a proven general adapter. Ends here are exclusive; do not assume inclusive PostCSS offsets. Mutations, nested ignored blocks, interpolation, missing comment gaps, CRLF/BOM and printing still require integration checks.

## Search limits

GET-only GitHub REST searches covered open/closed issues and PRs in `sass/dart-sass`, over titles/bodies: `"sass-parser"` (98), `keyframes parser` (0), `comment parser` (51), `raws` (7), `"raws.before"` (1), `"sass-parser" format` (6), `comment else` (2), `footer` (2). Each response reported `incomplete_results: false` and fit one page. Dependency-update PRs quoting PostCSS notes were not treated as duplicates. Selected PR files/comments and related issues were read separately.

This does not search every comment, discussion, another repository or unindexed text. “No exact match found” is a bounded result, not proof that no report exists. Recheck statuses/duplicates before publication. The three English drafts are for review only.
