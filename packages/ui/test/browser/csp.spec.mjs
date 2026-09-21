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

// --- Этап 45c: второй источник <style> — рантайм темы ------------------------

// griffincss-theme.js на два кадра ставит безслойный <style> с
// transition: none. Под строгой политикой без nonce лист блокируется —
// тема при этом переключается как прежде, только переходами; с nonce
// со своего тега лист применяется. Замер — в кадре после set('dark'):
// цвет карточки итоговый, если гашение сработало.
const THEME_PAGE = '/csp-theme-fixture.html';
// Долгий переход цвета у карточки — отдельным файлом, а не инлайном:
// инлайновый <style> фикстуры та же политика и заблокировала бы.
const THEME_CSS = '/csp-theme-fixture.css';

const themeHtml = (nonce) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>CSP тема</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="${THEME_CSS}">
<script src="/packages/core/dist/griffincss-theme.js" data-persist="false"${nonce ? ` nonce="${nonce}"` : ''}></script>
</head><body>
<div class="gr-card" id="card"><div class="gr-card-body">Карточка</div></div>
</body></html>`;

async function openTheme(page, policy, nonce) {
  await page.route(`**${THEME_CSS}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/css; charset=utf-8' },
    body: '.gr-card { transition: background-color 1s linear; }',
  }));
  await page.route(`**${THEME_PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: Object.assign(
      { 'content-type': 'text/html; charset=utf-8' },
      policy ? { 'content-security-policy': policy } : {},
    ),
    body: themeHtml(nonce),
  }));

  await page.goto(THEME_PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

const switched = (page) => page.evaluate(() => new Promise((resolve) => {
  const card = document.getElementById('card');
  const color = () => getComputedStyle(card).backgroundColor;

  window.Griffincss.theme.set('dark');

  const style = [...document.querySelectorAll('head style')].find((s) => s.textContent.includes('transition:none'));
  const rules = style && style.sheet ? style.sheet.cssRules.length : 0;
  const nonce = style ? style.nonce : null;

  requestAnimationFrame(() => {
    const first = color();

    setTimeout(() => resolve({ rules, nonce, first, final: color(), theme: document.documentElement.getAttribute('data-gr-theme') }), 600);
  });
}));

test('тема: под строгой политикой с nonce гашение переходов применяется', async ({ page }) => {
  await openTheme(page, `default-src 'self'; script-src 'nonce-${NONCE}'; style-src 'self' 'nonce-${NONCE}'`, NONCE);

  const state = await switched(page);

  expect(state.nonce).toBe(NONCE);
  expect(state.rules).toBeGreaterThan(0);
  expect(state.theme).toBe('dark');
  expect(state.first, `цвет в кадре после set(): ${JSON.stringify(state)}`).toBe(state.final);
});

test('тема: без nonce лист гашения блокируется, но тема переключается — переходами', async ({ page }) => {
  await openTheme(page, `default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'self'`, null);

  const state = await switched(page);

  expect(state.rules).toBe(0);
  expect(state.theme).toBe('dark');
  expect(state.first, `гашение сработало без nonce — политика не применилась: ${JSON.stringify(state)}`).not.toBe(state.final);
});

// --- Этап 48c: догрузка бандла полей под строгой политикой --------------------

// Загрузчик слоя (griffinjs-loader.js, набор «ядро + загрузчик»),
// встретив data-gr-mask без виджета, вставляет <script> из data-fields
// и переносит на него nonce со своего тега. Под script-src без nonce
// на вставленном теге браузер не выполнил бы файл — молча, с одной
// строкой в консоли; поле осталось бы базой без скрипта.
const FIELDS_PAGE = '/csp-fields-fixture.html';
const FIELDS_SRC = '/packages/ui/dist/griffinjs-fields.js';

// auto: подъём автостартом с nonce, прочитанным у тега загрузчика; manual —
// автостарт выключен, а ручной старт из инлайнового скрипта стирает nonce:
// так вставленный тег остаётся без него при той же политике.
const fieldsHtml = (nonce, manual) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>CSP поля</title>
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<script src="/packages/ui/dist/griffinjs-core.js"${nonce ? ` nonce="${nonce}"` : ''}${manual ? ' data-auto="false"' : ''}></script>
<script src="/packages/ui/dist/griffinjs-loader.js"${nonce ? ` nonce="${nonce}"` : ''}${manual ? '' : ` data-fields="${FIELDS_SRC}"`}></script>
${manual ? `<script nonce="${nonce}">GriffinJS.loader._nonce(''); GriffinJS.config.fields = { src: '${FIELDS_SRC}' }; GriffinJS.start();</script>` : ''}
</head><body>
<input class="gr-input" id="phone" type="tel" data-gr-mask="+7 (000) 000-00-00">
</body></html>`;

async function openFields(page, policy, nonce, manual) {
  await page.route(`**${FIELDS_PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: Object.assign(
      { 'content-type': 'text/html; charset=utf-8' },
      policy ? { 'content-security-policy': policy } : {},
    ),
    body: fieldsHtml(nonce, manual),
  }));

  await page.goto(FIELDS_PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

const fieldsState = (page) => page.evaluate(() => {
  const tag = document.querySelector('script[src*="griffinjs-fields"]');

  return {
    inserted: !!tag,
    nonce: tag ? tag.nonce : null,
    async: tag ? tag.async : null,
    mask: !!window.GriffinJS.widgets.mask,
    mounted: !!window.GriffinJS.instance(document.getElementById('phone'), 'mask'),
  };
});

test('поля: под строгой политикой вставленный тег несёт nonce загрузчика, маска надета', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });

  await openFields(page, `default-src 'self'; script-src 'nonce-${NONCE}'; style-src 'self'`, NONCE, false);

  await expect.poll(async () => (await fieldsState(page)).mounted, 'маска не поднялась после догрузки').toBe(true);

  const state = await fieldsState(page);

  expect(state.nonce).toBe(NONCE);
  expect(state.async).toBe(false);

  const phone = page.locator('#phone');
  await phone.pressSequentially('9123456789');
  expect(await phone.inputValue()).toBe('+7 (912) 345-67-89');
  expect(warnings.filter((w) => w.includes('GriffinJS'))).toEqual([]);
});

// Отрицательный контроль: та же политика, вставленный тег без nonce —
// файл отброшен, ядро предупредило, поле принимает что угодно.
test('поля: без nonce на вставленном теге бандл блокируется — слой предупреждает, база остаётся', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });

  await openFields(page, `default-src 'self'; script-src 'nonce-${NONCE}'; style-src 'self'`, NONCE, true);

  await expect.poll(() => warnings.some((w) => w.includes('бандл полей не загружен')), 'слой не предупредил о заблокированном файле').toBe(true);

  const state = await fieldsState(page);

  expect(state.inserted).toBe(true);
  expect(state.nonce).toBe('');
  expect(state.mask).toBe(false);
  expect(state.mounted).toBe(false);

  const phone = page.locator('#phone');
  await phone.pressSequentially('abc');
  expect(await phone.inputValue()).toBe('abc');
});

test('поля: без политики догрузка работает и с data-fields на теге', async ({ page }) => {
  await openFields(page, null, null, false);

  await expect.poll(async () => (await fieldsState(page)).mounted).toBe(true);

  const state = await fieldsState(page);

  expect(state.nonce).toBe('');

  const phone = page.locator('#phone');
  await phone.pressSequentially('9123456789');
  expect(await phone.inputValue()).toBe('+7 (912) 345-67-89');
});
