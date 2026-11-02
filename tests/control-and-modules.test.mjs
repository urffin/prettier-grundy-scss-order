import prettier from "prettier";
import { compileString } from "sass";
import plugin from "../src/index.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

async function format(source, options = {}) {
    const config = { parser: "scss", plugins: [plugin], ...options };
    const result = await prettier.format(source, config);
    assert.equal(await prettier.format(result, config), result, "Formatting must be idempotent");
    return result;
}

async function check(source, expected = source, options = {}) {
    assert.equal(await format(source, options), await prettier.format(expected, { parser: "scss" }));
}

for (const directive of [
    "@if true { color: green; }",
    "@if false { color: green; } @else if false { color: pink; } @else { color: yellow; }",
    "@for $i from 1 through 2 { color: green; }",
    "@each $color in green, yellow { color: $color; }",
    "@while false { color: green; }"
]) {
    test(`Preserves position and compiled CSS of ${directive}`, async () => {
        const source = `.a { color: red; ${directive} color: blue; }`;
        for (const withRoot of [true, false]) {
            const result = await format(source, { grundyScssSorterWithRoot: withRoot });
            assert.equal(result, await prettier.format(source, { parser: "scss" }));
            assert.equal(compileString(result).css, compileString(source).css);
        }
    });
}

test("Sorts independently inside and around branches without splitting the chain", async () => {
    await check(
        ".a { width: 1px; color: red; @if $flag { width: 2px; color: green; }\n // alternative\n @else { width: 3px; color: blue; } padding: 0; display: block; }",
        ".a { color: red; width: 1px; @if $flag { color: green; width: 2px; }\n // alternative\n @else { color: blue; width: 3px; } display: block; padding: 0; }"
    );
});

test("Pins enclosing blocks containing control flow", async () => {
    await check(".a { color: red; .child { @if true { color: green; } } color: blue; }");
});

test("Preserves return order even when custom groups try to move it", async () => {
    const source = "@function pick() { @if true { @return red; } @return blue; } .a { color: pick(); }";
    const result = await format(source, {
        grundyScssSorterGroupsOrder: ["returns", "@if", "rule"],
        grundyScssSorterGroups: JSON.stringify({ returns: { type: "atrule", startsWith: "blue" } })
    });
    assert.equal(compileString(result).css, compileString(source).css);
    assert.equal(result, await prettier.format(source, { parser: "scss" }));
});

for (const name of ["warn", "debug", "error"]) {
    test(`Keeps @${name} between surrounding statements`, async () => {
        await check(`.a { width: 1px; @${name} "message"; color: red; }`);
    });
}

const modules = {
    zeta: ".shared { color: red; }",
    alpha: ".shared { color: blue; }",
    theme: "$color: red !default; .theme { color: $color; }",
    config: "$color: green;"
};
const compilationOptions = {
    importers: [
        {
            canonicalize(url) {
                return Object.hasOwn(modules, url) ? new URL(`test:${url}`) : null;
            },
            load(url) {
                return { contents: modules[url.pathname], syntax: "scss" };
            }
        }
    ]
};

const moduleFixtures = [
    ["mixed forward/use CSS order", '@forward "zeta"; @use "alpha";'],
    ["forward configuration before use", '@forward "theme" with ($color: blue); @use "theme"; .a { color: theme.$color; }'],
    ["use configuration before forward", '@use "theme" with ($color: blue); @forward "theme";'],
    ["module dependency in configuration", '@use "config"; @forward "theme" with ($color: config.$color);'],
    ["variable before use configuration", '$color: blue; @use "theme" with ($color: $color);'],
    ["forward before local CSS", '@forward "theme"; .a { color: blue; }']
];

for (const [name, source] of moduleFixtures) {
    test(`Preserves ${name} across presets`, async () => {
        const css = compileString(source, compilationOptions).css;
        for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"]) {
            const result = await format(source, { grundyScssSorterPreset: preset, grundyScssSorterSplitGroup: true });
            assert.equal(compileString(result, compilationOptions).css, css);
        }
    });
}

for (const name of ["use", "forward"]) {
    test(`Custom alphabetical groups cannot reorder @${name}`, async () => {
        const source = `@${name} "zeta"; @${name} "alpha";`;
        const options = {
            grundyScssSorterGroupsOrder: ["modules"],
            grundyScssSorterGroups: JSON.stringify({ modules: { startsWith: '"', order: "alphabetical" } })
        };
        await check(source, source, options);
        assert.equal(
            compileString(await format(source, options), compilationOptions).css,
            compileString(source, compilationOptions).css
        );
    });
}

test("Does not silently repair invalid module placement by hoisting it", async () => {
    await check('.a { color: red; } @use "theme";');
});

test("Preserves legacy imports and their position among declarations", async () => {
    await check('.a { color: red; @import "theme"; color: blue; }');
});

test("Keeps module comments and group spacing without moving module loads", async () => {
    await check(
        '// exports\n@forward "theme"; // public\n// local\n@use "theme";\n.a { width: 1px; color: red; }',
        '// exports\n@forward "theme"; // public\n\n// local\n@use "theme";\n\n.a { color: red; width: 1px; }',
        { grundyScssSorterSplitGroup: true }
    );
});

test("Preserves diagnostic execution order around a conditional", async () => {
    const source = '@debug "before"; @if true { @warn "middle"; } @debug "after";';
    function messages(text) {
        const log = [];
        compileString(text, {
            logger: {
                debug(message) {
                    log.push(["debug", message]);
                },
                warn(message) {
                    log.push(["warn", message]);
                }
            }
        });
        return log;
    }
    assert.equal(messages(await format(source)), messages(source));
});

test("Keeps forwarding compatible with downstream module configuration", async () => {
    const entry = '@forward "theme"; @use "theme"; .local { color: theme.$color; }';
    function compileEntry(contents) {
        return compileString('@use "entry" with ($color: blue);', {
            importers: [
                {
                    canonicalize(url) {
                        return url === "entry" ? new URL("test:entry") : compilationOptions.importers[0].canonicalize(url);
                    },
                    load(url) {
                        return url.pathname === "entry" ?
                                { contents, syntax: "scss" }
                            :   compilationOptions.importers[0].load(url);
                    }
                }
            ]
        }).css;
    }
    assert.equal(compileEntry(await format(entry)), compileEntry(entry));
});

test("Preserves module visibility and prefix clauses", async () => {
    await check('@forward "theme" as theme-* show $color; @use "theme" as local; .a { color: local.$color; }');
});

test.run();
