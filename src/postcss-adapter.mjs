/** @typedef {import('postcss').ChildNode} ChildNode */
/**
 * @param {ChildNode} node
 * @returns {string}
 */
function nodeName(node) {
    switch (node.type) {
        case "atrule":
            return node.params;
        case "rule":
            return node.selector;
        case "decl":
            return node.prop;
        default:
            return "comment";
    }
}

/**
 * @param {ChildNode} node
 * @returns {string}
 */
function nodeType(node) {
    switch (node.type) {
        case "atrule":
            if (node.name == "use") return "use";
            if (node.name == "mixin") return "mixin";
            if (node.name == "include") return "include";
            if (node.name == "if") return "if";
            if (node.name == "else") return "else";
            if (node.name == "extend") return "extend";
            if (node.name == "media") return "media";
            if (node.name == "supports") return "supports";
            return "atrule";
        case "rule":
            return "rule";
        case "decl":
            if (!node.variable) return "decl";
            if (node.prop[0] == "$") return "$variable";
            return "variable";
        default:
            return "comment";
    }
}

/**
 * Read a declaration name without evaluating Sass. Nested property blocks and
 * dynamic/escaped names are deliberately opaque: declarations cannot cross them.
 * @param {import('postcss').ChildNode} node
 * @returns {string | null}
 */
function propertyName(node) {
    if (node.type === "rule" && /:\s*$/.test(node.selector)) return "*";
    if (node.type !== "decl" || node.prop.startsWith("$")) return null;
    if (!/^[-a-zA-Z0-9_]+$/.test(node.prop) || node.nodes) return "*";
    return node.prop;
}

/**
 * A moved // comment must not swallow the next statement or closing brace.
 * @param {import('postcss').Container} container
 */
function terminateLineComments(container) {
    for (let i = 0; i < container.nodes.length; i++) {
        const node = container.nodes[i];
        if (node.type !== "comment" || !node.raws.inline) continue;
        const next = container.nodes[i + 1];
        const raws = next ? next.raws : container.raws;
        const key = next ? "before" : "after";
        if (!/[\r\n]/.test(raws[key] ?? "")) raws[key] = "\n" + (raws[key] ?? "");
    }
}

/**
 * PostCSS-specific node access and whitespace writes. Nodes are kept by identity:
 * reordering within one container preserves their parent and source information.
 * @type {import('./sorter-core.mjs').AstAdapter}
 */
export const postcssAdapter = {
    name: nodeName,
    groupType: nodeType,
    directive: node => (node.type === "atrule" ? node.name : undefined),
    isAssignment: node => node.type === "decl" && /(?:^|\.)\$/.test(node.prop),
    isComment: node => node.type === "comment",
    commentText: node => node.text,
    propertyName,
    children: node => (Array.isArray(node.nodes) ? node.nodes : undefined),
    replaceChildren(container, nodes) {
        container.nodes = nodes;
    },
    before: node => node.raws.before ?? "",
    setBefore(node, text) {
        node.raws.before = text;
    },
    finishContainer: terminateLineComments
};
