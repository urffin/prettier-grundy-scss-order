export const order = ["fonts", "position", "display", "box-model", "layout", "content-wrap", "content-pack"];

export const groups = {
    fonts: {
        oneOf: [
            "font",
            "font-family",
            "font-size",
            "font-weight",
            "font-style",
            "font-variant",
            "font-size-adjust",
            "font-stretch",
            "font-effect",
            "font-emphasize",
            "font-emphasize-position",
            "font-emphasize-style",
            "font-smooth",
            "line-height"
        ],
        order: "exact"
    },
    position: {
        oneOf: ["position", "z-index", "top", "right", "bottom", "left"],
        order: "exact"
    },
    display: {
        oneOf: [
            "display",
            "visibility",
            "float",
            "clear",
            "overflow",
            "overflow-x",
            "overflow-y",
            "-ms-overflow-x",
            "-ms-overflow-y",
            "clip",
            "zoom"
        ],
        order: "exact"
    },
    "box-model": {
        oneOf: [
            "-webkit-align-content",
            "-ms-flex-line-pack",
            "align-content",
            "-webkit-box-align",
            "-moz-box-align",
            "-webkit-align-items",
            "align-items",
            "-ms-flex-align",
            "-webkit-align-self",
            "-ms-flex-item-align",
            "-ms-grid-row-align",
            "align-self",
            "-webkit-box-flex",
            "-webkit-flex",
            "-moz-box-flex",
            "-ms-flex",
            "flex"
        ],
        order: "exact"
    },
    layout: {
        oneOf: [
            "-webkit-flex-flow",
            "-ms-flex-flow",
            "flex-flow",
            "-webkit-flex-basis",
            "-ms-flex-preferred-size",
            "flex-basis",
            "-webkit-box-orient",
            "-webkit-box-direction",
            "-webkit-flex-direction",
            "-moz-box-orient",
            "-moz-box-direction",
            "-ms-flex-direction",
            "flex-direction"
        ],
        order: "exact"
    },
    "content-wrap": {
        oneOf: [
            "-webkit-flex-grow",
            "-ms-flex-positive",
            "flex-grow",
            "-webkit-flex-shrink",
            "-ms-flex-negative",
            "flex-shrink",
            "-webkit-flex-wrap",
            "-ms-flex-wrap",
            "flex-wrap"
        ],
        order: "exact"
    },
    "content-pack": {
        oneOf: [
            "-webkit-box-pack",
            "-moz-box-pack",
            "-ms-flex-pack",
            "-webkit-justify-content",
            "justify-content",
            "-webkit-box-ordinal-group",
            "-webkit-order",
            "-moz-box-ordinal-group",
            "-ms-flex-order",
            "order"
        ],
        order: "exact"
    }
};
export const withRoot = false;
export const splitGroups = true;
