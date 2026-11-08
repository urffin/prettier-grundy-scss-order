import * as defaults from "./presets/default.mjs";
import { tryLoadPreset } from "./tryLoadPreset.mjs";

const nodeTypes = new Set([
    "use",
    "extend",
    "mixin",
    "include",
    "if",
    "else",
    "atrule",
    "rule",
    "decl",
    "$variable",
    "variable",
    "media",
    "supports",
    "comment"
]);
const fields = new Set(["type", "startsWith", "oneOf", "order", "splitItems"]);
const record = value =>
    value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function invalid(path, message) {
    throw new Error(`Invalid SCSS sorter configuration: ${path} ${message}`);
}
function strings(value, path) {
    if (!Array.isArray(value)) invalid(path, "must be an array of strings.");
    for (const item of value) {
        if (typeof item !== "string") invalid(path, "must be an array of strings.");
    }
}

/** Validate before compiling comparison keys, including direct PostCSS/core use. */
export function validateGroups(groups, path = "grundyScssSorterGroups") {
    if (!record(groups)) invalid(path, "must be an object mapping group names to criteria.");
    for (const [name, criteria] of Object.entries(groups)) {
        const location = `${path}[${JSON.stringify(name)}]`;
        if (!name.trim()) invalid(path, "must use non-empty group names.");
        if (!record(criteria)) invalid(location, "must be an object.");
        for (const key of Object.keys(criteria)) {
            if (!fields.has(key)) invalid(`${location}.${key}`, "is an unknown criterion.");
            const value = criteria[key];
            if (key === "type" && !nodeTypes.has(value))
                invalid(`${location}.type`, `must be one of: ${[...nodeTypes].join(", ")}.`);
            if (key === "startsWith" && typeof value !== "string") invalid(`${location}.startsWith`, "must be a string.");
            if (key === "oneOf") strings(value, `${location}.oneOf`);
            if (key === "order" && value !== "exact" && value !== "alphabetical")
                invalid(`${location}.order`, 'must be "exact" or "alphabetical".');
            if (key === "splitItems" && typeof value !== "boolean") invalid(`${location}.splitItems`, "must be a boolean.");
        }
        if (criteria.order === "exact" && !Object.hasOwn(criteria, "oneOf"))
            invalid(location, 'requires oneOf when order is "exact".');
    }
}

export function validateOrder(order, groups) {
    strings(order, "grundyScssSorterGroupsOrder");
    for (const name of order) {
        if (!Object.hasOwn(groups, name))
            invalid("grundyScssSorterGroupsOrder", `references unknown group ${JSON.stringify(name)}.`);
    }
}

/** Prettier supplies [] for an omitted array option; [] therefore means inherit. */
export async function resolveConfiguration(options) {
    const preset = await tryLoadPreset(options.grundyScssSorterPreset);
    let groups;
    if (options.grundyScssSorterGroups !== undefined) {
        if (typeof options.grundyScssSorterGroups !== "string") invalid("grundyScssSorterGroups", "must be a JSON string.");
        try {
            groups = JSON.parse(options.grundyScssSorterGroups);
        } catch (cause) {
            throw new Error(
                `Invalid SCSS sorter configuration: grundyScssSorterGroups contains invalid JSON: ${cause.message}`,
                { cause }
            );
        }
    }
    const explicitOrder = options.grundyScssSorterGroupsOrder;
    if (explicitOrder !== undefined) strings(explicitOrder, "grundyScssSorterGroupsOrder");
    return {
        groups,
        presetGroups: preset?.groups,
        order: explicitOrder?.length ? explicitOrder : (preset?.order ?? defaults.order),
        withRoot: options.grundyScssSorterWithRoot ?? preset?.withRoot ?? defaults.withRoot,
        splitGroups: options.grundyScssSorterSplitGroup ?? preset?.splitGroups ?? defaults.splitGroups,
        safety: options.grundyScssSorterSafety ?? "conservative"
    };
}
