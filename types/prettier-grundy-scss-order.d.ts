declare module "prettier-grundy-scss-order" {
    import { Plugin } from "prettier";

    interface PrettierGrundyScssOptions {
        grundyScssSorterWithRoot?: boolean;
        grundyScssSorterSplitGroup?: boolean;
        grundyScssSorterGroups?: string;
        grundyScssSorterPreset?: string;
        grundyScssSorterGroupsOrder?: string[];
    }

    const plugin: Plugin<PrettierGrundyScssOptions>;
    export = plugin;
}
