// Research-only parser variants. Production modules and public options stay intact.
import postcss from "postcss";
import scss from "postcss-scss";
import native from "prettier/parser-postcss";
import stock from "../src/index.mjs";
import { resolveConfiguration } from "../src/configuration.mjs";
import { grundyPropSorter } from "../src/grundy-prop-sorter.mjs";
import { createSorter } from "../src/sorter-core.mjs";
import { postcssAdapter } from "../src/postcss-adapter.mjs";

export function phaseClock() {
    let stack = [],
        phases = {};
    return {
        reset() {
            if (stack.length) throw new Error("Unclosed pipeline phase");
            phases = {};
        },
        get result() {
            return phases;
        },
        enter(name) {
            const frame = { name, start: performance.now(), child: 0 };
            stack.push(frame);
            return frame;
        },
        leave(frame) {
            const elapsed = performance.now() - frame.start;
            if (stack.pop() !== frame) throw new Error("Pipeline phase nesting mismatch");
            const row = (phases[frame.name] ??= { calls: 0, inclusiveMs: 0, exclusiveMs: 0 });
            row.calls++;
            row.inclusiveMs += elapsed;
            row.exclusiveMs += elapsed - frame.child;
            if (stack.length) stack.at(-1).child += elapsed;
        },
        measure(name, action) {
            const f = this.enter(name);
            try {
                return action();
            } finally {
                this.leave(f);
            }
        },
        async async(name, action) {
            const f = this.enter(name);
            try {
                return await action();
            } finally {
                this.leave(f);
            }
        }
    };
}

function mutationTracker() {
    let reordered = false;
    const before = new Map(),
        after = new Map();
    const remember = (node, map, key) => {
        if (!map.has(node)) map.set(node, node.raws[key]);
    };
    return {
        changed() {
            if (reordered) return true;
            for (const [node, value] of before) if (node.raws.before !== value) return true;
            for (const [node, value] of after) if (node.raws.after !== value) return true;
            return false;
        },
        adapter: {
            ...postcssAdapter,
            replaceChildren(container, nodes) {
                if (
                    !reordered &&
                    (container.nodes.length !== nodes.length || nodes.some((n, i) => n !== container.nodes[i]))
                )
                    reordered = true;
                postcssAdapter.replaceChildren(container, nodes);
            },
            setBefore(node, value) {
                if (!reordered && node.raws.before !== value) remember(node, before, "before");
                postcssAdapter.setBefore(node, value);
            },
            finishContainer(container) {
                if (!reordered)
                    for (let i = 0; i < container.nodes.length; i++) {
                        const node = container.nodes[i];
                        if (node.type !== "comment" || !node.raws.inline) continue;
                        const next = container.nodes[i + 1],
                            target = next ?? container,
                            key = next ? "before" : "after";
                        if (!/[\r\n]/.test(target.raws[key] ?? "")) remember(target, next ? before : after, key);
                    }
                postcssAdapter.finishContainer(container);
            }
        }
    };
}

// Deliberately exploratory: these css-* nodes and raw headers are Prettier
// implementation details, not the PostCSS AST contract used by the library.
function nativeView(node) {
    const type = node.type.replace(/^css-/, "");
    if (!["root", "rule", "atrule", "decl", "comment"].includes(type)) throw new Error("Unsupported native node: " + type);
    const selector = type === "rule" ? node.raws.selector : undefined;
    const params = type === "atrule" ? (node.raws.params ?? "") : undefined;
    if (type === "rule" && typeof selector !== "string") throw new Error("Unsupported native rule header");
    if (type === "atrule" && typeof params !== "string") throw new Error("Unsupported native directive header");
    return {
        native: node,
        type,
        selector,
        params,
        prop: node.prop,
        name: node.name,
        text: node.text,
        variable: node.variable,
        raws: node.raws,
        ...(Array.isArray(node.nodes) ? { nodes: node.nodes.map(nativeView) } : {})
    };
}
function applyNativeOrder(view) {
    if (!view.nodes) return;
    view.native.nodes = view.nodes.map(child => child.native);
    for (const child of view.nodes) applyNativeOrder(child);
}

export function createPipelinePlugin(kind, { clock, observe = () => {} } = {}) {
    if (
        ![
            "processor",
            "direct",
            "skip-unchanged",
            "raw-handoff",
            "native-view",
            "profile",
            "profile-plain",
            "roundtrip"
        ].includes(kind)
    )
        throw new Error("Unknown pipeline research variant");
    if (kind.startsWith("profile") && !clock) throw new Error("Phase clock required");
    const parser = {
        ...native.parsers.scss,
        async parse(text, options) {
            // Preserve the pre-direct integration as an explicit reference even
            // after the public plugin switches to the direct path.
            if (kind === "processor") {
                const config = await resolveConfiguration(options);
                const processed = await postcss([grundyPropSorter(config)]).process(text, {
                    from: undefined,
                    syntax: scss
                });
                options.originalText = processed.css;
                return native.parsers.scss.parse(processed.css, [options.parser], options);
            }
            if (kind === "profile-plain")
                return clock.async("prettierParse", () => native.parsers.scss.parse(text, [], options));
            if (kind === "profile") {
                const config = await clock.async("configuration", () => resolveConfiguration(options));
                const sorter = clock.measure("sorterConstruction", () => grundyPropSorter(config));
                const once = sorter.OnceExit;
                sorter.OnceExit = (...args) => clock.measure("sorting", () => once(...args));
                const syntax = {
                    parse: (...args) => clock.measure("postcssParse", () => scss.parse(...args)),
                    stringify: (...args) => clock.measure("serialization", () => scss.stringify(...args))
                };
                const processed = await clock.async("postcssProcessor", () =>
                    postcss([sorter]).process(text, { from: undefined, syntax })
                );
                const sorted = clock.measure("materialization", () => processed.css);
                options.originalText = sorted;
                return clock.async("prettierParse", () => native.parsers.scss.parse(sorted, [], options));
            }
            if (kind === "native-view") {
                const config = await resolveConfiguration(options);
                const ast = await native.parsers.scss.parse(text, [], options);
                const view = nativeView(ast);
                createSorter(config, postcssAdapter)(view);
                applyNativeOrder(view);
                return ast;
            }
            if (kind !== "roundtrip") {
                const config = await resolveConfiguration(options);
                const root = scss.parse(text, { from: undefined });
                // Processor also owns sourcemap annotation removal/regeneration.
                // Preserve that behavior instead of treating it as serialization.
                if (
                    root.source?.input.map ||
                    root.nodes.some(n => n.type === "comment" && n.text.startsWith("# sourceMappingURL="))
                ) {
                    const processed = await postcss([grundyPropSorter(config)]).process(root, {
                        from: undefined,
                        syntax: scss
                    });
                    observe({ serialized: true, mapped: true });
                    options.originalText = processed.css;
                    return native.parsers.scss.parse(processed.css, [], options);
                }
                const tracker = kind === "skip-unchanged" ? mutationTracker() : null;
                createSorter(config, tracker?.adapter ?? postcssAdapter)(root);
                if (kind === "raw-handoff") return root;
                const serialize = !tracker || tracker.changed();
                // PostCSS's round trip removes a BOM. Keep that behavior even
                // when an untouched tree can reuse the remaining source text.
                const sorted = serialize ? root.toString(scss.stringify) : text.replace(/^\uFEFF/, "");
                observe({ serialized: serialize });
                options.originalText = sorted;
                return native.parsers.scss.parse(sorted, [], options);
            }
            const root = scss.parse(text, { from: undefined });
            const sorted =
                (
                    root.source?.input.map ||
                    root.nodes.some(n => n.type === "comment" && n.text.startsWith("# sourceMappingURL="))
                ) ?
                    (await postcss().process(root, { from: undefined, syntax: scss })).css
                :   root.toString(scss.stringify);
            options.originalText = sorted;
            return native.parsers.scss.parse(sorted, [], options);
        }
    };
    return {
        ...(kind === "profile-plain" || kind === "roundtrip" ? {} : { options: stock.options }),
        parsers: { scss: parser }
    };
}
