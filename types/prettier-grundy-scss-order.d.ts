declare module "prettier-grundy-scss-order" {
    import { Plugin } from "prettier";

    export interface PrettierGrundyScssOptions {
        grundyScssSorterWithRoot?: boolean;
        grundyScssSorterSplitGroup?: boolean;
        grundyScssSorterGroups?: string;
        grundyScssSorterPreset?: string;
        grundyScssSorterGroupsOrder?: string[];
    }

    /**
     * Group criteria configuration for sorting properties
     */
    export interface GroupCriteria {
        /** Array of property names that belong to this group */
        oneOf?: string[];
        /** Type-based criteria for matching nodes */
        type?: string;
        /** Prefix-based criteria for matching nodes */
        startsWith?: string;
        /** Sorting order within the group */
        order?: "exact" | "alphabetical";
    }

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
