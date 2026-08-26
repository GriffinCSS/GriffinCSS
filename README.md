# Griffincss

Модульная SCSS-библиотека для современной вёрстки на основе CSS Grid и Flexbox.

**Griffincss** — три независимых пакета:

| Пакет | Что внутри | Размер (gzip) |
|---|---|---|
| **`griffincss-core`** | CSS Grid и Flexbox, парсер раскладок `data-gr-layout` (CSS + JS-рантайм), дизайн-токены, темы, стратегии оформления, опциональный ресет | 3.3 КБ CSS + 4.8 КБ JS |
| **`griffincss-ui`** | Компоненты интерфейса: кнопки, поля, флажки, карточки, таблицы, сообщения, плашки, аватары, навигация, меню, вкладки, аккордеон, модальное окно, выдвижная панель, подсказки, пагинация, прогресс, спиннер, заглушки, тосты, шаги, пустое состояние | 10.0 КБ CSS + 2.9 КБ JS |
| **`griffincss-utils`** | Утилитарные классы: отступы, размеры, типографика, цвета, границы, скругления, тени, позиционирование, эффекты, видимость, интерактивность, переходы | 14.2 КБ CSS + 2.5 КБ JS |

JS-рантаймы опциональны: у ядра это раскладки и переключатель темы,
у `ui` — поведение компонентов (подложка, крестик, тосты, клавиатура
вкладок и их события), у `utils` — каскад скруглений и произвольные
значения. Без них пакеты остаются рабочим CSS.

`griffincss-core` самодостаточен. `griffincss-ui` и `griffincss-utils`
peer-зависят от него: дизайн-токены и карта брейкпоинтов лежат в ядре
в единственном экземпляре, а собранные файлы надстроек при этом остаются
самостоятельными — блок `:root` входит в каждый целиком, подключать ядро
ради токенов не нужно.

Друг от друга надстройки не зависят. Компонент обязан выглядеть правильно
сам по себе: утилиты нужны, чтобы его подвинуть, а не чтобы он собрался.

A modular SCSS library for modern layouts based on CSS Grid and Flexbox.

**Griffincss** ships as three packages: `griffincss-core` (grid, flex, tokens,
themes, layout runtime), `griffincss-ui` (interface components) and
`griffincss-utils` (utility classes). The design tokens live in the core only;
both add-ons peer-depend on it, yet their compiled CSS stays self-contained.

---

## Требования / Requirements

| Компонент / Component | Версия / Version |
|---|---|
| Node.js | ≥ 22 (CI проверяет 22 и 24) |
| npm | ≥ 9 |
| Dart Sass | `^1.101.0`, ставится как devDependency |

Поддержка браузеров / Browser support: Chrome, Edge, Firefox, Safari —
последние версии. Библиотека опирается на CSS Grid, Flexbox и CSS custom
properties. JS-рантайм не требует сборки и не имеет зависимостей.

---

## Установка / Installation

> **Текущая версия `0.17.0`.** Пакеты доступны в npm и на CDN,
> исходники — в репозитории.

### npm

```bash
npm i griffincss-core griffincss-ui griffincss-utils
```

Ядро самодостаточно, надстройки — нет: `griffincss-ui` и `griffincss-utils`
объявляют `griffincss-core` в `peerDependencies`, и его нужно ставить всегда.
Нужны только раскладки — хватит одного ядра.

```html
<link rel="stylesheet" href="node_modules/griffincss-core/dist/griffincss-reset.css">
<link rel="stylesheet" href="node_modules/griffincss-core/dist/griffincss-core.css">
<link rel="stylesheet" href="node_modules/griffincss-ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="node_modules/griffincss-utils/dist/griffincss-utils.css">
<script src="node_modules/griffincss-core/dist/griffincss.js"></script>
```

Порядок `<link>` значения не имеет: библиотека целиком лежит в каскадных
слоях и сама объявляет их порядок.

### CDN

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-core@0.17.0/dist/griffincss-core.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-ui@0.17.0/dist/griffincss-ui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-utils@0.17.0/dist/griffincss-utils.css">
<script src="https://cdn.jsdelivr.net/npm/griffincss-core@0.17.0/dist/griffincss.js"></script>
```

Работает и `unpkg.com` с теми же путями. Номер версии в адресе указывайте
явно: без него CDN отдаст последнюю, и обновление приедет к пользователям
незамеченным.

### Из исходников

```bash
git clone https://gitverse.ru/BarneyScott/GriffinCSS.git
cd GriffinCSS
npm install
npm run build
```

Готовые файлы появятся в `packages/*/dist/`:

| Файл | Назначение |
|---|---|
| `packages/core/dist/griffincss-core.css` | Сетка, флекс, статические правила |
| `packages/core/dist/griffincss-reset.css` | Ресет — отдельная точка входа, подключается по желанию |
| `packages/core/dist/griffincss-styles.css` | Стратегии оформления `data-gr-style` (airy, strict, compact) — opt-in файл |
| `packages/core/dist/griffincss.js` | Рантайм-парсер раскладок |
| `packages/core/dist/griffincss-theme.js` | Рантайм переключателя темы — подключается отдельно и по желанию |
| `packages/ui/dist/griffincss-ui.css` | Компоненты интерфейса |
| `packages/ui/dist/griffincss-ui-scoped.css` | То же, обёрнутое в `@scope (.griffin)` |
| `packages/ui/dist/griffincss-ui.js` | Опциональный рантайм компонентов: закрытие окна щелчком по подложке, крестик `[data-gr-dismiss]`, тосты, клавиатура вкладок и события `griffincss:*` |
| `packages/utils/dist/griffincss-utils.css` | Утилитарные классы |
| `packages/utils/dist/griffincss-utils-scoped.css` | То же, обёрнутое в `@scope (.griffin)` |
| `packages/utils/dist/griffincss-utils.js` | Опциональный рантайм утилит: каскад скруглений произвольной глубины и произвольные значения `gr-*-[…]` |

Рантаймы пишутся руками в `packages/*/src/` и минифицируются при сборке
(terser, рядом лежат карты кода); правится всегда `src/`, файлы в `dist/` —
артефакт.

**Зависимости пакетов.** `griffincss-core` не зависит ни от чего.
`griffincss-ui` и `griffincss-utils` объявляют `griffincss-core`
в `peerDependencies`: они берут оттуда токены и карту брейкпоинтов, чтобы
значения существовали в одном экземпляре. Друг на друга надстройки
не ссылаются вовсе. Практически это значит:

- готовые `griffincss-ui.css` и `griffincss-utils.css` подключаются сами
  по себе — `griffincss-core.css` для них не нужен (`:root` входит
  в каждый файл целиком);
- сборка надстроек **из SCSS** требует, чтобы `griffincss-core` разрешался как пакет:
  `sass --load-path=node_modules …` или эквивалент в вашем сборщике;
- peer-зависимость (а не обычная) выбрана намеренно: в дереве может быть только
  одна копия `griffincss-core`, поэтому значения брейкпоинтов в надстройках
  и в сетке не разъезжаются.

## Использование / Usage

### HTML (основной способ / primary)

```html
<!-- Ресет — по желанию -->
<link rel="stylesheet" href="griffincss-core/dist/griffincss-reset.css">
<!-- Сетка и флекс -->
<link rel="stylesheet" href="griffincss-core/dist/griffincss-core.css">
<!-- Компоненты интерфейса — по желанию -->
<link rel="stylesheet" href="griffincss-ui/dist/griffincss-ui.css">
<!-- Утилитарные классы — по желанию -->
<link rel="stylesheet" href="griffincss-utils/dist/griffincss-utils.css">

<!-- JS-рантайм: парсит data-gr-layout и генерирует grid на лету -->
<script src="griffincss-core/dist/griffincss.js"></script>
```

После загрузки JS любой элемент с `data-gr-layout` автоматически получает CSS Grid раскладку.
Рантайм ставит скрипт лучше в `<head>`: первым действием он внедряет защиту от FOUC.

### SCSS (кастомизация / customization)

```scss
// Сетка и флекс
@use 'griffincss-core/scss/griffincss-core';

// Ресет — отдельная точка входа
@use 'griffincss-core/scss/griffincss-reset';

// Компоненты интерфейса
@use 'griffincss-ui/scss/griffincss-ui';

// Утилитарные классы
@use 'griffincss-utils/scss/griffincss-utils';

// Компилтайм-раскладки (опционально, без JS)
@use 'griffincss-core/scss/grid-parser' as parser;

@include parser.gr-grid-layout('a3b4-c2d5', $md: 'hdr4-main4-side2_2-ftr4', $name: 'page');
// → класс .gr-l-page, разметка: <div class="gr-l-page">…</div>
```

### Каскадные слои / Cascade layers

Весь CSS библиотеки объявлен в слоях, порядок один и тот же в каждой сборке:

```css
@layer griffincss.reset, griffincss.core, griffincss.ui, griffincss.utils, griffincss.style;
```

| Слой | Что в нём |
|---|---|
| `griffincss.reset` | `griffincss-reset.css` |
| `griffincss.core` | `griffincss-core.css`, вывод компилтайм-миксина и весь CSS JS-рантайма |
| `griffincss.ui` | `griffincss-ui.css` и `griffincss-ui-scoped.css` |
| `griffincss.utils` | `griffincss-utils.css` и `griffincss-utils-scoped.css` |
| `griffincss.style` | `griffincss-styles.css` — стратегии оформления `data-gr-style` |

Компоненты старше ядра, утилиты старше компонентов. Первое нужно, чтобы
`.gr-card` со своим `display: flex` не проигрывал `.gr-flex`; второе — чтобы
`.gr-mb-0` на карточке побеждал её собственный `margin-bottom`. Стратегии
оформления — старше всего библиотечного: выбранный `data-gr-style` обязан
переопределять метрики и компонентов, и утилит.

Два следствия:

- **Ваш CSS вне слоёв выигрывает у библиотеки** — при любой специфичности
  и любом порядке подключения, без `!important`:

  ```css
  /* перебивает .gr-p-4, хотя специфичность та же */
  .card { padding: 3px; }
  ```

- **Порядок подключения файлов больше не влияет на итог**: утилиты всегда
  сильнее компонентов, компоненты — сетки, сетка — ресета, потому что порядок
  задан объявлением, а не позицией `<link>`.

- **Свои стили можно поставить между сеткой и утилитами** — тогда они
  перекрывают ядро, а любая утилита перекрывает их. Порядок задаёт первое
  объявление `@layer` в документе, поэтому свой файл подключают **до** пакетов
  и начинают полным списком:

  ```css
  /* app.css — подключён первым, до griffincss-*.css */
  @layer griffincss.reset, griffincss.core, griffincss.app, griffincss.ui, griffincss.utils, griffincss.style;

  @layer griffincss.app {
    p { margin: 0.75rem 0; }   /* .gr-mb-0 на абзаце всё равно победит */
  }
  ```

  Имя обязано быть вложенным — `griffincss.app`, а не `app`. Слои `reset`,
  `core`, `ui` и `utils` вложены в общий родитель `griffincss`, и сторонний
  слой верхнего уровня встаёт целиком до или целиком после него: между
  `griffincss.core` и `griffincss.utils` помещается только собственный
  подслой того же родителя. Так собрана документация в `docs/`
  (`docs/style.css`, слой `griffincss.docs` — он стоит ниже
  `griffincss.ui`, чтобы правила по элементам `table`, `a` и `p`
  не перебивали компоненты на страницах, где те и показываются).

Чтобы вывод компилтайм-миксина оказался вне слоёв (и стал сильнее стилей в слоях):

```scss
@use 'griffincss-core/scss/grid-parser' as parser with ($gr-default-layer: false);
```

### Брейкпоинты / Breakpoints

Значения живут в одном месте — карте `$gr-breakpoints` в
`griffincss-core/scss/_breakpoints.scss`. Из неё собираются медиа-запросы
**всех трёх** пакетов, токены `--gr-bp-*` и фолбэки JS-рантайма.

```scss
// подключать до точек входа — настройка действует и на утилиты
@use 'griffincss-core/scss/breakpoints' with (
  $gr-breakpoints: (sm: 480px, md: 720px, lg: 960px, xl: 1200px)
);
@use 'griffincss-core/scss/griffincss-core';
@use 'griffincss-utils/scss/griffincss-utils';
```

Добавление брейкпоинта в карту — одна строка: появятся и токен `--gr-bp-*`,
и адаптивные варианты всех утилит, и поддержка `data-gr-layout-<имя>` в рантайме.

Та же карта питает **контейнерные** запросы — суффикс `-c<брейкпоинт>`
и атрибуты `data-gr-layout-c<брейкпоинт>`. Отдельной шкалы для контейнеров
нет намеренно: она удвоила бы источник правды. См. «Контейнерные запросы».

## Сборка / Build

```bash
npm run build        # все три пакета
npm run build:core   # только griffincss-core
npm run build:ui     # только griffincss-ui
npm run build:utils  # только griffincss-utils
npm run watch        # отслеживание изменений
npm run lint         # stylelint по исходникам
npm test             # node:test + проверка собранного CSS
npm run check        # lint + build + test — полный шлюз
```

### Отсечение неиспользуемого / Purge

Полный `griffincss-utils.css` — это все ступени всех шкал на всех
брейкпоинтах. Странице столько не нужно: отсечение оставляет только те
правила, чьи классы встретились в вашей разметке.

```bash
npm run purge -- --out dist/utils.css src/                 # каталог целиком
npm run purge -- --css node_modules/griffincss-utils/dist/griffincss-utils.css \
                 --out public/utils.css --safelist 'gr-r-*,gr-radius-*' src/
```

| Опция | Что делает |
|---|---|
| `--css <файл>` | Что отсекать. По умолчанию `packages/utils/dist/griffincss-utils.css` |
| `--out <файл>` | Куда писать. Без неё результат идёт в `stdout`, а отчёт — в `stderr` |
| `--safelist a,b*` | Имена и шаблоны, которые сохраняются, даже если в разметке их нет |
| `<файлы/каталоги>` | Разметка. Каталог обходится рекурсивно: `.html`, `.jsx`, `.vue`, `.svelte`, `.php`, `.twig`, `.md` и прочие шаблоны |

Отчёт печатается всегда — счётчики и есть та проверка, по которой видно,
что safelist собран правильно:

```
purge: 43 файлов разметки, найдено классов: 682
purge: правил оставлено 230 из 2525, выброшено 2295
purge: 105.5 КБ → 22.8 КБ (gzip 14565 → 4231 Б, brotli 7399 → 3551 Б)
```

**Что скрипт видит.** Значение атрибута `class`, `className`, `:class`,
`class:list` — в том числе в экранированных примерах внутри `<pre>`.
В файлах с кодом (`.js`, `.jsx`, `.ts`, `.vue`, `.svelte`) — дополнительно
строковые литералы, поэтому `clsx('gr-p-4')` находится.

**Чего не видит.** Класс, собранный склейкой: `'gr-mt-' + n`,
`` `gr-p-${step}` ``, имя из ответа API. Такие классы перечисляются
в `--safelist` — точным именем (`gr-mt-4`), шаблоном (`gr-mt-*`) или
регулярным выражением (`/^gr-(mt|mb)-/`). Точное имя — именно точное:
`gr-mt-4` не сохранит `gr-mt-40`.

**Что сохраняется всегда:** объявление порядка слоёв, `:root` со всеми
переменными, `@property`, правила без классов в селекторе (по тегу,
по атрибуту). `@keyframes` остаётся, только если на анимацию ссылается
уцелевшее правило; опустевший `@media` не остаётся вовсе.

Отсечение необратимо на вашей стороне: ошибка в safelist видна не в сборке,
а как пропавший стиль на странице. Поэтому счётчики — часть вывода,
а не отладочный флаг.

### Непрерывная проверка / Continuous integration

`npm run check` — тот же гейт, который запускает CI: конфиг
[`.gitverse/workflows/check.yaml`](.gitverse/workflows/check.yaml) прогоняет
`npm ci` и `npm run check` на Node 22 и 24 при каждом push в `main`
и при каждом запросе на слияние.

Значка состояния сборки в этом разделе нет намеренно: GitVerse не отдаёт
badge-эндпоинта — проверены пути `/actions/workflows/<файл>/badge.svg`,
`/badges/…` и их вариант в публичном API, все три отвечают 404. Появится
эндпоинт — появится и значок.

---

## Философия / Philosophy

- **Минимализм**: пакет сетки — только grid + flex.
- **Одно ядро**: `griffincss-core` самодостаточен; `griffincss-utils` — надстройка над ним
  (peer-зависимость), поэтому токены и брейкпоинты существуют в единственном экземпляре.
  Собранный `griffincss-utils.css` при этом подключается и без `griffincss-core.css`.
- **Работает без JS**: рантаймы опциональны и добавляют только то, чего CSS
  не выражает — раскладки из `data-gr-layout`, переключение темы, каскад
  скруглений, поведение компонентов; без них библиотека остаётся рабочим CSS.
- **Современность**: CSS Grid + Flexbox, никаких float.
- **Префикс `gr-`**: все классы и data-атрибуты используют префикс `gr-`.
- **CSS custom properties**: все переменные доступны для переопределения в runtime.

---

## Справочники по классам / Class reference

Полные списки классов, переменных и модификаторов трёх пакетов живут
в документации, а не здесь: там они ищутся полем поиска, копируются
нажатием и стоят рядом с живыми примерами.

| Пакет | Справочник | Что внутри |
|---|---|---|
| `griffincss-core` | [docs/reference-core.html](docs/reference-core.html) | Переменные, брейкпоинты, grid-парсер, flex- и grid-утилиты, темы, стратегии оформления, ресет |
| `griffincss-ui` | [docs/reference-ui.html](docs/reference-ui.html) | Двадцать пять модулей интерфейса: кнопки, поля, карточки, таблицы, навигация, всплывающие слои, состояния |
| `griffincss-utils` | [docs/reference-utils.html](docs/reference-utils.html) | Отступы, размеры, типографика, цвета, границы, скругления, тени, позиционирование, эффекты, видимость, интерактивность, переходы |

The full class reference for each package now lives in the documentation
site — searchable, copy-on-click and next to live examples. Start at
[docs/index.html](docs/index.html).

### Куда идти за чем / Where to look

| Задача | Страница |
|---|---|
| Понять раскладку `a3b4-c2d5` | [docs/core-grid.html](docs/core-grid.html) |
| Собрать страницу из готовых сегментов | [docs/patterns.html](docs/patterns.html) |
| Настроить темы и режим для слабовидящих | [docs/theme.html](docs/theme.html) |
| Выбрать стратегию оформления | [docs/style-presets.html](docs/style-presets.html) |
| Разобраться с рантаймом и его API | [docs/runtime.html](docs/runtime.html) |
| Задать значение вне шкалы | [docs/arbitrary-values.html](docs/arbitrary-values.html) |
| Свести адаптивность к ширине блока | [docs/container-queries.html](docs/container-queries.html) |
| Посмотреть всё сразу | [docs/demo.html](docs/demo.html) |

Поиск по документации — поле в боковой панели любой страницы `docs/`
или клавиша <kbd>/</kbd>. Он знает про 2900 классов, 192 токена
и все заголовки разделов.

Documentation search: the field in the sidebar of any `docs/` page, or the
<kbd>/</kbd> key. It indexes 2 900 classes, 192 tokens and every section heading.

---


## Тесты / Tests

```bash
npm test                                   # node:test + проверка собранного CSS
node --test "packages/*/test/*.test.js"    # только тесты
npm run check                              # lint + build + test — полный шлюз
```

Тесты не имеют зависимостей: DOM для рантайма — собственный мок
(`packages/core/test/helpers/dom.js`), сравнение CSS компилтайм-миксина
и рантайма — через API `sass`.

`scripts/check-dist.mjs` работает по собранному CSS, где все селекторы
буквальные: он следит за префиксом `gr-`, отсутствием `!important`,
порядком каскадных слоёв, тем, что весь вывод пакета лежит внутри своего
слоя, что медиа-запросы берут значения только из карты брейкпоинтов, что
блок `:root` во всех трёх пакетах идентичен и что классы не пересекаются
между пакетами попарно: `core ↔ ui`, `core ↔ utils`, `ui ↔ utils`.

---

## Структура проекта / Project Structure

```
GriffinCSS/
├── package.json                  # Приватный корень, npm workspaces, общие скрипты
├── README.md                     # Эта документация
├── LICENSE                       # MIT
├── CONTRIBUTING.md               # Как участвовать в разработке
├── CODE_OF_CONDUCT.md            # Кодекс поведения
├── SECURITY.md                   # Сообщения об уязвимостях
├── ARCHITECTURE.md               # Архитектурный справочник
├── CHANGELOG.md                  # Журнал изменений
├── TODO.md                       # Что дальше и чего не будет
├── packages/
│   ├── core/                     # Пакет griffincss-core
│   │   ├── scss/
│   │   │   ├── griffincss-core.scss    # Точка входа
│   │   │   ├── griffincss-reset.scss   # Ресет — отдельная точка входа
│   │   │   ├── griffincss-styles.scss  # Стратегии оформления — отдельная точка входа
│   │   │   ├── _tokens.scss            # CSS custom properties — общие для всех трёх пакетов
│   │   │   ├── _theme-values.scss      # Значения тем и режима доступности — только миксины
│   │   │   ├── _theme.scss             # Блоки data-gr-theme и data-gr-a11y
│   │   │   ├── _styles.scss            # Блоки data-gr-style: ось оформления
│   │   │   ├── _style-values.scss      # Якоря и ручки стилей (только миксины)
│   │   │   ├── _style-config.scss      # Список $gr-styles, общий для ядра и ui
│   │   │   ├── _metrics.scss           # Миксины зазоров, метрик и теней
│   │   │   ├── _breakpoints.scss       # $gr-breakpoints — единственная карта брейкпоинтов
│   │   │   ├── _functions.scss         # Парсер раскладок и его валидация
│   │   │   ├── _layout-mixins.scss     # gr-grid-layout() — компилтайм-раскладки
│   │   │   ├── _grid-parser.scss       # Статические правила сетки
│   │   │   ├── _grid-helpers.scss      # Grid-утилиты
│   │   │   ├── _flex.scss              # Flex-утилиты
│   │   │   ├── _gap.scss               # Модификаторы отступа для grid и flex
│   │   │   └── _reset.scss             # Минимальный ресет
│   │   ├── src/
│   │   │   ├── griffincss.js           # JS-рантайм раскладок (правится напрямую)
│   │   │   └── griffincss-theme.js     # JS-рантайм переключателя темы
│   │   ├── test/                       # node:test + мок-DOM
│   │   └── dist/                       # Скомпилированный CSS + минифицированные рантаймы
│   ├── ui/                       # Пакет griffincss-ui (надстройка над core)
│   │   ├── scss/
│   │   │   ├── griffincss-ui.scss        # Точка входа
│   │   │   ├── griffincss-ui-scoped.scss # То же в @scope (.griffin)
│   │   │   ├── _accordion.scss           # Раскрывающиеся разделы на <details>
│   │   │   ├── _alert.scss               # Сообщения о статусе
│   │   │   ├── _avatar.scss              # Аватары и стопка
│   │   │   ├── _badge.scss               # Плашки, теги, точки, счётчики
│   │   │   ├── _breadcrumb.scss          # Хлебные крошки
│   │   │   ├── _button.scss              # Кнопки: варианты, размеры, группа
│   │   │   ├── _card.scss                # Карточки
│   │   │   ├── _choice.scss              # Флажки, радио, тумблер, сегменты
│   │   │   ├── _drawer.scss              # Выдвижная панель на <dialog>
│   │   │   ├── _dropdown.scss            # Выпадающая панель: <details> и popover
│   │   │   ├── _empty.scss               # Пустое состояние
│   │   │   ├── _form.scss                # Поля, метки, подсказки, аддоны
│   │   │   ├── _keyframes.scss           # @keyframes вне @scope
│   │   │   ├── _link.scss                # Ссылки: варианты и стили линии
│   │   │   ├── _menu.scss                # Список действий внутри панели
│   │   │   ├── _modal.scss               # Модальное окно на <dialog>
│   │   │   ├── _nav.scss                 # Навигация, шапка, сворачивание
│   │   │   ├── _pagination.scss          # Постраничная навигация
│   │   │   ├── _progress.scss            # Полоса выполнения и шкала
│   │   │   ├── _skeleton.scss            # Заглушки на время загрузки
│   │   │   ├── _spinner.scss             # Кольцо занятости
│   │   │   ├── _steps.scss               # Шаги процесса
│   │   │   ├── _table.scss               # Таблицы, прокрутка, липкая шапка
│   │   │   ├── _tabs.scss                # Вкладки
│   │   │   ├── _toast.scss               # Всплывающие уведомления
│   │   │   └── _tooltip.scss             # Подсказка у элемента
│   │   ├── src/
│   │   │   └── griffincss-ui.js          # Рантайм: подложка, крестик, тосты, вкладки
│   │   ├── test/
│   │   └── dist/
│   └── utils/                    # Пакет griffincss-utils (надстройка над core)
│       ├── scss/
│       │   ├── griffincss-utils.scss        # Точка входа
│       │   ├── griffincss-utils-scoped.scss # То же в @scope (.griffin)
│       │   ├── _animations.scss             # Переходы, длительности, gr-spin
│       │   ├── _border-radius.scss          # Каскадный border-radius
│       │   ├── _borders.scss                # Границы: ширина, стороны, стиль
│       │   ├── _colors.scss                 # HSL-палитра
│       │   ├── _effects.scss                # Прозрачность, object-fit, пропорции
│       │   ├── _interactivity.scss          # Курсор, выделение, прокрутка
│       │   ├── _keyframes.scss              # @keyframes вне @scope
│       │   ├── _position.scss               # Позиционирование, inset, z-index
│       │   ├── _shadows.scss                # Тени
│       │   ├── _sizing.scss                 # Ширина, высота, min/max
│       │   ├── _spacing.scss                # Отступы
│       │   ├── _typography.scss             # Типографика
│       │   └── _visibility.scss             # Display, overflow, доступность
│       ├── src/
│       │   └── griffincss-utils.js          # JS-рантайм каскада скруглений
│       ├── test/
│       └── dist/
├── scripts/
│   ├── sync-breakpoints.mjs      # Фолбэки брейкпоинтов рантайма из карты SCSS
│   ├── sync-rule-table.mjs       # Таблица правил рантайма утилит из карт SCSS
│   ├── check-dist.mjs            # Проверки собранного CSS и бюджета рантаймов
│   ├── check-links.mjs           # Целостность ссылок документации
│   ├── build-docs-index.mjs      # Поисковый индекс доксайта
│   ├── purge.mjs                 # Отсечение неиспользуемых утилит
│   └── serve-stream.mjs          # Стенд потоковой раскладки
├── docs/                         # Демо и страницы документации
└── .gitverse/workflows/          # Непрерывная проверка
```

---

## Документация и поддержка / Documentation & Support

| Ресурс | Ссылка |
|---|---|
| Репозиторий | <https://gitverse.ru/BarneyScott/GriffinCSS> |
| Демо всех возможностей | [docs/demo.html](docs/demo.html) |
| Рантайм: API и внутреннее устройство | [docs/runtime.html](docs/runtime.html) |
| Страницы по разделам | [docs/index.html](docs/index.html) |
| Готовые блоки вёрстки | [docs/patterns.html](docs/patterns.html) |
| Справочники по классам | [core](docs/reference-core.html) · [ui](docs/reference-ui.html) · [utils](docs/reference-utils.html) |
| Архитектура и внутреннее устройство | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Журнал изменений | [CHANGELOG.md](CHANGELOG.md) |
| Что дальше и чего не будет | [TODO.md](TODO.md) |
| Как участвовать в разработке | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Кодекс поведения | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| Сообщить об уязвимости | [SECURITY.md](SECURITY.md) |

Локальный просмотр демо / Run the demo locally:

```bash
npx serve -l 8800 -n .        # или: python3 -m http.server 8800
# http://localhost:8800/docs/demo.html
```

**Вопросы и предложения:** заведите issue в
[репозитории](https://gitverse.ru/BarneyScott/GriffinCSS).
**Контакт:** bersi82@gmail.com

---

## Лицензия / License

Проект распространяется по лицензии MIT. Полный текст — в файле [LICENSE](LICENSE).

Released under the MIT License. See [LICENSE](LICENSE) for the full text.
