# grundy-scss-order

[![npm][npm-badge]][npm] ![GitHub Actions Workflow Status][npm-build]

A [Prettier](https://prettier.io/) plugin to sort CSS or SCSS properties. Using [postcss-scss](https://github.com/postcss/postcss-scss) for parse source.

## Usage

Following the Prettier plugin guidelines, this package depends on Prettier as a peer dependency:
`npm install prettier-grundy-scss-order --save-dev`

To enable the plugin use the Prettier API, CLI or configuration file. For example using the JS configuration:

```json
{
    "plugins": ["prettier-grundy-scss-order"]
}
```

### Configuration

This plugin adds next configurable keys to Prettier:

- `grundyScssSorterGroupsOrder` - array of groups in needed order, default:
  `["@use", "--variable", "$variable", "@if", "decl", "@include", "@mixin", "rule"]`
- `grundyScssSorterWithRoot` - flag if need sort on root level, default: `false`
- `grundyScssSorterSplitGroup` - flag if need split groups in result with empty line, default: `false`
- `grundyScssSorterGroups` - define custom groups to sort, **extend** default groups

### Predefined groups

- `@use` - scss [`use` statements](https://sass-lang.com/documentation/at-rules/use/)
- `@mixin` - scss [`@mixin` statements](https://sass-lang.com/documentation/at-rules/mixin/)
- `--variable` - css [custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*):
- `$variable` - scss [variables](https://sass-lang.com/documentation/variables/)
- `decl` - any css properties: `color: ...`, `backgroud: ...`, etc.
- `@include` - scss [`@include` statements](https://sass-lang.com/documentation/at-rules/mixin/)
- `rule` - css selector rule: `.class {...}`, `tag{...}`, `#id{...}`, etc.
- `@if` - scss [`@if` with optionally `@else`/`@else if`](https://sass-lang.com/documentation/at-rules/control/if/) statements
- `@media` - css [`@media`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media) statements
- `@supports` - css [`@supports`](https://developer.mozilla.org/en-US/docs/Web/CSS/@supports) statements

### Custom groups

With option `grundyScssSorterGroups` possibly add custom groups satisfying the criterias

example, add group `@font` - in this group select all properties started with `font`: `font`, `font-size`, etc.

```js
"{\"@font\": { \"startsWith\": \"font\" }}";
```

Then possibly use this group in `grundyScssSorterGroupsOrder`:

```js
["--variable", "$variable", "@font", "decl"];
```

### Custom groups criterias

To define custom group available next criterias

- `startsWith` - check name starts with parameter
- `oneOf` - check name one of array string
- `type` - check node type one of predefined type

    - "use"
    - "mixin"
    - "include"
    - "if"
    - "extend"
    - "atrule"
    - "rule"
    - "decl"
    - "$variable"
    - "variable"
    - "media"
    - "supports"

#### Samples

<table>
<tr>
<th width="5%">Criteria</th>
<th width="35%">Sample</th>
<th width="25%">Description</th>
<th >Applied to</th>
</tr>
<tr>
<td>type</td>
<td>

```json
{
    "type": "use"
}
```

</td>
<td>select "@use" statements</td>
<td>

```scss
@use "colors";
@use "colors" as c;
```

</td>
</tr>
<tr>
<td>startsWith</td>
<td>

```json
{
    "startsWith": "font"
}
```

</td>
<td>select statements starts with "font"</td>
<td>

```scss
font: "Courier New";
font-size: 10px;
@include fonts;
```

</td>
</tr>
<tr>
<td>oneOf</td>
<td>

```json
{
    "oneOf": ["position", "left"]
}
```

</td>
<td>select statements with name that exactly matches one of the array elements</td>
<td>

```scss
position: relative;
left: 10px;
```

</td>
</tr>
</table>

[npm]: https://www.npmjs.com/package/prettier-grundy-scss-order
[npm-badge]: https://img.shields.io/npm/v/prettier-grundy-scss-order?color=blue
[npm-build]: https://img.shields.io/github/actions/workflow/status/urffin/grundy-scss-order/npm-publish.yml?label=build
