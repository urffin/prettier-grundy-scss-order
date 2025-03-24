import prettier from "prettier";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("Should sort css and scss variables", async () => {
    const result = await prettier.format(
        `
            text-decoration-color: green;
            --stroke-opacity: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterGroupsOrder: ["--variable", "$variable"]
        }
    );
    assert.equal(
        result,
        `--stroke-opacity: 0.36;
text-decoration-color: green;
`
    );
});

test.run();
