/**
 * @typedef {import('prettier-grundy-scss-order').PresetConfig} PresetConfig
 */

// Re-export all presets
import * as preset from "./default.mjs";
import * as csscombPreset from "./csscomb.mjs";
import * as csscombYandexPreset from "./csscomb-yandex.mjs";
import * as csscombZenPreset from "./csscomb-zen.mjs";

export const defaultPreset = preset;

export const presets = {
    default: defaultPreset,
    csscomb: csscombPreset,
    "csscomb-yandex": csscombYandexPreset,
    "csscomb-zen": csscombZenPreset
};
