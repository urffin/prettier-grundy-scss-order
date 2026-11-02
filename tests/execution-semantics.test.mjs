import prettier from "prettier";
import { compileString } from "sass";
import plugin from "../src/index.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

const compilationOptions = {
    importers: [
        {
            canonicalize(url) {
                return url === "theme" ? new URL("test:theme") : null;
            },
            load() {
                return { contents: "$color: red; @mixin paint { color: $color; }", syntax: "scss" };
            }
        }
    ]
};

const fixtures = [
    ["local reassignment", ".a { $size: 1px; width: $size; $size: 2px; height: $size; }"],
    ["root reassignment", "$color: red; .before { color: $color; } $color: blue; .after { color: $color; }"],
    [
        "default assignment",
        ".a { $size: null; width: if(sass($size): $size; else: 1px); $size: 2px !default; height: $size; }"
    ],
    ["mixin overrides", "@mixin paint { color: green; } .a { color: red; @include paint; color: blue; }"],
    [
        "mixin variable effects",
        "$size: 1px; @mixin resize { $size: 2px !global; } .a { width: $size; @include resize; height: $size; }"
    ],
    ["content callback", "@mixin paint { color: red; @content; color: blue; } .a { @include paint { color: green; } }"],
    [
        "conditional assignment",
        "$size: 1px; .a { width: $size; @if false { $size: 3px; } @else { $size: 2px; } height: $size; }"
    ],
    ["nested global assignment", "$size: 1px; .a { width: $size; .nested { $size: 2px !global; } height: $size; }"],
    [
        "module reassignment",
        '@use "theme"; .before { color: theme.$color; } theme.$color: blue; .after { @include theme.paint; }'
    ]
];

for (const [name, source] of fixtures) {
    test(`Preserves compiled CSS for ${name}`, async () => {
        const before = compileString(source, compilationOptions).css;
        for (const withRoot of [true, false]) {
            const config = {
                parser: "scss",
                plugins: [plugin],
                grundyScssSorterWithRoot: withRoot,
                grundyScssSorterSplitGroup: true
            };
            const formatted = await prettier.format(source, config);
            assert.equal(compileString(formatted, compilationOptions).css, before);
            assert.equal(await prettier.format(formatted, config), formatted, "Formatting must be idempotent");
        }
    });
}

test.run();
