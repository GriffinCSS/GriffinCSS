// Карточки вместо строк (Этап 47c, фидбек темы griffin по 0.25.0, п. 5).
// Проверяется вычисленным стилем, а не наличием правила: display у tr
// и td, невидимость шапки без display: none, подпись из data-label —
// то, что мок-DOM не видит. Пороги — окно (375 против 1024 px) и контейнер
// (узкая колонка против широкой при одной ширине окна).

import { test, expect } from '@playwright/test';

const PAGE = '/table-stack-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Таблица-карточки</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
</head><body>
<table id="win" class="gr-table gr-table-stack-md">
  <thead><tr><th>Заказ</th><th>Дата</th><th>Сумма</th></tr></thead>
  <tbody>
    <tr><td data-label="Заказ">#1042</td><td data-label="Дата">12.09.2026</td><td>24 800 ₽</td></tr>
    <tr><td data-label="Заказ">#1043</td><td data-label="Дата">14.09.2026</td><td>1 200 ₽</td></tr>
  </tbody>
</table>
<div style="display:flex;gap:16px;align-items:start">
  <div class="gr-cq" style="inline-size:240px;flex:none">
    <table id="narrow" class="gr-table gr-table-stack-csm"><tbody><tr><td data-label="Заказ">#1</td><td>1 ₽</td></tr></tbody></table>
  </div>
  <div class="gr-cq" style="flex:1;min-inline-size:0">
    <table id="wide" class="gr-table gr-table-stack-csm"><tbody><tr><td data-label="Заказ">#2</td><td>2 ₽</td></tr></tbody></table>
  </div>
</div>
</body></html>`;

async function open(page, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  }));
  await page.goto(PAGE);
}

// Подпись доказывается геометрией, а не текстом content: Firefox отдаёт
// в getComputedStyle нерешённое attr(data-label). Текст подписанной ячейки
// начинается за долей подписи (40 % ширины), текст ячейки без атрибута —
// сразу за полем.
const probe = (page, id) => page.evaluate((id) => {
  const table = document.getElementById(id);
  const thead = table.tHead;
  const row = table.tBodies[0].rows[0];
  const cell = row.cells[0];
  const plain = row.cells[row.cells.length - 1];
  const rect = row.getBoundingClientRect();

  const textOffset = (td) => {
    const range = document.createRange();

    range.selectNodeContents(td);

    const box = td.getBoundingClientRect();

    return (range.getBoundingClientRect().left - box.left) / box.width;
  };

  return {
    row: getComputedStyle(row).display,
    cell: getComputedStyle(cell).display,
    thead: thead ? getComputedStyle(thead).display : null,
    theadBox: thead ? thead.getBoundingClientRect().width : null,
    labelled: getComputedStyle(cell, '::before').content !== 'none',
    plainLabel: getComputedStyle(plain, '::before').content,
    labelOffset: textOffset(cell),
    plainOffset: textOffset(plain),
    rowBorder: getComputedStyle(row).borderTopWidth,
    rowWidth: rect.width,
  };
}, id);

test('375 px: строка — карточка, подпись из data-label, шапка невидима, но в дереве', async ({ page }) => {
  await open(page, 375);

  const s = await probe(page, 'win');

  expect(s.row).toBe('block');
  expect(s.cell).toBe('flex');
  expect(s.labelled).toBe(true);
  expect(s.labelOffset).toBeGreaterThan(0.35);
  // Ячейка без data-label — без подписи и без пустого ::before:
  // значение стоит у края, а не сдвинуто на долю пустой подписи.
  expect(s.plainLabel).toBe('none');
  expect(s.plainOffset).toBeLessThan(0.2);
  expect(s.rowBorder).not.toBe('0px');
  // Шапка не display: none — она в дереве доступности, но ужата в пиксель.
  expect(s.thead).not.toBe('none');
  expect(s.theadBox).toBeLessThanOrEqual(1);
  // Карточка занимает ширину окна с учётом полей страницы.
  expect(s.rowWidth).toBeGreaterThan(300);
});

test('1024 px: та же разметка — обычная таблица', async ({ page }) => {
  await open(page, 1024);

  const s = await probe(page, 'win');

  expect(s.row).toBe('table-row');
  expect(s.cell).toBe('table-cell');
  expect(s.labelled).toBe(false);
  expect(s.thead).toBe('table-header-group');
  expect(s.theadBox).toBeGreaterThan(100);
});

test('порог по контейнеру: узкая колонка — карточки, широкая — таблица, окно одно', async ({ page }) => {
  await open(page, 1200);

  const narrow = await probe(page, 'narrow');
  const wide = await probe(page, 'wide');

  expect(narrow.row).toBe('block');
  expect(narrow.labelled).toBe(true);
  expect(narrow.labelOffset).toBeGreaterThan(0.35);
  expect(wide.row).toBe('table-row');
  expect(wide.labelled).toBe(false);
});
