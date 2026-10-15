# prettier-grundy-scss-order [English](../README.md)

[![npm][npm-badge]][npm] [![GitHub Actions Workflow Status][npm-build]][github-actions]

Поддерживайте порядок в SCSS, даже когда проект растёт. `prettier-grundy-scss-order` — плагин для [Prettier](https://prettier.io/), который при каждом форматировании размещает свойства, переменные, директивы Sass и вложенные правила в предсказуемом порядке.

Он создан для реальных SCSS-проектов: храните переменные вместе, единообразно располагайте свойства раскладки, отделяйте логические блоки пустыми строками и переходите со знакомых правил сортировки без ручной переработки стилей.

## Зачем это нужно?

- **Одна команда форматирования — один стиль для всей команды.** Больше никаких замечаний в ревью о порядке свойств.
- **Сортировка с пониманием SCSS.** Упорядочивайте `$переменные`, CSS-переменные, `@use`, `@extend`, `@include`, `@mixin`, условия и вложенные правила, а не только декларации.
- **Используйте привычный стандарт.** Выберите `csscomb`, `csscomb-yandex`, `csscomb-zen` или `pepelsbey`.
- **Задайте свой порядок.** Создавайте группы по типу узла, префиксу свойства или явному списку свойств.

## До и после

```scss
.card {
    padding: 16px;
    color: white;
    --card-color: #222;
    display: flex;
}
```

```scss
.card {
    --card-color: #222;
    color: white;
    display: flex;
    padding: 16px;
}
```

## Быстрый старт

Установите Prettier и плагин:

```bash
npm install --save-dev prettier prettier-grundy-scss-order
```

Добавьте плагин в `prettier.config.mjs`:

```js
export default {
    plugins: ["prettier-grundy-scss-order"]
};
```

Затем форматируйте SCSS обычным способом:

```bash
npx prettier --write "src/**/*.scss"
```

Порядок по умолчанию:

```text
@use → @extend → CSS-переменные → Sass-переменные → @if → декларации → @include → @mixin → вложенные правила
```

Декларации в группе `decl` сортируются по алфавиту. Сортировка применяется как на корневом уровне, так и внутри вложенных правил.

## Настройка

Задайте опции в конфигурации Prettier:

```js
export default {
    plugins: ["prettier-grundy-scss-order"],
    grundyScssSorterSplitGroup: true,
    grundyScssSorterGroupsOrder: ["--variable", "$variable", "layout", "typography", "decl", "@include", "rule"],
    grundyScssSorterGroups: JSON.stringify({
        layout: {
            oneOf: ["display", "position", "inset", "width", "height", "margin", "padding"],
            order: "exact"
        },
        typography: {
            startsWith: "font",
            type: "decl"
        }
    })
};
```

| Опция | Описание | По умолчанию |
| --- | --- | --- |
| `grundyScssSorterGroupsOrder` | Имена групп в нужном порядке. Узлы, не соответствующие перечисленным группам, размещаются после них. | `[@use, @extend, --variable, $variable, @if, decl, @include, @mixin, rule]` |
| `grundyScssSorterWithRoot` | Сортировать узлы корневого уровня, а также декларации внутри правил. | `true` |
| `grundyScssSorterSplitGroup` | Добавлять пустую строку между группами. Группы с пометкой разделения также разделяют свои элементы. | `false` |
| `grundyScssSorterGroups` | JSON-строка с пользовательскими группами. Они дополняют встроенные группы. | — |
| `grundyScssSorterPreset` | Встроенный пресет порядка свойств. | — |

## Пресеты

Начните со знакомого соглашения и переопределяйте только то, что отличается в вашем проекте:

```js
export default {
    plugins: ["prettier-grundy-scss-order"],
    grundyScssSorterPreset: "pepelsbey"
};
```

| Пресет | Для чего подходит |
| --- | --- |
| [`csscomb`](../src/presets/csscomb.mjs) | Миграция с конфигурации CSScomb по умолчанию. |
| [`csscomb-yandex`](../src/presets/csscomb-yandex.mjs) | Миграция с конфигурации Yandex для CSScomb. |
| [`csscomb-zen`](../src/presets/csscomb-zen.mjs) | Миграция с конфигурации Zen для CSScomb. |
| [`pepelsbey`](../src/presets/pepelsbey.mjs) | Полный точный порядок CSS-свойств на основе `stylelint-config-pepelsbey`. |

## Встроенные группы

| Группа | Что включает |
| --- | --- |
| `@use` | Инструкции Sass `@use` |
| `@extend` | Инструкции Sass `@extend` |
| `--variable` | Пользовательские CSS-свойства |
| `$variable` | Переменные Sass |
| `@if` | Инструкции Sass `@if`; связанные блоки `@else` остаются вместе с ними |
| `decl` | CSS-декларации, по умолчанию сортируются по алфавиту |
| `@include` | Инструкции Sass `@include` |
| `@mixin` | Объявления Sass `@mixin` |
| `rule` | Вложенные селекторы и правила |
| `@media`, `@supports` | Медиа- и feature-query-правила; добавьте их в порядок, когда это необходимо |

## Пользовательские группы

В каждой группе можно сочетать следующие критерии:

| Критерий | Значение | Пример |
| --- | --- | --- |
| `type` | Соответствует типу узла SCSS. | `{ type: "decl" }` |
| `startsWith` | Соответствует имени узла, начинающемуся с указанной строки. | `{ startsWith: "font", type: "decl" }` |
| `oneOf` | Соответствует одному из перечисленных имён узла. | `{ oneOf: ["position", "inset"] }` |
| `order` | Сортирует группу с помощью `"alphabetical"` или порядка массива `oneOf` при `"exact"`. | `{ oneOf: ["display", "position"], order: "exact" }` |
| `splitItems` | Разделяет элементы группы пустыми строками, если включено разделение групп. | `{ type: "include", splitItems: true }` |

Поддерживаемые значения `type`: `use`, `extend`, `mixin`, `include`, `if`, `else`, `atrule`, `rule`, `decl`, `$variable`, `variable`, `media` и `supports`.

> Используйте `type: "decl"` вместе с `startsWith` или `oneOf`, если группа должна содержать только CSS-свойства. Без него критерий может также совпасть с именем или параметрами другого SCSS-узла.

## Попробовать

**[Откройте песочницу](https://grundyjs.ru/prettier-grundy-scss-order/playground/)**, чтобы проверить группы и пресеты до добавления их в проект.

[npm]: https://www.npmjs.com/package/prettier-grundy-scss-order
[npm-badge]: https://img.shields.io/npm/v/prettier-grundy-scss-order?color=blue
[npm-build]: https://img.shields.io/github/actions/workflow/status/urffin/grundy-scss-order/npm-publish.yml?label=build
[github-actions]: https://github.com/urffin/grundy-scss-order/actions/workflows/npm-publish.yml
