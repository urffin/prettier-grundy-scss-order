# Minimal sass-parser readiness fixtures

These inputs preserve five blockers found by the isolated `sass-parser` 0.5.3 study on 2026-11-02, plus an ordinary control. Inputs are valid Dart Sass. Keep their exact whitespace and comments: they are test data, excluded from formatting and stored with LF on Windows as well.

| Fixture                   | Required behavior                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `keyframes.scss`          | Parse `0%` and `100%` selectors.                                                                    |
| `branch-comment.scss`     | Keep the comment between `@if` and `@else` on both passes.                                          |
| `footer-comment.scss`     | Keep the trailing block comment on a second parse/stringify.                                        |
| `ignored-subtree.scss`    | Preserve the exact text following `prettier-ignore`.                                                |
| `leading-whitespace.scss` | Expose `raws.before` for the current adapter's declaration/comment attachment and spacing contract. |
| `control.scss`            | Parse/stringify ordinary declarations and produce stable output.                                    |

The manifest describes desired behavior. Tests do not pin the candidate's broken outputs, so a new version can pass without updating expected failures. `raws.before` is a requirement of the existing adapter, not proof that another future adapter could never reconstruct whitespace from source positions. Exact ignored text could also require a dedicated adapter; this probe deliberately measures the candidate's unmodified round trip first.

All cases check parse/print, whether printed SCSS remains parseable, comment content/count/style on both passes and byte stability between first and second outputs. Full input byte identity is informational except for the ignored subtree. This is not a Sass semantic equivalence test or a sorting test.

Run the [versioned readiness command](../../../scripts/SASS_PARSER_READINESS.md). `npm test` validates these fixtures and the probe using an independent `postcss-scss` control and synthetic failures; it does not download or import `sass-parser` in the repository process.

The [upstream triage and standalone collector](upstream/README.md) separate three syntax/comment-loss candidates from two adapter contracts, map relevant upstream work and retain three unpublished issue drafts. The six-fixture gate remains unchanged; source-span observations do not approve migration.
