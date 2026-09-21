// Смена темы за один кадр (Этап 45c). Фидбек темы griffin по 0.25.0,
// п. 17: у компонентов переходы цвета 0,2 с, и при переключении каждый
// ехал к новому цвету сам по себе — страница шла пятнами, а замер
// контраста сразу после переключения читал промежуточное значение.
// griffincss-theme.js на два кадра ставит безслойный <style> с
// transition: none и класс gr-theme-switching на <html>.
//
// Проверка — та самая, которую оба отчёта делали руками: вычисленный
// background-color карточки в кадре после set('dark') равен итоговому.
// Отрицательный контроль — смена атрибута мимо рантайма: тот же кадр
// даёт промежуточный цвет, иначе тест ничего не доказывал бы.

import { test, expect } from '@playwright/test';

const PAGE = '/theme-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Тема</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<script src="/packages/core/dist/griffincss-theme.js" data-persist="false"></script>
<style>body { padding: 40px; } .gr-card { transition: background-color 1s linear; }</style>
</head><body>
<div class="gr-card" id="card"><div class="gr-card-body">Карточка</div></div>
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

// Цвет карточки в кадре после переключения и итоговый — через секунду,
// когда любой переход давно закончился.
const switchAndMeasure = (page, viaRuntime) => page.evaluate((useRuntime) => new Promise((resolve) => {
  const card = document.getElementById('card');
  const color = () => getComputedStyle(card).backgroundColor;
  const before = color();

  if (useRuntime) window.Griffincss.theme.set('dark');
  else document.documentElement.setAttribute('data-gr-theme', 'dark');

  const immediate = color();

  requestAnimationFrame(() => {
    const first = color();

    requestAnimationFrame(() => {
      const second = color();
      const frozen = !!document.querySelector('head style') && document.head.lastElementChild.tagName === 'STYLE' && document.head.lastElementChild.textContent.includes('transition:none');
      const marked = document.documentElement.classList.contains('gr-theme-switching');

      setTimeout(() => resolve({ before, immediate, first, second, final: color(), frozen, marked }), 1200);
    });
  });
}), viaRuntime);

test('после set("dark") цвет карточки итоговый уже в следующем кадре, гашение снято через два', async ({ page }) => {
  await open(page);

  const m = await switchAndMeasure(page, true);

  expect(m.before, 'светлая и тёмная карточка одного цвета — фикстура не переключается').not.toBe(m.final);
  expect(m.immediate, `цвет сразу после set(): ${JSON.stringify(m)}`).toBe(m.final);
  expect(m.first, `цвет в первом кадре: ${JSON.stringify(m)}`).toBe(m.final);
  expect(m.second, `цвет во втором кадре: ${JSON.stringify(m)}`).toBe(m.final);
  // Во втором кадре гашение ещё стоит — снимается его же обратным вызовом,
  // поставленным раньше нашего; проверяется, что класс к концу снят.
  expect(await page.evaluate(() => document.documentElement.classList.contains('gr-theme-switching'))).toBe(false);
  expect(await page.evaluate(() => [...document.querySelectorAll('head style')].some((s) => s.textContent.includes('transition:none')))).toBe(false);
});

test('отрицательный контроль: смена атрибута мимо рантайма даёт промежуточный цвет', async ({ page }) => {
  await open(page);

  const m = await switchAndMeasure(page, false);

  expect(m.before).not.toBe(m.final);
  expect(m.first, `переход не идёт — контроль ничего не проверяет: ${JSON.stringify(m)}`).not.toBe(m.final);
  expect(m.marked).toBe(false);
});
