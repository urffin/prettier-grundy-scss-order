# Draft: sass-parser's printed footer comment is lost on reparse

Unpublished. No exact matching issue found in the 2026-11-18 title/body search. [Root raws PR #2915](https://github.com/sass/dart-sass/pull/2915) does not establish a fix for this nested-rule case.

In a fresh directory, install `sass-parser@0.5.6`, `sass@1.108.2`, `postcss@8.5.32` with `npm install --ignore-scripts`. Save as `reproduction.cjs` and run `node reproduction.cjs`:

```js
const { scss } = require("sass-parser");
const input = ".a { width: 1px; /* keep footer */ }";
const first = scss.parse(input).toString();
const second = scss.parse(first).toString();
console.log(first);
console.log(second);
console.log(first.includes("keep footer"), second.includes("keep footer"));
```

Actual: `true false`. The first output contains the footer but omits the preceding declaration semicolon. Its reparsed comment walk is empty; the second output loses the footer. The package's own output causes this, without another formatter.

Expected: preserve comment content when reparsing default printed output; original whitespace is unnecessary. This establishes a parser/stringifier interaction, not which internal component owns the fix.

Diagnostic only: setting `rule.raws.semicolon = true` once retains the marker on the next pass. Without repeating that intervention, the third print loses it. This is not a complete workaround or proposed production patch.

Measured on Node 22.17.0 with Sass 1.108.2/PostCSS 8.5.32. [Three-pass collector and search scope](../README.md).
