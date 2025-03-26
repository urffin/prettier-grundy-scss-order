import prettier from "prettier";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("Should split group", async () => {
    const result = await prettier.format(
        `
            color: green;
            background: red;
            --color: 0.36;
            --bgColor: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["--variable", "$variable"]
        }
    );

    assert.equal(
        result,
        `--color: 0.36;
--bgColor: 0.36;

color: green;
background: red;
`
    );
});

test("Should split group last element", async () => {
    const result = await prettier.format(
        `
            color: green;
            --background: red;
            --color: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["--variable", "$variable"]
        }
    );

    assert.equal(
        result,
        `--background: red;
--color: 0.36;

color: green;
`
    );
});

test.run();
