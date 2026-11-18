# Draft: sass-parser loses a comment between @if and @else

Unpublished. No exact matching issue found in the 2026-11-18 title/body search. This concerns exposed parser comments, not a requirement for Sass compilation to emit every source comment.

In a fresh directory, install `sass-parser@0.5.6`, `sass@1.108.2`, `postcss@8.5.32` with `npm install --ignore-scripts`. Save as `reproduction.cjs` and run `node reproduction.cjs`:

```js
const { scss } = require("sass-parser");
const input = "@if true {.a{width:1px}} /* keep branch */ @else {.a{width:2px}}";
const root = scss.parse(input);
const comments = [];
root.walkComments(node => comments.push(node.text));
console.log(comments);
console.log(root.toString());
```

Actual: empty comment inventory; the first print omits `keep branch`. Sass 1.108.2 compiles the input. No sorting, mutation, Prettier or second pass is needed.

Expected for source transformations: retain the comment in the exposed tree or provide a supported representation for inter-branch trivia. Original spacing and separate PostCSS comment siblings specifically are unnecessary. The full source text still contains the comment; this report concerns the comment walk and default output. Since formatting metadata is documented as incomplete, maintainers may classify this as unsupported trivia rather than a regression.

Measured on Node 22.17.0 with Sass 1.108.2/PostCSS 8.5.32. [Full collector, exact hash and search scope](../README.md).
