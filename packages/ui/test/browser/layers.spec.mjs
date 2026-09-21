// Семь каскадных слоёв (Этап 46) вживую, на трёх движках.
//
// Фидбек темы griffin по 0.25.0, п. 10: подслой app между core и ui,
// как советовал starter.html, не мог переопределить :root { --gr-font-sans } —
// та же строка из ui и utils лежала в слоях старше. Теперь токены всех
// пакетов лежат в одном слое griffincss.tokens, и подслой сразу после него
// перебивает их. П. 11: <nav class="gr-nav" hidden> оставался на экране —
// display: flex компонента в ui был старше [hidden] из reset; теперь
// [hidden] лежит в последнем слое griffincss.hidden.
//
// Подслой — именно griffincss.app, как в README: слой ВЕРХНЕГО уровня
// (app) стоит после всего griffincss.* при любом месте в списке и перебивал
// бы не только токены, а всю библиотеку — так было в старом starter.html.
//
// Отрицательный контроль — СТАРАЯ строка порядка в CSS потребителя:
// неизвестные ей tokens и hidden встают в конец, и подслой снова
// проигрывает токенам. Это и есть то, о чём предупреждает CHANGELOG 0.26.0.

import { test, expect } from '@playwright/test';

const PAGE = '/layers-fixture.html';

const NEW_ORDER = '@layer griffincss.reset, griffincss.tokens, griffincss.core, griffincss.app, griffincss.ui, griffincss.utils, griffincss.style, griffincss.hidden;';
const OLD_ORDER = '@layer griffincss.reset, griffincss.core, griffincss.app, griffincss.ui, griffincss.utils, griffincss.style;';

const html = (order) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Слои</title>
<style>${order}</style>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-styles.css">
<style>
@layer griffincss.app {
  :root { --gr-font-sans: Georgia; --gr-radius: 13px; }
  body { font-family: var(--gr-font-sans); }
  .gr-btn { color: rgb(1, 2, 3); }
}
</style>
</head><body>
<button class="gr-btn" id="btn" type="button">Кнопка</button>
<nav class="gr-nav" id="nav" hidden><a class="gr-nav-link" href="#">Пункт</a></nav>
<button class="gr-btn" id="hidden-btn" type="button" hidden>Скрытая</button>
<section class="gr-card" id="found" hidden="until-found"><div class="gr-card-body">Найди меня</div></section>
<div class="gr-alert" id="alert" role="status"><strong class="gr-alert-title">Готово</strong></div>
</body></html>`;

async function open(page, order) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html(order),
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

const probe = (page) => page.evaluate(() => {
  const s = (id) => getComputedStyle(document.getElementById(id));

  return {
    btnFont: s('btn').fontFamily,
    btnColor: s('btn').color,
    btnRadius: s('btn').borderTopLeftRadius,
    alertRadius: s('alert').borderTopLeftRadius,
    nav: s('nav').display,
    hiddenBtn: s('hidden-btn').display,
    found: s('found').display,
    foundVisibility: s('found').contentVisibility,
  };
});

test('подслой app сразу после tokens перебивает токены всех пакетов', async ({ page }) => {
  await open(page, NEW_ORDER);

  const m = await probe(page);

  expect(m.btnFont, `шрифт кнопки: ${JSON.stringify(m)}`).toMatch(/Georgia/);
  expect(m.btnRadius, `радиус кнопки: ${JSON.stringify(m)}`).toBe('13px');
  expect(m.alertRadius, `радиус сообщения: ${JSON.stringify(m)}`).toBe('13px');
  // Подслой остаётся подслоем: правило по компоненту из него по-прежнему
  // проигрывает самому компоненту в ui.
  expect(m.btnColor, `правило подслоя перебило компонент: ${JSON.stringify(m)}`).not.toBe('rgb(1, 2, 3)');
});

test('[hidden] старше display компонента; until-found не тронут', async ({ page }) => {
  await open(page, NEW_ORDER);

  const m = await probe(page);

  expect(m.nav, `навигация с hidden видна: ${JSON.stringify(m)}`).toBe('none');
  expect(m.hiddenBtn, `кнопка с hidden видна: ${JSON.stringify(m)}`).toBe('none');
  expect(m.found, `until-found получил display: none: ${JSON.stringify(m)}`).not.toBe('none');
  // content-visibility: hidden — UA-стиль для until-found; движок без
  // поддержки атрибута отдаёт пустую строку или visible — и то, и другое
  // означает «библиотека не вмешалась».
  expect(['hidden', 'visible', '', undefined]).toContain(m.foundVisibility);
});

test('отрицательный контроль: старая строка порядка ставит tokens в конец, и подслой снова проигрывает', async ({ page }) => {
  await open(page, OLD_ORDER);

  const m = await probe(page);

  expect(m.btnFont, `со старым порядком подслой не должен перебить токены: ${JSON.stringify(m)}`).not.toMatch(/Georgia/);
  // hidden при старом порядке всё равно последний — он и должен быть последним.
  expect(m.nav).toBe('none');
});
