// Строгий CSP (Этап 30): под политикой style-src без 'unsafe-inline'
// браузер молча выбрасывает содержимое <style>, созданного скриптом.
// Раскладки теряются, ошибки в консоли нет — отлаживать нечего.
// Лечится тем, что рантайм переносит на свой лист nonce со своего тега.
//
// Страница подменяется маршрутом, а не файлом в docs/: заголовок
// Content-Security-Policy обязан приехать в ответе, а демо-сервер
// заголовков не ставит.

import { test, expect } from '@playwright/test';

const NONCE = 'gr0test';
const PAGE = '/csp-fixture.html';

const html = (nonce) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>CSP</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<script src="/packages/core/dist/griffincss.js"${nonce ? ` nonce="${nonce}"` : ''}></script>
</head><body>
<div id="box" data-gr-layout="a1b1"><div>a</div><div>b</div></div>
</body></html>`;

// policy === null — страница без политики вовсе.
async function open(page, policy, nonce) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: Object.assign(
      { 'content-type': 'text/html; charset=utf-8' },
      policy ? { 'content-security-policy': policy } : {},
    ),
    body: html(nonce),
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

const applied = (page) => page.evaluate(() => {
  const el = document.getElementById('griffincss-dynamic');

  return {
    // Заблокированный политикой <style> не заводит таблицу стилей.
    rules: el && el.sheet ? el.sheet.cssRules.length : 0,
    nonce: el ? el.nonce : null,
    display: getComputedStyle(document.getElementById('box')).display,
  };
});

test('под строгой политикой с nonce раскладка применяется', async ({ page }) => {
  await open(page, `default-src 'self'; script-src 'nonce-${NONCE}'; style-src 'self' 'nonce-${NONCE}'`, NONCE);

  const state = await applied(page);

  expect(state.nonce).toBe(NONCE);
  expect(state.rules).toBeGreaterThan(0);
  expect(state.display).toBe('grid');
});

// Отрицательный контроль: без nonce в style-src тот же <style> блокируется.
// Без этого теста первый ничего не доказывал бы — политика могла бы
// просто не применяться движком.
test('без nonce в политике лист блокируется — это и есть чинимый дефект', async ({ page }) => {
  await open(page, `default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'self'`, null);

  const state = await applied(page);

  expect(state.rules).toBe(0);
  expect(state.display).not.toBe('grid');
});

test('без политики раскладка работает как прежде', async ({ page }) => {
  await open(page, null, null);

  const state = await applied(page);

  expect(state.nonce).toBe('');
  expect(state.rules).toBeGreaterThan(0);
  expect(state.display).toBe('grid');
});
