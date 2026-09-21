// Пустое окно и состояние загрузки (Этап 45c). Фидбек темы griffin
// по 0.25.0, п. 3: окно открывается сразу, содержимое приходит ajax'ом,
// и до ответа <dialog> рисовался полоской высотой в рамку. Теперь у окна
// минимальная высота 10rem, а data-gr-state="loading" рисует кольцо
// по центру — без скрипта, одним ::before. Рост высоты с приходом
// содержимого — работа слоя (48d), здесь не проверяется.

import { test, expect } from '@playwright/test';

const PAGE = '/modal-loading-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Пустое окно</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<style>:root { --gr-transition: 0s; }</style>
</head><body>
<dialog class="gr-modal" id="empty"></dialog>
<dialog class="gr-modal" id="loading" data-gr-state="loading" aria-busy="true"></dialog>
<dialog class="gr-modal" id="filled">
  <div class="gr-modal-header"><h2 class="gr-modal-title">Заголовок</h2></div>
  <div class="gr-modal-body"><p>Строка.</p></div>
  <div class="gr-modal-footer"><button class="gr-btn" type="button">Ок</button></div>
</dialog>
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

const rem = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

test('пустое открытое окно не ниже 10rem', async ({ page }) => {
  await open(page);

  const base = await rem(page);
  const height = await page.evaluate(() => {
    const d = document.getElementById('empty');

    d.showModal();

    return d.getBoundingClientRect().height;
  });

  expect(height, `высота пустого окна ${height}px при 1rem = ${base}px`).toBeGreaterThanOrEqual(10 * base - 0.5);
  expect(height).toBeLessThan(10 * base + 8);
});

test('состояние loading рисует кольцо по центру окна и крутит его', async ({ page }) => {
  await open(page);

  const m = await page.evaluate(() => {
    const d = document.getElementById('loading');

    d.showModal();

    const box = d.getBoundingClientRect();
    const s = getComputedStyle(d, '::before');
    const size = parseFloat(s.width);
    // Центр кольца — через авто-отступы флекс-элемента: отступ сверху
    // равен половине свободного места.
    const top = parseFloat(s.marginTop);
    const inner = box.height - 2 * parseFloat(getComputedStyle(d).borderTopWidth);

    return {
      content: s.content,
      size,
      animation: s.animationName,
      centered: Math.abs(top - (inner - parseFloat(s.height)) / 2) <= 1,
      arc: s.borderTopColor !== s.borderRightColor,
    };
  });

  expect(m.content, JSON.stringify(m)).not.toBe('none');
  expect(m.size, JSON.stringify(m)).toBeGreaterThan(20);
  expect(m.animation, JSON.stringify(m)).toBe('gr-spin');
  expect(m.centered, `кольцо не по центру: ${JSON.stringify(m)}`).toBe(true);
  expect(m.arc, `у кольца нет акцентной дуги: ${JSON.stringify(m)}`).toBe(true);
});

test('окно с содержимым выше минимума живёт как прежде, без кольца', async ({ page }) => {
  await open(page);

  const m = await page.evaluate(() => {
    const d = document.getElementById('filled');

    d.showModal();

    return { height: d.getBoundingClientRect().height, content: getComputedStyle(d, '::before').content };
  });

  expect(m.height).toBeGreaterThan(10 * (await rem(page)));
  expect(m.content).toBe('none');
});
