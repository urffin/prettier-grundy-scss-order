import prettier from "prettier";
import plugin from "../src/index.mjs";
import { test } from "uvu";
import * as assert from "uvu/assert";

for (const safety of ["conservative", "structural"]) {
    test(`Precomputed priorities preserve first matches and duplicate ranks in ${safety}`, async () => {
        const config = {
            parser: "scss",
            plugins: [plugin],
            grundyScssSorterSafety: safety,
            grundyScssSorterGroupsOrder: ["missing", "layout", "text", "layout"],
            grundyScssSorterGroups: JSON.stringify({
                text: { oneOf: ["color", "display"], order: "exact" },
                layout: { oneOf: ["width", "display", "width"], order: "exact" }
            })
        };
        const result = await prettier.format(".a { color: red; padding: 0; display: block; width: 1px; }", config);
        assert.equal(result, ".a {\n  width: 1px;\n  display: block;\n  color: red;\n  padding: 0;\n}\n");
        assert.equal(await prettier.format(result, config), result);
    });
}

test("Precomputed membership keeps criteria conjunctive and property names case-sensitive", async () => {
    const result = await prettier.format(".a { --token: red; --Token: blue; color: red; width: 1px; }", {
        parser: "scss",
        plugins: [plugin],
        grundyScssSorterGroupsOrder: ["selected"],
        grundyScssSorterGroups: JSON.stringify({
            selected: { type: "variable", startsWith: "--T", oneOf: ["width", "--Token", "--token"], order: "exact" }
        })
    });
    assert.equal(result, ".a {\n  --Token: blue;\n  --token: red;\n  color: red;\n  width: 1px;\n}\n");
});

test("Normalization does not turn vendor-prefixed ordinary names into custom properties", async () => {
    const result = await prettier.format(".a { -webkit---token: 1; --token: 2; }", {
        parser: "scss",
        plugins: [plugin]
    });
    assert.equal(result, ".a {\n  --token: 2;\n  -webkit---token: 1;\n}\n");
});

test.run();
