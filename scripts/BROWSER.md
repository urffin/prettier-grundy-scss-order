# Prettier standalone browser check

The plugin can be bundled with [Prettier standalone](https://prettier.io/docs/browser). Use a bundler that honors package `browser` mappings; the check uses esbuild's `platform: "browser"` without Node polyfills or custom shims. This is not a prebuilt browser distribution or a test of the deployed playground.

```js
import * as prettier from "prettier/standalone";
import postcssPlugin from "prettier/plugins/postcss";
import sorter from "prettier-grundy-scss-order";

const result = await prettier.format(".card { width: 1px; color: red; }", {
    parser: "scss",
    plugins: [postcssPlugin, sorter],
    grundyScssSorterSafety: "strict"
});
```

Standalone requires explicit plugins: the native PostCSS plugin supplies the printer, and the sorter comes last to replace its SCSS parser. Pass configuration values directly; standalone does not discover configuration or ignore files. Both safety modes, aliases and presets use the same public options as Node.js.

## Source maps

PostCSS's own browser mappings disable filesystem/path APIs and `source-map-js`. Its browser parser consequently does not decode previous inline or external maps. Ordinary input takes the direct path; a root `sourceMappingURL` comment still selects Processor fallback. A nested annotation alone does not select fallback in the browser, because there is no parsed previous map.

Fallback preserves the installed Processor's browser behavior. In the verified PostCSS 8.5.33 build, annotations remain unchanged; an older supported build can remove root annotations. Node.js can instead parse/regenerate maps and reject malformed or unsupported encodings that the browser leaves as comments. The smoke report records these differences separately and compares the CSS after removing map annotations. All other cases require byte-identical Node/browser output or matching diagnostics.

Preserved map annotations may describe the original input and be stale after sorting/printing. Neither runtime guarantees that a final map describes Prettier's printed output. This check does not add browser source-map support, filesystem shims or a runtime policy change.

## Run from a repository checkout

Browser tooling is grouped in `scripts/browser/`: `runner.mjs` prepares and serves the smoke, `cases.mjs` defines inputs, `runtime.mjs` runs each case, `page.mjs` drives the browser, `verification.mjs` checks results, and `dependencies.mjs` selects and verifies the installed dependency profile. `scripts/test-browser.mjs` remains the CLI and re-exports its existing programmatic functions. Commands, report schemas, evidence filenames and CI artifact names are unchanged. Source-hash verification should read `scripts/browser/runtime.mjs` for the report's existing `sourceHashes.runtime` field.

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:browser -- --output browser-results.json
```

The command packs the current checkout, installs the tarball and the selected Prettier version in a temporary consumer, builds its browser bundle, prepares independent Node.js outputs and runs headless Chromium on a loopback page. The temporary consumer is removed after completion. Playwright and esbuild are development dependencies only.

To use an existing installed package, including a published version, pass `--package-root /consumer/node_modules/prettier-grundy-scss-order`. It uses that consumer's Prettier and PostCSS. For a manually opened browser, use `--serve`: the command prints a local URL, waits for the page to submit results and launches no browser or debugger. In PowerShell, use `npm.cmd` if the shim consumes `--`.

The 342 cases cover all 18 pinned regression fixtures across five presets and strict/loose, BOM/CRLF and comment-only/empty input, comments and ignore directives, root/group spacing combinations, aliases, configuration/syntax diagnostics, root/nested/missing/inline/malformed map annotations. Each success is checked against an explicit Processor reference and a second formatting pass. Sparse generated maps normalize only random PostCSS input source IDs for within-Node reference comparison; map-free CSS is compared separately across runtimes. Empty input can use Prettier's own fast path without calling the parser.

`browser-results.json` records package/dependency versions, bundle/input/source hashes, browser environment, per-case output hashes and direct/fallback call counts. Its sibling `browser-results.evidence` directory retains raw Node/browser results, cases, metadata and the generated bundle. Failed comparisons exit nonzero. Unit tests reject missing/duplicate results, changed comments/output, wrong integration paths and map-policy exceptions that alter CSS.

CI runs this check in the existing Node.js 24/Linux matrix with minimum Prettier 3.8.1 and the latest 3.x. Each run uploads a separate `browser-results-prettier-*` artifact with the report and JSON evidence for 14 days. The bundle and browser reports are excluded from the npm package. This is a Chromium smoke check, not a cross-engine guarantee, a performance benchmark or a proof of Sass/CSS semantic equivalence.

## Runtime dependency matrix

Four additional Node.js 24/Linux CI jobs run every minimum/latest combination of `postcss` and `postcss-scss`, using the checkout's locked Prettier. Each installs the actual plugin tarball in a fresh consumer and runs the same 342 Node/browser cases: both safety modes, all presets, comments/ignore, direct/fallback, valid and invalid maps. These jobs also gate releases through the reusable checks workflow.

```sh
npm run test:browser -- --postcss minimum --postcss-scss latest --output browser-results.json
```

Pass both selectors. `minimum` is the exact lower bound from the plugin's declared caret range (currently PostCSS 8.5.8 and postcss-scss 4.0.9). `latest` uses npm's fresh resolution within that range, rather than an unrestricted dist-tag or a prerelease. All four combinations run even when a package's minimum and latest resolve to the same version. A future unsupported range shape fails explicitly. These selectors cannot be combined with `--package-root`; `--serve` remains available.

The temporary consumer declares and overrides both runtime packages. Before formatting, the check verifies loaded versions against its lockfile and checks that the plugin and SCSS parser resolve the same PostCSS instance. It rejects minimum-version drift, out-of-range/prerelease versions and unexpected nested versions. Repository dependency ranges and lockfile are unchanged.

The additive JSON `dependencies` field records selection, declared/requested ranges, exact resolved versions, tarball URLs and integrity, the consumer manifest, full installation lockfile and its canonical JSON SHA-256. `versions` still records the actual Node/Prettier/PostCSS/postcss-scss/esbuild versions. CI uploads `runtime-dependencies-postcss-{minimum|latest}-scss-{minimum|latest}` with the report and raw JSON evidence for 14 days; the generated bundle is not uploaded.

Map annotation retention can differ between supported PostCSS versions. Every profile must match its own Processor reference and the documented Node/browser policy; only map annotations and generated input IDs receive the existing narrow normalization. CSS, comments and integration call counts keep their existing checks. These results do not prove that preserved maps describe the final Prettier output.

See also [development checks](DEVELOPMENT.md) and the [Russian guide](BROWSER.ru.md).
