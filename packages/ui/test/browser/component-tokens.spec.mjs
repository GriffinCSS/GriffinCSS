// Токены компонентов по списку темы и радиус контейнера (Этап 46c).
// Фидбек темы griffin по 0.25.0, пп. 4, 12, 18: правило темы на структурном
// ребёнке (li, summary, .gr-modal-body) проигрывает слою ui при любой
// специфичности; тема оборачивала узлы или держала свои классы. Теперь
// компонент читает var(--gr-<name>-*, <прежний литерал>) и ничего сам
// не объявляет — переопределение на ЛЮБОЙ обёртке меняет вычисленный стиль.
//
// Второй тест — обещание «вид не меняется»: без переопределений радиус
// карточки, окна, меню и сообщения равен радиусу кнопки (--gr-radius)
// во всех трёх стратегиях оформления и на островке стиля: у токена
// --gr-radius-container нет объявления на :root, запасное значение
// считается на самом элементе.

import { test, expect } from '@playwright/test';

const PAGE = '/component-tokens-fixture.html';

const html = (style, overrides) => `<!doctype html>
<html lang="ru"${style ? ` data-gr-style="${style}"` : ''}><head><meta charset="utf-8"><title>Токены компонентов</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-styles.css">
<style>
:root { --gr-transition: 0s; }
${overrides ? `.wrap {
  --gr-card-bg: rgb(1, 2, 3); --gr-card-border: rgb(4, 5, 6); --gr-card-radius: 21px; --gr-card-pad: 3px; --gr-card-overflow: visible;
  --gr-nav-item-pad: 5px; --gr-nav-link-radius: 2px;
  --gr-modal-body-overflow: hidden; --gr-modal-transition: 1.5s linear;
  --gr-tabs-tab-pad: 7px; --gr-dropdown-min-width: 111px; --gr-dropdown-pad: 4px;
  --gr-accordion-summary-pad: 9px; --gr-radius-container: 17px;
}` : ''}
</style>
</head><body>
<div class="wrap">
  <div class="gr-card" id="card"><div class="gr-card-header" id="card-head">Шапка</div><div class="gr-card-body" id="card-body">Тело</div></div>
  <div class="gr-card gr-card-overlay" id="card-overlay"><div class="gr-card-body">На сером</div></div>
  <ul class="gr-nav"><li id="nav-item"><a class="gr-nav-link" id="nav-link" href="#">Пункт</a></li></ul>
  <div class="gr-tabs"><div class="gr-tablist" role="tablist"><button class="gr-tab" id="tab" role="tab" type="button">Вкладка</button></div></div>
  <details class="gr-dropdown"><summary class="gr-btn">Меню</summary><div class="gr-dropdown-panel" id="panel"><ul class="gr-menu" id="menu"><li><button class="gr-menu-item" type="button">Пункт</button></li></ul></div></details>
  <div class="gr-accordion"><details class="gr-accordion-item"><summary class="gr-accordion-trigger" id="summary">Раздел</summary><div class="gr-accordion-panel">Текст</div></details></div>
  <div class="gr-alert" id="alert" role="status"><strong class="gr-alert-title">Готово</strong></div>
  <dialog class="gr-modal" id="modal" open><div class="gr-modal-body" id="modal-body">Тело окна</div></dialog>
  <button class="gr-btn" id="btn" type="button">Кнопка</button>
  <section data-gr-style="strict" id="island"><div class="gr-card" id="island-card"><div class="gr-card-body">Островок</div></div><button class="gr-btn" id="island-btn" type="button">Кнопка островка</button></section>
</div>
</body></html>`;

async function open(page, style, overrides) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html(style, overrides),
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

const probe = (page) => page.evaluate(() => {
  const s = (id) => getComputedStyle(document.getElementById(id));

  return {
    cardBg: s('card').backgroundColor,
    cardBorder: s('card').borderTopColor,
    cardRadius: s('card').borderTopLeftRadius,
    cardPad: s('card-body').paddingTop,
    cardOverflow: s('card').overflowY,
    cardHeadPadInline: s('card-head').paddingLeft,
    overlayBg: s('card-overlay').backgroundColor,
    overlayBorderWidth: s('card-overlay').borderTopWidth,
    navItemPad: s('nav-item').paddingTop,
    navLinkRadius: s('nav-link').borderTopLeftRadius,
    modalOverflow: s('modal-body').overflowY,
    modalTransition: s('modal').transitionDuration,
    tabPad: s('tab').paddingLeft,
    panelMinWidth: s('panel').minWidth,
    panelPad: s('panel').paddingTop,
    summaryPad: s('summary').paddingLeft,
    menuRadius: s('menu').borderTopLeftRadius,
    alertRadius: s('alert').borderTopLeftRadius,
    modalRadius: s('modal').borderTopLeftRadius,
    btnRadius: s('btn').borderTopLeftRadius,
    islandCardRadius: s('island-card').borderTopLeftRadius,
    islandBtnRadius: s('island-btn').borderTopLeftRadius,
    overlayToken: s('card-overlay').getPropertyValue('--gr-color-surface-overlay').trim(),
  };
});

test('переопределение токена на обёртке меняет вычисленный стиль компонента', async ({ page }) => {
  await open(page, null, true);

  const m = await probe(page);

  expect(m.cardBg, JSON.stringify(m)).toBe('rgb(1, 2, 3)');
  expect(m.cardBorder).toBe('rgb(4, 5, 6)');
  expect(m.cardRadius).toBe('21px');
  expect(m.cardPad).toBe('3px');
  expect(m.cardHeadPadInline).toBe('3px');
  // Обрезка карточки — токеном (фидбек темы griffin по 0.26.0, п. 5):
  // абсолютный список подсказки под полем в панели кабинета резался
  // у нижнего края, а overflow компонента из app не перебить.
  expect(m.cardOverflow).toBe('visible');
  expect(m.navItemPad).toBe('5px');
  expect(m.navLinkRadius).toBe('2px');
  expect(m.modalOverflow).toBe('hidden');
  expect(m.tabPad).toBe('7px');
  expect(m.panelMinWidth).toBe('111px');
  expect(m.panelPad).toBe('4px');
  expect(m.summaryPad).toBe('9px');
  // Радиус контейнера — у окна, меню и сообщения; карточка взяла свой.
  expect(m.modalRadius).toBe('17px');
  expect(m.menuRadius).toBe('17px');
  expect(m.alertRadius).toBe('17px');
  // Переход окна — под @supports allow-discrete; где его нет, длительность
  // остаётся нулевой из --gr-transition фикстуры.
  expect(['1.5s, 1.5s, 1.5s, 1.5s', '0s']).toContain(m.modalTransition);
});

for (const style of [null, 'airy', 'strict', 'compact']) {
  test(`без переопределений вид прежний: радиус контейнеров равен --gr-radius (${style || 'standard'})`, async ({ page }) => {
    await open(page, style, false);

    const m = await probe(page);

    expect(m.cardRadius, `карточка: ${JSON.stringify(m)}`).toBe(m.btnRadius);
    expect(m.modalRadius, `окно: ${JSON.stringify(m)}`).toBe(m.btnRadius);
    expect(m.menuRadius, `меню: ${JSON.stringify(m)}`).toBe(m.btnRadius);
    expect(m.alertRadius, `сообщение: ${JSON.stringify(m)}`).toBe(m.btnRadius);
    // Островок строгого стиля: карточка внутри следует радиусу островка,
    // а не корня — запасное значение считается на самом элементе.
    expect(m.islandCardRadius, `островок: ${JSON.stringify(m)}`).toBe(m.islandBtnRadius);
    if (style !== 'strict') expect(m.islandBtnRadius, `островок не отличается от корня: ${JSON.stringify(m)}`).not.toBe(m.btnRadius);
    // Умолчания токенов — прежние литералы.
    expect(m.navItemPad).toBe('0px');
    expect(m.panelPad).toBe('0px');
    expect(m.cardOverflow).toBe('hidden');
    expect(m.modalOverflow).toBe('auto');
    // Карточка на сером: фон — поверхность всплывающего слоя, обводка
    // на месте. В строгом и журнальном стилях поверхность карточки и так
    // белый лист (якоря lifted), и варианты совпадают — там сравнивать нечего.
    if (!style || style === 'airy') expect(m.overlayBg, JSON.stringify(m)).not.toBe(m.cardBg);
    expect(m.overlayBorderWidth).not.toBe('0px');
  });
}
