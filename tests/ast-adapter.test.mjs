import { test } from "uvu";
import * as assert from "uvu/assert";
import scss from "postcss-scss";
import { createSorter } from "../src/sorter-core.mjs";
import { postcssAdapter } from "../src/postcss-adapter.mjs";
import { grundyPropSorter } from "../src/grundy-prop-sorter.mjs";

// Deliberately has none of PostCSS's type/prop/nodes/raws fields.
const adapter = {
    name: item => item.facts.name,
    groupType: item => item.facts.groupType,
    directive: item => item.facts.directive,
    isAssignment: item => item.facts.assignment,
    isComment: item => item.facts.kind === "comment",
    commentText: item => item.facts.commentText,
    propertyName: item => item.facts.property,
    children: item => item.items,
    replaceChildren: (item, items) => {
        item.items = items;
    },
    before: item => item.leading,
    setBefore: (item, text) => {
        item.leading = text;
    },
    finishContainer: item => {
        item.finished = true;
    }
};
const item = (kind, name, extra = {}, items) => ({
    facts: { kind, name, groupType: kind, assignment: false, property: kind === "decl" ? name : null, ...extra },
    leading: "\n",
    items
});
const decl = name => item("decl", name);
const block = (name, items) => item("rule", name, {}, items);
const comment = text => item("comment", "comment", { commentText: text });
const directive = (name, items = []) => item("atrule", name, { directive: name, groupType: name }, items);
const options = {
    withRoot: true,
    order: ["values", "blocks", "conditions"],
    groups: {
        values: { type: "decl", order: "alphabetical" },
        blocks: { type: "rule", order: "alphabetical" },
        conditions: { type: "if" }
    }
};
const labels = root => root.items.map(child => child.facts.name);

test("Core sorts a foreign AST, preserving property dependencies and nested traversal", () => {
    const nested = block(".nested", [decl("z-index"), decl("color")]);
    const root = block("root", [decl("z-index"), decl("margin-top"), nested, decl("margin"), decl("color")]);
    const sort = createSorter(options, adapter);
    sort(root);
    assert.equal(labels(root), ["margin-top", "margin", "z-index", ".nested", "color"]);
    assert.equal(labels(nested), ["color", "z-index"]);
    assert.ok(root.finished && nested.finished);
    sort(root);
    assert.equal(labels(root), ["margin-top", "margin", "z-index", ".nested", "color"]);
});

test("Core preserves execution boundaries and their enclosing blocks through the adapter", () => {
    const nested = block(".effects", [decl("z-index"), directive("include"), decl("color")]);
    const root = block("root", [decl("z-index"), nested, decl("color")]);
    createSorter(options, adapter)(root);
    assert.equal(labels(root), ["z-index", ".effects", "color"]);
    assert.equal(labels(nested), ["z-index", "include", "color"]);
    createSorter({ ...options, safety: "loose" }, adapter)(root);
    assert.equal(labels(root), ["color", "z-index", ".effects"]);
    assert.equal(labels(nested), ["color", "z-index", "include"]);
});

test("Core keeps branch comments, ignored subtrees and group spacing on a foreign AST", () => {
    const first = directive("if", [decl("z-index"), decl("color")]);
    const between = comment("between branches");
    const second = directive("else");
    const heading = comment("heading");
    const value = decl("color");
    const ignored = block(".ignored", [decl("z-index"), decl("color")]);
    const ignore = comment("prettier-ignore");
    const footer = comment("footer");
    const root = block("root", [first, between, second, heading, value, ignore, ignored, footer]);
    const sort = createSorter({ ...options, safety: "loose", splitGroups: true }, adapter);
    sort(root);
    assert.equal(root.items, [heading, value, first, between, second, ignore, ignored, footer]);
    assert.equal(first.leading, "\n\n\n");
    assert.equal(labels(first), ["color", "z-index"]);
    assert.equal(labels(ignored), ["z-index", "color"]);
    assert.not.ok(ignored.finished);
    const saved = JSON.stringify(root);
    sort(root);
    assert.equal(JSON.stringify(root), saved);
});

test("Root-disabled sorting still visits children", () => {
    const nested = block(".nested", [decl("z-index"), decl("color")]);
    const root = block("root", [decl("z-index"), nested, decl("color")]);
    createSorter({ ...options, withRoot: false }, adapter)(root);
    assert.equal(labels(root), ["z-index", ".nested", "color"]);
    assert.equal(labels(nested), ["color", "z-index"]);
    assert.not.ok(root.finished);
});

test("A reused sorter reads changed node metadata on each invocation", () => {
    const root = block("root", [decl("z-index"), decl("color")]);
    const sort = createSorter(options, adapter);
    sort(root);
    root.items[0].facts.name = "zz-last";
    root.items[0].facts.property = "zz-last";
    sort(root);
    assert.equal(labels(root), ["z-index", "zz-last"]);
});

test("A reused sorter invalidates nested property caches after edits and between trees", () => {
    const nested = block(".nested", [decl("color")]);
    const root = block("root", [nested, decl("color")]);
    const sort = createSorter(options, adapter);
    sort(root);
    assert.equal(labels(root), [".nested", "color"]);
    nested.items = [decl("width")];
    sort(root);
    assert.equal(labels(root), ["color", ".nested"]);
    nested.items = [decl("color")];
    root.items.reverse();
    sort(root);
    assert.equal(labels(root), [".nested", "color"]);
    const other = block("other", [block(".other", [decl("color")]), decl("color")]);
    sort(other);
    assert.equal(labels(other), [".other", "color"]);
});

test("PostCSS adapter preserves identities, parents, source locations and line-comment termination", () => {
    const root = scss.parse(".a { z-index: 1; // tail\n color: red; }");
    const rule = root.first;
    const nodes = [...rule.nodes];
    const sources = nodes.map(node => node.source);
    grundyPropSorter().OnceExit(root);
    assert.equal(
        rule.nodes.map(node => (node.type === "decl" ? node.prop : node.text)),
        ["color", "z-index", "tail"]
    );
    for (let i = 0; i < nodes.length; i++) {
        assert.is(nodes[i].parent, rule);
        assert.is(nodes[i].source, sources[i]);
        assert.ok(rule.nodes.includes(nodes[i]));
    }
    assert.ok(rule.raws.after.includes("\n"));
    assert.equal(scss.parse(root.toString(scss.stringify)).first.nodes.length, 3);
    assert.is(postcssAdapter.children(rule.first), undefined);
    assert.equal(postcssAdapter.children(scss.parse(".empty {} ").first), []);
});

test.run();
