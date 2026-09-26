// Плавный рост окна (Этап 48d, фидбек темы griffin, п. 3 — JS-часть):
// data-gr-dialog="grow" — ResizeObserver на окне, смена высоты больше
// 24 px идёт анимацией от прежней высоты к новой. Без атрибута окно
// прыгает, как раньше; при prefers-reduced-motion — тоже сразу.
//
// Страница — маршрутом, как у csp.spec: два окна, одно с grow, второе
// без, и высота считается по кадрам, а не по одному снимку.

import { test, expect } from '@playwright/test';

const PAGE = '/grow-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Рост окна</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<script src="/packages/ui/dist/griffinjs.js"></script>
</head><body>
<dialog class="gr-modal" id="grow" aria-label="С ростом" data-gr-dialog="grow">
  <div class="gr-modal-body" id="grow-body"><p>Плашка</p></div>
</dialog>
<dialog class="gr-modal" id="plain" aria-label="Без роста" data-gr-dialog>
  <div class="gr-modal-body" id="plain-body"><p>Плашка</p></div>
</dialog>
</body></html>`;

async function open(page, { reduced = false } = {}) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.route(`**${PAGE}`, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());
}

// Открыть окно, дождаться покоя, вставить блок в 240 px и записать высоту
// окна по кадрам вместе с числом идущих анимаций. Плашка стоит на
// min-block-size: 10rem, поэтому рост — около 170 px, а не 240.
const growTrace = (page, id) => page.evaluate((id) => new Promise((resolve) => {
  const dialog = document.getElementById(id);

  window.GriffinJS.dialog.open('#' + id);

  setTimeout(() => {
    const before = dialog.getBoundingClientRect().height;
    const frames = [];
    const block = document.createElement('div');

    block.style.blockSize = '240px';
    dialog.querySelector('.gr-modal-body').appendChild(block);

    const started = performance.now();
    const tick = () => {
      frames.push({ h: dialog.getBoundingClientRect().height, animations: dialog.getAnimations().length });

      if (performance.now() - started < 500) requestAnimationFrame(tick);
      else resolve({ before, after: dialog.getBoundingClientRect().height, frames });
    };

    requestAnimationFrame(tick);
  }, 400);
}), id);

test('grow: высота идёт от прежней к новой по кадрам, анимация одна, итог — новая высота', async ({ page }) => {
  await open(page);

  const trace = await growTrace(page, 'grow');

  expect(trace.after - trace.before).toBeGreaterThan(100);

  const between = trace.frames.filter((f) => f.h > trace.before + 1 && f.h < trace.after - 1);
  const animated = trace.frames.filter((f) => f.animations > 0);

  expect(between.length, `ни одного промежуточного кадра: ${JSON.stringify(trace.frames.slice(0, 8))}`).toBeGreaterThan(1);
  expect(animated.length, 'анимации на окне нет').toBeGreaterThan(0);
  expect(Math.max(...trace.frames.map((f) => f.animations))).toBe(1);
  expect(trace.frames[trace.frames.length - 1].h).toBe(trace.after);
  expect(trace.frames[trace.frames.length - 1].animations).toBe(0);
});

test('без grow окно прыгает сразу: ни промежуточных кадров, ни анимаций', async ({ page }) => {
  await open(page);

  const trace = await growTrace(page, 'plain');

  expect(trace.after - trace.before).toBeGreaterThan(100);
  expect(trace.frames.filter((f) => f.h > trace.before + 1 && f.h < trace.after - 1)).toEqual([]);
  expect(trace.frames.filter((f) => f.animations > 0)).toEqual([]);
});

// Анимация меняет размер наблюдаемого окна, и если она начинается внутри
// обратного вызова, пока окно под наблюдением, WebKit сообщает на window
// «ResizeObserver loop completed with undelivered notifications» — ошибку
// страницы, которую ловят журналы ошибок. Chromium и Firefox молчат.
test('grow: рост не даёт ошибки цикла ResizeObserver на window', async ({ page }) => {
  const errors = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await page.evaluate(() => {
    window.__errors = [];
    window.addEventListener('error', (event) => window.__errors.push(event.message));
  });

  const trace = await growTrace(page, 'grow');

  expect(trace.after - trace.before).toBeGreaterThan(100);
  expect(trace.frames.filter((f) => f.animations > 0).length, 'анимации на окне нет').toBeGreaterThan(0);

  // Второй рост — после первой анимации: наблюдение обязано вернуться.
  const second = await page.evaluate(() => new Promise((resolve) => {
    const dialog = document.getElementById('grow');
    const block = document.createElement('div');
    let animated = 0;

    block.style.blockSize = '200px';
    dialog.querySelector('.gr-modal-body').appendChild(block);

    const started = performance.now();
    const tick = () => {
      animated = Math.max(animated, dialog.getAnimations().length);

      if (performance.now() - started < 500) requestAnimationFrame(tick);
      else resolve(animated);
    };

    requestAnimationFrame(tick);
  }));

  expect(second, 'второй рост не анимирован: наблюдение не вернулось').toBe(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test('grow при prefers-reduced-motion: без анимации', async ({ page }) => {
  await open(page, { reduced: true });

  const trace = await growTrace(page, 'grow');

  expect(trace.after - trace.before).toBeGreaterThan(100);
  expect(trace.frames.filter((f) => f.animations > 0)).toEqual([]);
  expect(trace.frames.filter((f) => f.h > trace.before + 1 && f.h < trace.after - 1)).toEqual([]);
});
