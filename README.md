# Griffincss

Модульная SCSS-библиотека для современной вёрстки на основе CSS Grid и Flexbox.

**Griffincss** — три независимых пакета:

| Пакет | Что внутри | Размер (gzip) |
|---|---|---|
| **`griffincss-core`** | CSS Grid и Flexbox, парсер раскладок `data-gr-layout` (CSS + JS-рантайм), дизайн-токены, темы, стратегии оформления, опциональный ресет | <!--gr:size:core-->3,3 КБ<!--/gr:size:core--> CSS + <!--gr:size:js-pkg-core-->4,8 КБ<!--/gr:size:js-pkg-core--> JS |
| **`griffincss-ui`** | Компоненты интерфейса: кнопки, поля, флажки, карточки, таблицы, сообщения, плашки, аватары, навигация, меню, вкладки, аккордеон, модальное окно, выдвижная панель, подсказки, пагинация, прогресс, спиннер, заглушки, тосты, шаги, пустое состояние. Плюс опциональный слой GriffinJS: слайдер, галерея, лайтбокс, параллакс, мегаменю, комбобокс, ползунок, сортируемая таблица | <!--gr:size:ui-->10,6 КБ<!--/gr:size:ui--> CSS + <!--gr:size:js-ui-->2,9 КБ<!--/gr:size:js-ui--> JS (+ <!--gr:size:griffinjs-->17,2 КБ<!--/gr:size:griffinjs--> GriffinJS по желанию) |
| **`griffincss-utils`** | Утилитарные классы: отступы, размеры, типографика, цвета, границы, скругления, тени, позиционирование, эффекты, видимость, интерактивность, переходы | <!--gr:size:utils-->14,6 КБ<!--/gr:size:utils--> CSS + <!--gr:size:js-utils-->2,4 КБ<!--/gr:size:js-utils--> JS |

### Раскладки: две дорожки, одна строка

Строка `a3b4-c2d5` — семь колонок в двух рядах — раскладывается двумя
независимыми способами, и оба входят в `griffincss-core`.

**Рантайм — атрибут в разметке.** Ничего собирать не нужно.

```html
<script src="griffincss-core/dist/griffincss.js"></script>

<div data-gr-layout="a3b4-c2d5">…</div>
```

**Компилтайм — миксин в SCSS.** Ни строки JS на странице.

```scss
@use 'griffincss-core/scss/grid-parser' as parser;

@include parser.gr-grid-layout('a3b4-c2d5', $name: 'page');
// → <div class="gr-l-page">…</div>
```

Обе дорожки дают один и тот же CSS — это держит тест, сверяющий их вывод
побайтово. Разница одна: **без JS раскладка из миксина есть, из атрибута —
нет, и контент при этом виден** — защиту от FOUC ставит сам рантайм,
в статическом CSS её нет. Ширины дорожек в обоих случаях задаются
свойствами `--gr-l-cols` и `--gr-l-rows`.

Подробнее — [docs/core-grid.html](docs/core-grid.html).

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

**Про размеры.** Цифры в таблице — не обещание, а замер: их вставляет
сборка, разойтись с файлом они не могут. Отдельно от них живут потолки,
которые проверяет `npm run check`: превышение роняет сборку. Потолок
поднимается только вместе с тем, что покупается, и подо что оставлен
запас — записано рядом с каждой цифрой в `scripts/check-dist.mjs`.
Для сравнения (замер сторонних файлов — 2026-08-30, gzip): ресет, ядро,
компоненты и утилиты вместе — <!--gr:size:css-all-->29,2 КБ<!--/gr:size:css-all-->
против 30,1 КБ у `bootstrap.min.css` и 63,1 КБ у `bulma.min.css`;
ресет, ядро и компоненты — <!--gr:size:css-ui-stack-->14,6 КБ<!--/gr:size:css-ui-stack-->
против 29,3 КБ у `uikit.min.css`; четыре рантайма —
<!--gr:size:js-all-->10,1 КБ<!--/gr:size:js-all--> против 23,2 КБ
у `bootstrap.bundle.min.js`.

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

### Поддержка браузеров / Browser support

Порог назван и измерен, а не оставлен умолчанием. Библиотека стоит
на каскадных слоях, контейнерных запросах, `:has()` и — в сборках
`-scoped` — на `@scope`. JS-рантайм не требует сборки и не имеет
зависимостей.

| Возможность | Минимальные версии | Требуется для | В мире | В России |
|---|---|---|---|---|
| Каскадные слои | Chrome 99 · Edge 99 · Firefox 97 · Safari 15.4 | все файлы CSS и правила, которые пишет рантайм | 95,3 % | 96,8 % от измеримого трафика (сырое 64,5 % при атрибуции 66,7 %) |
| Контейнерные запросы | Chrome 105 · Edge 105 · Firefox 110 · Safari 16.0 | утилиты `-c*`, `.gr-cq` ядра, `data-gr-layout-c*` | 94,0 % | 95,6 % от измеримого трафика (сырое 63,7 %) |
| `:has()` | Chrome 105 · Edge 105 · Firefox 121 · Safari 15.4 | `griffincss-ui.css` | 94,1 % | 95,0 % от измеримого трафика (сырое 63,3 %) |
| `@scope` | Chrome 118 · Edge 118 · Firefox 146 · Safari 17.4 | только `*-scoped.css` | 90,0 % | 83,8 % от измеримого трафика (сырое 55,9 %) |

**Ниже порога слоёв страница остаётся читаемой, но не оформленной.**
Браузер, не знающий `@layer`, пропускает блок целиком — то есть всю
библиотеку, включая правила, которые рантайм создаёт для `data-gr-layout`.
Текст, ссылки и поля работают, оформления нет совсем; ошибки в консоли
при этом не будет.

**Сборки `-scoped` требуют большего — отдельной строкой.** Firefox 146 —
это осень 2025 года, и одним предложением на все файлы порог не описывается:
обычные сборки `@scope` не требуют, а `griffincss-ui-scoped.css`
и `griffincss-utils-scoped.css` требуют.

**Замер: 2026-08-30, `npm run coverage`** (`browserslist --coverage`,
данные `caniuse-lite`; постоянной зависимости нет, пакет тянется разово
через `npx`). Российская цифра дана от измеримой доли не для красоты:
`caniuse-lite` атрибутирует по РФ только 66,7 % трафика, а остальное —
браузеры без версионной статистики, прежде всего Яндекс.Браузер, и он
на Chromium. Подробный разбор, поведение ниже порога и три строки
самопроверки — [docs/compatibility.html](docs/compatibility.html).

Browser support in short: Chrome/Edge 99+, Firefox 97+, Safari 15.4+
(cascade layers). Container queries, `:has()` and `@scope` raise the bar
for specific files — see the table above.

---

## Установка / Installation

> **Текущая версия `0.22.0`.** Пакеты доступны в npm и на CDN,
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
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-core@0.22.0/dist/griffincss-core.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-ui@0.22.0/dist/griffincss-ui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-utils@0.22.0/dist/griffincss-utils.css">
<script src="https://cdn.jsdelivr.net/npm/griffincss-core@0.22.0/dist/griffincss.js"></script>
```

Стратегии оформления `data-gr-style` — отдельный файл, по желанию: все три
стиля разом (1 566 Б brotli) или один вместо них (971–1 232 Б).

```html
<!-- все три стиля -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-core@0.22.0/dist/griffincss-styles.css">
<!-- или один — вместо предыдущей строки, а не вдобавок к ней -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-core@0.22.0/dist/griffincss-style-strict.css">
```

Разбор и веса по каждому файлу — [docs/style-presets.html](docs/style-presets.html).

Слой виджетов с состоянием — GriffinJS — подключается ещё двумя строками,
и только если нужен (слайдер, галерея, лайтбокс, параллакс, мегаменю,
дропдаун с ролями, подсказка в верхнем слое, окна, комбобокс, ползунок,
сортируемая таблица):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/griffincss-ui@0.22.0/dist/griffinjs.css">
<script src="https://cdn.jsdelivr.net/npm/griffincss-ui@0.22.0/dist/griffinjs.js"></script>
```

Работает и `unpkg.com` с теми же путями. Номер версии в адресе указывайте
явно: без него CDN отдаст последнюю, и обновление приедет к пользователям
незамеченным.

Если нужны все четыре рантайма, вместо четырёх тегов `<script>` есть
бандл — те же файлы одним, но на ~15 % легче: склейка жмётся одним
gzip-словарём вместо четырёх независимых.

```html
<script src="https://cdn.jsdelivr.net/npm/griffincss-core@0.22.0/dist/griffincss-all.js"></script>
```

Бандл — артефакт для браузера; под Node подключаются отдельные файлы.

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
| `packages/core/dist/griffincss-style-airy.css`, `-strict`, `-compact` | То же по одному стилю в файле — замена `griffincss-styles.css` для тех, кто не собирает из SCSS |
| `packages/core/dist/griffincss.js` | Рантайм-парсер раскладок |
| `packages/core/dist/griffincss-theme.js` | Рантайм переключателя темы — подключается отдельно и по желанию |
| `packages/core/dist/griffincss-all.js` | Бандл: все четыре рантайма одним файлом, на ~15 % легче суммы — для страниц, где нужны все |
| `packages/ui/dist/griffincss-ui.css` | Компоненты интерфейса |
| `packages/ui/dist/griffincss-ui-scoped.css` | То же, обёрнутое в `@scope (.griffin)`; порог браузеров выше остальных файлов — Chrome 118, Safari 17.4, Firefox 146 |
| `packages/ui/dist/griffincss-ui.js` | Опциональный рантайм компонентов: закрытие окна щелчком по подложке, крестик `[data-gr-dismiss]`, тосты, клавиатура вкладок и события `griffincss:*` |
| `packages/ui/dist/griffinjs.js`, `griffinjs.css` | GriffinJS — опциональный слой виджетов с состоянием (`window.GriffinJS`): слайдер, галерея, лайтбокс, параллакс, мегаменю, контроллеры дропдауна, подсказки и окон, комбобокс, ползунок, сортировка таблицы; <!--gr:size:griffinjs-->17,2 КБ<!--/gr:size:griffinjs--> gzip целиком, `griffinjs-core.js` + модули по одному — для сборки нужного набора. Документация — раздел «GriffinJS» доксайта |
| `packages/utils/dist/griffincss-utils.css` | Утилитарные классы |
| `packages/utils/dist/griffincss-utils-scoped.css` | То же, обёрнутое в `@scope (.griffin)`; порог браузеров выше остальных файлов — Chrome 118, Safari 17.4, Firefox 146 |
| `packages/utils/dist/griffincss-utils.js` | Опциональный рантайм утилит: каскад скруглений произвольной глубины и произвольные значения `gr-*-[…]` |

Рантаймы пишутся руками в `packages/*/src/` и минифицируются при сборке
(terser, рядом лежат карты кода); правится всегда `src/`, файлы в `dist/` —
артефакт.

**Состав оси оформления настраивается.** `griffincss-styles.css` по умолчанию
несёт все три стиля; список `$gr-styles` оставляет только нужные — и в файле
оси, и в структурных правилах компонентов, а пустой список выключает ось
целиком:

```scss
@use 'griffincss-core/scss/style-config' with ($gr-styles: (strict));
```

Замер по каждой конфигурации — [docs/style-presets.html](docs/style-presets.html),
раздел «Возьмите один стиль».

**Палитра и шкалы утилит — тоже.** Все публичные карты `griffincss-utils`
помечены `!default`: восемнадцать акцентов заменяются тремя своими, шкала
отступов или кегля урезается наполовину — без правки файлов пакета. Форма
другая, чем у оси оформления: модули утилит выводят CSS, поэтому
переопределение идёт через свою точку входа с `meta.load-css($with: …)`,
а не через `@use … with`.

```scss
@include meta.load-css('griffincss-utils/scss/spacing', $with: (
  "gr-spacing-steps": (0, 1, 2, 4, 8)
));
```

Урезанная шкала отступов, скруглений и кегля — 14 945 → 10 876 Б gzip,
классов 2490 → 1546. Полный пример (карта **и** переменные под неё,
разбор частой ошибки, замеры) — [docs/reference-utils.html](docs/reference-utils.html),
раздел «Своя палитра и своя шкала».

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

### Строгий CSP / Content Security Policy

`griffincss.js` — единственный файл библиотеки, который создаёт `<style>`.
Остальные три рантайма и слой виджетов `griffinjs.js` листов не заводят:
им от политики нужен только `script-src`.

Под `style-src` без `'unsafe-inline'` браузер откажется применять созданный
скриптом лист — контент останется на месте, но раскладки `data-gr-layout`
не сложатся. Рантайм переносит на свой лист `nonce` со своего тега `<script>`:

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self' 'nonce-r4nd0m';
  style-src   'self' 'nonce-r4nd0m'
```

```html
<script src="griffincss.js" nonce="r4nd0m"></script>
```

`nonce` читается у `document.currentScript`, поэтому под строгой политикой
рантайм подключается тегом `<script>`, а не импортом из сборки. Подробности
и таблица по вариантам подключения — [docs/runtime.html](docs/runtime.html)
(«Строгий CSP»).

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

### Токены для дизайнера / Design tokens export

Сборка кладёт рядом с CSS файл `design-tokens.json` — переменные темы
в формате [DTCG](https://tr.designtokens.org/format/), том самом, который
читают плагины Figma Variables.

```bash
npm i griffincss-core
# node_modules/griffincss-core/dist/design-tokens.json
# точка входа пакета: griffincss-core/tokens
```

Файл генерируется из **собранного** `griffincss-core.css`, а не из исходников,
поэтому разойтись с библиотекой не может: `check-dist` сверяет его с CSS
байт-в-байт и по составу, и переменная `:root` без токена роняет сборку.

Три набора верхнего уровня — `light`, `dark`, `low-vision` — ложатся в одну
коллекцию Figma с тремя режимами; составы совпадают токен в токен. В каждом
141 токен, имя повторяет имя переменной CSS без префикса: `color-bg` — это
`--gr-color-bg`. Значения резолвнуты до конца: ни `var()`, ни `calc()`,
цвета переведены из HSL в hex.

**Это экспорт переменных, а не библиотека компонентов.** Figma-кита
у Griffincss не было и не будет — кит требует постоянного сопровождения;
классов, макетов и готовых элементов в файле нет. Что именно приезжает,
чего нет и почему — раздел «Токены для дизайнера» на странице
[docs/theme.html](docs/theme.html).

## Сборка / Build

```bash
npm run build        # все три пакета
npm run build:core   # только griffincss-core
npm run build:ui     # только griffincss-ui
npm run build:utils  # только griffincss-utils
npm run build:tokens # только design-tokens.json
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

**Ось оформления.** Стилей четыре, странице нужен один: правила
`[data-gr-style="strict"]` и блоки токенов чужих стилей выбрасываются,
если в разметке стоит только `data-gr-style="compact"`. Отчёт называет
и оставленное, и выброшенное. Стиль, который ставится в рантайме
(`el.dataset.grStyle = …`), скрипт увидеть не может — его имя идёт
в `--safelist` наравне с классами: `--safelist airy`. Если `data-gr-style`
не встретился в разметке вовсе, ось отсекается целиком, и об этом
говорится отдельной строкой отчёта.

**Что сохраняется всегда:** объявление порядка слоёв, `:root` со всеми
переменными, `@property`, правила без классов в селекторе (по тегу,
по атрибуту — кроме разобранного выше `data-gr-style`). `@keyframes`
остаётся, только если на анимацию ссылается уцелевшее правило;
опустевший `@media` не остаётся вовсе.

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
| `griffincss-ui` | [docs/reference-ui.html](docs/reference-ui.html) | Двадцать шесть модулей интерфейса: кнопки, поля, карточки, таблицы, навигация, всплывающие слои, состояния |
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
| Взять библиотеку в React или Vue | [docs/frameworks.html](docs/frameworks.html) |
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
│   │   └── dist/                       # Скомпилированный CSS, минифицированные рантаймы
│   │                                   # и design-tokens.json — экспорт токенов (DTCG)
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
│   ├── check-dist.mjs            # Проверки собранного CSS и бюджетов на вес
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
| Griffincss в React и Vue | [docs/frameworks.html](docs/frameworks.html) |
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
