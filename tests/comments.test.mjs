import prettier from "prettier";
import plugin from "../src/index.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

async function check(source, expected, options = {}) {
    const config = { parser: "scss", plugins: [plugin], ...options };
    const result = await prettier.format(source, config);
    assert.equal(result, await prettier.format(expected, { parser: "scss" }));
    assert.equal(await prettier.format(result, config), result, "Formatting must be idempotent");
}

test("Keeps a trailing line comment with a declaration moved to the end", async () => {
    await check(".a { z-index: 1; // layer\n color: red; }", ".a { color: red; z-index: 1; // layer\n }");
});

test("Terminates a trailing line comment before a declaration moved from the first position", async () => {
    await check(".a { z-index: 1; color: red; // color\n }", ".a { color: red; // color\n z-index: 1; }");
});

test("Keeps leading line and block comments with their declaration", async () => {
    await check(
        ".a {\n // layer\n /* explanation */\n z-index: 1;\n // color\n color: red;\n }",
        ".a {\n // color\n color: red;\n // layer\n /* explanation */\n z-index: 1;\n }"
    );
});

test("Keeps trailing block comments with their declaration", async () => {
    await check(".a { z-index: 1; /* layer */ color: red; }", ".a { color: red; z-index: 1; /* layer */ }");
    await check(".a { z-index: 1; color: red; /* color */ }", ".a { color: red; /* color */ z-index: 1; }");
});

test("Keeps a standalone footer at the end of its container", async () => {
    await check(".a { z-index: 1; color: red;\n // footer\n }", ".a { color: red; z-index: 1;\n // footer\n }");
});

test("Splits groups before their leading comments and keeps trailing comments inline", async () => {
    await check(
        ".a {\n // layer\n z-index: 1; // keep\n // token\n --color: red;\n }",
        ".a {\n // token\n --color: red;\n\n // layer\n z-index: 1; // keep\n }",
        { grundyScssSorterSplitGroup: true }
    );
});

test("Keeps comments within an if/else chain", async () => {
    await check(
        ".a { z-index: 1;\n @if $a { color: red; }\n // alternative\n @else if $b { color: blue; }\n /* fallback */\n @else { color: green; } }",
        ".a { z-index: 1; @if $a { color: red; }\n // alternative\n @else if $b { color: blue; }\n /* fallback */\n @else { color: green; } }"
    );
});

test("Keeps prettier-ignore and its subtree untouched as a sorting boundary", async () => {
    await check(
        ".a { z-index: 1; color: red;\n // prettier-ignore\n .nested { z-index:1; color:red; }\n width: 1px; display: block; }",
        ".a { color: red; z-index: 1;\n // prettier-ignore\n .nested { z-index:1; color:red; }\n display: block; width: 1px; }"
    );
});

test("Handles root comments, comment-only containers, and CRLF", async () => {
    await check(
        "// rule\r\n.a { /* only */ }\r\n// module\r\n@use 'colors';\r\n// footer",
        "// rule\n.a { /* only */ }\n// module\n@use 'colors';\n// footer"
    );
});

test("Honors root prettier-ignore even when root sorting is disabled", async () => {
    await check(
        "/* prettier-ignore */\n.a { z-index:1; color:red; }\n.b { z-index: 1; color: red; }",
        "/* prettier-ignore */\n.a { z-index:1; color:red; }\n.b { color: red; z-index: 1; }",
        { grundyScssSorterWithRoot: false, grundyScssSorterSplitGroup: true }
    );
});

test("Keeps comments on nested rules and includes when splitting individual items", async () => {
    await check(
        ".a {\n // child\n .child { z-index: 1; color: red; } // child end\n // mixin\n @include paint; // mixin end\n }",
        ".a {\n // child\n .child { color: red; z-index: 1; } // child end\n\n // mixin\n @include paint; // mixin end\n }",
        { grundyScssSorterSplitGroup: true }
    );
});

test.run();
