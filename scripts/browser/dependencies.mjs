import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const names = ["postcss", "postcss-scss"];
const key = name => (name === "postcss" ? "postcss" : "postcssScss");
const versionParts = text => {
    assert.match(text, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, "Expected a stable exact version");
    return text.split(".").map(Number);
};

export function validateDependencyOptions(options) {
    const selected = options.postcss !== undefined || options.postcssScss !== undefined;
    if (!selected) return false;
    for (const name of names)
        assert(["minimum", "latest"].includes(options[key(name)]), `Select minimum or latest for both runtime dependencies`);
    assert(!options.packageRoot, "Dependency selection requires a fresh tarball install, not --package-root");
    return true;
}

export function dependencyRequests(pkg, options) {
    if (!validateDependencyOptions(options)) return null;
    return Object.fromEntries(
        names.map(name => {
            const range = pkg.dependencies[name];
            // Fail on a future range shape instead of silently choosing the wrong minimum.
            assert.match(range, /^\^[1-9]\d*\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, `Unsupported range for ${name}`);
            const selection = options[key(name)];
            return [name, { selection, range, requested: selection === "minimum" ? range.slice(1) : range }];
        })
    );
}

export function consumerManifest(pkg, tarball, prettierVersion, requests) {
    return {
        name: "scss-browser-consumer",
        private: true,
        type: "module",
        dependencies: {
            [pkg.name]: `file:${tarball}`,
            prettier: prettierVersion,
            ...Object.fromEntries(Object.entries(requests ?? {}).map(([name, request]) => [name, request.requested]))
        },
        ...(requests ? { overrides: Object.fromEntries(names.map(name => [name, "$" + name])) } : {})
    };
}

export function dependencyEvidence(requests, packageJSON, packageLock, versions) {
    if (!requests) return null;
    assert.equal(packageLock.lockfileVersion, 3);
    const resolved = {};
    for (const name of names) {
        const request = requests[name];
        assert.equal(packageJSON.dependencies[name], request.requested);
        assert.equal(packageJSON.overrides[name], "$" + name);
        const installed = packageLock.packages["node_modules/" + name];
        assert(installed, `Missing lock entry for ${name}`);
        assert.equal(versions[key(name)], installed.version, `Loaded ${name} differs from lock`);
        const actual = versionParts(installed.version),
            minimum = versionParts(request.range.slice(1));
        assert.equal(actual[0], minimum[0], `${name} is outside the supported major`);
        assert(actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]), `${name} is below minimum`);
        if (request.selection === "minimum") assert.equal(installed.version, request.requested, `${name} minimum drift`);
        assert.match(installed.integrity ?? "", /^sha512-[A-Za-z0-9+/]+={0,2}$/, `Missing integrity for ${name}`);
        assert.equal(installed.resolved, `https://registry.npmjs.org/${name}/-/${name}-${installed.version}.tgz`);
        for (const [location, entry] of Object.entries(packageLock.packages))
            if (location.endsWith("node_modules/" + name))
                assert.equal(entry.version, installed.version, `Unexpected nested ${name} at ${location}`);
        resolved[name] = {
            ...request,
            version: installed.version,
            integrity: installed.integrity,
            resolved: installed.resolved
        };
    }
    return {
        packages: resolved,
        lockJSONSHA256: createHash("sha256").update(JSON.stringify(packageLock)).digest("hex"),
        packageJSON,
        packageLock
    };
}
