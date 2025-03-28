import prettier from "prettier";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("Should sort media and variables", async () => {
    const result = await prettier.format(
        `
            $bgColor: 0.36;
            @media hover {
                color: red;
            }

            --color: 0.36;`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["--variable", "@media", "$variable"]
        }
    );

    assert.equal(
        result,
        `--color: 0.36;

@media hover {
  color: red;
}

$bgColor: 0.36;
`
    );
});

test("Should sort supports", async () => {
    const result = await prettier.format(
        `
            --color: 0.36;
            @supports (display: flex) {
                  .flex-container {
                    display: flex;
                }
            }
            @media hover {
               color: red;
            }`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["@media", "@supports", "--variable"]
        }
    );

    assert.equal(
        result,
        `@media hover {
  color: red;
}

@supports (display: flex) {
  .flex-container {
    display: flex;
  }
}

--color: 0.36;
`
    );
});

test.run();
