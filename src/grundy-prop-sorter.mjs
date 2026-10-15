/**
 * @typedef {import('prettier-grundy-scss-order').Groups} Groups
 * @typedef {import('prettier-grundy-scss-order').GroupCriteria} GroupCriteria
 * @typedef {import('postcss').ChildNode} ChildNode
 * @typedef {import('postcss').Root} Root
 * @typedef {Map<ChildNode, string[]>} GroupMap
 * @typedef {{ node: ChildNode, prev: ChildNode | undefined }} ElseStatement
 */

import {
    order as defaultOrder,
    groups as defaultGroups,
    withRoot as defaultWithRoot,
    splitGroups as defaultSplitGroups
} from "./presets/default.mjs";

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
 * @param {ChildNode[]} nodes
 * @param {GroupMap} groupMap
 * @param {Groups} groups
 * @returns {void}
 */
function splitGroupsInternal(nodes, groupMap, groups) {
    /**
     * @param {ChildNode} node
     * @returns {void}
     */
    function cleanEnding(node) {
        node.raws.before = node.raws.before.replace(/\n+/g, "\n");
        node.raws.after = undefined;
    }
    /**
     *
     * @param {string[]} lastGroup
     * @param {ChildNode} node
     * @returns {string[]} Current group names
     */
    function checkGroup(lastGroup, node) {
        const currentGroups = groupMap.get(node) ?? [];
        cleanEnding(node);
        if (!lastGroup.some(g => currentGroups.includes(g)) || currentGroups.some(g => groups[g]?.splitItems)) {
            node.raws.before = "\n\n" + (node.raws.before ?? "");
            return currentGroups;
        }
        return lastGroup;
    }
    if (nodes.length == 0) return;

    cleanEnding(nodes[0]);
    if (nodes.length == 1) return;

    let lastGroup = groupMap.get(nodes[0]) ?? [];
    for (let i = 1; i < nodes.length - 1; i++) {
        lastGroup = checkGroup(lastGroup, nodes[i]);
    }
    checkGroup(lastGroup, nodes[nodes.length - 1]);
}
/**
 * @param {ChildNode[]} nodes
 * @param {GroupMap} groups
 * @returns {ElseStatement[]}
 */
function removeElseStatements(nodes, groups) {
    /** @type {ElseStatement[]} */
    const elseStatements = [];
    for (let i = nodes.length; i-- > 0; ) {
        const node = nodes[i];
        const nodeGroup = groups.get(node) ?? [];
        if (nodeGroup.includes("@else")) {
            elseStatements.push({
                node,
                prev: node.prev()
            });
            node.remove();
        }
    }
    return elseStatements;
}

/**
 * @param {ElseStatement[]} elseStatements
 * @returns {void}
 */
function appendElseStatements(elseStatements) {
    for (let i = elseStatements.length; i-- > 0; ) {
        const { node, prev } = elseStatements[i];
        prev.after(node);
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
 * @returns {import('postcss').Plugin} PostCSS plugin object
 */
export function grundyPropSorter({
    groups = {},
    order = defaultOrder,
    withRoot = defaultWithRoot,
    splitGroups = defaultSplitGroups,
    presetGroups
} = {}) {
    groups = Object.assign({}, defaultGroups, presetGroups, groups);

    /**
     * @param {ChildNode[] | undefined} nodes
     * @returns {void}
     */
    function runComparer(nodes) {
        if (Array.isArray(nodes)) {
            const groupMap = new Map(nodes.map(node => [node, nodeGroup(node, groups)]));
            const elseStatements = removeElseStatements(nodes, groupMap);
            const typeComparer = createComparerByType(order, groupMap, groups);
            nodes.sort(typeComparer);
            if (splitGroups) splitGroupsInternal(nodes, groupMap, groups);
            appendElseStatements(elseStatements);
        }
    }
    return {
        postcssPlugin: "grundy-scss-order",
        /**
         * @param {Root} css
         */
        OnceExit: css => {
            if (withRoot) {
                runComparer(css.nodes);
            }
            css.walk(node => {
                runComparer(node.nodes);
            });
        }
    };
}

grundyPropSorter.postcss = true;
