declare module "prettier-grundy-scss-order/presets" {
    import { PresetConfig } from "prettier-grundy-scss-order";

    export const defaultPreset: PresetConfig;
    export const presets: {
        [presetName: string]: PresetConfig;
    };
}
