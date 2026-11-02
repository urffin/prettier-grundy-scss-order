/**
 * @typedef {import('prettier-grundy-scss-order').Groups} Groups
 * @typedef {import('prettier-grundy-scss-order').GroupCriteria} GroupCriteria
 * @typedef {import('postcss').ChildNode} ChildNode
 * @typedef {import('postcss').Root} Root
 * @typedef {Map<ChildNode, string[]>} GroupMap
 * @typedef {{ node: ChildNode, nodes: ChildNode[], ignored: boolean }} SortUnit
 */

import {
    order as defaultOrder,
    groups as defaultGroups,
    withRoot as defaultWithRoot,
    splitGroups as defaultSplitGroups
} from "./presets/default.mjs";
import { sortWithPropertyConstraints } from "./property-conflicts.mjs";

// These directives execute, control evaluation, or load modules at this position.
// In particular, hoisting @use over @forward can configure a module too late.
const executionDirectives = new Set([
    "include",
    "content",
    "if",
    "else",
    "for",
    "each",
    "while",
    "return",
    "warn",
    "debug",
    "error",
    "use",
    "forward",
    "import"
]);

/**
 * @param {ChildNode} node
 * @param {Groups} groups
 * @returns {string[]}
 */
function nodeGroup(node, groups) {
    const nodeGroups = [];
    for (let group in groups) {
        if (checkCriteria(node, groups[group])) {
            nodeGroups.push(group);
        }
    }
    return nodeGroups;
}

/**
 *
 * @param {ChildNode} node
 * @param {GroupCriteria} criterias
 * @returns {boolean} Whether the node matches all criteria
 */
function checkCriteria(node, criterias) {
    const _nodeName = nodeName(node);
    for (let criteria in criterias) {
        switch (criteria) {
            case "type":
                if (nodeType(node) != criterias[criteria]) return false;
                break;
            case "startsWith":
                if (!_nodeName.startsWith(criterias[criteria])) return false;
                break;
            case "oneOf":
                if (!criterias[criteria].includes(_nodeName)) return false;
                break;
        }
    }
    return true;
}

/**
 *
 * @param {string[]} order
 * @param {GroupMap} groupMap
 * @param {Groups} groups
 * @returns {(a: ChildNode, b: ChildNode) => number}
 */
function createComparerByType(order, groupMap, groups) {
    return (a, b) => {
        const aGroups = groupMap.get(a) ?? [];
        const bGroups = groupMap.get(b) ?? [];
        const aIndex = order.findIndex(group => aGroups.includes(group));
        const bIndex = order.findIndex(group => bGroups.includes(group));

        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex == -1) return 1;
        if (bIndex == -1) return -1;

        if (aIndex == bIndex) {
            return compareInGroup(a, b, groups[order[aIndex]]);
        }

        return aIndex - bIndex;
    };
}

/**
 * @param {ChildNode} a
 * @param {ChildNode} b
 * @param {GroupCriteria} group
 * @returns {number}
 */
function compareInGroup(a, b, group) {
    if (group.order == "alphabetical") {
        const aName = nodeName(a);
        const bName = nodeName(b);
        if (aName > bName) return 1;
        if (aName < bName) return -1;
        return 0;
    }

    if (group.order == "exact") {
        const aName = nodeName(a);
        const bName = nodeName(b);
        const aIndex = group.oneOf.findIndex(name => name == aName);
        const bIndex = group.oneOf.findIndex(name => name == bName);

        if (aIndex == -1) return 1;
        if (bIndex == -1) return -1;

        return aIndex - bIndex;
    }

    return 0;
}

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
 * Treat comments as part of a statement, rather than independent sortable nodes.
 * Own-line comments lead the next statement; same-line comments trail the previous
 * statement. Unattached final comments stay at the end of the container.
 * @param {ChildNode[]} nodes
 * @returns {{ units: SortUnit[], footer: ChildNode[] }}
 */
function collectUnits(nodes) {
    /** @type {SortUnit[]} */
    const units = [];
    let pending = [];
    for (const node of nodes) {
        const previous = units.at(-1);
        if (node.type === "comment") {
            if (
                previous &&
                pending.length === 0 &&
                !/[\r\n]/.test(node.raws.before ?? "") &&
                node.text.trim() !== "prettier-ignore"
            ) {
                previous.nodes.push(node);
            } else {
                pending.push(node);
            }
            continue;
        }
        const ignored = pending.some(comment => comment.text.trim() === "prettier-ignore");
        // Comments between branches must not break the if/else association.
        if (
            node.type === "atrule" &&
            node.name === "else" &&
            previous?.node.type === "atrule" &&
            previous.node.name === "if"
        ) {
            previous.nodes.push(...pending, node);
            previous.ignored ||= ignored;
        } else {
            units.push({ node, nodes: [...pending, node], ignored });
        }
        pending = [];
    }
    return { units, footer: pending };
}

/**
 * Place group spacing before leading comments, never inside a statement unit.
 * @param {SortUnit[]} units
 * @param {GroupMap} groupMap
 * @param {Groups} groups
 */
function splitGroupsInternal(units, groupMap, groups) {
    let lastGroup = [];
    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const currentGroups = groupMap.get(unit.node) ?? [];
        const first = unit.nodes[0];
        const newGroup = !lastGroup.some(g => currentGroups.includes(g)) || currentGroups.some(g => groups[g]?.splitItems);
        if (!unit.ignored) {
            first.raws.before = (first.raws.before ?? "").replace(/\n+/g, "\n");
            if (i > 0 && newGroup) {
                first.raws.before = "\n\n" + first.raws.before;
            }
        }
        if (i === 0 || newGroup) lastGroup = currentGroups;
    }
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
 * Create PostCSS plugin for sorting SCSS properties
 * @param {Object} options - Plugin options
 * @param {Groups} [options.groups={}] - Custom groups to merge with default groups
 * @param {string[]} [options.order] - Order of groups
 * @param {boolean} [options.withRoot=false] - Whether to sort at root level
 * @param {boolean} [options.splitGroups=false] - Whether to add empty lines between groups
 * @param {Groups} [options.presetGroups] - Groups from preset
 * @param {"conservative" | "structural"} [options.safety="conservative"] - Ordering protection
 * @returns {import('postcss').Plugin} PostCSS plugin object
 */
export function grundyPropSorter({
    groups = {},
    order = defaultOrder,
    withRoot = defaultWithRoot,
    splitGroups = defaultSplitGroups,
    presetGroups,
    safety = "conservative"
} = {}) {
    if (safety !== "conservative" && safety !== "structural") {
        throw new Error(`Unknown SCSS sorter safety mode: ${safety}`);
    }
    groups = Object.assign({}, defaultGroups, presetGroups, groups);

    /** @type {WeakMap<ChildNode, boolean>} */
    const executionBoundaries = new WeakMap();

    /**
     * Assignments and directives may change values or emit CSS at this exact point.
     * Pin enclosing blocks too: moving one would move its effects across siblings.
     * This does not prevent sorting safe segments inside those blocks.
     * @param {ChildNode} node
     * @returns {boolean}
     */
    function hasExecutionBoundary(node) {
        if (executionBoundaries.has(node)) return executionBoundaries.get(node);
        const boundary =
            (node.type === "decl" && /(?:^|\.)\$/.test(node.prop)) ||
            (node.type === "atrule" && executionDirectives.has(node.name)) ||
            (node.nodes?.some(hasExecutionBoundary) ?? false);
        executionBoundaries.set(node, boundary);
        return boundary;
    }

    /**
     * @param {import('postcss').Container} container
     * @param {boolean} shouldSort
     */
    function sortContainer(container, shouldSort = true) {
        if (!Array.isArray(container.nodes)) return;
        const { units, footer } = collectUnits(container.nodes);
        if (shouldSort) {
            const groupMap = new Map(units.map(unit => [unit.node, nodeGroup(unit.node, groups)]));
            const compare = createComparerByType(order, groupMap, groups);
            // Boundaries stay in place regardless of the configured group order.
            // Check every branch of a collected if/else unit, not only its first node.
            let start = 0;
            for (let i = 0; i <= units.length; i++) {
                if (
                    i === units.length ||
                    units[i].ignored ||
                    (safety === "conservative" && units[i].nodes.some(hasExecutionBoundary))
                ) {
                    const segment = units.slice(start, i);
                    const sorted =
                        safety === "conservative" ?
                            sortWithPropertyConstraints(segment, compare)
                        :   segment.sort((a, b) => compare(a.node, b.node));
                    units.splice(start, sorted.length, ...sorted);
                    start = i + 1;
                }
            }
            if (splitGroups) splitGroupsInternal(units, groupMap, groups);
            for (let i = 1; i < units.length; i++) {
                const first = units[i].nodes[0];
                if (first.type === "comment" && !/[\r\n]/.test(first.raws.before ?? "")) {
                    first.raws.before = "\n" + (first.raws.before ?? "");
                }
            }
            container.nodes = [...units.flatMap(unit => unit.nodes), ...footer];
            terminateLineComments(container);
        }
        for (const unit of units) {
            if (unit.ignored) continue;
            for (const node of unit.nodes) {
                if (node.nodes) sortContainer(node);
            }
        }
    }
    return {
        postcssPlugin: "grundy-scss-order",
        /** @param {Root} css */
        OnceExit: css => sortContainer(css, withRoot)
    };
}

grundyPropSorter.postcss = true;
