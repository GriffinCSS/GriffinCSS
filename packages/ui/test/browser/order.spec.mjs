// Порядок в раскладке: .gr-order-first / -last / -none с оконными суффиксами.
// Проверяется геометрией в трёх движках: картинка текстового ряда сверху
// на узком окне и справа на широком (сетка), левая колонка в конце ниже
// 1024 px и на своём месте с 1024 px (флекс — случай темы griffin).

import { test, expect } from '@playwright/test';

const PAGE = '/order-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Порядок</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
</head><body>
<div class="gr-grid-1 gr-grid-2-md">
  <div id="img1" style="block-size:120px;background:#abc">Картинка 1</div>
  <div id="txt1">Текст первого ряда</div>
</div>
<div class="gr-grid-1 gr-grid-2-md">
  <div id="img2" class="gr-order-last-md" style="block-size:120px;background:#cba">Картинка 2</div>
  <div id="txt2">Текст второго ряда</div>
</div>
<div class="gr-flex gr-flex-col gr-flex-row-lg">
  <aside id="aside" class="gr-order-last gr-order-none-lg" style="flex:none;inline-size:200px">Фильтры</aside>
  <main id="main" style="flex:1">Товары</main>
</div>
</body></html>`;

async function open(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  }));
  await page.goto(PAGE);

  return page.evaluate(() => {
    const box = (id) => document.getElementById(id).getBoundingClientRect();

    return Object.fromEntries(['img1', 'txt1', 'img2', 'txt2', 'aside', 'main'].map((id) => [id, box(id)]));
  });
}

test('узкое окно: картинка каждого ряда сверху, левая колонка — после содержимого', async ({ page }) => {
  const b = await open(page, 375);

  expect(b.img1.top).toBeLessThan(b.txt1.top);
  expect(b.img2.top).toBeLessThan(b.txt2.top);
  expect(b.img2.left).toBe(b.txt2.left);
  expect(b.aside.top).toBeGreaterThan(b.main.top);
});

test('с 768 px: второй ряд — картинка справа, первый — слева по разметке', async ({ page }) => {
  const b = await open(page, 800);

  expect(b.img1.left).toBeLessThan(b.txt1.left);
  expect(b.img2.left).toBeGreaterThan(b.txt2.left);
  expect(b.img2.top).toBe(b.txt2.top);
  // Ниже 1024 px колонка ещё в конце.
  expect(b.aside.top).toBeGreaterThan(b.main.top);
});

test('с 1024 px: левая колонка на своём месте — в начале строки', async ({ page }) => {
  const b = await open(page, 1280);

  expect(b.aside.left).toBeLessThan(b.main.left);
  expect(b.aside.top).toBe(b.main.top);
});
