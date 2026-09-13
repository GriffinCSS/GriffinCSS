# Griffincss — Architecture Reference

> **Contribution rules — build gate, naming, module conventions — are in
> [CONTRIBUTING.md](CONTRIBUTING.md).** Read the section for the layer you are
> about to touch (SCSS module, existing SCSS, JS runtime) before starting.

## Project Identity
- **Name:** griffincss (private monorepo root, npm workspaces)
- **Packages:** `griffincss-core` (core), `griffincss-ui` (components) and `griffincss-utils` (utilities) — both add-ons peer-depend on the core, all under `packages/*`
- **Version:** 0.25.0
- **Type:** Modular SCSS CSS library + JS runtime
- **Language:** SCSS (Dart Sass), JavaScript (IIFE)
- **License:** MIT
- **Root:** `/Users/barney/Documents/Миша/Сайты/SITEFORU/GRIFFINCSS/PROJECT`

## Build & Verify

```bash
npm run build          # sync (runtime breakpoint fallbacks) + all three packages
npm run build:core     # griffincss-core only
npm run build:ui       # griffincss-ui only
npm run build:utils    # griffincss-utils only
npm run build:pages    # docs site for GitVerse Pages into _site/
npm run watch          # all three packages, single sass --watch process
npm run sync           # sync-breakpoints (check; -- --fix rewrites the runtime block)
npm run lint           # stylelint over packages/*/scss
npm run lint:fix       # stylelint --fix
npm test               # node --test packages/*/test + check-dist.mjs + check-links.mjs
npm run check          # lint + build + test

# Compiler: Dart Sass (sass package, ^1.101.0)
# Output:
#   packages/core/dist/griffincss-core.css, griffincss-reset.css,
#                       griffincss-styles.css, griffincss-style-{airy,strict,compact}.css,
#                       griffincss.js, griffincss-theme.js
#   packages/ui/dist/griffincss-ui.css, griffincss-ui-scoped.css
#   packages/utils/dist/griffincss-utils.css, griffincss-utils-scoped.css
```

**After any SCSS change:** run `npm run build`. The JS runtimes are hand-written in
`packages/*/src/*.js` and minified into `dist/` by `build:js` (`scripts/build-js.mjs`:
terser with `passes: 3`, `mangle`, `ecma: 2020`, source map alongside, ASCII `/*! … */`
banner). The terser flags live in one module, `scripts/terser-options.mjs`, read by
`build-js.mjs`, by `build-griffinjs.mjs` and by `scripts/check-origin.mjs` — always edit the
`src/` copy; `dist/*.js` is a build artifact, and `check-origin.mjs` (a step of `npm test`)
minifies every `src/` in memory with the same functions the build uses and compares it with
`dist/` byte for byte: a hand-edited or stale `dist/*.js` fails `npm test` with the file name
and the hint `npm run build`. The terser version is pinned exactly (no `^`): upgrading the
minifier is a deliberate commit with a rebuild, not a surprise on `npm install`.
`check-dist.mjs` guards the result: a banner in ASCII, no block comments left, no Cyrillic
outside string literals (Russian console messages and `aria-label`s are string literals and
stay), and 10 KB gzip for all four runtimes together — 9.1 KB today.

**Package hierarchy:** `griffincss-core` is the core and depends on nothing. `griffincss-ui`
and `griffincss-utils` are layers on top: each declares `griffincss-core` in `peerDependencies`
and pulls `_tokens.scss` and `_breakpoints.scss` from it by package path
(`@use 'griffincss-core/scss/breakpoints'`). The two add-ons do not reference each other at all —
a component must look right on its own; utilities exist to move it, not to make it work.
There are no duplicated SCSS sources and no sync script for them. Two consequences:
compiling an add-on from SCSS needs package resolution (`--load-path=node_modules`, already in the
add-on build scripts), and the compiled `griffincss-ui.css` / `griffincss-utils.css` stay
self-contained — each carries the same `:root` block, so a page can load either without
`griffincss-core.css`.
Peer, not a regular dependency: only one copy of the core may exist in the tree, otherwise the
breakpoint values in the add-ons and in the core could silently diverge.

**Breakpoints — single source:** the map `$gr-breakpoints` in `packages/core/scss/_breakpoints.scss`.
Everything else is derived from it — every `@media` in all three packages, the `--gr-bp-*` tokens in
`_tokens.scss`, and the `BREAKPOINTS` fallbacks in the runtime (the block between the
`gr:breakpoints` markers, kept in sync by `scripts/sync-breakpoints.mjs`, `-- --fix` to rewrite).
Adding or changing a breakpoint is a one-line edit in that map plus `npm run build`.
A consumer configures it once for every package:
`@use 'griffincss-core/scss/breakpoints' with ($gr-breakpoints: (…))` before either entry point.

**Style axis — single configuration point:** the list `$gr-styles` in
`packages/core/scss/_style-config.scss` (default `(airy, strict, compact)`, `@error` on an
unknown name). It decides both which blocks reach `griffincss-styles.css` and which
structural rules reach `griffincss-ui.css` — `griffincss-ui` peer-depends on the core and
reads the list by package path, so the two cannot diverge. `()` switches the axis off
entirely.

Consumers who do not compile SCSS have no place to set that list, so the same three
configurations are prebuilt: `griffincss-style-airy.css`, `-strict`, `-compact`, one style
each, produced by `scripts/build-styles.mjs` from the very same entry point (`build:style-files`
in `packages/core`). Each file **replaces** `griffincss-styles.css` rather than adding to it —
the shared part of the axis is inside every one of them. They cover tokens only; the
structural rules in `griffincss-ui.css` are another package and stay complete there (115 B
brotli for all four styles). `check-dist.mjs` guards each file against carrying another
style's selectors — the failure mode of a forgotten configuration is a silent copy of the
full file. Stage 44 (2026-09-13): the axis stays inside `griffincss-core` — a separate npm
package was weighed and declined (zero bytes saved on the page, a fourth package in the
peer-locked trio); the four axis files got gzip budgets in `check-dist` (1.9 / 1.5 / 1.2 /
1.5 KB), and `griffincss-core.css`, the reset and `griffincss-utils.css` are guarded against
any `[data-gr-style` rule — the nine structural rules in `ui` are the only place the axis
is paid for by those who do not link it.

`packages/ui/scss/_style-rules.scss` holds every structural rule of the axis and is loaded
**only** by `griffincss-ui.scss`. In the scoped build every selector is prefixed with
`:where(.griffin)`, so `[data-gr-style="strict"] .gr-card-header` would require the
attribute carrier inside the scope — and it sits on `<html>`. In the scoped build such a
rule compiles, passes every other check and silently never matches. `@keyframes` and the
theme are excluded from the scope for the same class of reason. `check-dist.mjs` guards it:
`[data-gr-style` anywhere in `griffincss-ui-scoped.css` is a failure.

**Linting:** two levels.
- `stylelint` (`.stylelintrc.json`) over the sources — style, `gr-` prefixes, no `@import`, no `!important`.
  `selector-class-pattern` is off on purpose: most class names are interpolated.
- `scripts/check-dist.mjs` over the compiled CSS, where every selector is literal —
  `gr-` prefix on all classes, no `!important`, only breakpoint-map values inside `@media`,
  range notation only, layer order declared and nothing left outside its layer,
  `--gr-bp-*` tokens matching the map, no class shared between any two packages
  (checked pairwise: `core ↔ ui`, `core ↔ utils`, `ui ↔ utils`),
  identical `:root` block in all three.

## Architecture

### Two-part system: SCSS (static utilities) + JS (runtime grid parser)

| Layer | Files | Role |
|---|---|---|
| Core package | `packages/core/scss/_breakpoints.scss`, `_tokens.scss`, `_container-queries.scss`, `_container-mixins.scss`, `_grid-helpers.scss`, `_grid-parser.scss`, `_layout-mixins.scss`, `_flex.scss`, `_gap.scss` | CSS custom props, container-query declaration and mixins, static grid/flex utilities, compile-time layout mixins |
| Core reset | `packages/core/scss/_reset.scss` | Opt-in, separate entry point — not part of `griffincss-core.css` |
| Core styles | `packages/core/scss/_styles.scss`, `_style-values.scss`, `_style-config.scss`, `_metrics.scss` | Opt-in `data-gr-style` axis, separate entry point `griffincss-styles.scss` → layer `griffincss.style` |
| SCSS Functions | `packages/core/scss/_functions.scss` | `gr-parse-layout`, `gr-parse-segment`, `gr-split-rows`, `gr-grid-areas`, `gr-grid-columns`, `gr-grid-rows`, `gr-area-names`, `gr-strip-unit`, `gr-rem` — validation rules mirror the runtime |
| Utils package | `packages/utils/scss/_spacing.scss`, `_sizing.scss`, `_typography.scss`, `_colors.scss`, `_borders.scss`, `_border-radius.scss`, `_shadows.scss`, `_position.scss`, `_effects.scss`, `_visibility.scss`, `_interactivity.scss`, `_animations.scss`, `_keyframes.scss`, `_transforms.scss`, `_filters.scss`, `_gradients.scss`, `_palette.scss` | Opt-in utility classes |
| UI package | `packages/ui/scss/_button.scss`, `_link.scss`, `_form.scss`, `_choice.scss`, `_card.scss`, `_table.scss`, `_alert.scss`, `_badge.scss`, `_avatar.scss` (wave 8a — static), `_nav.scss`, `_breadcrumb.scss`, `_menu.scss`, `_dropdown.scss`, `_accordion.scss`, `_tabs.scss`, `_modal.scss`, `_drawer.scss`, `_tooltip.scss`, `_pagination.scss` (wave 8b — navigation and disclosure) | Opt-in interface components; no library JS in either wave |
| Entry points | `griffincss-core.scss`, `griffincss-reset.scss`, `griffincss-ui.scss`, `griffincss-ui-scoped.scss`, `griffincss-utils.scss`, `griffincss-utils-scoped.scss` | `@use` the partials; the scoped variants wrap the add-on in `:where(.griffin)` via `meta.load-css()` |
| JS Runtime | `packages/core/src/griffincss.js` (27 KB raw, 3.3 KB gzip minified, IIFE) | DOM-scanning grid parser, auto-hide, auto-assign, responsive ranges |
| Tests | `packages/core/test/*.test.js`, `packages/ui/test/*.test.js`, `packages/utils/test/*.test.js` | `node:test`, zero dependencies; hand-written mock DOM in `test/helpers/dom.js`, CSS comparison in `test/helpers/css.js` |
| Tooling | `scripts/sync-breakpoints.mjs`, `scripts/check-dist.mjs` | Runtime breakpoint fallbacks, compiled-artifact checks (both zero-dependency) |
| Demo | `docs/demo.html`, `docs/slow.html` | Visual test pages |
| Docs site | `docs/*.html`, `docs/nav.js`, `docs/style.css` | 38 pages sharing one shell: `nav.js` builds the sidebar, the search box, the page outline, the copy buttons and the preview/code tabs from the existing DOM — page markup carries none of it |

### Cascade layers
Every build declares the same order and puts all of its output inside one layer:

```css
@layer griffincss.reset, griffincss.core, griffincss.ui, griffincss.utils, griffincss.style;
```

| Layer | Source |
|---|---|
| `griffincss.reset` | `griffincss-reset.css` |
| `griffincss.core` | `griffincss-core.css`, `gr-grid-layout()` output, all runtime CSS |
| `griffincss.ui` | `griffincss-ui.css`, `griffincss-ui-scoped.css` |
| `griffincss.utils` | `griffincss-utils.css`, `griffincss-utils-scoped.css` |
| `griffincss.style` | `griffincss-styles.css`, `griffincss-style-{airy,strict,compact}.css` — tokens only, never a class |

Components outrank the core so `.gr-card` with its own `display: flex` does not lose to
`.gr-flex`; utilities outrank components so `.gr-mb-0` on a card beats its own `margin-bottom`.

`griffincss.style` is last and must stay last. `griffincss-ui.scss` and
`griffincss-utils.scss` load the core `_tokens.scss` **inside their own layers** so each
built file is self-contained — which puts a `:root` block in three layers at once. A layer
beats any specificity, so the style axis shipping in `griffincss.core` would have lost to
those base tokens silently on any page with `griffincss-ui.css`. User CSS outside layers
still wins over all five.

**What of the theme travels into the add-ons, and why (Stage 40).** The theme is two
partials. `_theme-tokens.scss` — the token carriers (`:root`, `[data-gr-theme]`,
`[data-gr-a11y]`, the `prefers-*` media blocks, print) — ships in **every** entry point:
the add-on layers outrank `griffincss.core`, so a theme override left only in the core
would lose to the base `:root` those add-ons carry, whatever the selector specificity.
`_theme-rules.scss` — the three property rules of the low-vision mode (root font scale,
`a[href]` underline and colour, the `:focus-visible` ring) — ships in the core and in
`griffincss-ui`, but **not** in `griffincss-utils`. From the topmost layer such a rule beats
every component regardless of specificity: `[data-gr-a11y="low-vision"] a[href] { color }`
in `griffincss-utils.css` painted the link colour over the fill of `a.gr-btn-primary`,
and in that mode link and fill are the same `accent-max` — 1.0 : 1 (field report on 0.23.1).
In the components layer the same rule is deliberate: it has to outrank `.gr-link-quiet`
and `.gr-link-inherit` (0,1,0), which it could not do from the core. A filled component
therefore shields itself with its own rule (`a.gr-btn:not(.gr-btn-link)` in `_button.scss`),
never with an attribute selector. `packages/utils/test/utils.test.js` checks that the theme
blocks of the utils build hold nothing but custom properties (and `color-scheme`, which
pairs with the base `:root`); `_theme.scss` forwards both partials for external imports.

The order string is one constant repeated in **nine** places — six entry points,
`packages/core/src/griffincss.js`, `scripts/check-dist.mjs` and the assertion in
`packages/core/test/generate.test.js`. They are cross-checked, so a missed copy fails the
build rather than causing a silent defect.

Consequences: user CSS outside layers always wins without `!important`, and the
final cascade no longer depends on `<link>` order. The runtime emits the same
declaration plus `@layer griffincss.core { … }` around its `<style>` content, so
a page with only the JS loaded lands in the same layer. Compile-time output can
opt out with `@use '…/grid-parser' with ($gr-default-layer: false)` — `false`,
not `null`, because `!default` treats `null` as "unset".

### SCSS Conventions
- Module system: `@use` / `@forward` (no `@import`)
- All mixins/functions prefixed `gr-` (a leading `_` marks module-private mixins)
- All CSS classes/data-attributes prefixed `gr-`; global SCSS variables prefixed `$gr-`
- CSS custom properties on `:root` (not SCSS vars) — runtime-overridable
- Breakpoints: sm=640, md=768, lg=1024, xl=1280 (px) — from `_breakpoints.scss`, never re-declared
  in a module (`@use 'breakpoints' as bp;` then `bp.$gr-breakpoints`)
- Media queries use range syntax everywhere: `@media (width >= 768px)`, `@media (768px <= width < 1024px)`
- Container queries share that scale and that syntax; the suffix differs by one letter —
  `-md` is the window, `-cmd` the nearest ancestor with `container-type`. `check-dist.mjs`
  checks an `@container` prelude exactly as it checks `@media`

### JS Runtime Key Features (v0.25.0)
1. **DOM scan:** reads `data-gr-layout`, `data-gr-layout-{sm,md,lg,xl}` (window) and `data-gr-layout-c{sm,md,lg,xl}` (container) attributes — `BP_ORDER` holds all nine keys and everything else (attribute names, selector, FOUC guard) is derived from it
2. **Class per layout set:** the per-element set is hashed (djb2 → base36) into `.gr-l-<hash>`; rules target that class, never the attribute value, so identical base layouts with different responsive variants never collide. Same set → same hash → one rule
3. **CSS generation:** injects `<style id="griffincss-dynamic">` — the layer-order declaration, then `@layer griffincss.core { … }` around three sections: `/* FOUC guard */`, `/* Grid Layouts */`, `/* Grid Areas */`, closed by `/* end */`
4. **Non-overlapping breakpoints:** range syntax (`(width < 768px)`, `(768px <= width < 1024px)`, `(width >= 1280px)`) — no `-1px` arithmetic, units of the breakpoint value do not matter. `rangeQuery()` writes the range, `wrapInQuery(rule, …)` picks `@media` or `@container`. Window and container are two independent chains; the base layout is wrapped in both at once, or it would cover the other axis' range and the winner would depend on rule order
5. **Auto-hide via :not():** hides children whose grid-area is not in current template (preserves native display)
6. **Auto-assign gr-area-*:** names already present on children are collected first and excluded; the remaining free names go to classless children in first-appearance order — duplicates are impossible
7. **Validation:** empty area name, repeat count `0` or `> 64`, name longer than 32 chars, invalid name chars, empty row → `console.warn('Griffincss: …')` and the whole element is skipped (still gets `.gr-ready`, so it stays visible). An empty attribute value (`data-gr-layout=""`) is not an error and warns about nothing, but the element still gets `.gr-ready` — the FOUC guard matches on the attribute's presence, so without it the content would stay at `opacity: 0` forever
7a. **Re-processing is idempotent:** `refresh()` over an element the runtime already touched drops the previous `.gr-l-*` class if the set changed and re-runs the `gr-area-*` handout from scratch. Two layout classes on one container would both apply, with source order — not recency — deciding the winner; stale area names would fall outside the new template and the auto-hide rule would hide every child. Classes written in the markup are never removed: only what `touched` records is taken back
8. **FOUC guard:** injected by the runtime itself as its first action, not shipped in the static CSS — with JS blocked there is no rule and the content stays visible
9. **API:** `Griffincss.init()`, `Griffincss.refresh(root?)`, `Griffincss.observe(root?)`, `Griffincss.destroy()`, `Griffincss.parseLayout(str)` (throws on invalid input)
10. **observe():** one MutationObserver per root, debounced (16 ms), refreshes only that root
11. **destroy():** disconnects observers, removes `.gr-ready`, `.gr-l-*` and the area classes the runtime assigned (explicit ones stay), drops the `<style>`, and clears every cache including the one-shot `--gr-bp-*` read — a later `init()` picks up breakpoints changed in the meantime
12. **data-auto="false":** attribute on `<script>` tag disables auto-init (FOUC guard then appears only with the manual `init()`)
12a. **Streaming layout:** when the script is synchronous in `<head>` and `readyState === 'loading'`, the runtime raises a parse observer on `document.documentElement` and lays out each container the moment the parser creates it — attributes arrive with the opening tag, children follow in later batches. `init()` on `DOMContentLoaded` stays as a final reconciliation pass and rebuilds the sheet if `--gr-bp-*` turned out to differ from what was read at script time. `data-stream="false"` on the `<script>` tag falls back to the pre-0.7.0 path; with `defer` or a script at the end of `<body>` the mode degenerates into it on its own. No fade in streaming mode: the container is never painted transparent, so the guard's transition has nothing to start from
12b. **Incremental area handout:** a classless child gets the first free name immediately; an explicit `gr-area-X` on a later child always wins, and the container is recomputed from scratch so the result matches the batch algorithm
13. **No radius pass:** `processRadius` is gone — the `.gr-radius` cascade is pure CSS (`--gr-p` → `padding`), no forced reflow
14. **Module export:** the file is a UMD-ish wrapper — `module.exports` under Node (for `node:test`), `window.Griffincss` + auto-start in the browser

### SCSS Mixins (compile-time, optional)
- `gr-grid-layout($base, $sm:, $md:, $lg:, $xl:, $csm:, $cmd:, $clg:, $cxl:, $name:, $layer:)` — one call per container,
  `$name` is required and becomes the class `.gr-l-<name>`; `$layer` defaults to
  `$gr-default-layer` (`griffincss.core`), pass `false` to emit outside any layer
- Output is **byte-for-byte the same CSS the runtime generates** (same ranges, same rule order,
  same area classes) — `packages/core/test/generate.test.js` compares both
- Lives in `_layout-mixins.scss` (no static CSS of its own), re-exported by `_grid-parser.scss`
- `.gr-area-*` classes exist **only** where these mixins are invoked, or where the JS runtime
  generates them at runtime. They are absent from `griffincss-core.css` by design.

## Grid Layout String Format

```
"a3b4-c2d5" → "a a a b b b b" / "c c d d d d d"
```

- `-` separates rows
- Letters = grid area name (one or more chars)
- Digits = repeat count
- `_` = empty cell (renders as `.` in CSS)
- First-appearance order determines auto-assignment order
- **CSS Grid constraint:** area spanning multiple rows must occupy same columns in all rows (rectangle)

## Testing

### Manual in-browser testing
```bash
# Start any static server from project root:
npx serve -l 8800 -n .
# Open http://localhost:8800/docs/demo.html
# Open http://localhost:8800/docs/slow.html
```

### Automated tests (`node:test`, zero dependencies)
```bash
npm test                                   # all suites + check-dist
node --test "packages/*/test/*.test.js"    # suites only
node --test --test-reporter=spec packages/core/test/parser.test.js
```

| Suite | Covers |
|---|---|
| `packages/core/test/parser.test.js` | `parseLayout` on valid and invalid input, element skipping, empty attribute value |
| `packages/core/test/collision.test.js` | one class per layout set, hash stability, no attribute-value rules, stale class dropped on re-processing |
| `packages/core/test/assign.test.js` | `gr-area-*` distribution over free names, re-assignment after a layout change |
| `packages/core/test/generate.test.js` | generated CSS vs reference string, media ranges, SCSS mixin ↔ runtime parity |
| `packages/core/test/runtime.test.js` | version, FOUC guard, `observe()` debounce and scoping, `destroy()` |
| `packages/utils/test/radius.test.js` | `--gr-p` → `padding` model of the radius cascade |
| `packages/core/test/container.test.js` | `.gr-cq`, `--gr-name` non-inheritance, `gr-container-media` output, runtime container layouts and the two-chain base wrapping |
| `packages/core/test/grid-helpers.test.js` | `.gr-subgrid` / `.gr-subgrid-rows` — axes independent, no gap of their own |
| `packages/core/test/print.test.js` | the `@media print` blocks: reset rules, `--gr-shadow-strength: 0` present in every artifact, animations stopped |
| `packages/core/test/style-css.test.js` | the `data-gr-style` axis: neutral handles in the core, the three inheritance traps on the axis carrier, per-theme anchors, `$gr-styles` gating, a11y precedence |

The runtime exports itself through `module.exports` under Node, so tests `require()` it against
the mock DOM in `test/helpers/dom.js` — no jsdom, no dependencies. `test/helpers/css.js` compiles
SCSS through the `sass` API and normalizes both outputs before comparing.

### Verify build output
```bash
npm run check                  # lint + build + check-dist, the full gate
ls -la packages/*/dist/
```

## GriffinJS — the stateful widget layer (Stage 21)

Optional layer inside `griffincss-ui`: one `<script src="griffinjs.js">`, its own
global `window.GriffinJS`, no dependency on the CSS runtimes. Sources —
`packages/ui/src/griffinjs/{core,engines,widgets}/*.js` (ES2020 IIFEs, concatenated
in list order by `scripts/build-griffinjs.mjs`, then terser with the flags from
`scripts/terser-options.mjs`); styles —
`packages/ui/scss/griffinjs/` → `dist/griffinjs.css` (cascade layer `griffincss.ui`).
Invariants and the reader-facing architecture: `docs/griffinjs-architecture.html`
(sections «Контракт с CSS» and «Инварианты»).

### Sizes by module (gzip, 2026-08-29, phase 21g)

| Artifact | gzip | Contents |
|---|---|---|
| `griffinjs-core.js` | 6.0 KB | core (registries, lifecycle, recorder/listeners), options, registry (event delegation), scanner, media, motion, gesture, track |
| `griffinjs-scroll.js` / `griffinjs-fade.js` | 1.5 / 0.5 KB | track engines |
| `griffinjs-anchor.js` | 0.9 KB | top-layer positioning; outside the core on purpose, required by dropdown and tooltip |
| `griffinjs-slider.js` / `-gallery.js` / `-lightbox.js` / `-parallax.js` | 1.6 / 0.7 / 1.7 / 0.3 KB | scrolling family and parallax |
| `griffinjs-megamenu.js` / `-dropdown.js` / `-tooltip.js` | 2.2 / 1.9 / 0.9 KB | dropping family |
| `griffinjs-dialog.js` / `-combobox.js` | 1.8 / 2.3 KB | dialog controller and combobox |
| **`griffinjs.js`** | **16.1 KB** | everything; budget 16.5 KB |
| core + scroll + slider | 7.9 KB | minimal slider set; budget 8 KB |
| `griffinjs.css` | — | track, gallery, lightbox, megamenu, controllers (dropdown, tooltip, dialog states), combobox |

from `JS_BUDGET`; the layer is not part of `griffincss-all.js`.

### Second bundle — form fields (Stage 38)

`packages/ui/dist/griffinjs-fields.js` + `griffinjs-fields.css` (+ `griffinjs-countries.js`,
the country table for `phone`): `mask`, `phone`, `datetime`, `number`, `file`, `rating`,
`otp`, `counter`, `validate`. Sources `packages/ui/src/griffinjs/fields/`, styles
`packages/ui/scss/griffinjs/fields/`, build list `FIELDS` in `scripts/build-griffinjs.mjs`,
one `griffinjs-<field>.js` per field. The core is not part of it (a second core would
wipe `window.GriffinJS`), and not a byte of it goes into `griffinjs.js` — `check-dist`
greps the full bundle for every field's `defineWidget`. Budgets: fields 11.2 KB, set
«core + anchor + fields» 13.8 KB, styles 1.8 KB, countries 0.9 KB — set by first
measurement, raised only with a named purchase (the history is in `check-dist.mjs`).
`mask` is the foundation (phone, datetime and otp stand on it); `datetime` touches the
markup only on `pointerType === 'mouse'`. Stage 43: `datetime` links a pair «from — to»
through the option `to` — the value of one field becomes the `min`/`max` of the other,
written only through the neighbour's own API (`limit`), the authored bound stays when it
is narrower; `number` (amount with digit grouping) formats by the document locale on
screen and keeps the number in a hidden `type="number"` companion, like `datetime`.
These widgets write the control's `value` — the declared extension of invariant 7, see
«Инварианты» in `docs/griffinjs-architecture.html`. Lab: `docs/griffinjs-fields-lab.html`, spec
`browser/fields.spec.mjs`; docs `docs/griffinjs-fields.html`.

### Acceptance (21g)

- `npm run test:browser` — Playwright on Chromium, Firefox, WebKit over
  `docs/griffinjs-lab.html`: state, keyboard, focus in the top layer, snapping;
  `matrix.spec.mjs` adds every layer page with a clean console **with and without**
  the script, the lab in RTL (`?dir=rtl`), dark theme and the contrast mode.
- `check-dist` guards: no `transform`/`opacity` written from JS; every demo whose
  markup needs the script carries the badge «нужен griffinjs.js», and on `ui-*.html`
- Manual matrix (iPhone Safari, VoiceOver, NVDA + Firefox) — journal
  `.planning/2026-08-29-griffinjs-21g-matrix/manual-matrix.md`, run before each release.

## Key File Paths

| File | Purpose |
|---|---|
| `package.json` | Private workspace root, shared scripts, devDependencies |
| `.stylelintrc.json` | Source linting config, shared by all three packages |
| `scripts/sync-breakpoints.mjs` | Keeps the runtime `BREAKPOINTS` fallbacks equal to the SCSS map |
| `scripts/check-dist.mjs` | Checks over the compiled CSS |
| `scripts/sync-rule-table.mjs` | Keeps the utils runtime rule table equal to the SCSS scales |
| `scripts/build-docs-index.mjs` | Builds `docs/search-index.js` — the static search index: pages, section headings with their anchors, and every class and token declared in `dist/*.css`. A name is bound to the page that *talks* about it (mentions inside `<code>`/`<pre>`, ranked by how much of the name's family that page covers), not to the page that merely uses it in its own markup. Ships as a `<script>` assignment to `window.GR_DOCS_INDEX`, not JSON: `fetch` over `file://` is blocked, and `docs/nav.js` injects the tag itself. Runs as part of `npm run build`; `check-dist.mjs` compares the file against a fresh render |
| `scripts/check-links.mjs` | Crawls every `href`/`src` in `docs/*.html`, in `docs/nav.js` and every Markdown link in `README.md`, checking both the target file and the `#anchor`. Anchors generated at runtime come from the search index. Links inside `<pre>` and inside `.demo-block` are sample markup and are skipped. Part of `npm test` |
| `scripts/build-pages.mjs` | Builds `_site/` — the documentation site published by GitVerse Pages. The published directory becomes the site root, so the tree is rearranged rather than copied one to one: `docs/` moves to the root, `packages/*/dist/` lands under it, and `../packages/` in the markup is rewritten to `packages/`. `docs/design/*.md` and `*.js.map` stay behind. Refuses to finish without `index.html`, with a `packages/…` reference that resolves to nothing, or with any `../` left in the output. Zero dependencies on purpose: the Pages workflow runs it without `npm ci`, since `packages/*/dist` is committed |
| `scripts/purge.mjs` | Purges unused rules from a built stylesheet: parses it into a tree, keeps a selector only when every class in it appears in the markup. `:root`, layer order, `@property` and class-free selectors always survive; an emptied `@media` does not. `--safelist` covers classes assembled at runtime (`'gr-mt-' + n`), and the report is printed unconditionally |
| `packages/core/package.json` | `griffincss-core` metadata and build scripts |
| `packages/core/scss/griffincss-core.scss` | Core package entry |
| `packages/core/scss/griffincss-reset.scss` | Reset entry (opt-in) |
| `packages/core/scss/_breakpoints.scss` | `$gr-breakpoints` map — single source for media queries, tokens and runtime fallbacks |
| `packages/core/scss/_tokens.scss` | CSS custom properties (:root) — source of truth for all three packages; component tokens (`--gr-control-*`, `--gr-ui-gap`, `--gr-overlay`, `--gr-z-*`) live here too |
| `packages/core/scss/_theme-values.scss` | Theme and a11y values as mixins only — zero CSS output |
| `packages/core/scss/_theme-tokens.scss` | Token carriers of the theme: `data-gr-theme` / `data-gr-a11y` blocks, `prefers-color-scheme`, `prefers-contrast`, print — ships in every entry point |
| `packages/core/scss/_theme-rules.scss` | Property rules of the low-vision mode (font scale, `a[href]`, `:focus-visible`) — core and ui only, never utils |
| `packages/core/scss/_theme.scss` | Forwards both theme partials — the entry for external `@use 'griffincss-core/scss/theme'` |
| `packages/core/scss/_container-queries.scss` | `.gr-cq` — `container-type: inline-size`, name from `--gr-name`; re-exports the mixins |
| `packages/core/scss/_container-mixins.scss` | `gr-container-media($bp, $name)`, `gr-bp-value($key)`, `gr-is-container($key)` — no CSS of its own, so `griffincss-utils` can `@use` it without dragging `.gr-cq` into a second package |
| `packages/core/scss/_functions.scss` | SCSS parser + utility functions |
| `packages/core/scss/_reset.scss` | Minimal CSS reset + the `@media print` block (black on white, `<details>` expanded via `::details-content`, break-avoid rules) |
| `packages/core/scss/_grid-parser.scss` | Static grid rules (`.gr-grid`, layout gap `[class*="gr-l-"]`), re-exports the layout mixins |
| `packages/core/scss/_layout-mixins.scss` | `gr-grid-layout()` — compile-time twin of the runtime |
| `packages/core/scss/_grid-helpers.scss` | `.gr-container`, `.gr-expand-root` + `.gr-container-expand` (full-bleed via `cqw`), auto-fit/fill, `.gr-grid-1…12` (+ responsive), `.gr-grid-rows`, span utilities |
| `packages/core/scss/_flex.scss` | Flex utilities + responsive variants |
| `packages/core/scss/_gap.scss` | `.gr-gap-sm/.gr-gap/.gr-gap-lg` — one gap set for grid, flex and layouts; loaded last |
| `packages/core/src/griffincss.js` | JS runtime (hand-written, copied to dist on build) |
| `packages/core/src/griffincss-theme.js` | Theme switcher runtime — separate file, separate `<script>`, optional |
| `packages/utils/src/griffincss-utils.js` | Utils runtime — border-radius cascade of arbitrary depth **and arbitrary values** (`.gr-mt-[13px]`). Streams during parsing, observes the live tree, emits into `griffincss.utils` through the core's `_emit`/`_flush`. Rule table between `gr:rule-table` markers is generated by `scripts/sync-rule-table.mjs`; the `PROPS` table maps a class prefix to the declarations of its static twin, and `arbitrary.test.js` compares both against the compiled CSS. Bracket contents are validated like a layout string in the core — length, no `}`, `;` or `/*` — and rejected input is a `console.warn` plus a skip, never a broken rule |
| `packages/ui/package.json` | `griffincss-ui` metadata and build scripts |
| `packages/ui/scss/griffincss-ui.scss` | UI package entry |
| `packages/ui/scss/griffincss-ui-scoped.scss` | Same components prefixed with `:where(.griffin)` |
| `packages/ui/scss/_button.scss` | `.gr-btn` + nine variants over three local custom props; one `:hover`/`:active` rule for all of them via `color-mix()` |
| `packages/ui/scss/_link.scss` | `.gr-link` + variants; exists because the reset strips colour and underline from `<a>` |
| `packages/ui/scss/_form.scss` | `.gr-input` / `.gr-textarea` / `.gr-select` as one control family, `.gr-field`, `.gr-input-group`, `:user-invalid`; the select draws its own arrow from two gradients in `currentcolor` — the UA arrow ignores `padding-inline-end` |
| `packages/ui/scss/_choice.scss` | `.gr-checkbox` / `.gr-radio` on `accent-color`, `.gr-switch` drawn with `background-image`, `.gr-segmented` from a real radio group |
| `packages/ui/scss/_card.scss` | `.gr-card` flex column, header/body/footer, stretched-link `.gr-card-interactive` |
| `packages/ui/scss/_table.scss` | `.gr-table` + element selectors inside, density modifiers, `.gr-table-wrap`, `.gr-table-sticky` (line drawn by inset shadow — a collapsed border does not travel with a sticky cell); stripes and hover are translucent tints of `currentcolor`, so they stay visible on any backdrop; hover is a `background-image` layer, not a `background-color` — same specificity as the stripe, so a colour would replace it instead of adding to it |
| `packages/ui/scss/_alert.scss` | Status message; `.gr-alert-title` is mandatory — the status must read as a word, not only as a colour |
| `packages/ui/scss/_badge.scss` | `.gr-badge`, `.gr-tag`, `.gr-dot`, counter |
| `packages/ui/scss/_avatar.scss` | Initials fallback by overlay, sizes, `.gr-avatar-group` |
| `packages/ui/scss/_nav.scss` | `.gr-nav` / `.gr-nav-link` with `[aria-current]` highlighting, `.gr-navbar`; the collapsible header keeps the nav as the **sibling** of `<details>` — a browser hides the details' own content and nothing but a script or `::details-content` brings it back on a wide screen |
| `packages/ui/scss/_breadcrumb.scss` | Path with a `::before` separator (`--gr-breadcrumb-sep`); the last item is `[aria-current="page"]`, not a link |
| `packages/ui/scss/_menu.scss` | Action list — header, separator on `<hr>`, danger item, icon and shortcut slots; no disclosure of its own. The `<li>` reset is written as `> :where(li)` so a class put on the `<li>` itself still wins |
| `packages/ui/src/griffincss-ui.js` | Optional component runtime, hand-written like the core's. One job so far: closing a `<dialog>` on an overlay click (`data-gr-overlay-close` on the dialog itself). One delegated listener on the document; both halves of the click must land outside the dialog box, so a text selection started inside does not close it. `dialog.returnValue` becomes `"overlay"` |
| `packages/ui/scss/_dropdown.scss` | Two paths, both scriptless: `<details>` everywhere, `popover` + anchor positioning under `@supports` (with `anchor-scope`, or every dropdown would latch onto the last anchor in the document); insets come from `anchor()` rather than `position-area` — under an area the panel's margins are spent on alignment inside it and the gap to the button disappears; the popover also needs an explicit `margin: 0`, since the UA sheet sets `auto`. Without anchor support the popover panel opens as a sheet at the bottom edge. A third opener, `.gr-dropdown-hover`, shows the same panel on `:hover` (inside `@media (hover: hover)`) and on `:focus-within` — no script, but no `aria-expanded` and no Esc either, so it is for navigation, not for destructive actions |
| `packages/ui/scss/_accordion.scss` | `<details>` sections; exclusivity is the platform's shared `name` attribute — zero CSS. Height animation lives entirely inside `@supports (interpolate-size) and selector(::details-content)` |
| `packages/ui/scss/_tabs.scss` | `.gr-tablist` draws its line with an inset shadow, not a border: a border sits outside the row's content, so the active tab had to be pulled over it by a negative margin — and a scrolling row clips whatever leaves its box, cutting the 2px line down to 1px. Panels are hidden by the `hidden` attribute, never by a `display: none` rule |
| `packages/ui/scss/_modal.scss` | `<dialog>` + `::backdrop` on `--gr-overlay`. `[open]` carries **only** `display` — the attribute drops on the first frame of `close()` while the discrete display transition keeps the dialog on screen, so anything else left there dies before the dialog does (a `flex-direction` in `[open]` turned the closing window into a row). Structure and an explicit `position: fixed` live in the base rule: by the end of the transition the dialog is no longer `:modal`, and percentage sizes would resolve against an ancestor. Body scrolls, header and footer do not |
| `packages/ui/scss/_drawer.scss` | The same `<dialog>` pinned to an edge by releasing the opposite inset — with both insets set (the UA `inset: 0`) an `auto` height stops following the content and the top drawer stood half-screen tall and empty. Sizes in `%`, never `100vw` (vw includes the scrollbar). Reuses `.gr-modal-header/-body/-footer` |
| `packages/ui/scss/_tooltip.scss` | Shown by `:hover` and `:focus-within` — no script; hidden by `visibility`, not `display`, so `aria-describedby` keeps pointing at a live node |
| `packages/ui/scss/_pagination.scss` | `.gr-page` links with `[aria-current]` fill, ellipsis, compact and joined rows |
| `packages/utils/package.json` | `griffincss-utils` metadata and build scripts |
| `packages/utils/scss/griffincss-utils.scss` | Utils package entry |
| `packages/utils/scss/griffincss-utils-scoped.scss` | Same utils prefixed with `:where(.griffin)` |
| `packages/utils/scss/_spacing.scss` | Margin/padding, sparse scale `0 1 2 3 4 5 6 7 8 10 12 16` (0.25rem step), responsive on all 14 physical/axis properties; logical `ms`/`me`/`ps`/`pe` without breakpoint suffix (gotcha 28) |
| `packages/utils/scss/_sizing.scss` | Width (incl. escaped fractions `.gr-w-1\/2`), height, min/max; `svw`/`svh` for viewport units |
| `packages/utils/scss/_borders.scss` | Border width/side/style, physical `t`/`r`/`b`/`l` plus logical `s`/`e`, axes as `border-inline`/`border-block` — colour comes from `_colors.scss`, loaded after it |
| `packages/utils/scss/_shadows.scss` | `.gr-shadow-*` over `--gr-shadow-*` tokens declared in the core `_tokens.scss` |
| `packages/utils/scss/_position.scss` | Position (responsive), inset (axes logical, sides physical plus `start`/`end`), z-index |
| `packages/utils/scss/_effects.scss` | Opacity, object-fit/position, aspect-ratio |
| `packages/utils/scss/_transforms.scss` | Scale, rotate (both signs), translate on both axes, `.gr-hover-lift` / `.gr-hover-grow`. Separate `scale`/`rotate`/`translate` properties, never a shared `transform`; both translate axes go through `--gr-tx`/`--gr-ty`, and the zero on the other axis is what cancels custom-property inheritance. No breakpoint suffix — see gotcha 33 |
| `packages/utils/scss/_filters.scss` | Blur, grayscale, brightness through one collecting `filter` rule over `--gr-blur` and friends; neutral values in that rule cancel inheritance (gotcha 34). `$gr-contrasts` and `$gr-saturations` ship as empty maps: a non-empty one adds both the classes and its function to the collecting rule. No breakpoint suffix |
| `packages/utils/scss/_gradients.scss` | Six directions plus `from`/`via`/`to` over eight colours of the shared palette. The middle stop is spliced into the same `linear-gradient` through an empty `var(--gr-via, )` fallback, so a two-stop gradient pays nothing for it. No breakpoint suffix |
| `packages/utils/scss/_palette.scss` | `$gr-grays` and `$gr-accents` — maps only, no CSS. Two modules need them (`_colors.scss`, `_gradients.scss`), and `@use 'colors'` from a second module would re-emit the whole colour block. `_colors.scss` forwards it (forward BEFORE use), so `@use 'colors' with ($gr-accents: …)` still configures it |
| `packages/utils/scss/_interactivity.scss` | Cursor, pointer-events, `.gr-user-select-*`, scroll-behavior |
| `packages/utils/scss/_animations.scss` | Transition properties, durations, `.gr-animate-spin`; all under `prefers-reduced-motion` |
| `packages/utils/scss/_keyframes.scss` | `@keyframes gr-spin` — separate file so the scoped build emits it outside the `.griffin` scope |
| `packages/utils/scss/_visibility.scss` | Display, visibility, overflow (both axes), sr-only + focusable, responsive hide |
| `docs/demo.html` | Full feature demo page |
| `docs/slow.html` | Slow-load simulation demo |
| `docs/patterns.html` | Twelve ready-made page segments, library classes only |
| `docs/reference-{core,ui,utils}.html` | Full class reference per package, moved out of `README.md` in stage 16 |
| `docs/search-index.js` | Build artifact of `scripts/build-docs-index.mjs`; never edited by hand |
| `docs/nav.js` | Docs shell: sidebar, theme controls, search, page outline, copy-to-clipboard, preview/code tabs. Everything is derived from the page's own DOM, so adding a docs page needs no wiring beyond a sidebar entry |
| `README.md` | User-facing documentation (RU+EN) |
| `ARCHITECTURE.md` | This file — architecture reference |

## Design Decisions & Gotchas

1. **Grid area rectangles:** CSS Grid requires named areas to form a single filled rectangle. L-shapes and T-shapes are invalid. All multi-row areas must occupy the same columns in every row they span.
2. **`display` preservation:** Auto-hide uses `:not()` to add `display:none`, NOT `display:block` to show. This preserves the element's native display type (flex, table, etc.).
3. **Non-overlapping ranges:** Responsive rules use range syntax (`(768px <= width < 1024px)`), not cumulative `min-width`. This prevents lower-breakpoint hide rules from conflicting with higher ones and leaves no gap at fractional widths.
4. **Cascade layers are opt-out, not opt-in:** anything emitted outside `@layer griffincss.*`
   silently outranks everything inside it. Keep new static rules inside the entry-point layer
   block, and keep runtime CSS inside `@layer griffincss.core` — `check-dist.mjs` fails on
   a top-level rule outside its layer.
5. **SCSS `@use` namespacing:** Mixins/functions defined in partials are namespaced. Use `@use 'griffincss-core/scss/grid-parser' as p; @include p.gr-grid-layout(...)`.
6. **FOUC protection uses opacity, not display:none** — preserves layout geometry, no CLS. The rule is injected by the runtime, never shipped in the static CSS: no JS → no rule → content visible.
7. **JS auto-assign** only reads the BASE `data-gr-layout` (no breakpoint suffix), not responsive variants.
8. **Layout rules are class-based** (`.gr-l-<hash>`), specificity (0,1,0) — the same as the attribute selectors they replaced, so the cascade is unchanged. Markup keeps the `data-gr-layout*` attributes as the data source.
9. **Radius cascade is pure CSS:** `--gr-p` sets the gap, `.gr-radius` derives its `padding` from it. Setting `padding` directly (inline or via a spacing utility) overrides that and leaves `--gr-p` at 0 — set `--gr-p` too when you need both.
10. **Gap lives in one place:** `.gr-gap-sm/.gr-gap/.gr-gap-lg` (`_gap.scss`) are the only gap
   modifiers — there is no `.gr-flex-gap-*` and no `data-gr-gap`. Neither the runtime nor
   `gr-grid-layout()` emits `gap`; the default comes from the single static rule
   `[class*="gr-l-"]` in `_grid-parser.scss`. All of these have specificity (0,1,0), so the
   override rests on source order: `_gap.scss` must stay the last `load-css()` in the entry point.
11. **Gap responsiveness lives in the tokens,** not in the classes: `--gr-gap*` step up at `md`
   via a `@media` block in `_tokens.scss`. It has to be there, not in `_gap.scss` — tokens ship
   in all three packages, and the `griffincss.utils` layer outranks `griffincss.core`, so a `:root`
   override emitted from the grid module would lose to the base `:root` coming from
   `griffincss-utils.css`. Consequence: gap classes need no breakpoint suffixes at all.
12. **Full-bleed is container-query based, and opt-in.** `.gr-container-expand` measures
   `100cqw` of the nearest `.gr-expand-root` ancestor, so it breaks out of any number of
   width-capped wrappers without the `100vw` scrollbar overflow — and it can target a column
   rather than the window. Three constraints: the root's width must not depend on its content
   (`container-type` applies inline-size containment — an `inline-block` root collapses to 0);
   ancestors between root and block must be centered (the formula cancels `50%` of the parent
   against `50cqw` of the root); and `--gr-expand-inset` only *reports* the root's inline
   padding — it never sets it. With no root at all, `cqw` falls back to `svw` and the block
   overflows by the scrollbar width. The library deliberately does NOT put `container-type`
   on `body`: that would make every unnamed `@container` query in the page resolve against
   the viewport instead of silently not matching — a quiet wrong answer instead of a loud one.
13. **One responsive syntax: the breakpoint suffix.** `.gr-p-8-md`, never `.gr-md\:p-8`.
   The prefixed form existed only in `_spacing.scss` and was removed in 0.7.0 — every other
   module always used the suffix. A new module must follow the suffix.
14. **`@keyframes` are declared outside the scope.** An animation name is looked up
   globally, so the `:where(.griffin)` prefix has nothing to apply to. That is why
   `_keyframes.scss` is a separate partial — `griffincss-utils-scoped.scss` loads it inside
   the layer but outside the scope, and the ordering stays identical in both builds.
   Any future keyframe goes there, not into a module.
15. **Shadow tokens live in the core `_tokens.scss`,** not in `_shadows.scss`. The same holds
   for component tokens: `--gr-control-*`, `--gr-ui-gap`, `--gr-overlay` and `--gr-z-*` live
   in the core, not in `griffincss-ui`. Check 8 in
   `check-dist.mjs` requires the `:root` block to be byte-identical in all three packages, so any
   token a utility reads must come from the single tokens file. Colour is separated from
   geometry (`--gr-shadow-color` holds HSL components) so the dark theme can repaint all
   seven shadows by changing one variable.
16. **Border colour and border geometry are different modules.** `_borders.scss` emits width,
   side and style with a default `var(--gr-color-border)`; `_colors.scss` emits `border-color`
   only. Both are specificity (0,1,0), so the override rests on source order — `borders`
   before `colors` in both entry points. That ordering is alphabetical, which is also the
   rule for every other module: keep it.
17. **The reset only strips lists that opt in.** `ul[role="list"]`, `ol[role="list"]` — an
   unconditional `list-style: none` removes the list role in VoiceOver along with the
   "list of N items" announcement. `.gr-list-*` utilities cover the case where the markup
   cannot be touched.
18. **Theme tokens must ship in every entry point; theme rules must not.** `_theme-tokens.scss`
   is loaded by `griffincss-core.scss`, `griffincss-ui.scss`, `griffincss-ui-scoped.scss`,
   `griffincss-utils.scss` and `griffincss-utils-scoped.scss` alike,
   for the same reason gap responsiveness lives in the tokens (gotcha 11): the
   `griffincss.utils` layer outranks `griffincss.core`, so a `[data-gr-theme="dark"]` block
   shipping only with the core would lose to the base `:root` coming from
   `griffincss-utils.css` — regardless of selector specificity. `check-dist.mjs` fails the
   build when either artifact is missing the theme. `_theme-rules.scss` — the property
   rules of the low-vision mode — is loaded by the core and by the ui builds only: from
   the utils layer those rules beat every component (see "Cascade layers"), and
   `packages/utils/test/utils.test.js` fails the build when a property other than
   `color-scheme` shows up inside a theme block of the utils artifacts.
19. **Resolved `--gr-color-*` are declared on every theme carrier**
   (`:root, [data-gr-theme], [data-gr-a11y]`), not on `:root` alone. `var()` inside a custom
   property is substituted on the element where the property is *declared*; descendants
   inherit the finished value. Declared once on `:root`, `--gr-color-bg` would stay the root
   theme's colour inside a `<section data-gr-theme="dark">` even though that section's
   triplets did change. Themes therefore swap only the HSL triplets, and the resolved block
   is a single grouped selector — no value is duplicated.
20. **The contrast mode is written once, in terms of anchors.** `gr-a11y-contrast` assigns
   `--gr-hsl-ink-0: var(--gr-hsl-ink-max)` and friends, never an absolute value; each theme
   defines what `-max`, `-strong`, `-mid` and `-near` mean. That is what keeps
   `data-gr-theme` × `data-gr-a11y` from turning into a selector matrix, and it is why an
   absolute colour inside that mixin is a bug — over the dark theme it would produce white
   on white. The typography half (`gr-a11y-typography`) stays on the attribute carrier only,
   or the `font-size` scale would multiply twice on nested carriers. An axis that moves one
   paint of a pair moves the other: the mixin sends `--gr-hsl-accent` to `accent-max` **and**
   `--gr-hsl-on-accent` to `surface-max` — white on the dark accent in the light theme, black
   on the light one in the dark theme. Leave the ink to the style axis and `airy`'s dark
   `on-accent-soft` lands on the dark `accent-max`: 1.9 : 1 (field report on 0.23.1, Stage 40).

21. **A component must not depend on the reset.** `griffincss-reset.css` is opt-in, so every
   component sets its own `box-sizing`, `font-family: inherit`, `margin: 0` and, for tables,
   `border-collapse`. A rule that only works with the reset loaded is a bug in the component.
22. **Rules keyed on `[data-gr-theme]` or `[data-gr-a11y]` cannot live inside the scope.**
   Both attributes sit on `<html>`, outside `.griffin`, so a selector like
   `[data-gr-a11y="low-vision"] .gr-btn` never matches in the scoped build. Components
   therefore adapt through tokens only — `--gr-border-width`, `--gr-focus-width`,
   `--gr-a11y-scale`, the contrast colour anchors — and never through attribute selectors.
   If one is ever unavoidable, it needs its own partial loaded outside the scope,
   the way `_keyframes.scss` is in utils.
23. **Component sizes are `rem`, never `px`.** The low-vision mode raises the root font size,
   so `--gr-control-height: 2.5rem` grows with the page and nothing else has to change.
   A hard-coded pixel height silently opts the component out of the mode.
24. **Status must read as a word, not only as a colour.** `.gr-alert-title` is a required part
   of the alert markup, not decoration: a coloured stripe does not survive black-and-white
   printing, colour blindness or a monochrome high-contrast mode. Colour and icon are the
   second and third signal on top of the word, never instead of it.
25. **`:hover` belongs inside `@media (hover: hover)`.** On a touch screen `:hover` sticks
   after a tap and the element stays highlighted until another one is touched. The exception
   is a rule that only raises `z-index` so a border or focus ring is not clipped — there is
   nothing to stick there. `packages/ui/test/ui.test.js` enforces this.
26. **The reset is why `_link.scss` exists.** `a { color: inherit; text-decoration: none }`
   is right for a link wrapping a card, and wrong for a link in a paragraph. A component
   that removes a distinguishing signal — `.gr-link-quiet`, `.gr-link-inherit` — must stay
   beatable by the theme: the low-vision block ships in every artifact and lands in the same
   layer as the components, so `[data-gr-a11y="low-vision"] a[href]` at (0,1,1) outranks
   a variant at (0,1,0). Keep variants at single-class specificity for that reason.
   The flip side: the same rule outranks `.gr-btn` (0,1,0) on an `<a>`, and in the mode
   link colour and accent fill are one and the same. A filled component shields itself —
   `a.gr-btn:not(.gr-btn-link) { color: var(--gr-btn-fg); text-decoration-line: none }`
   in `_button.scss`, no attribute selector (gotcha 22), the link-looking variant excluded
   because to it the mode's underline and link colour are due. `.gr-tabs-pills` needs no
   shield: its active tab is already (0,3,0).
27. **A status colour is either ink or fill, and for `warning` they differ.**
   `--gr-color-warning` is a text-safe value: to read as text on white it has to be
   a dark brown, and a dark brown dot, counter, button or stripe reads as dirt rather than
   as a warning. Every component that paints a status as a *shape* must take
   `--gr-color-warning-surface` (and `--gr-color-on-warning` for text on it), never
   `--gr-color-warning`. The other three statuses stay recognisable when darkened, so
   ink and fill are the same token for them. Components carry both roles explicitly —
   `--gr-btn-bg` / `--gr-btn-fg`, `--gr-badge-color` / `--gr-badge-fill` /
   `--gr-badge-on-fill`, `--gr-alert-color` / `--gr-alert-fill`. A test in
   `packages/ui/test/ui.test.js` fails the build if `--gr-color-warning` is used
   as a background again.
28. **A physical side and a logical side are two classes, not one.** `.gr-ml-*` cannot be
   redefined into `margin-inline-start`: markup that says `ml` chose the left side on
   purpose, and a close button in the corner of a window must hold the corner in any
   writing direction. Stage 13 therefore paired `ms`/`me` with `ml`/`mr`, `ps`/`pe` with
   `pl`/`pr`, `.gr-text-start`/`-end` with `left`/`right`, `.gr-start-0`/`-end-0` with
   `.gr-left-0`/`.gr-right-0` and `.gr-border-s`/`-e` with `-l`/`-r`. Axis classes are the
   exception and *are* logical shorthands (`margin-inline`, `padding-inline`,
   `inset-inline`, `inset-block`, `border-inline`, `border-block`): both sides carry the
   same value, so direction cannot change the result and one declaration replaces two.
   `width`/`height` stay physical — `direction: rtl` does not swap the inline axis, only
   `writing-mode` does. The logical side classes carry **no breakpoint suffix**: the full
   set is 240 selectors and +1086 B gzip, six times the budget the stage had.

29. **A container query never asks the element itself.** `@container` resolves to the
   nearest *ancestor* with `container-type`, so a layout container cannot react to its
   own width — `.gr-cq` goes on the wrapper, `-cmd` classes and `data-gr-layout-cmd`
   on what is inside it. The runtime deliberately does not add `.gr-cq` for you:
   `container-type: inline-size` applies inline containment, and forced onto someone
   else's markup it collapses an `inline-block` or `fit-content` ancestor to zero
   width — silently, and in a place nobody was looking at. This is a correction to
   the Stage 14 plan, which asked for the opposite.
30. **Container variants exist for four utils modules only** — spacing, sizing,
   typography, visibility. Colour, shadow, border, position, opacity and transitions
   do not depend on the width of a container, and every extra selector is bytes in
   a file everyone downloads. Full parity cost +3430 B gzip (11 045 → 14 508),
   over the stage's own 1.5 KB budget, and it was taken deliberately: the most common
   case of container adaptivity is "narrower column, smaller padding", and spacing
   alone is +2580 B of that. `packages/utils/test/utils.test.js` fails the build if
   the module list grows silently.
31. **The scale is shared with the window, and that makes it coarse.** 768 px of
   *container* width is only reached by a layout's main column; a card in a
   three-column grid on a 1440 px page gets about 440 px. `-csm` (640 px) is the
   threshold a block inside a page actually crosses. A finer scale of its own would
   double the source of truth that Stage 3 collapsed into one map; a one-off
   threshold is one line of the user's own CSS.
32. **Print cannot be done from the reset alone.** `griffincss.reset` is the lowest
   layer and `!important` is banned, so `box-shadow: none` written there loses to
   both `.gr-card` and `.gr-shadow-*`. Shadows are therefore killed at the token
   level — `@media print` in `_theme-tokens.scss` sets `--gr-shadow-strength: 0`, and all
   seven shadows are built from that multiplier, so they go transparent in every
   layer of every package at once. The selector list mirrors the theme carriers,
   `:root:not([data-gr-theme])` included: that one is (0,2,0) and without a match
   the dark system theme would take its `2.6` back on paper. Animations are stopped
   in `_animations.scss`, last block of the module. Only element-level defaults —
   colours on `body`, `<details>`, page breaks — belong in `_reset.scss`.
33. **Three utils groups carry no breakpoint suffix at all** — transforms, filters and
   gradients. `.gr-scale-105-md` does not exist, and neither do `.gr-blur-2-lg` or
   `.gr-gradient-to-r-xl`. The precedent is the logical spacing of Stage 13 (gotcha 28):
   a card lifts under the cursor the same way at every window width, and window plus
   container variants would multiply the group about ninefold — 65 classes would become
   roughly 600, several times the whole budget the stage was given. The rule is written
   in the modules, in three docs pages and in `packages/utils/test/utils.test.js`, which
   fails the build on any `-sm`/`-md`/`-lg`/`-xl`/`-c*` suffix in those groups: one `@each`
   over the breakpoint map is all it takes to add them back by accident.
34. **A custom property that feeds a collecting rule must be reset in that rule.**
   `--gr-blur`, `--gr-tx` and `--gr-from` are ordinary custom properties, so they
   inherit. The collecting rule therefore declares the neutral value for every property
   it reads — `--gr-blur: 0`, `--gr-tx: 0`, `--gr-from: transparent` — and sits *before*
   the value classes: specificity is equal and source order decides. Without it a
   `.gr-grayscale-100` nested inside a `.gr-blur-4` would inherit the ancestor's blur
   and show a plausible-looking wrong picture rather than a visible refusal. `@property`
   with `inherits: false` would do the same job, but it costs bytes in all three packages'
   `:root` block, and core has 74 B of headroom.
35. **The form of a collecting rule is a measurement, not a style.** Shared selector list
   versus repeating the declaration in every class: transforms are cheaper repeated
   (15 733 B vs 15 749 B for the whole file), filters are cheaper with the list
   (15 733 B vs 15 757 B). The rule of thumb the numbers gave: a short declaration
   repeated over few rules compresses to nothing, while a long one over many rules is
   worth writing once. Measure before changing either.
