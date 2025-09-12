/**
 * @typedef {import('prettier-grundy-scss-order').PresetConfig} PresetConfig
 */

/**
 * Load a preset from the presets directory
 * @param {string | undefined} presetName - One of predefined presets (csscomb, csscomb-yandex, csscomb-zen)
 * @description Load a preset from the presets directory.
 * @returns {Promise<PresetConfig | undefined>} Groups and orders for grundy-scss-declaration-sorter
 */
export async function tryLoadPreset(presetName) {
    if (!presetName) {
        return undefined;
    }
    try {
        const presetModule = await import(`./presets/${presetName}.mjs`);
        return presetModule;
    } catch (error) {
        console.error(`Failed to load preset: ${presetName}`, error);
        return undefined;
    }
}
