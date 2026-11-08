import { appendFile } from "node:fs/promises";
import scss from "postcss-scss";
import prettier from "prettier";
import { grundyPropSorter } from "../src/grundy-prop-sorter.mjs";

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const scenarios = [
    ["100 independent declarations", Array.from({ length: 100 }, (_, i) => `property-${100 - i}: 0;`).join("")],
    ["1000 independent declarations", Array.from({ length: 1000 }, (_, i) => `property-${1000 - i}: 0;`).join("")],
    ["500 conflicting declarations", Array.from({ length: 500 }, (_, i) => `border-${i}: 0;`).join("")]
];
const rows = [];
for (const [scenario, declarations] of scenarios) {
    for (const safety of ["strict", "loose"]) {
        const samples = [];
        for (let round = 0; round < 8; round++) {
            const tree = scss.parse(`.a {${declarations}}`);
            const start = performance.now();
            grundyPropSorter({ safety }).OnceExit(tree);
            const elapsed = performance.now() - start;
            if (round) samples.push(elapsed);
        }
        rows.push({ scenario, safety, medianMs: Number(median(samples).toFixed(3)) });
    }
}
console.log(
    JSON.stringify(
        {
            node: process.version,
            prettier: prettier.version,
            measurement: "Sorter creation and AST ordering; excludes parsing and printing; seven samples after warmup",
            rows
        },
        null,
        2
    )
);
if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### Sorting benchmark\n\nNode ${process.version}, Prettier ${prettier.version}. Seven samples after warmup; parsing and printing excluded. Timing is informational, without thresholds.\n\n` +
            "| Scenario | Mode | Median, ms |\n| --- | --- | ---: |\n" +
            rows.map(row => `| ${row.scenario} | ${row.safety} | ${row.medianMs} |`).join("\n") +
            "\n"
    );
}
