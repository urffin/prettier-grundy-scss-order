import { readFile } from "node:fs/promises";

const presets = ["default", "csscomb", "csscomb-yandex", "csscomb-zen", "pepelsbey"];
const modes = ["strict", "loose"];
const root = new URL("../../tests/fixtures/corpus/regressions/", import.meta.url);
const base =
    ".z { width:1px; /* leading */ color:red; // trailing\n margin-top:8px; margin:0; @media (min-width:1px) {color:blue;} } .a {height:2px;}";
function inlineMap(encoding) {
    const json = JSON.stringify({
        version: 3,
        sources: ["input.scss"],
        names: [],
        mappings: "AAAA",
        sourcesContent: [base]
    });
    return `/*# sourceMappingURL=data:application/json${encoding === "base64" ? ";base64," + Buffer.from(json).toString("base64") : "," + encodeURIComponent(json)} */`;
}

export async function browserCases() {
    const cases = [];
    function add(id, source, extra = {}, options = {}) {
        for (const preset of presets)
            for (const safety of modes)
                cases.push({
                    id: `${id}/${preset}/${safety}`,
                    source,
                    category: "same",
                    path: { node: 0, browser: 0 },
                    ...extra,
                    options: { grundyScssSorterPreset: preset, grundyScssSorterSafety: safety, ...options }
                });
    }
    const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
    for (const fixture of manifest.fixtures) {
        const source = await readFile(new URL(fixture.entry, root), "utf8");
        const expected = {};
        for (const mode of modes) expected[mode] = await readFile(new URL(fixture.expected[mode], root), "utf8");
        add(`fixture/${fixture.id}`, source, { expected });
    }
    for (const [id, source] of Object.entries({
        empty: "",
        "comment-only": "// comment only",
        "bom-crlf": "\ufeff.a {\r\n width:1px; // tail\r\n /* lead */ color:red;\r\n // footer\r\n}",
        "nested-annotation": ".a {width:1px; /*# sourceMappingURL=missing.map */ color:red;}",
        "unrelated-annotation": base + "\n/*# sourceURL=unrelated.scss */"
    }))
        add(id, source);
    for (const withRoot of [false, true])
        for (const split of [false, true])
            add(
                `settings/root-${withRoot}/split-${split}`,
                base,
                {},
                {
                    grundyScssSorterWithRoot: withRoot,
                    grundyScssSorterSplitGroup: split
                }
            );
    add("map/missing-external", base + "\n/*# sourceMappingURL=__browser_smoke_missing__.map */", {
        path: { node: 1, browser: 1 }
    });
    for (const encoding of ["base64", "uri"])
        add(`map/root-${encoding}`, base + "\n" + inlineMap(encoding), {
            category: "map-policy",
            path: { node: 1, browser: 1 }
        });
    add("map/nested-inline", ".a {width:1px; " + inlineMap("uri") + " color:red;}", {
        category: "map-policy",
        path: { node: 1, browser: 0 }
    });
    for (const [id, url] of Object.entries({
        malformed: "data:application/json,%7Bbad",
        unsupported: "data:application/json;unsupported,abc"
    }))
        add(`map/${id}`, base + `\n/*# sourceMappingURL=${url} */`, {
            category: "map-error-policy",
            path: { node: 0, browser: 1 }
        });
    const errors = [
        { grundyScssSorterGroups: "{" },
        { grundyScssSorterGroups: JSON.stringify({ bad: { order: "random" } }) },
        { grundyScssSorterPreset: "__missing__" },
        { grundyScssSorterGroupsOrder: ["__missing__"] }
    ];
    for (const [index, options] of errors.entries())
        for (const mode of modes)
            cases.push({
                id: `configuration-error/${index}/${mode}`,
                category: "error",
                source: ".a {",
                path: { node: 0, browser: 0 },
                options: { grundyScssSorterSafety: mode, ...options }
            });
    for (const mode of modes)
        cases.push({
            id: `syntax-error/${mode}`,
            category: "error",
            source: ".a {",
            path: { node: 0, browser: 0 },
            options: { grundyScssSorterSafety: mode }
        });
    for (const [alias, canonical] of [
        ["conservative", "strict"],
        ["structural", "loose"]
    ])
        cases.push({
            id: `alias/${alias}`,
            source: base,
            category: "same",
            path: { node: 0, browser: 0 },
            aliasOf: `settings/root-true/split-false/default/${canonical}`,
            options: { grundyScssSorterSafety: alias }
        });
    return cases;
}
