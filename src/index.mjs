import prettierPostcss from "prettier/parser-postcss";
import postcss from "postcss";
import postcssScss from "postcss-scss";
import { grundyPropSorter } from "./grundy-prop-sorter.mjs";
import { tryLoadPreset } from "./tryLoadPreset.mjs";

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
    const {
        grundyScssSorterGroups,
        grundyScssSorterWithRoot,
        grundyScssSorterGroupsOrder,
        grundyScssSorterSplitGroup,
        grundyScssSorterPreset
    } = options;

    const preset = await tryLoadPreset(grundyScssSorterPreset);

    const processed = await postcss([
        grundyPropSorter({
            groups: grundyScssSorterGroups ? JSON.parse(grundyScssSorterGroups) : undefined,
            order: grundyScssSorterGroupsOrder ?? preset?.order,
            withRoot: grundyScssSorterWithRoot ?? preset?.withRoot,
            splitGroups: grundyScssSorterSplitGroup ?? preset?.splitGroups,
            presetGroups: preset?.groups
        })
    ]).process(text, {
        from: undefined,
        syntax: postcssScss
    });
    const sortedCss = processed.css;
    options.originalText = sortedCss;
    return prettierPostcss.parsers[options.parser].parse(sortedCss, [options.parser], options);
}

export const options = {
    grundyScssSorterWithRoot: {
        type: "boolean",
        description: "Flag if need sort root node",
        category: "grundy-scss-declaration-sorter",
        default: false
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
        category: "grundy-scss-declaration-sorter"
    }
};
export const parsers = {
    scss: {
        ...prettierPostcss.parsers.scss,
        parse: grundyParseSorter
    }
};
export default { options, parsers };
