# sass-parser readiness [Русский](SASS_PARSER_READINESS.ru.md)

This opt-in probe reproduces the parser-migration blockers without changing the production `postcss-scss` parser, sorter or dependencies. The six [minimal fixtures](../tests/fixtures/sass-parser/README.md) cover percentage keyframes, branch/footer comments, ignored text, whitespace metadata and an ordinary control.

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
