import { corpusSources, corpusProject, hash } from "./corpus.mjs";

const declarations = count => Array.from({ length: count }, (_, i) => `property-${count - i}: 0;`).join("");
export const scenarios = [
    { id: "independent-100", source: `.a { ${declarations(100)} }` },
    { id: "independent-1000", source: `.a { ${declarations(1000)} }` },
    { id: "conflicts-500", source: `.a { ${Array.from({ length: 500 }, (_, i) => `border-${i}: 0;`).join("")} }` },
    {
        id: "nested-media",
        source: `.a { ${Array.from({ length: 30 }, (_, i) => `property-${i}: 0; @media (min-width: ${600 + i}px) { color: red; ${declarations(15)} }`).join("")} color: blue; }`
    },
    { id: "deep-35", source: `.root { ${".a {".repeat(35)}color: red;${"}".repeat(35)} color: blue; }` },
    {
        id: "comments",
        source: `.a { ${Array.from({ length: 500 }, (_, i) => `\n/* leading ${i} */\n// line ${i}\nproperty-${500 - i}: 0; // trailing ${i}\n`).join("")}\n/* footer */\n}`
    },
    {
        id: "if-else-comments",
        source: `.a { z-index: 1; @if $flag { width: 1px; color: red; } ${Array.from({ length: 30 }, (_, i) => `\n// branch ${i}\n@else if $flag == ${i} { width: 1px; color: blue; }`).join("")} color: green; }`
    },
    { id: "real-grundyjs", project: "grundyjs.ru" },
    { id: "real-landos", project: "landos-new" },
    { id: "real-falcon", project: "falcon-frontend-main" },
    { id: "real-eywa", project: "eywa-neo2" }
];

// Whole files stay independent: concatenating SCSS merges scopes and modules.
export function scenarioSources(scenario) {
    return scenario.project ? corpusSources(scenario.project) : [{ path: "input.scss", source: scenario.source }];
}

export function scenarioText(scenario, sources, texts) {
    return scenario.project ? JSON.stringify(sources.map((file, i) => [file.path, texts[i]])) : texts[0];
}

export function scenarioInfo(scenario) {
    const sources = scenarioSources(scenario);
    const info = {
        id: scenario.id,
        kind: scenario.project ? "real" : "synthetic",
        files: sources.length,
        bytes: sources.reduce((n, f) => n + Buffer.byteLength(f.source), 0),
        inputHash: hash(
            scenarioText(
                scenario,
                sources,
                sources.map(f => f.source)
            )
        )
    };
    if (scenario.project) {
        const project = corpusProject(scenario.project);
        info.corpus = { project: project.id, revision: project.revision, digest: project.digest, files: project.files };
    }
    return info;
}
