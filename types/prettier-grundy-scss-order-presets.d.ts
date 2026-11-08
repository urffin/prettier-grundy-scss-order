declare module "prettier-grundy-scss-order/presets" {
    import { PresetConfig, PresetName } from "prettier-grundy-scss-order";

    export const defaultPreset: PresetConfig;
    export const presets: Record<PresetName, PresetConfig>;
}
