import { test } from "uvu";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dependencyRequests, consumerManifest, dependencyEvidence } from "../scripts/browser/dependencies.mjs";
import { parseBrowserArgs } from "../scripts/test-browser.mjs";
import { browserCases } from "../scripts/browser/cases.mjs";

const pkg = { name: "prettier-grundy-scss-order", dependencies: { postcss: "^8.5.8", "postcss-scss": "^4.0.9" } };
const options = { postcss: "minimum", postcssScss: "latest" };
function sample() {
    const requests = dependencyRequests(pkg, options);
    const manifest = consumerManifest(pkg, "/tmp/package.tgz", "3.8.1", requests);
    const versions = { postcss: "8.5.8", postcssScss: "4.0.10" };
    const lock = {
        lockfileVersion: 3,
        packages: Object.fromEntries(
            [
                ["postcss", versions.postcss],
                ["postcss-scss", versions.postcssScss]
            ].map(([name, version]) => [
                "node_modules/" + name,
                {
                    version,
                    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
                    integrity: "sha512-AAAA"
                }
            ])
        )
    };
    return { requests, manifest, versions, lock };
}

test("Runtime selectors require a paired fresh install and reject ambiguous CLI input", () => {
    for (const postcss of ["minimum", "latest"])
        for (const postcssScss of ["minimum", "latest"])
            assert.deepEqual(
                Object.fromEntries(
                    Object.entries(parseBrowserArgs(["--postcss", postcss, "--postcss-scss", postcssScss])).filter(([key]) =>
                        ["postcss", "postcssScss"].includes(key)
                    )
                ),
                { postcss, postcssScss }
            );
    for (const args of [
        ["--postcss"],
        ["--postcss", "minimum"],
        ["--postcss-scss", "latest"],
        ["--postcss", "8.5.8", "--postcss-scss", "latest"],
        ["--postcss", "latest", "--postcss-scss", "next"],
        ["--postcss", "latest", "--postcss-scss", "latest", "--package-root", "/tmp/plugin"],
        ["--postcss", "minimum", "--postcss", "latest", "--postcss-scss", "latest"]
    ])
        assert.throws(() => parseBrowserArgs(args));
    assert.equal(dependencyRequests(pkg, {}), null);
    assert.equal(consumerManifest(pkg, "/tmp/plugin.tgz", "3.8.1", null).overrides, undefined);
});

test("Runtime requests derive minima from declared ranges and latest stays inside those ranges", () => {
    const changed = { ...pkg, dependencies: { postcss: "^8.6.0", "postcss-scss": "^4.1.2" } };
    assert.deepEqual(dependencyRequests(changed, options), {
        postcss: { selection: "minimum", range: "^8.6.0", requested: "8.6.0" },
        "postcss-scss": { selection: "latest", range: "^4.1.2", requested: "^4.1.2" }
    });
    for (const range of [">=8.5.8", "~8.5.8", "^0.5.8", "^8.5.8-beta", undefined])
        assert.throws(() => dependencyRequests({ ...pkg, dependencies: { ...pkg.dependencies, postcss: range } }, options));
});

test("Isolated consumer pins minima and overrides nested runtime dependencies without changing the plugin", () => {
    const { manifest } = sample();
    assert.deepEqual(manifest.dependencies, {
        "prettier-grundy-scss-order": "file:/tmp/package.tgz",
        prettier: "3.8.1",
        postcss: "8.5.8",
        "postcss-scss": "^4.0.9"
    });
    assert.deepEqual(manifest.overrides, { postcss: "$postcss", "postcss-scss": "$postcss-scss" });
    assert.equal(pkg.dependencies.postcss, "^8.5.8");
});

test("Dependency JSON preserves exact loaded versions, selection, integrity and the canonical lock hash", () => {
    const { requests, manifest, lock, versions } = sample();
    const result = dependencyEvidence(requests, manifest, lock, versions);
    assert.equal(result.packages.postcss.version, "8.5.8");
    assert.equal(result.packages["postcss-scss"].version, "4.0.10");
    assert.equal(result.packages.postcss.selection, "minimum");
    assert.equal(result.packages["postcss-scss"].requested, "^4.0.9");
    assert.equal(result.lockJSONSHA256, createHash("sha256").update(JSON.stringify(lock)).digest("hex"));
    assert.deepEqual(result.packageJSON, manifest);
    assert.deepEqual(result.packageLock, lock);
});

test("Dependency verification rejects silent minimum drift, wrong loaded versions and inconsistent lock trees", () => {
    for (const mutate of [
        s => {
            s.versions.postcss = "8.5.9";
        },
        s => {
            s.lock.packages["node_modules/postcss"].version = s.versions.postcss = "8.5.9";
        },
        s => {
            s.lock.packages["node_modules/postcss-scss"].version = s.versions.postcssScss = "5.0.0";
        },
        s => {
            s.lock.packages["node_modules/postcss-scss"].version = s.versions.postcssScss = "4.0.8";
        },
        s => {
            s.lock.packages["node_modules/postcss-scss"].version = s.versions.postcssScss = "4.1.0-beta.1";
        },
        s => {
            s.lock.packages["node_modules/postcss"].integrity = undefined;
        },
        s => {
            s.lock.packages["node_modules/postcss"].resolved = "file:elsewhere";
        },
        s => {
            s.lock.packages["node_modules/plugin/node_modules/postcss"] = { version: "8.5.9" };
        },
        s => {
            s.manifest.overrides.postcss = "latest";
        },
        s => {
            s.manifest.dependencies.postcss = "^8.5.8";
        },
        s => {
            s.lock.lockfileVersion = 2;
        }
    ]) {
        const value = sample();
        mutate(value);
        assert.throws(() => dependencyEvidence(value.requests, value.manifest, value.lock, value.versions));
    }
});

test("Each runtime matrix cell retains both modes, comments, direct and fallback map checks", async () => {
    const cases = await browserCases();
    for (const mode of ["strict", "loose"]) {
        const selected = cases.filter(c => c.options.grundyScssSorterSafety === mode);
        assert(selected.some(c => c.expected && /\/\*|\/\//.test(c.source)));
        assert(selected.some(c => c.source.includes("prettier-ignore")));
        assert(selected.some(c => c.path.node === 0 && c.path.browser === 0 && c.source.includes("//")));
        for (const category of ["map-policy", "map-error-policy"]) assert(selected.some(c => c.category === category));
        assert(selected.some(c => c.path.node === 1 && c.path.browser === 1));
        assert(selected.some(c => c.path.node === 1 && c.path.browser === 0));
    }
    const source = (await readFile(new URL("../.github/workflows/checks.yml", import.meta.url), "utf8")).replaceAll(
        "\r\n",
        "\n"
    );
    const job = source.slice(source.indexOf("    runtime-dependencies:"), source.indexOf("    benchmark:"));
    assert.match(job, /postcss: \[minimum, latest\]/);
    assert.match(job, /scss: \[minimum, latest\]/);
    assert.match(job, /fail-fast: false/);
    assert(!job.includes("continue-on-error"));
    assert.match(job, /--postcss \$\{\{ matrix.postcss \}\} --postcss-scss \$\{\{ matrix.scss \}\}/);
    assert.match(job, /runtime-dependencies-postcss-\$\{\{ matrix.postcss \}\}-scss-\$\{\{ matrix.scss \}\}/);
    assert.match(job, /if: always\(\)/);
    assert(job.includes("browser-results.evidence/*.json"));
});

test.run();
