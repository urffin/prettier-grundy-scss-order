// Shared by the actual browser bundle and the independent Node.js reference.
// Only this test wrapper observes internals; published production code is unchanged.
export function createBrowserRuntime({ prettier, native, plugin, postcss, scss, resolveConfiguration, grundyPropSorter }) {
    const processor = {
        ...plugin,
        parsers: {
            scss: {
                ...plugin.parsers.scss,
                async parse(text, options) {
                    const sorter = grundyPropSorter(await resolveConfiguration(options));
                    const root = scss.parse(text, { from: undefined });
                    const result = await postcss([sorter]).process(root, { from: undefined, syntax: scss });
                    options.originalText = result.css;
                    return native.parsers.scss.parse(result.css, [options.parser], options);
                }
            }
        }
    };
    async function probe(source, options, implementation) {
        const originalProcess = postcss.Processor.prototype.process;
        const originalParse = scss.parse;
        const calls = { parses: 0, processes: 0 };
        postcss.Processor.prototype.process = function (...args) {
            calls.processes++;
            return originalProcess.apply(this, args);
        };
        scss.parse = function (...args) {
            calls.parses++;
            return originalParse.apply(this, args);
        };
        try {
            const output = await prettier.format(source, { ...options, parser: "scss", plugins: [native, implementation] });
            return { output, calls };
        } catch (error) {
            return {
                error: Object.fromEntries(
                    ["name", "message", "reason", "line", "column", "endLine", "endColumn"]
                        .filter(key => error[key] !== undefined)
                        .map(key => [key, error[key]])
                ),
                calls
            };
        } finally {
            postcss.Processor.prototype.process = originalProcess;
            scss.parse = originalParse;
        }
    }
    return {
        prettierVersion: prettier.version,
        async run(test) {
            const first = await probe(test.source, test.options, plugin);
            const reference = await probe(test.source, test.options, processor);
            const second = first.error ? null : await probe(first.output, test.options, plugin);
            return { id: test.id, first, reference, second };
        }
    };
}
