import prettier from "prettier";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("Should create custom group by oneOf", async () => {
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
            grundyScssSorterGroupsOrder: ["custom", "--variable"],
            grundyScssSorterGroups: JSON.stringify({ custom: { oneOf: ["--color", "font-size"] } })
        }
    );

    assert.equal(
        result,
        `font-size: large;
--color: 0.36;

--bgColor: 0.36;

font-family: "Courier New", Courier, monospace;
`
    );
});

test("Should create custom group by oneOf with type", async () => {
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
            grundyScssSorterGroupsOrder: ["custom", "--variable"],
            grundyScssSorterGroups: JSON.stringify({ custom: { oneOf: ["--color", "font-size"], type: "decl" } })
        }
    );

    assert.equal(
        result,
        `font-size: large;

--color: 0.36;
--bgColor: 0.36;

font-family: "Courier New", Courier, monospace;
`
    );
});

test("Should create custom group by oneOf and exact", async () => {
    const result = await prettier.format(
        `
            font-size: large;
            --color: 0.36;
            --bgColor: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterGroupsOrder: ["custom", "--variable"],
            grundyScssSorterGroups: JSON.stringify({ custom: { oneOf: ["--color", "font-size"], order: "exact" } })
        }
    );

    assert.equal(
        result,
        `--color: 0.36;
font-size: large;
--bgColor: 0.36;
`
    );
});

test.run();
