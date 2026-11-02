// Shorthands reset omitted longhands too. Logical properties may target the same
// physical side depending on writing-mode and direction, so preserve their order.
// https://www.w3.org/TR/css-cascade-5/#shorthand
// https://www.w3.org/TR/css-logical-1/#box
// https://www.w3.org/TR/css-text-4/#white-space-property
const aliases = new Map([
    ["grid-gap", "gap"],
    ["grid-row-gap", "row-gap"],
    ["grid-column-gap", "column-gap"],
    ["word-wrap", "overflow-wrap"],
    ["page-break-before", "break-before"],
    ["page-break-after", "break-after"],
    ["page-break-inside", "break-inside"]
]);

// Relationships not covered by a shared property-name prefix.
const extraLonghands = new Map([
    ["font", ["line-height"]],
    ["columns", ["column-width", "column-count", "column-height"]],
    ["gap", ["row-gap", "column-gap"]],
    ["place-content", ["align-content", "justify-content"]],
    ["place-items", ["align-items", "justify-items"]],
    ["place-self", ["align-self", "justify-self"]],
    ["white-space", ["text-wrap-mode"]],
    ["text-spacing", ["text-autospace"]],
    ["line-clamp", ["max-lines", "block-ellipsis", "continue"]],
    ["vertical-align", ["alignment-baseline", "baseline-shift", "baseline-source"]]
]);

function normalize(property) {
    const name = property.toLowerCase().replace(/^-(webkit|moz|ms|o)-/, "");
    return aliases.get(name) ?? name;
}

function contains(shorthand, property) {
    return property === shorthand || property.startsWith(shorthand + "-");
}

function expandsTo(shorthand, property) {
    return contains(shorthand, property) || (extraLonghands.get(shorthand) ?? []).some(name => contains(name, property));
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

function namesConflict(first, second) {
    if (first === null || second === null) return false;
    if (first.raw === "*" || second.raw === "*") return true;
    // Custom properties are case-sensitive and are not affected by `all`.
    if (first.raw.startsWith("--") || second.raw.startsWith("--")) return first.raw === second.raw;
    const a = first.name;
    const b = second.name;
    if (a === "all" || b === "all") {
        return !["direction", "unicode-bidi"].includes(a === "all" ? b : a);
    }
    if (expandsTo(a, b) || expandsTo(b, a)) return true;

    // Overlapping shorthands (border-top/border-color, grid-area/grid-row, etc.).
    // Keep these families conservative rather than guessing from their values.
    for (const family of ["border", "grid"]) {
        if (contains(family, a) && contains(family, b)) return true;
    }
    for (const family of ["margin", "padding", "scroll-margin", "scroll-padding", "overflow", "overscroll-behavior"]) {
        const logical = /-(inline|block)(-|$)/;
        if (contains(family, a) && contains(family, b) && (logical.test(a) || logical.test(b))) return true;
    }
    const offsets = /^(top|right|bottom|left|inset(?:-.+)?)$/;
    if (offsets.test(a) && offsets.test(b)) return true;
    const size = /^(min-|max-)?(width|height|inline-size|block-size)$/;
    if (size.test(a) && size.test(b) && /(?:inline|block)-size/.test(a + " " + b)) return true;
    // text-wrap and white-space overlap through text-wrap-mode.
    if ((a === "text-wrap" && b === "white-space") || (b === "text-wrap" && a === "white-space")) return true;
    return false;
}

/**
 * Stable topological ordering: original conflicting pairs are hard constraints;
 * the configured comparer chooses between currently unconstrained statements.
 * A special-case Array.sort comparator would not be transitive for these pairs.
 * @template {{ node: import('postcss').ChildNode }} T
 * @param {T[]} units
 * @param {(a: import('postcss').ChildNode, b: import('postcss').ChildNode) => number} compare
 * @returns {T[]}
 */
export function sortWithPropertyConstraints(units, compare) {
    const names = units.map(unit => {
        const raw = propertyName(unit.node);
        // Preserve the original name for custom-property detection: removing a
        // vendor prefix must not turn an ordinary property into a custom one.
        return raw === null ? null : { raw, name: raw.startsWith("--") ? raw : normalize(raw) };
    });
    const successors = units.map(() => []);
    const incoming = units.map(() => 0);
    for (let i = 0; i < units.length; i++) {
        for (let j = i + 1; j < units.length; j++) {
            if (namesConflict(names[i], names[j])) {
                successors[i].push(j);
                incoming[j]++;
            }
        }
    }
    const sorted = [];
    while (sorted.length < units.length) {
        let best = -1;
        for (let i = 0; i < units.length; i++) {
            if (incoming[i] !== 0) continue;
            if (best === -1 || compare(units[i].node, units[best].node) < 0) best = i;
        }
        // Edges always point forwards in the original input, so there is no cycle.
        sorted.push(units[best]);
        incoming[best] = -1;
        for (const next of successors[best]) incoming[next]--;
    }
    return sorted;
}
