# Regression and benchmark corpus

The two sets have different purposes. CI reads only the committed snapshots in this directory. It does not fetch projects or inspect a developer's working directories.

## Regression fixtures

`regressions/manifest.json` describes 15 small, self-contained examples: five adapted from patterns in the real corpus and ten authored to cover missing constructs. Origins and covered features are recorded per fixture. The authored cases add modules (`@use`/`@forward` and module assignments), loops, functions, interpolation, nested properties, `@content ... using`, `!default`/`!global`, conflict families and ignored subtrees.

`input.scss`, `strict.scss` and `loose.scss` are reviewed characterization fixtures from runtime 0.4.6. Tests never regenerate expected files. Plain Prettier normalizes printer whitespace in the expected files for the installed supported version; the saved ordering remains the oracle. Supporting partials make Sass examples compilable without application dependencies.

`npm test` checks all five presets, both modes and both group-spacing settings: frozen default outputs, comments, ignored text, idempotence and strict compiled CSS. Three explicitly marked examples allow independent declaration ordering and instead preserve each property's compiled value sequence. These projections are not a general CSS equivalence proof. Loose has explicit default compile outcomes, including intentionally invalid import/module ordering; it does not promise semantic equivalence.

## Real whole-file snapshots

`real/manifest.json` records source commit, every path, byte count and SHA-256, plus a project digest. Only CRLF-to-LF normalization is applied; files are not shortened or combined. `.gitattributes` preserves LF on Windows and permits original whitespace in snapshots and the intentional comment-separator input. Snapshots are excluded from automatic formatting and from the npm package.

| Project | Files | Source selection |
| --- | ---: | --- |
| grundyjs.ru | 53 (51 CSS, 2 SCSS) | All committed styles under `app`, `components`, `styles` |
| landos-new | 19 SCSS | Existing audit selection |
| falcon-frontend-main | 36 SCSS | Existing audit selection |
| eywa-neo2 | 44 SCSS | Existing audit selection |

The original audit contained 101 SCSS files from these four local projects. The site's active styles also grow in CSS modules, so its snapshot includes CSS. Exact source revisions and current counts belong to the manifest, not to the benchmark implementation. Snapshots are test data from their source projects; their presence does not change ownership of the original styles.

Each `real-*` benchmark scenario processes one project's files separately, with independent scopes and parser calls. Time is for the whole batch. Sort ASTs are prepared before timing and the memory baseline. All result ASTs/strings remain live through the final memory snapshot. Input/output hashes include file paths and boundaries. JSON `inputs` records scenario kind, files, bytes, input hash and the real corpus's revision, digest and individual file hashes. Synthetic scenario hashes retain their previous definition.

`npm run test:corpus -- --output corpus-results.json` verifies all snapshot hashes and the file inventory, then checks five presets × two modes × two spacing settings (3040 cases for 152 files): parsing, idempotence and preservation of declarations, values, comments and block ancestry. It compares against plain Prettier to account for printer normalization. Real files are not compiled as standalone Sass applications: imports and dependencies may live outside the snapshot. This check does not assert CSS cascade equivalence.

CI runs regression tests across the compatibility matrix. The benchmark job also runs the complete real-file check and uploads `corpus-results.json` separately from the combined time/memory `benchmark-results.json`, both for 14 days. Performance has no thresholds; invariant violations fail CI.

## Refreshing evolving site styles

Refresh explicitly after committing site changes. The updater reads Git blobs from the chosen revision (default `HEAD`), never working-tree edits. It discovers new committed `.css` and `.scss` files under the configured roots. Indented `.sass` syntax is outside this SCSS parser's scope.

```sh
npm run corpus:update -- --project grundyjs.ru --root E:/Source/Repos/grundyjs.ru --check
npm run corpus:update -- --project grundyjs.ru --root E:/Source/Repos/grundyjs.ru --revision HEAD
npm run test:corpus -- --output corpus-results.json
npm test
npm run benchmark -- --scenario real-grundyjs --output benchmark-results.json
```

Use `npm.cmd` in PowerShell if its `npm.ps1` shim consumes `--`. `--check` performs no writes and exits 1 for added, changed, deleted or damaged snapshots. Updating repairs damaged snapshots and removes only obsolete snapshot files listed in the manifest. Source projects are read only. Unrelated source commits with identical selected styles keep the existing provenance. `real/selection.json` controls source roots or the original audit paths; it stores no machine-specific paths.

When reviewing a refresh, inspect changed file hashes/counts, rerun correctness checks and record a new benchmark baseline. A growing input batch changes the workload; timings from different corpus digests cannot demonstrate a sorter regression or improvement by themselves.
