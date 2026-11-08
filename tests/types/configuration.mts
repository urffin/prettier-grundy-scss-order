import plugin, { type GroupCriteria, type Groups, type PrettierGrundyScssOptions } from "prettier-grundy-scss-order";
import { presets } from "prettier-grundy-scss-order/presets";
import type { Plugin } from "prettier";

const groups: Groups = {
    exact: { type: "decl", order: "exact", oneOf: ["width", "color"] },
    empty: { order: "exact", oneOf: [] },
    catchAll: {},
    prefix: { startsWith: "font", order: "alphabetical" }
};
const options: PrettierGrundyScssOptions = {
    grundyScssSorterPreset: "pepelsbey",
    grundyScssSorterGroups: JSON.stringify(groups),
    grundyScssSorterWithRoot: false,
    grundyScssSorterSafety: "loose"
};
const accepted: Plugin = plugin;
void [options, accepted, presets.csscomb];

const modes: PrettierGrundyScssOptions["grundyScssSorterSafety"][] = ["strict", "loose", "conservative", "structural"];
// @ts-expect-error Unknown safety modes are rejected.
const badSafety: PrettierGrundyScssOptions = { grundyScssSorterSafety: "off" };
void [modes, badSafety];

// @ts-expect-error Exact ordering needs its list.
const noList: GroupCriteria = { order: "exact" };
// @ts-expect-error Node type spelling is validated at runtime too.
const badType: GroupCriteria = { type: "declaration" };
// @ts-expect-error Unknown presets are rejected instead of silently falling back.
const badPreset: PrettierGrundyScssOptions = { grundyScssSorterPreset: "missing" };
// @ts-expect-error Groups must be JSON-encoded for Prettier's string option.
const badGroups: PrettierGrundyScssOptions = { grundyScssSorterGroups: groups };
// @ts-expect-error The preset export has the same supported names.
void presets.missing;
void [noList, badType, badPreset, badGroups];
