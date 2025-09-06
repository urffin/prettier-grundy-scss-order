# Prettier-grundy-scss-order ([EN](../README.md))

[![npm][npm-badge]][npm] ![GitHub Actions Workflow Status][npm-build]

Плагин [prettier](https://prettier.io/) для сортировки CSS или SCSS свойств. Для разбора исходников использует [postcss-scss](https://github.com/postcss/postcss-scss).

## Использование

Для установки можно использовать команду:

`npm install prettier-grundy-scss-order --save-dev`

Для подключения плагина можно воспользоваться Prettier API, CLI или конфигурационного файла. Например:

```json
{
    "plugins": ["prettier-grundy-scss-order"]
}
```

### Настройка

Данный плагин добавляет следующие ключи для настройки:

<table>
<tr>
<th>Название</th>
<th>Описание</th>
<th>Значение по умолчанию</th>
</tr>
<tr>
<td>

`grundyScssSorterGroupsOrder`</td>

<td>массив групп в нужном порядке</td>
<td>

```json
["@use", "--variable", "$variable", "@if", "decl", "@include", "@mixin", "rule"]
```

</td>
</tr>
<tr>
<td>

`grundyScssSorterWithRoot`</td>

<td>нужно ли сортировать на корневом уровне</td>
<td>

`false`</td>

<tr><td>

`grundyScssSorterSplitGroup`</td>

<td>нужно ли отделять группы пустой строкой</td>
<td>

`false`</td>

</tr>
<tr><td>

`grundyScssSorterGroups`</td>

<td>

определяет дополнительный группы для сортировки, **расширяет** группы по умолчанию</td>

<td></td>

</tr>
<tr><td>

`grundyScssSorterPreset`</td>

<td>

предопределенные свойства, например: `csscomb`</td>

<td></td>

</tr>
    </table>

### Пресеты

Список пресетов для миграции с других плагинов

<table>
<tr>
<th>Пресет</th>
<th>Описание</th>
</tr>
<tr>
<td>

[csscomb](../src/presets/csscomb.mjs)

</td>
<td>

пресет для миграции с [`csscomb`](https://github.com/csscomb/csscomb.js) использующий [`default`](https://github.com/csscomb/csscomb.js/blob/dev/config/csscomb.json) пресет</td>

</tr>
<tr>
<td>

[csscomb-yandex](../src/presets/csscomb-yandex.mjs)</td>

<td>

пересет для миграции с [`csscomb`](https://github.com/csscomb/csscomb.js) использующий [`yandex`](https://github.com/csscomb/csscomb.js/blob/dev/config/yandex.json) пресет</td>

</tr>
<tr>
<td>

[csscomb-zen](../src/presets/csscomb-zen.mjs)</td>

<td>

пересет для миграции с [`csscomb`](https://github.com/csscomb/csscomb.js) использующий [`zen`](https://github.com/csscomb/csscomb.js/blob/dev/config/zen.json) пресет</td>

</tr>
</table>

### Предопределенные группы

- `@use` - scss [`use` statements](https://sass-lang.com/documentation/at-rules/use/)
- `@mixin` - scss [`@mixin` statements](https://sass-lang.com/documentation/at-rules/mixin/)
- `--variable` - css [custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*):
- `$variable` - scss [variables](https://sass-lang.com/documentation/variables/)
- `decl` - любые css свойства: `color: ...`, `backgroud: ...`, и т.д.
- `@include` - scss [`@include` statements](https://sass-lang.com/documentation/at-rules/mixin/)
- `rule` - css селекторы: `.class {...}`, `tag{...}`, `#id{...}`, etc.
- `@if` - scss [`@if` with optionally `@else`/`@else if`](https://sass-lang.com/documentation/at-rules/control/if/) statements
- `@media` - css [`@media`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media) statements
- `@supports` - css [`@supports`](https://developer.mozilla.org/en-US/docs/Web/CSS/@supports) statements

### Пользовательские группы

Настройка `grundyScssSorterGroups` позволяет добавить пользовательские группы по дополнительным критериям.

Например, добавление группы `@font` - в эту группу помещаются все свойства начинающиеся с `font`: `font`, `font-size`, и т.д.

```js
"{\"@font\": { \"startsWith\": \"font\" }}";
```

Затем можно использовать данную группу в `grundyScssSorterGroupsOrder`:

```js
["--variable", "$variable", "@font", "decl"];
```

### Пользовательские критерии для групп

Для определения пользовательских групп доступны следующие критерии

- `startsWith` - название начинается с указанного параметра
- `oneOf` - название является одним из перечисленных в списке
- `type` - тип узла соответствует одному из перечисленных

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

#### Примеры

<table>
<tr>
<th width="5%">Притерии</th>
<th width="35%">Пример</th>
<th width="25%">Описание</th>
<th >Подходящие свойства</th>
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
<td>выбирает "@use" statements</td>
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
<td>выбирает свойства начинающиеся с "font"</td>
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
<td>sвыбирает свойства, названия которых совпадают с одним из элементов списка</td>
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
