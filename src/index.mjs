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
    const processed = await postcss([grundyPropSorter(configuration)]).process(text, {
        from: undefined,
        syntax: postcssScss
    });
    const sortedCss = processed.css;
    options.originalText = sortedCss;
    return prettierPostcss.parsers[options.parser].parse(sortedCss, [options.parser], options);
}

export const options = {
    grundyScssSorterSafety: {
        type: "choice",
        category: "grundy-scss-declaration-sorter",
        description: "Preserve semantic ordering, or explicitly allow configured ordering with structural protection only",
        default: "conservative",
        choices: [
            { value: "conservative", description: "Preserve execution boundaries and conflicting property order" },
            {
                value: "structural",
                description: "Allow configured ordering; preserve comments, if/else chains and prettier-ignore"
            }
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
