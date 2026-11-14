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
    }
];
