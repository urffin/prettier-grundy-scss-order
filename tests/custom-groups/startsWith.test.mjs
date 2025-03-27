import prettier from "prettier";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("Should create custom group by startsWith", async () => {
    const result = await prettier.format(
        `
            font-family: "Courier New", Courier, monospace;
            font-size: large;
            --color: 0.36;
            --bgColor: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["--variable", "fonts"],
            grundyScssSorterGroups: JSON.stringify({ fonts: { startsWith: "font" } })
        }
    );

    assert.equal(
        result,
        `--color: 0.36;
--bgColor: 0.36;

font-family: "Courier New", Courier, monospace;
font-size: large;
`
    );
});

test("Should create custom group by startsWith includes", async () => {
    const result = await prettier.format(
        `
            @include fonts;
            font-family: "Courier New", Courier, monospace;
            font-size: large;
            --color: 0.36;
            --bgColor: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["--variable", "fonts", "@include"],
            grundyScssSorterGroups: JSON.stringify({ fonts: { startsWith: "font" } })
        }
    );

    assert.equal(
        result,
        `--color: 0.36;
--bgColor: 0.36;

@include fonts;
font-family: "Courier New", Courier, monospace;
font-size: large;
`
    );
});

test("Should create custom group by startsWith with type", async () => {
    const result = await prettier.format(
        `
            @include fonts;
            font-family: "Courier New", Courier, monospace;
            font-size: large;
            --color: 0.36;
            --bgColor: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["--variable", "fonts", "@include"],
            grundyScssSorterGroups: JSON.stringify({ fonts: { startsWith: "font", type: "decl" } })
        }
    );

    assert.equal(
        result,
        `--color: 0.36;
--bgColor: 0.36;

font-family: "Courier New", Courier, monospace;
font-size: large;

@include fonts;
`
    );
});

test.run();
