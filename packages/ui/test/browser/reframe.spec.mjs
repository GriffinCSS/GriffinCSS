// Перерисовка фреймворка (Этап 37a): React и Vue считают className
// контейнера своим и присваивают его целиком при изменении пропа.
// С узла слетают gr-ready и gr-l-<хеш>: раскладка исчезает, а FOUC-защита
// снова ловит элемент по атрибуту и держит его в opacity: 0 навсегда.
// Наблюдение за childList такую мутацию не видит.
//
// Класс меняется здесь напрямую, а не через React: проверяется рантайм,
// а не фреймворк. React перезаписывает className не при каждой
// перерисовке, а при изменении пропа, — тест на фреймворке доказывал бы
// факты о React.
//
// С Этапа 47 наблюдение включено по умолчанию: положительный случай —
// голый тег <script>, отрицательный контроль — data-observe="false".

import { test, expect } from '@playwright/test';

const PAGE = '/reframe-fixture.html';

const html = (observe) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Перерисовка</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<script src="/packages/core/dist/griffincss.js"${observe ? '' : ' data-observe="false"'}></script>
</head><body>
<div id="box" data-gr-layout="a1b1"><div>a</div><div>b</div></div>
</body></html>`;

async function open(page, observe) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html(observe),
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForFunction(() => document.getElementById('box').classList.contains('gr-ready'));
}

const state = (page) => page.evaluate(() => {
  const box = document.getElementById('box');
  const css = getComputedStyle(box);

  return {
    className: box.className,
    ready: box.classList.contains('gr-ready'),
    opacity: css.opacity,
    display: css.display,
  };
});

// Ровно то, что делает фреймворк: className присваивается целиком.
const rewrite = (page) => page.evaluate(() => { document.getElementById('box').className = 'foo'; });

test('контейнер после разбора открыт', async ({ page }) => {
  await open(page, true);

  const before = await state(page);

  expect(before.ready).toBe(true);
  expect(before.opacity).toBe('1');
  expect(before.display).toBe('grid');
});

test('под наблюдением по умолчанию перезапись className не оставляет контейнер невидимым', async ({ page }) => {
  await open(page, true);
  await rewrite(page);

  // Ждём не факта возврата класса, а конца перехода 0,3 с: сразу после
  // возврата .gr-ready вычисленная непрозрачность ещё дробная.
  await expect.poll(async () => (await state(page)).opacity).toBe('1');

  const after = await state(page);

  expect(after.ready).toBe(true);
  expect(after.display).toBe('grid');
  expect(after.className).toContain('foo');
});

// Отрицательный контроль и он же — содержание шестой оговорки:
// с data-observe="false" возвращать маркеры некому, и контейнер остаётся
// тёмным. Без этого теста первый ничего не доказывал бы.
test('с data-observe="false" перезапись className гасит контейнер', async ({ page }) => {
  await open(page, false);
  await rewrite(page);
  await page.waitForTimeout(300);

  const after = await state(page);

  expect(after.ready).toBe(false);
  expect(after.opacity).toBe('0');
});
