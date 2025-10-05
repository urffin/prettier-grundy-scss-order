/**
 * @typedef {import('prettier-grundy-scss-order').Groups} Groups
 */

/**
 * Default order of groups for sorting
 * @type {string[]}
 */
export const order = ["@use", "@extend", "--variable", "$variable", "@if", "decl", "@include", "@mixin", "rule"];

/**
 * Default group definitions using type-based criteria
 * @type {Groups}
 */
export const groups = {
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

/**
 * Whether to sort properties at root level
 * @type {boolean}
 */
export const withRoot = true;

/**
 * Whether to add empty lines between groups
 * @type {boolean}
 */
export const splitGroups = false;
