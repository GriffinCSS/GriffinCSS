// Адреса из разметки не исполняют скрипт в origin страницы.
//
// Лайтбокс открывает кадр только по http(s), относительному адресу, data:
// и blob: — javascript: во фрейме исполнился бы в origin страницы.
// Окно и мегаменю вставляют в innerHTML только ответ своего origin
// с типом text/html: чужой адрес, редирект своего адреса на чужой
// и свой JSON, отражающий запрос, дали бы <img onerror> в документе.
// Комбобокс переходит по href позиции только по http(s).
//
// Сервер — свой, на свободном порту: нужен настоящий HTTP. Редирект
// маршрутом page.route WebKit не отдаёт («Cannot fulfill with redirect
// status»), а второй origin — тот же сервер под другим именем:
// localhost — страница, 127.0.0.1 — чужой сайт с Access-Control-Allow-Origin: *.
// Слой — опубликованная сборка packages/ui/dist/griffinjs.js, как у остальных спек.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const GRIFFINJS = new URL('../../dist/griffinjs.js', import.meta.url);

// Ответ чужого сервера: будь он вставлен, onerror записал бы origin
// страницы в body.
const EVIL = '<img src="x" onerror="document.body.dataset.xss=location.origin">';
const LIST = JSON.stringify([{ value: 'Иванов', label: 'Иванов', href: 'javascript:void(document.body.dataset.xss=location.origin)' }]);

let server;
let OWN = '';
let FOREIGN = '';
const pages = new Map();

function reply(res, type, body, extra = {}) {
  res.writeHead(200, Object.assign({ 'content-type': type }, extra));
  res.end(body);
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://host');

    if (String(req.headers.host).startsWith('127.0.0.1')) {
      return reply(res, pathname.endsWith('.json') ? 'application/json' : 'text/html', pathname.endsWith('.json') ? LIST : EVIL, { 'access-control-allow-origin': '*' });
    }

    if (pathname === '/griffinjs.js') return reply(res, 'text/javascript', readFileSync(GRIFFINJS));
    // Редирект своего адреса на чужой origin.
    if (pathname === '/redirect-out') {
      res.writeHead(302, { location: FOREIGN + '/panel.html' });
      return res.end();
    }
    // Свой JSON, отражающий запрос: угловые скобки в строке не экранированы.
    if (pathname === '/api/search') return reply(res, 'application/json', JSON.stringify({ query: '<img src=x onerror=document.body.dataset.xss=location.origin>' }));
    if (pathname === '/fragments/own.html') return reply(res, 'text/html; charset=utf-8', '<p id="own-fragment">Свой фрагмент</p>');
    if (pages.has(pathname)) return reply(res, 'text/html; charset=utf-8', pages.get(pathname));

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  OWN = `http://localhost:${port}`;
  FOREIGN = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function open(page, name, body, hash = '') {
  pages.set(`/${name}.html`, `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Адреса из разметки</title></head><body>
${body}
<script src="/griffinjs.js"></script>
</body></html>`);

  await page.goto(`${OWN}/${name}.html${hash}`);
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());
}

const xss = (page) => page.evaluate(() => document.body.dataset.xss || (document.title === 'XSS' ? 'title' : ''));

test('лайтбокс: javascript: в адресе кадра не исполняется, щелчок остаётся ссылке', async ({ page }) => {
  await open(page, 'lightbox', `
<a id="l1" href="#no-script-1" data-gr-lightbox data-gr-type="iframe" data-gr-src="javascript:parent.document.title='XSS'">Видео 1</a>
<a id="l2" href="#no-script-2" data-gr-lightbox data-gr-src="javascript:parent.document.body.dataset.xss=1//rutube.ru">Видео 2</a>`);

  for (const n of [1, 2]) {
    await page.click('#l' + n);
    await expect.poll(() => page.evaluate(() => location.hash), `щелчок по #l${n} не дошёл до ссылки`).toBe('#no-script-' + n);
    await expect(page.locator('dialog')).toHaveCount(0);
  }

  expect(await xss(page)).toBe('');
});

test('мегаменю: чужой origin, редирект на чужой и свой JSON не вставляются; свой text/html — вставляется', async ({ page }) => {
  const item = (id, src) => `<li><details class="gr-megamenu-item" id="${id}" data-gr-src="${src}"><summary class="gr-nav-link">${id}</summary><div class="gr-megamenu-panel"></div></details></li>`;

  await open(page, 'megamenu', `
<nav class="gr-navbar gr-megamenu" data-gr-megamenu="hover: false"><ul class="gr-nav">
${item('foreign', FOREIGN + '/panel.html')}
${item('redirect', '/redirect-out')}
${item('json', '/api/search?q=1')}
${item('own', '/fragments/own.html')}
</ul></nav>`);

  for (const id of ['foreign', 'redirect', 'json']) {
    await page.click(`#${id} > summary`);
    await expect(page.locator('#' + id), `панель ${id} загружена`).toHaveAttribute('data-gr-state', 'error');
  }

  await page.click('#own > summary');
  await expect(page.locator('#own')).toHaveAttribute('data-gr-state', 'ready');
  await expect(page.locator('#own #own-fragment')).toHaveCount(1);

  expect(await xss(page)).toBe('');
});

test('окно: чужой фрагмент не вставляется по щелчку на цель-<div>; свой — вставляется', async ({ page }) => {
  await open(page, 'dialog', `
<a id="op" href="#" data-gr-open="#tgt">Открыть окно</a>
<div id="tgt" data-gr-src="${FOREIGN}/panel.html"></div>
<button id="op-own" type="button" data-gr-open="#own">Своё окно</button>
<dialog id="own" data-gr-dialog data-gr-src="/fragments/own.html"></dialog>`);

  await page.click('#op');
  await expect(page.locator('#tgt'), 'окно загружено').toHaveAttribute('data-gr-state', 'error');

  await page.click('#op-own');
  await expect(page.locator('#own #own-fragment')).toHaveCount(1);
  await expect(page.locator('#own')).toHaveAttribute('data-gr-state', 'open');

  expect(await xss(page)).toBe('');
});

test('окно: страница с #id окна не вставляет чужой фрагмент и без щелчка', async ({ page }) => {
  await open(page, 'dialog-hash', `<div id="tgt" data-gr-dialog="hash" data-gr-src="${FOREIGN}/panel.html"></div>`, '#tgt');

  await expect(page.locator('#tgt'), 'окно загружено').toHaveAttribute('data-gr-state', 'error');
  expect(await xss(page)).toBe('');
});

for (const [name, src] of [['с чужого сервера', () => FOREIGN + '/s.json?q={q}'], ['из data: без сервера', () => 'data:application/json,' + LIST]]) {
  test(`комбобокс: переход по javascript: из ответа источника не выполняется — ${name}`, async ({ page }) => {
    await open(page, 'combobox', `
<div class="gr-combobox" data-gr-combobox='src: ${src()}; navigate'>
  <form action="/search" onsubmit="return false"><input id="q" type="search" name="q"></form>
</div>`);

    await page.click('#q');
    await page.keyboard.type('Ива');
    await expect(page.locator('[role="option"]')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');

    const refused = page.waitForEvent('console', { predicate: (m) => m.text().includes('combobox'), timeout: 5000 });

    await page.keyboard.press('Enter');
    await refused;

    await expect(page.locator('#q')).toHaveValue('Иванов');
    expect(await xss(page)).toBe('');
  });
}
