# Участие в разработке Griffincss

Спасибо за интерес к проекту. Здесь описано, как предложить изменение,
каким требованиям должен отвечать код и как проверить свою работу.

## Кодекс поведения

Участие в проекте означает согласие с [кодексом поведения](CODE_OF_CONDUCT.md).

---

## Требования к окружению

| Компонент | Версия |
|---|---|
| Node.js | ≥ 22 (CI проверяет 22 и 24) |
| npm | ≥ 9 |
| Dart Sass | ставится как devDependency (`sass ^1.101.0`) |

```bash
git clone https://gitverse.ru/BarneyScott/GriffinCSS.git
cd GriffinCSS
npm install
npm run build
```

Успешная сборка не выводит ничего. Любой вывод — это ошибка компиляции.

Node 20 не годится: `npm test` запускает `node --test` с glob-шаблоном,
а шаблоны в позиционных аргументах появились только в 22-й версии —
на 20.20.2 команда падает с `Could not find`. Сверх того, поддержка
Node 20 закончилась 30.04.2026.

---

## Как предложить изменение

1. **Заведите issue** до начала работы, если правка не тривиальна. Опишите
   задачу и предполагаемое решение — это дешевле, чем переписывать готовый код.
2. **Создайте ветку** от `main`. Имя ветки — латиницей, по схеме
   `<тип>/<краткое-описание>`: `feat/dark-theme`, `fix/layout-collision`.
3. **Сделайте изменение** минимальным по объёму и совпадающим по стилю
   с соседним кодом.
4. **Проверьте** его (см. раздел «Проверка»).
5. **Откройте pull request** в `main` с описанием: что изменилось, зачем,
   как проверено.

---

## Требования к коду

### SCSS

- Модульная система — только `@use` / `@forward`. `@import` запрещён.
- Все классы, data-атрибуты, CSS-переменные, миксины и функции — с префиксом `gr-`.
- Значения берутся из CSS custom properties, а не хардкодятся в правилах.
- `!important` не используется.
- Отступ — 2 пробела. Комментарии — в стиле `//`.
- Повторяющиеся правила генерируются циклами `@each` / `@for`, а не копипастой.
- Модули из `scss/modules/` не попадают в core-точку входа.

### JavaScript

- Рантайм — IIFE со `'use strict'`, без сборки и без зависимостей.
- Предупреждения в консоль — с префиксом `Griffincss: `.
- Значения брейкпоинтов должны совпадать с `scss/core/_variables.scss`.

### Детальные правила

Три раздела ниже — по одному на слой, который вы собираетесь трогать.
Прочитайте нужный **до** начала правки: в них лежат инварианты, нарушение
которых ловится гейтом уже после того, как работа сделана.

- [Новый SCSS-модуль](#creating-a-new-griffincss-scss-module)
- [Правка существующего SCSS](#editing-griffincss-scss)
- [Правка JS-рантайма](#editing-griffincss-js-runtime)

Архитектурный справочник — [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Creating a New Griffincss SCSS Module

Follow these steps to add a new optional module to the library.

### 1. Create the SCSS partial

File — a class belongs to exactly one package, and `check-dist.mjs` checks all three pairs:

| Package | Path | What belongs here |
|---|---|---|
| core | `packages/core/scss/_<name>.scss` | Tokens, themes, grid/flex, layout |
| ui | `packages/ui/scss/_<name>.scss` | Interface components — a thing with parts and states |
| utils | `packages/utils/scss/_<name>.scss` | Single-purpose utility classes |

Rules:
- Use `@use` syntax (Dart Sass), never `@import`
- Prefix ALL CSS classes and data-attributes with `gr-`
- Use CSS custom properties from `:root` for values; do NOT hardcode pixels
- Each module must be self-contained — importing it alone should not produce errors
- Do NOT use `!important` unless absolutely unavoidable
- Document the module with `//` comments at the top describing its purpose

#### Template

```scss
// Griffincss — <Module Name>
// <Brief description of what this module provides>

// в packages/core/:         @use 'breakpoints' as bp;
// в packages/ui/ и utils/:  @use 'griffincss-core/scss/breakpoints' as bp;
@use 'breakpoints' as bp;

// Example utility class
.gr-<utility-name> {
  property: value;
}

// Responsive variants (if applicable) — shared map, range notation, suffix naming
@each $bp-name, $bp-value in bp.$gr-breakpoints {
  @media (width >= $bp-value) {
    .gr-<utility-name>-#{$bp-name} {
      property: value;
    }
  }
}
```

Never declare a breakpoint map inside a module, and never write `min-width` / `max-width` —
both stylelint and `scripts/check-dist.mjs` reject it.

### 2. Register the module

File: the package entry point — `packages/core/scss/griffincss-core.scss`,
`packages/ui/scss/griffincss-ui.scss` (plus `griffincss-ui-scoped.scss`) or
`packages/utils/scss/griffincss-utils.scss` (plus `griffincss-utils-scoped.scss`).
Both scoped variants have to be edited too, or the module ships in one build and not the other.

The module goes inside the layer block, alphabetically:

```scss
@include meta.load-css('<name>');
```

Nothing else is needed: the layer wrapper comes from the entry point, so the module
itself must not open a `@layer` of its own.

### 3. Rebuild

```bash
npm run build
```

Verify zero output on success, then `npm test` — `scripts/check-dist.mjs` confirms the new
classes are inside their layer, carry the `gr-` prefix and do not leak into another package.

### 4. Update documentation

Add a section to `README.md` following the existing pattern:
- Bilingual header (RU/EN)
- Table of classes with descriptions
- Code example if helpful

### 5. Update demo (if applicable)

Add an example to `docs/demo.html` demonstrating the new module's classes.

### Naming Conventions

| Scope | Convention | Example |
|---|---|---|
| File | `_lowercase.scss` | `_spacing.scss` |
| CSS classes | `.gr-{kebab-case}` | `.gr-my-4`, `.gr-flex-center` |
| Data attributes | `data-gr-{kebab-case}` | `data-gr-layout`, `data-gr-layout-md` — the layout parser only; utilities are classes |
| SCSS mixins/functions | `gr-{kebab-case}()` | `gr-grid-layout()`, `gr-rem()` |
| CSS custom properties | `--gr-{kebab-case}` | `--gr-gap`, `--gr-radius` |
| Responsive suffix | `-{sm,md,lg,xl}` | `.gr-hidden-md`, `.gr-flex-col-lg` |
| Logical side | `-s` / `-e` next to physical `-l` / `-r` | `.gr-ms-4`, `.gr-border-e` |

The prefix form `.gr-md\:p-8` was removed in v0.7.0. The library has exactly one
responsive syntax: the suffix.

### Logical properties (write these by default)

A new module writes **logical properties**. `margin-inline-start`, not
`margin-left`; `inset-inline`, not the `left` + `right` pair; `text-align: start`,
not `left`. They flip themselves under `dir="rtl"`, so no `[dir]` or `:dir()` rule
is ever needed — and a pair of physical sides collapses into a single declaration,
which makes the output smaller rather than larger.

A physical property is allowed, but it needs a reason written in a comment next
to it. Two reasons are known to be good:

- **The side is geometric, not textual.** A close button in the corner of a window
  must hold the corner, so `.gr-left-0` is left in any writing direction. Same for
  `object-position` — it frames the picture, not the text.
- **The class already exists with a physical name.** `.gr-ml-*` cannot be
  redefined into `margin-inline-start`: markup that says `ml` chose the left side
  on purpose. Add the logical sibling next to it instead — that is how Stage 13
  paired `ms`/`me` with `ml`/`mr` and `start`/`end` with `left`/`right`.

`width` and `height` are *not* on this list. `direction: rtl` does not swap the
inline axis — only `writing-mode` does — so `inline-size` buys nothing while the
library has no vertical writing support, and costs six bytes in every rule.

Both classes belong in the same module and in the same documentation table, with
the RTL column filled in. A logical class the reader cannot find is a class nobody
uses.

### A utility whose value someone else needs

If another rule or a runtime reads the value of a utility, declare it as a custom
property and derive the property from it:

```scss
.gr-p-4 {
  --gr-p: 1rem;

  padding: var(--gr-p);
}
```

The fight over the property in the cascade then stops meaning anything: whoever wins,
both sides arrive at the same value. That is exactly how `.gr-p-*` and `.gr-radius`
were made to agree in Stage 9.

A property no subtree is supposed to see is registered with `@property` and
`inherits: false` in `packages/core/scss/_tokens.scss` — see `--gr-r` and `--gr-p`.
An inheriting `--gr-r` would make a nested `.gr-radius` copy its ancestor's radius
verbatim, which is a plausible-looking wrong picture rather than a visible refusal.

The value must also be derivable from a SCSS map: otherwise the rule table in
`packages/utils/src/griffincss-utils.js` cannot see it and `npm run sync` cannot
check it.

Do not publish for symmetry. A variable nobody reads costs bytes in every artifact
and buys nothing — Stage 9d went through all thirteen utils modules on exactly this
criterion and added no new publications.

### Breakpoints (do not redefine)

One map, `$gr-breakpoints` in `packages/core/scss/_breakpoints.scss`, feeds every `@media`
in all three packages, the `--gr-bp-*` tokens and the JS runtime fallbacks. `griffincss-ui`
and `griffincss-utils` reach it by package path — both peer-depend on `griffincss-core`.

```scss
// In SCSS — take the values from the map:
@use 'breakpoints' as bp;

@each $bp-name, $bp-value in bp.$gr-breakpoints {
  @media (width >= $bp-value) { … }
}
```

```css
/* In authored CSS (yours or a demo page) — the tokens, which carry the same values: */
var(--gr-bp-sm)  /* 640px */
var(--gr-bp-md)  /* 768px */
var(--gr-bp-lg)  /* 1024px */
var(--gr-bp-xl)  /* 1280px */
```

Hardcoding a pixel value inside `@media` fails `scripts/check-dist.mjs`: only values present
in the map are allowed.

### Extra rules for `packages/ui/` components

1. **Do not rely on the reset.** It is opt-in. Set `box-sizing`, `font-family: inherit`,
   `margin: 0` and, for tables, `border-collapse` in the component itself.
2. **Tokens live in the core.** A component token goes into `packages/core/scss/_tokens.scss`,
   never into a ui partial: check 8 in `check-dist.mjs` requires an identical `:root` block
   in all three packages, and the theme has to be able to reach it.
3. **Sizes in `rem`, colours through `--gr-color-*`.** A literal pixel height opts the
   component out of the low-vision mode; a literal colour opts it out of both themes.
   `packages/ui/test/ui.test.js` fails the build on either.
4. **No `[data-gr-theme]` / `[data-gr-a11y]` selectors.** Both attributes sit on `<html>`,
   outside `.griffin`, so such a rule never matches in the scoped build. Adapt through tokens.
5. **`:hover` goes inside `@media (hover: hover)`** — otherwise it sticks after a tap on
   a touch screen. The only exception is a `z-index` bump.
6. **Variants set custom properties, not properties.** One `:hover` rule over
   `--gr-btn-bg` / `--gr-btn-fg` beats nine copies of the same declaration; see `_button.scss`.
7. **State signalled by more than colour.** A status needs a word in the markup —
   see `.gr-alert-title` — because colour does not survive printing or colour blindness.

---

## Editing Griffincss SCSS

Rules for modifying existing SCSS files in the library.

### Before Making Changes

1. **Read the target file** and its neighbors to understand existing conventions
2. **Check which entry point includes this file:**
   - `packages/core/scss/griffincss-core.scss` — layer `griffincss.core`
   - `packages/core/scss/griffincss-reset.scss` — layer `griffincss.reset`
   - `packages/ui/scss/griffincss-ui.scss` and `griffincss-ui-scoped.scss` — layer `griffincss.ui`
   - `packages/utils/scss/griffincss-utils.scss` and `griffincss-utils-scoped.scss` — layer `griffincss.utils`

   Layer order: `@layer griffincss.reset, griffincss.core, griffincss.ui, griffincss.utils;` —
   declared in full by every entry point, so the result does not depend on `<link>` order.
3. **`_tokens.scss`, `_breakpoints.scss`, `_theme.scss` and `_theme-values.scss` live only in `packages/core/`.**
   `griffincss-ui` and `griffincss-utils`
   pull them by package path (`@use 'griffincss-core/scss/breakpoints' as bp;`) — both peer-depend
   on the core. Editing them changes all three packages at once, so rebuild and check all three.
   `_theme.scss` **must** be loaded by every entry point, not just the grid one: the
   `griffincss.ui` and `griffincss.utils` layers outrank `griffincss.core`, so theme overrides
   that ship only with the core would lose to the base `:root` block coming from an add-on
   build, whatever the selector specificity. `check-dist.mjs` fails the build if the theme
   block is missing from any artifact.
4. **Resolved `--gr-color-*` are declared for every theme carrier**, not just `:root`
   (`:root, [data-gr-theme], [data-gr-a11y]`). `var()` inside a custom property is
   substituted on the element where the property is declared; descendants inherit the
   finished colour. Declared once on `:root`, a nested `data-gr-theme` section would swap
   its triplets and keep the root theme's colours.

### While Editing

- **Preserve `@use` / `@forward` structure.** Never add `@import`.
- **Follow existing naming:** all mixins/functions prefixed `gr-`, all classes prefixed `gr-`.
- **Breakpoints live in exactly one map.** `packages/core/scss/_breakpoints.scss` →
  `$gr-breakpoints`. A module never re-declares it:
  ```scss
  @use 'breakpoints' as bp;

  @each $bp-name, $bp-value in bp.$gr-breakpoints {
    @media (width >= $bp-value) { … }
  }
  ```
  Changing a value is a one-line edit in that map, then `npm run build` — it propagates to
  every `@media` in all three packages, to the `--gr-bp-*` tokens in `_tokens.scss` (generated by
  `@each` from the same map) and to the runtime fallbacks.
  `npm run sync-breakpoints -- --fix` rewrites the marked block in
  `packages/core/src/griffincss.js`; the check runs on every build.
  Inside `packages/ui/` and `packages/utils/` the same map is reached as
  `@use 'griffincss-core/scss/breakpoints' as bp;` — never copy the values over.
- **A map that feeds the rule table is synced, not just rebuilt.** `$gr-spacing-base`,
  `$gr-spacing-steps`, `$gr-radius-base` and `$gr-radius-max` are read by
  `scripts/sync-rule-table.mjs` and mirrored into the runtime table in
  `packages/utils/src/griffincss-utils.js`. After changing any of them run
  `npm run sync -- --fix`, otherwise `packages/utils/test/rule-table.test.js`
  reports the divergence and the build gate fails — the runtime would be handing out
  rules that contradict the compiled CSS.
- **Keep new CSS inside the layer.** Entry points emit everything through
  `@include meta.load-css(...)` inside `@layer griffincss.{reset,core,ui,utils}`; a partial that
  emits CSS is picked up automatically. Never open a layer inside a partial — `check-dist.mjs`
  fails on any top-level rule outside its layer, and a rule outside layers silently outranks
  the whole library.
- **Match existing code style:**
  - Indentation: 2 spaces
  - Comments: `//` style, bilingual where applicable
  - SCSS loops: `@for`, `@each` for repetitive rules
  - Map syntax: `$map: (key: value, key2: value2)`

### After Making Changes

1. **Rebuild immediately:**
   ```bash
   npm run build
   ```
   - Zero output = success
   - Error message = fix and rebuild

2. **Verify output:**
   ```bash
   npm test     # node:test suites + scripts/check-dist.mjs over the compiled CSS
   ```

3. **Grep for your changes:**
   ```bash
   grep "your-new-class" packages/core/dist/griffincss-core.css
   grep "your-new-class" packages/ui/dist/griffincss-ui.css
   grep "your-new-class" packages/utils/dist/griffincss-utils.css
   # A class must appear in exactly one of the three packages
   ```

4. **Update demo** if the change affects user-facing behavior.

5. **Update README** if APIs or class names changed.

### File Dependency Map

```
packages/core/scss/griffincss-core.scss        @layer griffincss.core
├── _tokens.scss          → _breakpoints.scss   (generates --gr-bp-*)
├── _grid-helpers.scss    → _breakpoints.scss
├── _grid-parser.scss     → _layout-mixins.scss (@forward)
│   └── _layout-mixins.scss → _breakpoints.scss, _functions.scss
└── _flex.scss            → _breakpoints.scss

packages/core/scss/griffincss-reset.scss       @layer griffincss.reset
└── _reset.scss           (no deps)

packages/ui/scss/griffincss-ui.scss            @layer griffincss.ui
├── griffincss-core/scss/tokens        (peer dep; no local copy)
├── griffincss-core/scss/theme
└── _alert / _avatar / _badge / _button / _card / _choice / _form / _table
    (no deps — components read tokens through var(), not through @use)

packages/ui/scss/griffincss-ui-scoped.scss — the same, wrapped in @scope (.griffin);
    tokens and theme stay outside the scope, [data-gr-theme] sits on <html>

packages/utils/scss/griffincss-utils.scss      @layer griffincss.utils
├── griffincss-core/scss/tokens        (peer dep → the core copy, no local one)
├── _border-radius.scss   → griffincss-core/scss/breakpoints
├── _colors.scss          (no deps)
├── _spacing.scss         → griffincss-core/scss/breakpoints
├── _typography.scss      → griffincss-core/scss/breakpoints
└── _visibility.scss      → griffincss-core/scss/breakpoints

packages/utils/scss/griffincss-utils-scoped.scss — the same, wrapped in @scope (.griffin)
```

### Common Patterns

#### Adding a new class to an existing module
Edit the module's `_*.scss` in `packages/*/scss/`. Rebuild. Done.

#### Adding a responsive variant
Follow the existing pattern — shared map, range notation, suffix naming:
```scss
@use 'breakpoints' as bp;

@each $bp-name, $bp-value in bp.$gr-breakpoints {
  @media (width >= $bp-value) {
    .gr-{utility}-#{$bp-name} { ... }
  }
}
```
`min-width` / `max-width` are rejected by both stylelint and `check-dist.mjs`.

#### Adding a new SCSS function
Add to `packages/core/scss/_functions.scss`. Prefix with `gr-`. Rebuild.
`_layout-mixins.scss` already has `@use 'functions' as fn`.

---

## Editing Griffincss JS Runtime

Rules for modifying `packages/core/src/griffincss.js` — the DOM-scanning grid parser.

### Key Facts

- **Source:** `packages/core/src/griffincss.js` — edit this copy
- **Artifact:** `packages/core/dist/griffincss.js` — minified by terser during `npm run build`
  (source map alongside, ASCII `/*! … */` banner; never edit it)
- **Format:** UMD-ish wrapper — `module.exports` under Node, `window.Griffincss` + auto-start in the browser
- **Size:** ~27 KB uncompressed in `src/`, 3.3 KB gzip in `dist/`; budget for all four runtimes — 10 KB gzip
- **No compilation:** the source is the truth, but run `npm run build` so `dist/` is re-minified from `src/`
- **CSS injection target:** `<style id="griffincss-dynamic">` in `<head>`
- **Tests:** `packages/core/test/*.test.js` on `node:test` — run them before and after every change

### Architecture Overview

```
(function (factory) { module.exports / window.Griffincss + autoStart })(function () {
  // === State ===
  VERSION, STYLE_ID, MAX_REPEAT, MAX_NAME_LENGTH, NAME_PATTERN, REFRESH_DELAY,
  BREAKPOINTS, BP_NAMES, BP_ORDER, BP_ATTRS, LAYOUT_SELECTOR,
  styleEl, generatedSets, generatedAreas, layoutCSS, areaCSS, touched, observers,
  parseObserver

  // === Parser (throws on invalid input) ===
  fail(), cellName(), parseSegment(), parseLayout(), collectAreaNames(), getMaxColumnCount()

  // === CSS Generation ===
  hashKey(), getStyleElement(), foucGuardCSS(), flushCSS(),
  buildGridRule(), buildHideRule(), isContainerBp(), byBpOrder(),
  rangeQuery(), wrapInQuery(), setKey(), ensureSetCSS(), ensureAreaCSS()

  // === DOM Processing ===
  track(), recordOf(), areaNameOf(), readElementLayouts(), baseNames(), freeAreaName(),
  assignAreaClasses(), admitChild(), markReady(), processElement(), processLayouts()

  // === Streaming (parse-time) ===
  hasLayoutAttr(), handleAdded(), observeParsing(), stopParseObserver(),
  breakpointFingerprint(), rebuild()

  // === Public API ===
  init(), refresh(root?), observe(root?), destroy(), parseLayout(), version, _autoStart()
})
```

### Invariants — do not break these

1. **Rules target `.gr-l-<hash>`, never `[data-gr-layout="value"]`.** The hash comes from
   `setKey()` (sorted `bp:layout` pairs), so two containers sharing a base layout but
   differing in responsive variants get different classes. Attributes stay the data source only.
2. **The compile-time mixin must stay in sync.** `packages/core/scss/_layout-mixins.scss`
   generates the same CSS; `generate.test.js` compares both outputs. Changing rule text, order,
   or media ranges in JS means changing the mixin in the same commit.
   The runtime writes no `gap`: the default comes from `[class*="gr-l-"]` in
   `_grid-parser.scss`, so `.gr-gap-*` can override it. Do not add the declaration back.
3. **Ranges use range syntax** — `(width < 768px)`, `(768px <= width < 1024px)`,
   `(width >= 1280px)`. No `-1px` arithmetic, no `min-width`/`max-width`.
   The same text serves `@media` and `@container`: `rangeQuery()` builds the range,
   `wrapInQuery(rule, …)` picks the at-rule. Window and container form **two
   independent chains**; the base layout is wrapped in both at once
   (`@media { @container { … } }`), or it would cover the other axis' range and
   the winner would depend on rule order rather than on width.
4. **All generated CSS goes inside `@layer griffincss.core`,** preceded by the full order
   declaration `@layer griffincss.reset, griffincss.core, griffincss.utils;`. The block ends
   with `/* end */` before the closing brace — `cssSection()` in the tests slices sections by
   comment markers and would otherwise pick up the brace. Emitting a rule outside the layer
   makes the runtime outrank every stylesheet, including the user's.
5. **The FOUC guard belongs to the runtime.** It must never be added to the SCSS —
   `check-dist.mjs` fails the build if `gr-ready` shows up in the compiled CSS.
6. **Invalid layouts skip the whole element** with `console.warn('Griffincss: …')`,
   and the element still gets `.gr-ready` so it stays visible.
7. **Whatever the runtime puts on an element is tracked** in `touched` so that
   `destroy()` can take it back off. Adding a new class or attribute means extending the record.
8. **Two entry points, one worker.** `processLayouts()` (batch) and `handleAdded()`
   (parse-time) both go through `processElement()`. Fixing a bug in one path means
   fixing it in `processElement`, never in a copy.
9. **Area handout must be order-independent.** Streaming hands a free name to a
   classless child at once, but an explicit `gr-area-*` in the markup always wins:
   `admitChild()` falls back to a full `assignAreaClasses()` recompute so the result
   equals the batch outcome. Do not replace it with a point fix — the result would
   depend on the order children arrived in.
10. **No layout reads.** `getComputedStyle` is used once for `--gr-bp-*`; per-element measuring
   was removed with `processRadius` and must not come back.

### Before Making Changes

1. **Understand the feature in CSS context.** The JS generates CSS — know what valid CSS should look like first.
2. **Check all callers of the function you're modifying** — grep for the function name.
3. **Write the failing test first** in `packages/core/test/`, run it, watch it fail.

### While Editing

- **Preserve the wrapper** — the factory returns the API object; `module.exports` must keep working
  or the whole test suite dies.
- **Keep all `var` declarations and ES5 syntax** — consistency with the rest of the file.
- **Add the `Griffincss: ` prefix to every warning and error message:**
  ```js
  fail('zero repeat count for area "' + name + '" in layout "' + layout + '"');
  ```
- **Update the version string** in `VERSION`, in the header comment, and in
  `packages/core/package.json` — `runtime.test.js` checks all three agree.
- **Never hand-edit the breakpoint fallbacks.** The block between the `gr:breakpoints`
  markers is generated from `packages/core/scss/_breakpoints.scss`:
  ```js
  var BREAKPOINTS = {
    /* gr:breakpoints */
    sm: '640px',
    …
    /* /gr:breakpoints */
  };
  ```
  Change the SCSS map, then `npm run sync-breakpoints -- --fix`; the build fails on divergence.
  `BP_ORDER` and `BP_ATTRS` are derived from this object, so a new breakpoint needs no JS edit.
  Values are overridden at runtime from `--gr-bp-*`.

### After Making Changes

1. **Run the suites:**
   ```bash
   node --test "packages/*/test/*.test.js"
   npm run check          # lint + build + tests + check-dist
   ```

2. **Test in a real browser:**
   ```bash
   python3 -m http.server 8800     # or: npx serve -l 8800 -n .
   # http://localhost:8800/docs/demo.html   — 375 / 700 / 900 / 1200 px, console must be clean
   # http://localhost:8800/docs/slow.html   — data-auto="false", init() after 3 s

  npm run demo:stream                        # HTML отдаётся порциями с паузой
  # http://localhost:8800/docs/stream.html      — потоковая раскладка
  # http://localhost:8800/docs/stream-off.html  — она же с data-stream="false"
   ```

### Cached State

Module-level caches persist across `refresh()` calls:

| Cache | Key | Purpose |
|---|---|---|
| `generatedSets` | sorted `"bp:layout,…"` | Set → class name; prevents regenerating rules for the same set |
| `generatedAreas` | area name | Prevents duplicate `.gr-area-*` rules |
| `layoutCSS`, `areaCSS` | (concatenated strings) | Accumulated CSS for the `<style>` output |
| `touched` | array of `{el, layoutClass, areas}` | What to undo in `destroy()` |
| `observers` | array of `{root, observer, timer}` | One observer per observed root, with its debounce timer |
| `parseObserver` | — | The parse-time observer; raised at script load, dropped on `DOMContentLoaded` and by `destroy()` |

**`destroy()` resets all of them** and removes the injected classes from the DOM.

### CSS Output Structure

```css
/* FOUC guard */
[data-gr-layout]:not(.gr-ready), … { opacity: 0; }
[data-gr-layout].gr-ready, …      { opacity: 1; transition: opacity 0.3s ease; }

/* Grid Layouts — оконная и контейнерная цепочки */
@media (width < 768px) { @container (width < 768px) { .gr-l-2m7q0z { … } } }
@media (width >= 768px)     { .gr-l-2m7q0z { … } }
@container (width >= 768px) { .gr-l-2m7q0z { … } }

/* Grid Layouts */
.gr-l-1f4x9k { display: grid; grid-template-areas: …; }   /* gap приходит из статики */
.gr-l-1f4x9k > [class*="gr-area-"]:not(.gr-area-a):not(.gr-area-b) { display: none; }
@media (width < 768px)  { .gr-l-2m7q0z { … } }
@media (width >= 768px) { .gr-l-2m7q0z { … } }

/* Grid Areas */
.gr-area-a { grid-area: a; }
```

### Layout Validation

| Rejected | Example |
|---|---|
| repeat count without an area name | `3a` |
| zero repeat count | `a0b2` |
| repeat count > 64 | `a99999b` |
| area name longer than 32 chars | `aaa…a1` |
| invalid characters in a name | `a.b1`, `a b1` |
| empty row / empty layout | `a1-`, `-a1`, `''` |

The same rules live in `packages/core/scss/_functions.scss` (`@error` instead of `console.warn`).

### Special Attributes

| Attribute | Purpose |
|---|---|
| `data-auto="false"` on `<script>` tag | Disables auto-init; the FOUC guard then appears only with the manual `Griffincss.init()` |
| `data-stream="false"` on `<script>` tag | Disables the parse observer; layout waits for `DOMContentLoaded`, as before v0.7.0 |
| `data-gr-layout` | Base grid layout (no breakpoint) |
| `data-gr-layout-{sm,md,lg,xl}` | Responsive grid layout by **window** width (`@media`) |
| `data-gr-layout-c{sm,md,lg,xl}` | Responsive grid layout by **container** width (`@container`) — the nearest ancestor with `container-type`, i.e. an ancestor carrying `.gr-cq`. The runtime never adds `.gr-cq` itself: inline-size containment forced onto someone else's markup breaks the page silently |

---

## Проверка

Изменение не считается готовым, пока не проверено.

| Что менялось | Чем проверяется |
|---|---|
| SCSS-модуль | `npm run build`, затем grep класса в `dist/griffincss.css` и его отсутствия в `dist/griffincss-core.css` |
| JS-рантайм | Node-скрипт с мок-DOM, включая невалидный ввод |
| Адаптивность | Реальный браузер, минимум на ширинах 375 / 700 / 900 / 1200 px |
| Демо и docs | Открыть страницу, убедиться, что консоль чистая |

Локальный просмотр демо:

```bash
npx serve -l 8800 -n .
# http://localhost:8800/docs/demo.html
```

> **Состояние на 0.16.0:** проверки автоматизированы — `npm run check`
> прогоняет `stylelint` по исходникам, пересобирает оба пакета, запускает
> `node:test` и `scripts/check-dist.mjs` по собранному CSS. Ручной обход
> по таблице выше остаётся для визуальной проверки в браузере.

Тот же гейт запускается сам: `.gitverse/workflows/check.yaml` выполняет
`npm ci` и `npm run check` на Node 22 и 24 при push в `main` и при запросе
на слияние. Запрос, у которого гейт красный, не сливается.

---

## Коммиты

Заголовок и тело коммита — **на русском языке**. Тип берётся из
Conventional Commits и остаётся английским.

```
feat: добавлен модуль типографики

- scss/modules/_typography.scss: размеры, начертания, выравнивание
- scss/griffincss.scss: регистрация модуля
- README.md: описание классов
```

Допустимые типы: `feat`, `fix`, `refactor`, `docs`, `style`, `test`,
`chore`, `build`.

Один коммит — одно осмысленное изменение. Не смешивайте рефакторинг
с новой функциональностью.

---

## Обратная совместимость

Публичный API — это имена классов, data-атрибутов и CSS-переменных.
Их изменение ломает вёрстку у пользователей библиотеки. Любое такое
изменение согласуется в issue до начала работы и описывается в разделе
миграции `README.md`.

---

## Вопросы

Если что-то неясно — заведите issue с меткой `question`
в [репозитории](https://gitverse.ru/BarneyScott/GriffinCSS).
