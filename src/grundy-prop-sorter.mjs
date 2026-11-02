import { createSorter } from "./sorter-core.mjs";
import { postcssAdapter } from "./postcss-adapter.mjs";

/**
 * Preserve the PostCSS plugin entry point; the sorting policy lives in the core.
 * @param {Parameters<typeof createSorter>[0]} [options]
 * @returns {import('postcss').Plugin}
 */
export function grundyPropSorter(options) {
    const sort = createSorter(options, postcssAdapter);
    return { postcssPlugin: "grundy-scss-order", OnceExit: sort };
}

grundyPropSorter.postcss = true;
