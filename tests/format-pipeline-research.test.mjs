import { test } from "uvu";
import * as assert from "uvu/assert";
import nodeAssert from "node:assert/strict";
import prettier from "prettier";
import stock from "../src/index.mjs";
import { createPipelinePlugin, phaseClock } from "../scripts/format-pipeline-variants.mjs";

test("Direct and unchanged-text research paths preserve public formatting across presets and trivia", async () => {
    const sources = [
        ".z { width:1px; /* before */ color:red; @media (min-width:1px) { margin:0; } margin-left:1px; } .a { height:2px; }",
        "\ufeff.a {\r\n width:1px; // tail\r\n color:red;\r\n}",
        ".a { font: { size:1px; weight:700; } @if $x { color:red; } /* branch */ @else { color:blue; } --Token:0; all:initial; }",
        ".a { width:1px; /* prettier-ignore */ .b {width:1px;color:red} /* end */ color:red; }",
        ".a { width:1px; color:red; } /*# sourceMappingURL=missing.css.map */"
    ];
    for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"])
        for (const safety of ["strict", "loose"])
            for (const split of [false, true])
                for (const source of sources) {
                    const options = {
                        parser: "scss",
                        grundyScssSorterPreset: preset,
                        grundyScssSorterSafety: safety,
                        grundyScssSorterWithRoot: split,
                        grundyScssSorterSplitGroup: split
                    };
                    const expected = await prettier.format(source, { ...options, plugins: [stock] });
                    for (const kind of ["direct", "skip-unchanged"]) {
                        const config = { ...options, plugins: [createPipelinePlugin(kind)] };
                        assert.is(await prettier.format(source, config), expected, kind);
                        assert.is(await prettier.format(expected, config), expected, kind + " idempotence");
                    }
                }
});

test("Unchanged-text experiment skips serialization only when final mutations permit it", async () => {
    const events = [],
        plugin = createPipelinePlugin("skip-unchanged", { observe: e => events.push(e) });
    const original = ".a { width:1px; color:red; }";
    const ready = await prettier.format(original, { parser: "scss", plugins: [stock] });
    const options = { parser: "scss", plugins: [plugin] };
    assert.is(await prettier.format(original, options), ready);
    assert.ok(events.at(-1).serialized);
    assert.is(await prettier.format(ready, options), ready);
    assert.is(events.at(-1).serialized, false);
});

test("Coarse pipeline clocks preserve plain and stock output and balance failed parses", async () => {
    const input = ".a { width:1px; @media (min-width:1px) { color:red; } color:blue; }";
    for (const formatter of ["plain", "strict", "loose"]) {
        const clock = phaseClock(),
            plain = formatter === "plain";
        const config = { parser: "scss", ...(plain ? {} : { grundyScssSorterSafety: formatter }) };
        const expected = await prettier.format(input, { ...config, ...(plain ? {} : { plugins: [stock] }) });
        const plugin = createPipelinePlugin(plain ? "profile-plain" : "profile", { clock });
        const start = performance.now();
        assert.is(await prettier.format(input, { ...config, plugins: [plugin] }), expected);
        const elapsed = performance.now() - start;
        assert.ok(clock.result.prettierParse.calls > 0);
        assert.ok(Object.values(clock.result).reduce((n, p) => n + p.exclusiveMs, 0) <= elapsed + 0.1);
        if (!plain) assert.ok(clock.result.sorting.calls > 0 && clock.result.serialization.calls > 0);
        await nodeAssert.rejects(() => prettier.format(".a {", { ...config, plugins: [plugin] }));
        clock.reset();
    }
});

test.run();
