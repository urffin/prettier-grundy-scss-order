# Draft: sass-parser rejects percentage selectors in valid @keyframes

Unpublished. No exact matching issue found in the 2026-11-18 title/body search. [PR #2670](https://github.com/sass/dart-sass/pull/2670) is related history; this draft does not establish that it introduced the failure.

In a fresh directory, install `sass-parser@0.5.6`, `sass@1.108.2`, `postcss@8.5.32` with `npm install --ignore-scripts`. Save as `reproduction.cjs` and run `node reproduction.cjs`:

```js
const { scss } = require("sass-parser");
const sass = require("sass");
const input = "@keyframes spin {0% {opacity:0} 100% {opacity:1}}";
console.log(sass.compileString(input).css);
console.log(scss.parse("@keyframes spin {from {opacity:0} to {opacity:1}}").toString());
console.log(scss.parse(input).toString());
```

Actual: Dart Sass compiles the percentages, and `from`/`to` parses. Parsing the percentage input throws `expected selector` at `0%` (line 1, column 18).

Expected: parse valid percentage keyframe selectors, or explicitly track this restriction. No original-whitespace preservation is required. No Prettier, sorter, PostCSS plugin or AST mutation participates.

Measured on Node 22.17.0. Parser entry SHA-256: `1c8c5e24e02d9fa8400bbc87f222ec73e062cba3a4a383fccb79cfa0dd42dd92`, matching the earlier Node 24.22.2 readiness run. [Full collector and search scope](../README.md).
