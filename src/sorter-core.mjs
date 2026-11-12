/**
 * Minimal internal AST contract. Accessors expose syntax facts, not ordering policy.
 * Nodes keep their identities; undefined children denotes a leaf, [] a container.
 * Parsing and serialization stay in the integration layer outside this contract.
 * Accessors are callbacks and must not depend on a receiver (`this`).
 * @typedef {object} AstAdapter
 * @property {(node: object) => string} name Text for startsWith, oneOf and ordering.
 * @property {(node: object) => string} groupType Classification for the type criterion.
 * @property {(node: object) => string | undefined} directive Sass directive name without @.
 * @property {(node: object) => boolean} isAssignment Whether a statement assigns a Sass variable.
 * @property {(node: object) => boolean} isComment
 * @property {(node: object) => string} commentText Comment contents without delimiters.
 * @property {(node: object) => string | null} propertyName Raw CSS name, '*' for opaque property syntax, null otherwise.
 * @property {(node: object) => object[] | undefined} children
 * @property {(container: object, nodes: object[]) => void} replaceChildren Reorder existing siblings, preserving identity and parent links.
 * @property {(node: object) => string} before
 * @property {(node: object, text: string) => void} setBefore
 * @property {(container: object) => void} finishContainer Repair parser-specific trivia after reordering.
 */

/**
 * @typedef {import('prettier-grundy-scss-order').Groups} Groups
 * @typedef {import('prettier-grundy-scss-order').GroupCriteria} GroupCriteria
 * @typedef {object} ChildNode
 * @typedef {Map<ChildNode, string[]>} GroupMap
 * @typedef {{ node: ChildNode, nodes: ChildNode[], ignored: boolean }} SortUnit
 */

import {
    order as defaultOrder,
    groups as defaultGroups,
    withRoot as defaultWithRoot,
    splitGroups as defaultSplitGroups
} from "./presets/default.mjs";
import { validateGroups, validateOrder } from "./configuration.mjs";
import { sortWithPropertyConstraints, createPropertyConflictChecker } from "./property-conflicts.mjs";

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
 * Compile configuration once per sorter, preserving first-occurrence semantics
 * for duplicate group names and duplicate entries in exact ordering lists.
 * @param {Groups} groups
 * @param {string[]} order
 */
function compileGroups(groups, order) {
    const priorities = new Map();
    order.forEach((name, index) => {
        if (!priorities.has(name)) priorities.set(name, index);
    });
    return Object.keys(groups).map(name => {
        const criteria = groups[name];
        const exactRanks = new Map();
        criteria.oneOf?.forEach((property, index) => {
            if (!exactRanks.has(property)) exactRanks.set(property, index);
        });
        return {
            name,
            criteria,
            oneOf: new Set(criteria.oneOf),
            exactRanks,
            priority: priorities.get(name) ?? -1
        };
    });
}

/**
 * @param {string} name
 * @param {string} type
 * @param {ReturnType<typeof compileGroups>[number]} group
 */
function checkCriteria(name, type, group) {
    const criteria = group.criteria;
    for (const criterion in criteria) {
        switch (criterion) {
            case "type":
                if (type != criteria.type) return false;
                break;
            case "startsWith":
                if (!name.startsWith(criteria.startsWith)) return false;
                break;
            case "oneOf":
                if (!group.oneOf.has(name)) return false;
                break;
        }
    }
    return true;
}

/**
 * Build comparison keys once per statement. Group membership is kept separately
 * for blank-line grouping, which can depend on every matching group.
 * @param {SortUnit[]} units
 * @param {ReturnType<typeof compileGroups>} groups
 * @param {AstAdapter} adapter
 */
function prepareNodes(units, groups, adapter) {
    /** @type {GroupMap} */
    const groupMap = new Map();
    const keys = new Map();
    for (const { node } of units) {
        const name = adapter.name(node);
        const type = adapter.groupType(node);
        const matches = [];
        let primary;
        for (const group of groups) {
            if (!checkCriteria(name, type, group)) continue;
            matches.push(group.name);
            if (group.priority !== -1 && (!primary || group.priority < primary.priority)) primary = group;
        }
        groupMap.set(node, matches);
        keys.set(node, {
            name,
            priority: primary?.priority ?? -1,
            order: primary?.criteria.order,
            exactRank: primary?.exactRanks.get(name) ?? -1
        });
    }
    return { groupMap, keys };
}

/** @param {ReturnType<typeof prepareNodes>["keys"]} keys */
function createComparerByType(keys) {
    return (a, b) => {
        const first = keys.get(a);
        const second = keys.get(b);
        if (first.priority === -1 && second.priority === -1) return 0;
        if (first.priority === -1) return 1;
        if (second.priority === -1) return -1;
        if (first.priority !== second.priority) return first.priority - second.priority;
        if (first.order === "alphabetical") {
            if (first.name > second.name) return 1;
            if (first.name < second.name) return -1;
        } else if (first.order === "exact") {
            if (first.exactRank === -1) return 1;
            if (second.exactRank === -1) return -1;
            return first.exactRank - second.exactRank;
        }
        return 0;
    };
}

/**
 * Treat comments as part of a statement, rather than independent sortable nodes.
 * Own-line comments lead the next statement; same-line comments trail the previous
 * statement. Unattached final comments stay at the end of the container.
 * @param {ChildNode[]} nodes
 * @param {AstAdapter} adapter
 * @returns {{ units: SortUnit[], footer: ChildNode[] }}
 */
function collectUnits(nodes, adapter) {
    /** @type {SortUnit[]} */
    const units = [];
    let pending = [];
    for (const node of nodes) {
        const previous = units.at(-1);
        if (adapter.isComment(node)) {
            if (
                previous &&
                pending.length === 0 &&
                !/[\r\n]/.test(adapter.before(node)) &&
                adapter.commentText(node).trim() !== "prettier-ignore"
            ) {
                previous.nodes.push(node);
            } else {
                pending.push(node);
            }
            continue;
        }
        const ignored = pending.some(comment => adapter.commentText(comment).trim() === "prettier-ignore");
        // Comments between branches must not break the if/else association.
        if (adapter.directive(node) === "else" && previous && adapter.directive(previous.node) === "if") {
            for (const comment of pending) previous.nodes.push(comment);
            previous.nodes.push(node);
            previous.ignored ||= ignored;
        } else {
            pending.push(node);
            units.push({ node, nodes: pending, ignored });
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
 * @param {AstAdapter} adapter
 */
function splitGroupsInternal(units, groupMap, groups, adapter) {
    let lastGroup = [];
    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const currentGroups = groupMap.get(unit.node) ?? [];
        const first = unit.nodes[0];
        const newGroup = !lastGroup.some(g => currentGroups.includes(g)) || currentGroups.some(g => groups[g]?.splitItems);
        if (!unit.ignored) {
            adapter.setBefore(first, adapter.before(first).replace(/\r?\n(?:[\t ]*\r?\n)+/g, "\n"));
            if (i > 0 && newGroup) {
                adapter.setBefore(first, "\n\n" + adapter.before(first));
            }
        }
        if (i === 0 || newGroup) lastGroup = currentGroups;
    }
}

/**
 * Create an AST-independent SCSS sorter
 * @param {Object} options - Plugin options
 * @param {Groups} [options.groups={}] - Custom groups to merge with default groups
 * @param {string[]} [options.order] - Order of groups
 * @param {boolean} [options.withRoot=false] - Whether to sort at root level
 * @param {boolean} [options.splitGroups=false] - Whether to add empty lines between groups
 * @param {Groups} [options.presetGroups] - Groups from preset
 * @param {"strict" | "loose" | "conservative" | "structural"} [options.safety="strict"] - Ordering protection (legacy aliases accepted)
 * @param {AstAdapter} adapter
 * @returns {(root: object) => void}
 */
export function createSorter(
    {
        groups = {},
        order = defaultOrder,
        withRoot = defaultWithRoot,
        splitGroups = defaultSplitGroups,
        presetGroups,
        safety = "strict"
    } = {},
    adapter
) {
    if (safety === "conservative") safety = "strict";
    if (safety === "structural") safety = "loose";
    if (safety !== "strict" && safety !== "loose") {
        throw new Error(`Unknown SCSS sorter safety mode: ${safety}`);
    }
    validateGroups(groups);
    if (presetGroups !== undefined) validateGroups(presetGroups, "preset.groups");
    if (typeof withRoot !== "boolean" || typeof splitGroups !== "boolean") {
        throw new Error("Invalid SCSS sorter configuration: withRoot and splitGroups must be booleans.");
    }
    groups = Object.assign(Object.create(null), defaultGroups, presetGroups, groups);
    validateOrder(order, groups);
    const compiledGroups = compileGroups(groups, order);
    /** @type {WeakMap<ChildNode, boolean>} */
    let executionBoundaries = new WeakMap();
    let emitted;
    let propertyNamesConflict;

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
            adapter.isAssignment(node) ||
            executionDirectives.has(adapter.directive(node)) ||
            (adapter.children(node)?.some(hasExecutionBoundary) ?? false);
        executionBoundaries.set(node, boundary);
        return boundary;
    }

    // A nested CSS block can emit declarations at the enclosing selector (media,
    // supports, &) or at an overlapping selector. Keep conflicting declarations
    // on their original side without trying to prove selector disjointness.
    function emittedProperties(node) {
        if (emitted.has(node)) return emitted.get(node);
        if (["mixin", "function"].includes(adapter.directive(node))) return [];
        const property = adapter.propertyName(node);
        if (property !== null) return [property];
        const properties = new Set();
        for (const child of adapter.children(node) ?? []) {
            for (const name of emittedProperties(child)) properties.add(name);
        }
        const result = [...properties];
        emitted.set(node, result);
        return result;
    }

    function declarationCrossings(segment) {
        if (!segment.some(unit => adapter.children(unit.node))) return [];
        const declarations = segment.map(unit => adapter.propertyName(unit.node));
        const positions = [];
        for (let i = 0; i < declarations.length; i++) if (declarations[i] !== null) positions.push(i);
        if (!positions.length) return [];
        emitted ??= new WeakMap();
        propertyNamesConflict ??= createPropertyConflictChecker();
        const edges = [];
        for (let i = 0; i < segment.length; i++) {
            if (declarations[i] !== null) continue;
            const properties = segment[i].nodes.flatMap(emittedProperties);
            if (!properties.length) continue;
            for (const j of positions) {
                if (properties.some(name => propertyNamesConflict(name, declarations[j]))) {
                    edges.push([Math.min(i, j), Math.max(i, j)]);
                }
            }
        }
        return edges;
    }

    /**
     * @param {object} container
     * @param {boolean} shouldSort
     */
    function sortContainer(container, shouldSort = true) {
        const children = adapter.children(container);
        if (!children) return;
        const { units, footer } = collectUnits(children, adapter);
        if (shouldSort) {
            const { groupMap, keys } = prepareNodes(units, compiledGroups, adapter);
            const compare = createComparerByType(keys);
            // Boundaries stay in place regardless of the configured group order.
            // Check every branch of a collected if/else unit, not only its first node.
            let start = 0;
            for (let i = 0; i <= units.length; i++) {
                if (
                    i === units.length ||
                    units[i].ignored ||
                    (safety === "strict" && units[i].nodes.some(hasExecutionBoundary))
                ) {
                    const segment = units.slice(start, i);
                    const sorted =
                        safety === "strict" ?
                            sortWithPropertyConstraints(
                                segment,
                                compare,
                                adapter.propertyName,
                                declarationCrossings(segment)
                            )
                        :   segment.sort((a, b) => compare(a.node, b.node));
                    for (let j = 0; j < sorted.length; j++) units[start + j] = sorted[j];
                    start = i + 1;
                }
            }
            if (splitGroups) splitGroupsInternal(units, groupMap, groups, adapter);
            for (let i = 1; i < units.length; i++) {
                const first = units[i].nodes[0];
                if (adapter.isComment(first) && !/[\r\n]/.test(adapter.before(first))) {
                    adapter.setBefore(first, "\n" + adapter.before(first));
                }
            }
            const reordered = new Array(children.length);
            let position = 0;
            for (const unit of units) {
                for (const node of unit.nodes) reordered[position++] = node;
            }
            for (const node of footer) reordered[position++] = node;
            adapter.replaceChildren(container, reordered);
            adapter.finishContainer(container);
        }
        for (const unit of units) {
            if (unit.ignored) continue;
            for (const node of unit.nodes) {
                if (adapter.children(node)) sortContainer(node);
            }
        }
    }
    return root => {
        // A plugin instance may process another tree, or a tree edited by its caller.
        executionBoundaries = new WeakMap();
        emitted = undefined;
        propertyNamesConflict = undefined;
        sortContainer(root, withRoot);
    };
}
