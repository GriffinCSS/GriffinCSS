// Таблица прозы во фрагменте GriffinJS. Окно и мегаменю с data-gr-src
// вставляют разметку сами; роль таблице прозы без заголовков ставит рантайм
// компонентов (Firefox считает таблицу со своей прокруткой без заголовков
// таблицей раскладки). Конец вставки знает только GriffinJS: он шлёт
// griffin:load, запущенный рантайм ловит его — без кода страницы.
// Рантайм, выключенный страницей (data-auto="false"), событие не запускает.
//
// Сервер — свой, на свободном порту: фрагмент берётся только со своего
// origin и только с типом text/html (urls.spec.mjs).

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const FILES = {
  '/griffincss-core.css': ['../../../core/dist/griffincss-core.css', 'text/css'],
  '/griffincss-ui.css': ['../../dist/griffincss-ui.css', 'text/css'],
  '/griffinjs.css': ['../../dist/griffinjs.css', 'text/css'],
  '/griffincss-ui.js': ['../../dist/griffincss-ui.js', 'text/javascript'],
  '/griffinjs.js': ['../../dist/griffinjs.js', 'text/javascript'],
};

const FRAGMENT = '<div class="gr-prose"><table id="frag"><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table></div>';

let server;
let OWN = '';
const pages = new Map();

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://host');
    const file = FILES[pathname];

    if (file) {
      res.writeHead(200, { 'content-type': file[1] });
      return res.end(readFileSync(new URL(file[0], import.meta.url)));
    }
    if (pathname === '/fragments/prose.html' || pages.has(pathname)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pages.get(pathname) || FRAGMENT);
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, resolve));
  OWN = `http://localhost:${server.address().port}`;
});

test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function open(page, name, body, uiAuto = true) {
  pages.set(`/${name}.html`, `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Фрагмент с таблицей прозы</title>
<link rel="stylesheet" href="/griffincss-core.css">
<link rel="stylesheet" href="/griffincss-ui.css">
<link rel="stylesheet" href="/griffinjs.css">
</head><body>
${body}
<script src="/griffincss-ui.js"${uiAuto ? '' : ' data-auto="false"'}></script>
<script src="/griffinjs.js"></script>
<script>window.loads = []; document.addEventListener('griffin:load', (e) => window.loads.push(e.target.id));</script>
</body></html>`);

  await page.goto(`${OWN}/${name}.html`);
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());
}

const role = (page) => page.evaluate(() => document.getElementById('frag').getAttribute('role'));

test('окно с data-gr-src: таблица прозы во фрагменте получает роль без кода страницы', async ({ page }) => {
  await open(page, 'dialog', `<button id="op" type="button" data-gr-open="#dlg">Открыть</button>
<dialog id="dlg" class="gr-modal" data-gr-dialog data-gr-src="/fragments/prose.html"></dialog>`);

  await page.click('#op');
  await expect(page.locator('#frag')).toHaveCount(1);

  expect(await role(page)).toBe('table');
  expect(await page.evaluate(() => window.loads)).toEqual(['dlg']);
});

test('мегаменю с data-gr-src: таблица прозы в панели получает роль без кода страницы', async ({ page }) => {
  await open(page, 'megamenu', `<nav class="gr-navbar gr-megamenu" data-gr-megamenu="hover: false"><ul class="gr-nav">
<li><details class="gr-megamenu-item" id="item" data-gr-src="/fragments/prose.html"><summary class="gr-nav-link">Каталог</summary><div class="gr-megamenu-panel"></div></details></li>
</ul></nav>`);

  await page.click('#item > summary');
  await expect(page.locator('#frag')).toHaveCount(1);

  expect(await role(page)).toBe('table');
  expect(await page.evaluate(() => window.loads)).toEqual(['item']);
});

test('рантайм, выключенный страницей, griffin:load не запускает', async ({ page }) => {
  await open(page, 'dialog-off', `<button id="op" type="button" data-gr-open="#dlg">Открыть</button>
<dialog id="dlg" class="gr-modal" data-gr-dialog data-gr-src="/fragments/prose.html"></dialog>`, false);

  await page.click('#op');
  await expect(page.locator('#frag')).toHaveCount(1);

  expect(await page.evaluate(() => window.loads)).toEqual(['dlg']);
  expect(await role(page)).toBe(null);
});
