const defaultOrder = ["@use", "@extend", "--variable", "$variable", "@if", "decl", "@include", "@mixin", "rule"];
const defaultGroups = {
    "@use": { type: "use" },
    "@mixin": { type: "mixin" },
    "--variable": { type: "variable" },
    $variable: { type: "$variable" },
    decl: { type: "decl", order: "alphabetical" },
    "@include": { type: "include" },
    rule: { type: "rule" },
    "@if": { type: "if" },
    "@else": { type: "else" },
    "@extend": { type: "extend" },
    "@media": { type: "media" },
    "@supports": { type: "supports" }
};

function nodeGroup(node, groups) {
    const nodeGroups = [];
    for (let group in groups) {
        if (checkCriteria(node, groups[group])) {
            nodeGroups.push(group);
        }
    }
    return nodeGroups;
}

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
 * @param {String[]} order
 * @param {Map<Node, String[]>} groupMap
 * @returns
 */
function createComparerByType(order, groupMap, groups) {
    return (a, b) => {
        const aGroups = groupMap.get(a) ?? [];
        const bGroups = groupMap.get(b) ?? [];
        const aIndex = order.findIndex(group => aGroups.includes(group));
        const bIndex = order.findIndex(group => bGroups.includes(group));

        if (aIndex == -1) return 1;
        if (bIndex == -1) return -1;

        if (aIndex == bIndex) {
            const currentGroup = groups[order[aIndex]];
            if (currentGroup.order == "alphabetical") {
                const aName = nodeName(a);
                const bName = nodeName(b);
                if (aName > bName) return 1;
                if (aName < bName) return -1;
                return 0;
            }
        }

        return aIndex - bIndex;
    };
}

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

function splitGroupsInternal(nodes, groups) {
    function cleanEnding(node) {
        node.raws.before = node.raws.before.replace(/\n+/g, "\n");
        node.raws.after = undefined;
    }
    function checkGroup(lastGroup, node) {
        const currentGroups = groups.get(node);
        cleanEnding(node);
        if (!lastGroup.some(g => currentGroups.includes(g))) {
            node.raws.before = "\n" + (node.raws.before ?? "");
            return currentGroups;
        }
        return lastGroup;
    }
    if (nodes.length == 0) return;

    cleanEnding(nodes[0]);
    if (nodes.length == 1) return;

    let lastGroup = groups.get(nodes[0]);
    for (let i = 1; i < nodes.length - 1; i++) {
        lastGroup = checkGroup(lastGroup, nodes[i]);
    }
    checkGroup(lastGroup, nodes.at(-1));
}
function removeElseStatements(nodes, groups) {
    const elseStatements = [];
    for (let i = nodes.length; i-- > 0; ) {
        const node = nodes[i];
        const nodeGroup = groups.get(node);
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

function appendElseStatements(elseStatements) {
    for (let i = elseStatements.length; i-- > 0; ) {
        const { node, prev } = elseStatements[i];
        prev.after(node);
    }
}

export function grundyPropSorter({ groups = {}, order = defaultOrder, withRoot = false, splitGroups = false } = {}) {
    groups = Object.assign({}, defaultGroups, groups);

    function runComparer(nodes) {
        if (Array.isArray(nodes)) {
            const groupMap = new Map(nodes.map(node => [node, nodeGroup(node, groups)]));
            const elseStatements = removeElseStatements(nodes, groupMap);
            const typeComparer = createComparerByType(order, groupMap, groups);
            nodes.sort(typeComparer);
            if (splitGroups) splitGroupsInternal(nodes, groupMap);
            appendElseStatements(elseStatements);
        }
    }
    return {
        postcssPlugin: "grundy-scss-order",
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
