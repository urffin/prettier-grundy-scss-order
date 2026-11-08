declare module "prettier-grundy-scss-order" {
    import { Plugin } from "prettier";

    export type PresetName = "default" | "csscomb" | "csscomb-yandex" | "csscomb-zen" | "pepelsbey";
    export type NodeType =
        | "use"
        | "extend"
        | "mixin"
        | "include"
        | "if"
        | "else"
        | "atrule"
        | "rule"
        | "decl"
        | "$variable"
        | "variable"
        | "media"
        | "supports"
        | "comment";

    export interface PrettierGrundyScssOptions {
        /** Defaults to conservative. Structural allows reordering that may change SCSS behavior. */
        grundyScssSorterSafety?: "conservative" | "structural";
        /** Explicit value overrides the preset; otherwise inherits preset/default. */
        grundyScssSorterWithRoot?: boolean;
        /** Explicit false also overrides a preset that enables splitting. */
        grundyScssSorterSplitGroup?: boolean;
        /** JSON-encoded Groups. Custom definitions replace entire groups by name. */
        grundyScssSorterGroups?: string;
        grundyScssSorterPreset?: PresetName;
        /** Omitted or empty order inherits preset/default. Duplicate names are allowed. */
        grundyScssSorterGroupsOrder?: string[];
    }

    /**
     * Group criteria configuration for sorting properties
     */
    export interface GroupMatchers {
        /** Type-based criteria for matching nodes */
        type?: NodeType;
        /** Prefix-based criteria for matching nodes */
        startsWith?: string;
        /** Whether to add empty lines between nodes in the group */
        splitItems?: boolean;
    }

    /** Exact ordering requires an explicit oneOf list; an empty list is valid. */
    export type GroupCriteria = GroupMatchers &
        ({ order: "exact"; oneOf: string[] } | { order?: "alphabetical"; oneOf?: string[] });

    /**
     * Collection of groups with their criteria
     */
    export interface Groups {
        [groupName: string]: GroupCriteria;
    }

    /**
     * Preset configuration interface
     */
    export interface PresetConfig {
        /** Order of groups for sorting */
        order?: string[];
        /** Group definitions with their criteria */
        groups?: Groups;
        /** Whether to sort properties at root level */
        withRoot?: boolean;
        /** Whether to add empty lines between groups */
        splitGroups?: boolean;
    }

    const plugin: Plugin<PrettierGrundyScssOptions>;
    export default plugin;
}
