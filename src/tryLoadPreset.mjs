/**
 *
 * @param {string} presetName One of predefined presets
 * @description Load a preset from the presets directory.
 * @returns Groups and orders for grundy-scss-declaration-sorter
 *  */
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
