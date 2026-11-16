import prettierPostcss from "prettier/parser-postcss";
import postcss from "postcss";
import postcssScss from "postcss-scss";
import { grundyPropSorter } from "./grundy-prop-sorter.mjs";
import { resolveConfiguration } from "./configuration.mjs";

/**
 * @typedef {import('prettier-grundy-scss-order').PrettierGrundyScssOptions} PrettierGrundyScssOptions
 */

/**
 * Parse and sort SCSS text using the grundy sorter
 * @param {string} text - The SCSS text to parse and sort
 * @param {PrettierGrundyScssOptions} options - The options for sorting
 * @returns {Promise<import('prettier').AST>} - The parsed AST
 */
async function grundyParseSorter(text, options) {
    const configuration = await resolveConfiguration(options);
    // Construct first: invalid configuration must still fail before SCSS parsing.
    const sorter = grundyPropSorter(configuration);
    const root = postcssScss.parse(text, { from: undefined });
    let sortedCss;
    // Processor also removes/regenerates source-map annotations, including a
    // missing external map whose annotation must be removed from the root.
    if (
        root.source.input.map ||
        root.nodes.some(node => node.type === "comment" && node.text.startsWith("# sourceMappingURL="))
    ) {
        const processed = await postcss([sorter]).process(root, { from: undefined, syntax: postcssScss });
        sortedCss = processed.css;
    } else {
        sorter.OnceExit(root);
        sortedCss = root.toString(postcssScss.stringify);
    }
    options.originalText = sortedCss;
    return prettierPostcss.parsers[options.parser].parse(sortedCss, [options.parser], options);
}

export const options = {
    grundyScssSorterSafety: {
        type: "choice",
        category: "grundy-scss-declaration-sorter",
        description: "Apply strict ordering constraints, or allow configured ordering in loose mode",
        default: "strict",
        choices: [
            { value: "strict", description: "Preserve execution boundaries and conflicting property order" },
            {
                value: "loose",
                description: "Allow configured ordering; preserve comments, if/else chains and prettier-ignore"
            },
            { value: "conservative", description: "Compatibility alias for strict" },
            { value: "structural", description: "Compatibility alias for loose" }
        ]
    },
    grundyScssSorterWithRoot: {
        type: "boolean",
        description: "Flag if need sort root node",
        category: "grundy-scss-declaration-sorter"
    },
    grundyScssSorterSplitGroup: {
        type: "boolean",
        description: "Flag if need split groups with empty line",
        category: "grundy-scss-declaration-sorter"
    },
    grundyScssSorterGroups: {
        type: "string",
        description: "Map of groups with criterias. This append new groups.",
        category: "grundy-scss-declaration-sorter"
    },
    grundyScssSorterPreset: {
        type: "string",
        description: "Preset groups and orders",
        category: "grundy-scss-declaration-sorter"
    },
    grundyScssSorterGroupsOrder: {
        type: "string",
        array: true,
        description: "An array of property names, their order is used to sort with. This overrides default ordering!",
        category: "grundy-scss-declaration-sorter",
        default: [{ value: [] }]
    }
};

export const parsers = {
    scss: {
        ...prettierPostcss.parsers.scss,
        parse: grundyParseSorter
    }
};

export default { options, parsers };
