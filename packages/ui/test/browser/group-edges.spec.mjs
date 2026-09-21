// Края групп по видимым полям (Этап 45a). Фидбек темы griffin по 0.25.0,
// пп. 1–2: скрытое поле последним ребёнком .gr-input-group забирало
// у кнопки скругление края, <legend> первым потомком .gr-segmented —
// у первого сегмента скругление и левую рамку. Края считаются по
// :nth-child(1 of S) / :nth-last-child(1 of S) поверх прежних
// :first-child / :last-child и по label:first-of-type / :last-of-type.
//
// Замер — вычисленным стилем, а не снимком: радиус угла в пикселях
// на каждом из трёх движков. Углы физические (top-right, bottom-right):
// страница LTR, и они совпадают с логическими end-концами.

import { test, expect } from '@playwright/test';

const PAGE = '/group-edges-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Края групп</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
<style>:root { --gr-radius: 8px; --gr-transition: 0s; } body { padding: 40px; }</style>
</head><body>
<!-- Телефон: полный номер в скрытом поле последним ребёнком -->
<div class="gr-input-group" id="hidden-last">
  <select class="gr-select" aria-label="Код"><option>+7</option></select>
  <input class="gr-input" id="tel" type="tel" aria-label="Номер">
  <input type="hidden" name="telephone">
</div>
<!-- Поиск: панель подсказки дописана внутрь группы с hidden -->
<div class="gr-input-group" id="panel-last">
  <input class="gr-input" type="search" aria-label="Поиск">
  <button class="gr-btn gr-btn-primary" id="find" type="button">Найти</button>
  <div hidden>панель</div>
</div>
<!-- Служебное поле первым ребёнком: первое видимое не сдвигается на рамку -->
<div class="gr-input-group" id="hidden-first">
  <input type="hidden" name="csrf">
  <input class="gr-input" id="amount" type="text" aria-label="Сумма">
  <span class="gr-input-addon">₽</span>
</div>
<!-- Обычная группа — контроль: ничего не изменилось -->
<div class="gr-input-group" id="plain">
  <input class="gr-input" id="plain-input" type="text" aria-label="Поле">
  <button class="gr-btn" id="plain-btn" type="button">Кнопка</button>
</div>
<!-- Сегменты с <legend> первым потомком и скрытым полем последним -->
<fieldset class="gr-segmented" id="seg">
  <legend class="gr-sr-only">Тема оформления</legend>
  <label><input type="radio" name="t" value="auto" checked><span id="seg-first">Как в системе</span></label>
  <label><input type="radio" name="t" value="light"><span id="seg-mid">Светлая</span></label>
  <label><input type="radio" name="t" value="dark"><span id="seg-last">Тёмная</span></label>
  <input type="hidden" name="source" value="segmented">
</fieldset>
</body></html>`;

async function open(page) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

// Радиусы четырёх углов, левая рамка и сдвиг на рамку — числами.
const box = (page, selector) => page.evaluate((sel) => {
  const s = getComputedStyle(document.querySelector(sel));
  const px = (v) => parseFloat(v);

  return {
    tl: px(s.borderTopLeftRadius),
    tr: px(s.borderTopRightRadius),
    bl: px(s.borderBottomLeftRadius),
    br: px(s.borderBottomRightRadius),
    borderLeft: px(s.borderLeftWidth),
    marginLeft: px(s.marginLeft),
  };
}, selector);

test('скрытое поле последним не отнимает у видимого края скругление', async ({ page }) => {
  await open(page);

  const tel = await box(page, '#tel');

  expect(tel.tr, `номер: ${JSON.stringify(tel)}`).toBe(8);
  expect(tel.br, `номер: ${JSON.stringify(tel)}`).toBe(8);
  expect(tel.tl, `номер: внутренний край скруглён ${JSON.stringify(tel)}`).toBe(0);

  const find = await box(page, '#find');

  expect(find.tr, `кнопка поиска: ${JSON.stringify(find)}`).toBe(8);
  expect(find.br, `кнопка поиска: ${JSON.stringify(find)}`).toBe(8);
});

test('скрытое поле первым: первое видимое скруглено и не сдвинуто на рамку', async ({ page }) => {
  await open(page);

  const amount = await box(page, '#amount');

  expect(amount.tl, `сумма: ${JSON.stringify(amount)}`).toBe(8);
  expect(amount.bl, `сумма: ${JSON.stringify(amount)}`).toBe(8);
  expect(amount.marginLeft, `сумма сдвинута на рамку: ${JSON.stringify(amount)}`).toBe(0);
  expect(amount.tr, `сумма: внутренний край скруглён ${JSON.stringify(amount)}`).toBe(0);
});

test('обычная группа выглядит как прежде', async ({ page }) => {
  await open(page);

  const input = await box(page, '#plain-input');
  const button = await box(page, '#plain-btn');

  expect([input.tl, input.bl, input.tr, input.br]).toEqual([8, 8, 0, 0]);
  expect([button.tl, button.bl, button.tr, button.br]).toEqual([0, 0, 8, 8]);
  expect(button.marginLeft, 'кнопка не наехала на рамку поля').toBeLessThan(0);
});

test('<legend> первым и скрытое поле последним не ломают края сегментов', async ({ page }) => {
  await open(page);

  const first = await box(page, '#seg-first');
  const mid = await box(page, '#seg-mid');
  const last = await box(page, '#seg-last');

  // Внутренний радиус — 8px минус рамка 1px.
  expect(first.tl, `первый сегмент: ${JSON.stringify(first)}`).toBe(7);
  expect(first.bl, `первый сегмент: ${JSON.stringify(first)}`).toBe(7);
  expect(first.borderLeft, `у первого сегмента левая рамка: ${JSON.stringify(first)}`).toBe(0);
  expect(mid.borderLeft, `у среднего сегмента нет внутренней рамки: ${JSON.stringify(mid)}`).toBe(1);
  expect(last.tr, `последний сегмент: ${JSON.stringify(last)}`).toBe(7);
  expect(last.br, `последний сегмент: ${JSON.stringify(last)}`).toBe(7);
  expect(last.tl, `последний сегмент скруглён изнутри: ${JSON.stringify(last)}`).toBe(0);
});
