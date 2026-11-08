import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import prettier from "prettier";
import plugin from "prettier-grundy-scss-order";
import { presets, defaultPreset } from "prettier-grundy-scss-order/presets";

const pkg = JSON.parse(await readFile(new URL("./node_modules/prettier-grundy-scss-order/package.json", import.meta.url)));
assert.equal(pkg.version, process.env.SCSS_PACKAGE_VERSION);
assert.ok(defaultPreset.groups.decl);
const source = ".a { /* leading */ margin-top: 1px; margin: 0; // tail\n color: red; }";
for (const preset of Object.keys(presets)) {
    for (const safety of ["conservative", "structural"]) {
        const options = {
            parser: "scss",
            plugins: [plugin],
            grundyScssSorterPreset: preset,
            grundyScssSorterSafety: safety,
            grundyScssSorterGroupsOrder: ["decl"]
        };
        const output = await prettier.format(source, options);
        assert.equal(await prettier.format(output, options), output);
        assert.ok(output.includes("/* leading */") && output.includes("// tail"));
        assert.equal(output.indexOf("margin-top:") < output.indexOf("margin:"), safety === "conservative");
    }
}
const rootSource = ".z { color: red; } .a { color: blue; }";
const rootOptions = {
    parser: "scss",
    plugins: ["prettier-grundy-scss-order"],
    grundyScssSorterPreset: "csscomb",
    grundyScssSorterGroupsOrder: ["rule"],
    grundyScssSorterGroups: '{"rule":{"type":"rule","order":"alphabetical"}}'
};
assert.ok((await prettier.format(rootSource, rootOptions)).startsWith(".z"));
assert.ok((await prettier.format(rootSource, { ...rootOptions, grundyScssSorterWithRoot: true })).startsWith(".a"));
await assert.rejects(
    prettier.format(source, { ...rootOptions, grundyScssSorterPreset: "missing" }),
    /Unknown SCSS sorter preset/
);
console.log(
    `Installed package ${pkg.version}: public exports, presets, modes, comments, configuration and idempotence passed (Prettier ${prettier.version}).`
);
