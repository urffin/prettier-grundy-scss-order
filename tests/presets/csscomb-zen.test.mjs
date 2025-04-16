import prettier from "prettier";
import path from "path";
import { fileURLToPath } from "url";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("Should sort by preset csscomb-zen", async () => {
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
            grundyScssSorterPreset: "csscomb-zen"
        }
    );

    assert.equal(
        result,
        `.c {
  position: absolute;
  display: block;
  font-size: large;
}
`
    );
});

test("Should handle empty CSS block with csscomb-zen", async () => {
    const result = await prettier.format(
        `
.c {
}
        `,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../../src/index.mjs")],
            grundyScssSorterPreset: "csscomb-zen"
        }
    );

    assert.equal(
        result,
        `.c {
}
`
    );
});

test("Should sort properties with multiple groups using csscomb-zen", async () => {
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
            grundyScssSorterPreset: "csscomb-zen"
        }
    );

    assert.equal(
        result,
        `.c {
  position: relative;
  z-index: 10;
  display: flex;
  font-size: 16px;
}
`
    );
});

test("Should handle unknown properties gracefully with csscomb-zen", async () => {
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
            grundyScssSorterPreset: "csscomb-zen"
        }
    );

    assert.equal(
        result,
        `.c {
  display: block;
  font-size: medium;
  unknown-property: value;
}
`
    );
});

test.run();
