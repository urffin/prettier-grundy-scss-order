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

test("Should split group at rule", async () => {
    const result = await prettier.format(
        `test {
    line-height: 10px;
}
@use "colors";
`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../src/index.mjs")],
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true,
            grundyScssSorterGroupsOrder: ["@use", "$variable", "rule"]
        }
    );

    assert.equal(
        result,
        `@use "colors";

test {
  line-height: 10px;
}
`
    );
});

test("Should split items inside group", async () => {
    const result = await prettier.format(
        `
.warningBlock__close {
    @extend %buttonReset;

    @include utils.media-down(utils.$mobile-breakpoint) {
        @include utils.focus;
        @include utils.transition("color");
        @include utils.hover {
            color: var(--color-ebony);
        }

        margin: -4px;
        margin-left: auto;
        padding: 4px;

        color: var(--color-gray-regent);

        [data-important="false"] & {
            [data-mode="dark"] & {
                @include utils.hover {
                    color: var(--color-white);
                }
            }
        }

        svg {
            display: block;

            fill: currentColor;
        }
    }
    @include utils.media-up(utils.$mobile-breakpoint) {
        display: none;
    }
}
`,
        {
            parser: "scss",
            plugins: [path.resolve(fileURLToPath(import.meta.url), "../../src/index.mjs")],
            tabWidth: 4,
            grundyScssSorterWithRoot: true,
            grundyScssSorterSplitGroup: true
        }
    );

    var expect = `.warningBlock__close {
    @extend %buttonReset;

    @include utils.media-down(utils.$mobile-breakpoint) {
        color: var(--color-gray-regent);
        margin: -4px;
        margin-left: auto;
        padding: 4px;

        @include utils.focus;

        @include utils.transition("color");

        @include utils.hover {
            color: var(--color-ebony);
        }

        [data-important="false"] & {
            [data-mode="dark"] & {
                @include utils.hover {
                    color: var(--color-white);
                }
            }
        }

        svg {
            display: block;
            fill: currentColor;
        }
    }

    @include utils.media-up(utils.$mobile-breakpoint) {
        display: none;
    }
}
`;
    console.log(expect);
    assert.equal(result, expect);
});

test.run();
