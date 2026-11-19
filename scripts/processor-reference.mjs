// Retain the pre-direct integration as an independent reference for checks.
import postcss from "postcss";
import scss from "postcss-scss";
import native from "prettier/parser-postcss";
import { options } from "../src/index.mjs";
import { resolveConfiguration } from "../src/configuration.mjs";
import { grundyPropSorter } from "../src/grundy-prop-sorter.mjs";

export function createProcessorPlugin() {
    return {
        options,
        parsers: {
            scss: {
                ...native.parsers.scss,
                async parse(text, options) {
                    const config = await resolveConfiguration(options);
                    const processed = await postcss([grundyPropSorter(config)]).process(text, {
                        from: undefined,
                        syntax: scss
                    });
                    options.originalText = processed.css;
                    return native.parsers.scss.parse(processed.css, [options.parser], options);
                }
            }
        }
    };
}
