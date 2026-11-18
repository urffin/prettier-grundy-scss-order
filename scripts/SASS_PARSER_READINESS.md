# sass-parser readiness [Русский](SASS_PARSER_READINESS.ru.md)

This opt-in probe reproduces the parser-migration blockers without changing the production `postcss-scss` parser, sorter or dependencies. The six [minimal fixtures](../tests/fixtures/sass-parser/README.md) cover percentage keyframes, branch/footer comments, ignored text, whitespace metadata and an ordinary control.

The [2026-11-18 upstream triage](../tests/fixtures/sass-parser/upstream/README.md) distinguishes three parser/printing candidates from two adapter requirements. It includes a standalone collector and unpublished issue drafts. Root raws work is separate from declaration `raws.before`; source spans recover ignored text in the measured example, but no migration adapter has been implemented or approved. The existing gate stays unchanged.

```sh
npm ci
npm run research:sass-parser -- --version 0.5.3 --output /external/directory/sass-parser-results.json
```

Specify an exact published version, including a prerelease if needed. Tags, ranges, Git URLs and filesystem package specs are rejected. The command installs only the selected candidate in a fresh OS temporary project from the official npm registry, with lifecycle scripts disabled. It loads and tests the candidate in a fresh Node.js worker and removes only its own temporary project afterwards. Repository `package.json`, lockfile and `node_modules` are not modified. Registry access is required for this mode.

Transitive candidate dependencies can change between runs even with an exact parser version. The JSON therefore embeds the actual temporary manifest and npm lockfile, a `JSON.stringify(packageLock)` SHA-256, candidate dependency versions and entry/package hashes. To replay that dependency tree, save `installation.packageJSON` and `installation.packageLock` as `package.json` and `package-lock.json` in another isolated directory and run `npm ci --ignore-scripts` there. Then use the existing-package mode:

```sh
npm run research:sass-parser -- --version 0.5.3 --package-root /isolated/node_modules/sass-parser --output /external/directory/recheck.json
```

`--package-root` needs no install or network. The worker still checks the package name and exact requested version; that supplied installation is not changed or deleted. The report records `installation.kind: "existing-package"` and dependency versions/hashes, but does not claim a new lockfile was created. On Windows use `npm.cmd` if the PowerShell shim consumes the `--` separator.

## Report and exit codes

Schema version 1 records runtime/worker identity, exact candidate and reference versions, fixture/input hashes, input/first/second text, per-check `pass` / `fail` / `skipped`, structured parser errors and aggregate counts. All fixture inputs are first compiled with the repository's Dart Sass to reject invalid test data. No candidate stylesheet is compiled as evidence of semantic equivalence.

- `completed: true` means the research ran; `status: "blocked"` is a valid measured result.
- `minimumChecksPassed` and `readyForCorpus` become true only when every check on every minimal fixture passes. Skipped checks do not count as passing.
- `migrationApproved` is always false. A passing minimal probe only permits the next investigation: the pinned full corpus, then an adapter, browser integration and performance checks.
- Installation/import/API/fixture problems produce `completed: false`, `status: "error"` and `error.phase`; they cannot be mistaken for parser readiness.

The default exit code is **0** for completed research, including measured blockers, and **1** for infrastructure or CLI errors. Add `--require-pass` to get **2** for measured blockers, for example in an explicit readiness gate:

```sh
npm run research:sass-parser -- --version 0.5.3 --require-pass --output /external/directory/gate.json
```

The versioned candidate is not added to the regular compatibility matrix. `npm test` runs offline fixture/evaluator/CLI regression tests with a synthetic candidate in a fresh worker. The probe does not run the full corpus automatically, introduce a production adapter or approve migration. It does not measure speed, memory or browser support. See the [official parser README](https://github.com/sass/dart-sass/tree/main/pkg/sass-parser#readme) for its own development status; readiness for this formatter must be established with the recorded checks.

## GitHub Actions: manual and weekly

The separate [Sass parser readiness workflow](../.github/workflows/sass-parser-readiness.yml) offers a manual exact-version input. Its weekly schedule runs on Mondays at **06:23 UTC / 09:23 Europe/Moscow**, on the default branch. Scheduled runs query the official npm `latest` endpoint, validate and record an exact stable version and integrity, then use that fixed version for the probe. Prereleases remain available through manual input. Every weekly run checks the current dependency tree, even if the parser version has not changed.

The workflow uses Node.js 24 and read-only repository permissions. Its result is independent of the ordinary push/PR matrix:

- `passed`: minimal fixtures pass; investigation of the full corpus remains necessary.
- `blocked`: research completed and reproduced blockers. The job succeeds, with blockers listed in its summary.
- `error`: selection, setup, installation, import, API or report validation failed. The probe step fails and the job is red.

An error placeholder JSON is initialized before `npm ci` using Node built-ins only. An `always()` summary step and artifact upload preserve evidence after dependency/probe failures. Failures before checkout or Node setup cannot produce that placeholder. The artifact **`sass-parser-readiness-results`** is retained for 30 days: a schema-1 `kind: "sass-parser-readiness-ci"` envelope with status, GitHub run/commit context, version selection and the complete research report; raw `*.probe.json` is also included when the probe ran. A scheduled selection's integrity must match the installed lockfile. The wrapper also rejects inconsistent counts, flags, inputs or missing checks. These files are excluded from npm.

`npm run research:sass-parser:ci` is the workflow wrapper. It reads `SASS_PARSER_VERSION` for `workflow_dispatch`; `schedule` resolves npm `latest`. `--initialize` and `--summarize` are internal bootstrap/report modes that run without installed dependencies. `SASS_PARSER_REPORT` overrides the JSON location, otherwise it uses `RUNNER_TEMP` (or the current directory locally). Exit 0 covers `passed` and `blocked`; execution errors exit 1. The standalone research command's `--require-pass` exit-2 behavior is unchanged.

GitHub's [`release` trigger](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release) concerns releases in this repository, so it does not subscribe to another package's npm publications. An immediate upstream-publication trigger would require an external listener calling `repository_dispatch` or `workflow_dispatch`; no such listener is configured. Weekly polling provides the automated check here. GitHub [scheduled runs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) may be delayed, and public-repository schedules can be disabled after 60 days without repository activity. The workflow becomes available after its file reaches the default branch. It never changes the production parser or publishes a release.
