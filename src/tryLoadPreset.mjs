/**
 * @typedef {import('prettier-grundy-scss-order').PresetConfig} PresetConfig
 */

const loaders = {
    default: () => import("./presets/default.mjs"),
    csscomb: () => import("./presets/csscomb.mjs"),
    "csscomb-yandex": () => import("./presets/csscomb-yandex.mjs"),
    "csscomb-zen": () => import("./presets/csscomb-zen.mjs"),
    pepelsbey: () => import("./presets/pepelsbey.mjs")
};

/**
 * Load only a supported preset, reporting both unknown names and import failures.
 * @param {string | undefined} presetName
 * @returns {Promise<PresetConfig | undefined>}
 */
export async function tryLoadPreset(presetName) {
    if (presetName === undefined) {
        return undefined;
    }
    if (typeof presetName !== "string" || !Object.hasOwn(loaders, presetName)) {
        throw new Error(
            `Unknown SCSS sorter preset ${JSON.stringify(presetName)}. Available presets: ${Object.keys(loaders).join(", ")}.`
        );
    }
    try {
        return await loaders[presetName]();
    } catch (cause) {
        throw new Error(`Failed to load SCSS sorter preset ${JSON.stringify(presetName)}: ${cause.message}`, { cause });
    }
}
