import { test } from "uvu";
import * as assert from "uvu/assert";
import nodeAssert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import prettier from "prettier";
import postcss from "postcss";
import scss from "postcss-scss";
import plugin from "../src/index.mjs";
import { createProcessorPlugin } from "../scripts/processor-reference.mjs";

const processor = createProcessorPlugin();
const format = (source, implementation = plugin, options = {}) =>
    prettier.format(source, { parser: "scss", plugins: [implementation], ...options });
const source =
    ".z { width:1px; /* lead */ color:rgb(1, 2, 3); // tail\n @media (min-width:1px) { color:blue; } margin:0; } .a { height:2px; }";

async function signature(action) {
    try {
        await action();
    } catch (error) {
        return Object.fromEntries(
            ["name", "message", "loc", "reason", "line", "column", "endLine", "endColumn", "plugin"]
                .filter(k => error[k] !== undefined)
                .map(k => [k, error[k]])
        );
    }
    assert.unreachable("Expected a parsing or configuration error");
}

test("Ordinary formatting bypasses Processor; map fallback reuses the parsed tree", async () => {
    const mapped = source + "\n/*# sourceMappingURL=__scss_order_missing__.map */";
    const expectedMapped = await format(mapped, processor);
    const originalProcess = postcss.Processor.prototype.process,
        originalParse = scss.parse;
    let processes = 0,
        parses = 0;
    postcss.Processor.prototype.process = function (...args) {
        processes++;
        return originalProcess.apply(this, args);
    };
    scss.parse = function (...args) {
        parses++;
        return originalParse.apply(this, args);
    };
    try {
        const plain = await format(source);
        assert.is(processes, 0);
        assert.is(parses, 1);
        assert.is(await format(mapped), expectedMapped);
        assert.is(processes, 1);
        assert.is(parses, 2);
        assert.is(await format(source, processor), plain);
        assert.is(processes, 2);
        assert.is(parses, 3);
    } finally {
        postcss.Processor.prototype.process = originalProcess;
        scss.parse = originalParse;
    }
});

test("Empty, comment-only and directive-only input preserve Processor formatting", async () => {
    for (const input of ["", "\ufeff", " \r\n\t", "// last", "/* leading */", ".a{}", "$x:1;", "@use 'sass:math';"])
        for (const safety of ["strict", "loose"]) {
            const options = { grundyScssSorterSafety: safety };
            assert.is(await format(input, plugin, options), await format(input, processor, options));
        }
});

test("Direct output and idempotence match Processor across presets, root and group spacing", async () => {
    const inputs = [
        source,
        "\ufeff.a {\r\n width:1px; // last\r\n color:red;\r\n}",
        ".a { font: { size:1px; weight:700; } @if $x { color:red; } /* branch */ @else { color:blue; } --Token:0; all:initial; }",
        ".a { width:1px; /* prettier-ignore */ .b {width:1px;color:red} /* end */ color:red; }",
        "$size:1px; @use 'theme'; .z { width:$size; @include theme.paint; color:red; &:hover { color:blue; } } // end"
    ];
    for (const preset of ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"])
        for (const safety of ["strict", "loose"])
            for (const root of [false, true])
                for (const split of [false, true])
                    for (const input of inputs) {
                        const options = {
                            grundyScssSorterPreset: preset,
                            grundyScssSorterSafety: safety,
                            grundyScssSorterWithRoot: root,
                            grundyScssSorterSplitGroup: split
                        };
                        const expected = await format(input, processor, options);
                        assert.is(await format(input, plugin, options), expected);
                        assert.is(await format(expected, plugin, options), expected);
                    }
});

test("Explicit Prettier options, pragmas and custom sorting preserve Processor output", async () => {
    const input =
        '/* @format */\r\n.z{width:calc(100% - 2px);content:"long quoted content";color:rgb(1,2,3)}\r\n.a{height:1px}';
    const options = [
        {},
        { singleQuote: true, tabWidth: 4, printWidth: 32, endOfLine: "crlf" },
        { useTabs: true, printWidth: 45, endOfLine: "auto" },
        { requirePragma: true },
        { insertPragma: true },
        {
            grundyScssSorterGroups: JSON.stringify({ sizing: { oneOf: ["width", "height"], order: "exact" } }),
            grundyScssSorterGroupsOrder: ["sizing", "decl"],
            grundyScssSorterWithRoot: false
        }
    ];
    for (const safety of ["strict", "loose", "conservative", "structural"])
        for (const o of options) {
            const opts = { ...o, grundyScssSorterSafety: safety, filepath: "components/example.scss" };
            assert.is(await format(input, plugin, opts), await format(input, processor, opts));
        }
    const unmarked = ".a{width:1px;color:red}";
    assert.is(await format(unmarked, plugin, { requirePragma: true }), unmarked);
});

test("Range formatting and cursor results preserve the Processor contract", async () => {
    for (const safety of ["strict", "loose"]) {
        const common = { parser: "scss", grundyScssSorterSafety: safety, printWidth: 40 };
        for (const cursorOffset of [0, source.indexOf("width"), source.indexOf("margin"), source.length]) {
            const old = await prettier.formatWithCursor(source, { ...common, plugins: [processor], cursorOffset });
            assert.equal(await prettier.formatWithCursor(source, { ...common, plugins: [plugin], cursorOffset }), old);
        }
        const opts = { ...common, rangeStart: source.indexOf("@media"), rangeEnd: source.indexOf("margin") };
        assert.is(await format(source, plugin, opts), await format(source, processor, opts));
    }
});

test("Parser wrappers receive the same native AST and sorted originalText", async () => {
    async function wrapped(implementation) {
        let observed,
            calls = 0;
        const wrapper = {
            ...implementation,
            parsers: {
                scss: {
                    ...implementation.parsers.scss,
                    async parse(text, options) {
                        calls++;
                        const ast = await implementation.parsers.scss.parse(text, options);
                        observed = { type: ast.type, originalText: options.originalText };
                        return ast;
                    }
                }
            }
        };
        const text = await format(source, wrapper);
        return { text, observed, calls };
    }
    const expected = await wrapped(processor),
        actual = await wrapped(plugin);
    assert.equal(actual, expected);
    assert.is(actual.calls, 1);
    assert.is(actual.observed.type, "css-root");
    assert.ok(actual.observed.originalText !== source);
});

test("Map annotations are removed like Processor while unrelated and nested comments survive", async () => {
    const inputs = [
        ".a{width:1px;color:red} /*# sourceMappingURL=__scss_order_missing__.map */",
        "/*# sourceMappingURL=first-missing.map */ .a{color:red} /*# sourceMappingURL=second-missing.map */",
        ".a{color:red} // # sourceMappingURL=__scss_order_missing__.map\n",
        ".a{color:red; /*# sourceMappingURL=__scss_order_missing__.map */ width:1px;}",
        ".a{width:1px;color:red} /* sourceMappingURL=keep-me */ /*# sourceURL=keep-too */"
    ];
    for (const safety of ["strict", "loose"])
        for (const input of inputs) {
            const options = { grundyScssSorterSafety: safety };
            assert.is(await format(input, plugin, options), await format(input, processor, options));
        }
    assert.match(await format(inputs.at(-1)), /sourceMappingURL=keep-me/);
    assert.match(await format(inputs[3]), /sourceMappingURL=__scss_order_missing__/);
});

function inlineMap(text) {
    const match = [...text.matchAll(/\/\*# sourceMappingURL=data:application\/json[^,]*;base64,([^\s*]+)\s*\*\//g)].at(-1);
    assert.ok(match, "Expected generated inline map");
    const map = JSON.parse(Buffer.from(match[1], "base64").toString());
    // Sparse previous maps leave unmapped locations assigned a random PostCSS
    // input ID even on two Processor runs. Normalize only those source names.
    map.sources = map.sources.map(s =>
        s.replace(/<input css [^>]+>/g, "<input css ID>").replace(/%3Cinput%20css%20[^%]+%3E/g, "%3Cinput%20css%20ID%3E")
    );
    return { css: text.slice(0, match.index) + "<MAP>" + text.slice(match.index + match[0].length), map };
}
function annotation(text, encoding = "base64") {
    const json = JSON.stringify({
        version: 3,
        sources: ["input.scss"],
        names: [],
        mappings: "AAAA",
        sourcesContent: [text]
    });
    return (
        "/*# sourceMappingURL=data:application/json" +
        (encoding === "base64" ? ";base64," + Buffer.from(json).toString("base64") : "," + encodeURIComponent(json)) +
        " */"
    );
}

test("Complete and sparse inline maps preserve CSS, mappings, names and source contents", async () => {
    for (const safety of ["strict", "loose"])
        for (const text of [".a{width:1px;color:red}", ".a {\n width:1px;\n color:red;\n}"])
            for (const encoding of ["base64", "uri"]) {
                const input = text + "\n" + annotation(text, encoding),
                    options = { grundyScssSorterSafety: safety };
                const expected = inlineMap(await format(input, processor, options));
                assert.equal(inlineMap(await format(input, plugin, options)), expected);
            }
});

test("A parsed previous map triggers fallback even without a root annotation", async () => {
    const input = ".a { width:1px; " + annotation(".a{width:1px;color:red}") + " color:red; }";
    const parsed = scss.parse(input);
    assert.ok(parsed.source.input.map);
    assert.ok(parsed.nodes.every(n => n.type !== "comment"));
    const expected = inlineMap(await format(input, processor));
    const process = postcss.Processor.prototype.process;
    let calls = 0;
    postcss.Processor.prototype.process = function (...args) {
        calls++;
        return process.apply(this, args);
    };
    try {
        assert.equal(inlineMap(await format(input)), expected);
        assert.is(calls, 1);
    } finally {
        postcss.Processor.prototype.process = process;
    }
});

test("External maps keep the Processor output annotation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scss-direct-map-"));
    try {
        const css = ".a{width:1px;color:red}",
            file = path.join(directory, "input.css.map");
        await writeFile(
            file,
            JSON.stringify({
                version: 3,
                file: "input.css",
                sources: ["input.scss"],
                names: [],
                mappings: "AAAA",
                sourcesContent: [css]
            })
        );
        const input = css + "\n/*# sourceMappingURL=" + file.replace(/\\/g, "/") + " */";
        for (const safety of ["strict", "loose"]) {
            const options = { grundyScssSorterSafety: safety },
                expected = await format(input, processor, options);
            assert.is(await format(input, plugin, options), expected);
            // External annotation policy differs across supported PostCSS
            // releases. Preserve the installed Processor's behavior exactly.
            assert.match(expected, /sourceMappingURL=/);
        }
    } finally {
        nodeAssert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
        nodeAssert.ok(path.basename(directory).startsWith("scss-direct-map-"));
        await rm(directory, { recursive: true, force: true });
    }
});

test("Syntax diagnostics and configuration-before-parse precedence remain unchanged", async () => {
    for (const input of [".a {", '.a { color: "unterminated; }', ".a { /* unclosed", ".a { color red; }"])
        assert.equal(await signature(() => format(input)), await signature(() => format(input, processor)));
    for (const options of [
        { grundyScssSorterGroups: "{" },
        { grundyScssSorterGroups: JSON.stringify({ bad: { order: "random" } }) },
        { grundyScssSorterPreset: "__missing__" },
        { grundyScssSorterSafety: "unsafe" },
        { grundyScssSorterGroupsOrder: ["__missing__"] }
    ]) {
        const expected = await signature(() => format(".a {", processor, options));
        assert.match(expected.message, /Invalid|Unknown SCSS sorter preset/);
        assert.equal(await signature(() => format(".a {", plugin, options)), expected);
    }
});

test("Malformed and unsupported source maps preserve Processor diagnostics", async () => {
    const urls = [
        "data:application/json;unsupported,abc",
        "data:application/json,%7Bbad",
        "data:application/json," + encodeURIComponent(JSON.stringify({ version: 2, sources: [], names: [], mappings: "" }))
    ];
    for (const url of urls) {
        const input = ".a{color:red} /*# sourceMappingURL=" + url + " */";
        assert.equal(await signature(() => format(input)), await signature(() => format(input, processor)));
    }
});

test.run();
