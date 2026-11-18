import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const hash = text => createHash("sha256").update(text).digest("hex");
const mapPattern = /\/\*# sourceMappingURL=data:application\/json[^,]*;base64,([^\s*]+)\s*\*\//g;
const annotations = text => [...text.matchAll(/\/\*# sourceMappingURL=([\s\S]*?)\*\//g)].map(match => match[1].trim());
export function canonicalMapOutput(text) {
    return text.replace(mapPattern, (_, data) => {
        const map = JSON.parse(Buffer.from(data, "base64").toString());
        map.sources = map.sources?.map(source =>
            source
                .replace(/<input css [^>]+>/g, "<input css ID>")
                .replace(/%3Cinput%20css%20[^%]+%3E/g, "%3Cinput%20css%20ID%3E")
        );
        return "/*# sourceMappingURL=" + JSON.stringify(map) + " */";
    });
}
export async function verifyBrowserResults({ cases, nodeRows, browser, prettier }) {
    assert.equal(browser.environment.document, "object", "Must run in a browser document");
    assert.equal(browser.environment.window, "object");
    for (const key of ["nodeProcess", "nodeRequire", "nodeBuffer"]) assert.equal(browser.environment[key], "undefined", key);
    assert.match(browser.environment.userAgent, /Chrome|Chromium|Edg|Firefox|Safari/);
    assert.equal(browser.environment.prettier, prettier.version, "Node and browser must use the same Prettier");
    assert.equal(browser.rows.length, cases.length, "Complete browser case coverage");
    assert.equal(nodeRows.length, cases.length);
    assert.equal(new Set(browser.rows.map(row => row.id)).size, cases.length, "No duplicate browser results");
    const byId = new Map(browser.rows.map(row => [row.id, row]));
    const css = async text =>
        prettier.format(text.replace(/\/\*# sourceMappingURL=[\s\S]*?\*\//g, ""), { parser: "scss", plugins: [] });
    const rows = [];
    for (const [index, test] of cases.entries()) {
        const node = nodeRows[index],
            actual = byId.get(test.id);
        assert.equal(node.id, test.id);
        assert.ok(actual, test.id);
        for (const [platform, result] of [
            ["node", node],
            ["browser", actual]
        ]) {
            const label = `${test.id} (${platform})`;
            assert.equal(result.first.calls.processes, test.path[platform], `${label}: direct/fallback`);
            const skipsParser = test.id.startsWith("configuration-error/") || test.source.trim() === "";
            assert.equal(
                result.first.calls.parses,
                skipsParser ? 0 : 1,
                `${label}: parse once unless Prettier skips empty input`
            );
            if (result.first.error) {
                assert.deepEqual(result.first.error, result.reference.error, `${label}: Processor error reference`);
                assert.equal(result.second, null);
            } else {
                assert.equal(typeof result.first.output, "string", label);
                assert.equal(result.reference.error, undefined, label);
                assert.equal(
                    canonicalMapOutput(result.first.output),
                    canonicalMapOutput(result.reference.output),
                    `${label}: Processor reference`
                );
                assert.equal(result.second?.error, undefined, `${label}: repeat formatting`);
                if (test.category === "map-policy")
                    assert.equal(
                        await css(result.first.output),
                        await css(result.second.output),
                        `${label}: map-free idempotence`
                    );
                else assert.equal(result.first.output, result.second.output, `${label}: idempotence`);
            }
        }
        if (test.category === "error") {
            assert.ok(actual.first.error, `${test.id}: expected error`);
            assert.deepEqual(actual.first.error, node.first.error, `${test.id}: Node/browser diagnostic`);
        } else if (test.category === "map-error-policy") {
            assert.ok(node.first.error, `${test.id}: Node parses invalid maps`);
            assert.equal(actual.first.error, undefined, `${test.id}: browser skips map decoding`);
            const retained = annotations(actual.first.output);
            if (retained.length)
                assert.deepEqual(retained, annotations(test.source), `${test.id}: browser does not regenerate maps`);
        } else {
            assert.equal(node.first.error, undefined, test.id);
            assert.equal(actual.first.error, undefined, test.id);
            if (test.category === "map-policy") {
                assert.equal(await css(actual.first.output), await css(node.first.output), `${test.id}: CSS excluding maps`);
                assert.match(node.first.output, /sourceMappingURL=data:/, `${test.id}: Node retains maps`);
                if (test.id.startsWith("map/nested-inline/"))
                    assert.match(actual.first.output, /sourceMappingURL=data:/, `${test.id}: nested comment retained`);
                const retained = annotations(actual.first.output);
                if (retained.length)
                    assert.deepEqual(retained, annotations(test.source), `${test.id}: browser does not regenerate maps`);
            } else assert.equal(actual.first.output, node.first.output, `${test.id}: exact Node/browser output`);
            if (test.expected && test.options.grundyScssSorterPreset === "default")
                assert.equal(
                    node.first.output,
                    test.expected[test.options.grundyScssSorterSafety].replaceAll("\r\n", "\n"),
                    `${test.id}: pinned fixture`
                );
        }
        if (test.aliasOf) assert.equal(actual.first.output, byId.get(test.aliasOf).first.output, test.id);
        rows.push({
            id: test.id,
            category: test.category,
            exactOutputMatches: node.first.output === actual.first.output,
            browserAnnotations: actual.first.error ? null : annotations(actual.first.output),
            node:
                node.first.error ?
                    { error: node.first.error, calls: node.first.calls }
                :   { sha256: hash(node.first.output), calls: node.first.calls },
            browser:
                actual.first.error ?
                    { error: actual.first.error, calls: actual.first.calls }
                :   { sha256: hash(actual.first.output), calls: actual.first.calls }
        });
    }
    return {
        valid: true,
        cases: rows.length,
        exactOutputCases: rows.filter(row => row.category === "same").length,
        diagnostics: rows.filter(row => row.category === "error").length,
        mapPolicyCases: rows.filter(row => row.category === "map-policy").length,
        mapErrorPolicyCases: rows.filter(row => row.category === "map-error-policy").length,
        environment: browser.environment,
        rows
    };
}
