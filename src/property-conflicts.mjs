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

// Only known properties get narrower write sets; unfamiliar extensions retain
// the conservative family fallback below.
const gridWrites = new Map([
    ["grid", ["rows", "columns", "areas", "auto-rows", "auto-columns", "auto-flow"]],
    ["grid-template", ["rows", "columns", "areas"]],
    ["grid-template-rows", ["rows"]],
    ["grid-template-columns", ["columns"]],
    ["grid-template-areas", ["areas"]],
    ["grid-auto-rows", ["auto-rows"]],
    ["grid-auto-columns", ["auto-columns"]],
    ["grid-auto-flow", ["auto-flow"]],
    ["grid-area", ["row-start", "row-end", "column-start", "column-end"]],
    ["grid-row", ["row-start", "row-end"]],
    ["grid-column", ["column-start", "column-end"]],
    ["grid-row-start", ["row-start"]],
    ["grid-row-end", ["row-end"]],
    ["grid-column-start", ["column-start"]],
    ["grid-column-end", ["column-end"]]
]);
const radius = /^border-(?:radius|(?:top|bottom)-(?:left|right)-radius|(?:start|end)-(?:start|end)-radius)$/;
const borderStrokeOrImage =
    /^border(?:-(?:(?:top|right|bottom|left|(?:block|inline)(?:-(?:start|end))?)(?:-(?:width|style|color))?|width|style|color|image(?:-(?:source|slice|width|outset|repeat))?))?$/;
const physicalInset = /^(top|right|bottom|left)$/;

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
    if (physicalInset.test(a) && physicalInset.test(b)) return a === b;
    if ((radius.test(a) && borderStrokeOrImage.test(b)) || (radius.test(b) && borderStrokeOrImage.test(a))) return false;
    if (gridWrites.has(a) && gridWrites.has(b)) {
        return gridWrites.get(a).some(property => gridWrites.get(b).includes(property));
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

// Candidate indexes only discard pairs that cannot conflict. The predicate above
// remains authoritative, including exceptions such as all/direction and custom names.
function prefixes(name) {
    const result = [name];
    for (let i = name.indexOf("-"); i !== -1; i = name.indexOf("-", i + 1)) result.push(name.slice(0, i));
    return result;
}

const candidateFamilies = new Map();
for (const family of [
    "border",
    "grid",
    "margin",
    "padding",
    "scroll-margin",
    "scroll-padding",
    "overflow",
    "overscroll-behavior"
]) {
    candidateFamilies.set(family, [family]);
}
for (const [shorthand, longhands] of extraLonghands) {
    for (const member of [shorthand, ...longhands]) {
        if (!candidateFamilies.has(member)) candidateFamilies.set(member, []);
        candidateFamilies.get(member).push("extra:" + shorthand);
    }
}

function families(name, ancestors) {
    const result = [];
    for (const ancestor of ancestors) result.push(...(candidateFamilies.get(ancestor) ?? []));
    if (/^(top|right|bottom|left|inset(?:-.+)?)$/.test(name)) result.push("offsets");
    if (/^(min-|max-)?(width|height|inline-size|block-size)$/.test(name)) result.push("size");
    if (name === "text-wrap" || name === "white-space") result.push("text-wrap-overlap");
    return result;
}

function addToIndex(index, key, position) {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(position);
}

function addDirectConstraints(names, successors, incoming, start = 0) {
    for (let i = 0; i < names.length; i++) {
        for (let j = Math.max(i + 1, start); j < names.length; j++) {
            if (namesConflict(names[i], names[j])) {
                successors[i].push(j);
                incoming[j]++;
            }
        }
    }
}

function buildConstraints(names, successors, incoming) {
    // Index construction costs more than a few direct comparisons. Keep short
    // segments simple; the index pays off on larger declaration blocks.
    if (names.length < 32) {
        addDirectConstraints(names, successors, incoming);
        return;
    }
    const exact = new Map();
    const descendants = new Map();
    const related = new Map();
    const custom = new Map();
    const declarations = [];
    const ordinary = [];
    const opaque = [];
    const resets = [];
    for (let j = 0; j < names.length; j++) {
        const current = names[j];
        if (current === null) continue;
        const candidates = new Set(opaque);
        const include = positions => {
            for (const i of positions ?? []) candidates.add(i);
        };
        const isCustom = current.raw.startsWith("--");
        let ancestors = [];
        let groups = [];
        if (current.raw === "*") {
            include(declarations);
        } else if (isCustom) {
            include(custom.get(current.raw));
        } else {
            include(resets);
            if (current.name === "all") include(ordinary);
            ancestors = prefixes(current.name);
            groups = families(current.name, ancestors);
            for (const name of ancestors) include(exact.get(name));
            include(descendants.get(current.name));
            for (const group of groups) include(related.get(group));
        }
        // Dense families and broad resets leave little work to discard. Avoid
        // paying for candidate sets as well as nearly all pair comparisons.
        if (j >= 32 && candidates.size * 2 >= j) {
            addDirectConstraints(names, successors, incoming, j);
            return;
        }
        for (const i of candidates) {
            if (namesConflict(names[i], current)) {
                successors[i].push(j);
                incoming[j]++;
            }
        }
        declarations.push(j);
        if (current.raw === "*") opaque.push(j);
        else if (isCustom) addToIndex(custom, current.raw, j);
        else {
            ordinary.push(j);
            if (current.name === "all") resets.push(j);
            addToIndex(exact, current.name, j);
            for (const name of ancestors) addToIndex(descendants, name, j);
            for (const group of groups) addToIndex(related, group, j);
        }
    }
}

/**
 * Stable topological ordering: original conflicting pairs are hard constraints;
 * the configured comparer chooses between currently unconstrained statements.
 * A special-case Array.sort comparator would not be transitive for these pairs.
 * @template {{ node: object }} T
 * @param {T[]} units
 * @param {(a: object, b: object) => number} compare
 * @param {(node: object) => string | null} propertyName
 * @returns {T[]}
 */
export function sortWithPropertyConstraints(units, compare, propertyName) {
    const names = units.map(unit => {
        const raw = propertyName(unit.node);
        // Preserve the original name for custom-property detection: removing a
        // vendor prefix must not turn an ordinary property into a custom one.
        return raw === null ? null : { raw, name: raw.startsWith("--") ? raw : normalize(raw) };
    });
    const successors = units.map(() => []);
    const incoming = units.map(() => 0);
    buildConstraints(names, successors, incoming);
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
