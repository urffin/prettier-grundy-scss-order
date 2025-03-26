import prettierPostcss from "prettier/parser-postcss";
import postcss from "postcss";
import postcssScss from "postcss-scss";
import { grundyPropSorter } from "./grundy-prop-sorter.mjs";

/**
 *
 * @param {string} text
 * @param {*} options
 * @returns
 */
function grundyParseSorter(text, options) {
    const { grundyScssSorterGroups, grundyScssSorterWithRoot, grundyScssSorterGroupsOrder, grundyScssSorterSplitGroup } =
        options;
    return postcss([
        grundyPropSorter({
            groups: grundyScssSorterGroups ? JSON.parse(grundyScssSorterGroups) : undefined,
            order: grundyScssSorterGroupsOrder,
            withRoot: grundyScssSorterWithRoot,
            splitGroups: grundyScssSorterSplitGroup
        })
    ])
        .process(text, {
            from: undefined,
            syntax: postcssScss
        })
        .then(result => result.css)
        .then(sortedCss => {
            options.originalText = sortedCss;
            return prettierPostcss.parsers[options.parser].parse(sortedCss, [options.parser], options);
        });
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
        category: "grundy-scss-declaration-sorter",
        default: false
    },
    grundyScssSorterGroups: {
        type: "string",
        description: "Map of groups with criterias. This append new groups.",
        category: "grundy-scss-declaration-sorter"
    },
    grundyScssSorterGroupsOrder: {
        type: "string",
        array: true,
        description: "An array of property names, their order is used to sort with. This overrides default ordering!",
        category: "grundy-scss-declaration-sorter",
        default: [{ value: ["@use", "--variable", "$variable", "decl", "@if", "@include", "@mixin", "rule"] }]
    }
};
export const parsers = {
    scss: {
        ...prettierPostcss.parsers.scss,
        parse: grundyParseSorter
    }
};
