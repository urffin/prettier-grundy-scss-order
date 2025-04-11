import prettier from "prettier";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("Should sort by preset csscomb", async () => {
    const result = await prettier.format(
        `
.c {
    display: block;
    font-size: large;
    position: absolute;
}
        `,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterPreset: "csscomb"
        }
    );

    assert.equal(
        result,
        `.c {
  font-size: large;
  position: absolute;
  display: block;
}
`
    );
});

test("Should handle empty CSS block", async () => {
    const result = await prettier.format(
        `
.c {
}
        `,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterPreset: "csscomb"
        }
    );

    assert.equal(
        result,
        `.c {
}
`
    );
});

test("Should sort properties with multiple groups", async () => {
    const result = await prettier.format(
        `
.c {
    z-index: 10;
    font-size: 16px;
    display: flex;
    position: relative;
}
        `,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterPreset: "csscomb"
        }
    );

    assert.equal(
        result,
        `.c {
  font-size: 16px;
  position: relative;
  z-index: 10;
  display: flex;
}
`
    );
});

test("Should handle unknown properties gracefully", async () => {
    const result = await prettier.format(
        `
.c {
    unknown-property: value;
    display: block;
    font-size: medium;
}
        `,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterPreset: "csscomb"
        }
    );

    assert.equal(
        result,
        `.c {
  font-size: medium;
  display: block;
  unknown-property: value;
}
`
    );
});

test.run();
