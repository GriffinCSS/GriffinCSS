// Адреса из разметки не исполняют скрипт в origin страницы.
//
// Лайтбокс открывает кадр только по http(s), относительному адресу, data:
// и blob: — javascript: во фрейме исполнился бы в origin страницы; фреймом —
// только адрес из GriffinJS.config.frames, и каждый кадр — в песочнице:
// вкладку не уводит, свой SVG со <script> к странице доступа не получает.
// Окно и мегаменю вставляют в innerHTML только ответ своего origin
// с типом text/html: чужой адрес, редирект своего адреса на чужой
// и свой JSON, отражающий запрос, дали бы <img onerror> в документе.
// Комбобокс переходит по href позиции только по http(s), а набранное
// отправляет только своему origin и тем, что сайт разрешил из JS
// (GriffinJS.config.sources): CORS держит чтение ответа, не отправку.
// Адрес бандла полей и флаги рантаймов читаются только у настоящего тега
// <script>: <img name="currentScript"> перекрывает свойство документа.
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
const GRIFFINCSS = new URL('../../../core/dist/griffincss.js', import.meta.url);

// Ответ чужого сервера: будь он вставлен, onerror записал бы origin
// страницы в body.
const EVIL = '<img src="x" onerror="document.body.dataset.xss=location.origin">';
const LIST = JSON.stringify([{ value: 'Иванов', label: 'Иванов', href: 'javascript:void(document.body.dataset.xss=location.origin)' }]);

let server;
let OWN = '';
let FOREIGN = '';
const pages = new Map();
const hits = new Map();

function reply(res, type, body, extra = {}) {
  res.writeHead(200, Object.assign({ 'content-type': type }, extra));
  res.end(body);
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://host');

    const foreign = String(req.headers.host).startsWith('127.0.0.1');
    const key = (foreign ? 'foreign:' : 'own:') + pathname;

    hits.set(key, (hits.get(key) || 0) + 1);

    if (foreign) {
      // Скрипт чужого сайта: исполнись он, origin страницы попал бы в body.
      if (pathname === '/evil.js') return reply(res, 'text/javascript', 'document.body.dataset.xss = location.origin;');
      // Чужой сервер без CORS: ответ браузер не прочтёт, но запрос с набранным дошёл бы.
      if (pathname === '/nocors.json') return reply(res, 'application/json', LIST);
      if (pathname === '/blank.html') return reply(res, 'text/html', '<p>кадр</p>');
      // «Плеер» чужого сайта: кнопка во весь кадр уводит вкладку сайта.
      if (pathname === '/player.html') {
        return reply(res, 'text/html', `<button id="go" style="position:fixed;inset:0" onclick="try{top.location='${FOREIGN}/landed'}catch(e){document.body.dataset.blocked=e.name}">Смотреть</button>`);
      }
      if (pathname === '/landed') return reply(res, 'text/html', '<p>чужой сайт</p>');

      return reply(res, pathname.endsWith('.json') ? 'application/json' : 'text/html', pathname.endsWith('.json') ? LIST : EVIL, { 'access-control-allow-origin': '*' });
    }

    if (pathname === '/griffinjs.js') return reply(res, 'text/javascript', readFileSync(GRIFFINJS));
    if (pathname === '/griffincss.js') return reply(res, 'text/javascript', readFileSync(GRIFFINCSS));
    if (pathname === '/blank.html') return reply(res, 'text/html', '<p>кадр</p>');
    // SVG сайта со <script>: откройся он фреймом в origin страницы — запись в body.
    if (pathname === '/evil.svg') {
      return reply(res, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>try{parent.document.body.dataset.xss="svg"}catch(e){document.documentElement.setAttribute("data-blocked",e.name)}</script></svg>');
    }
    // Своя страница в кадре открывает окно со своей же страницей со скриптом:
    // выйди окно из песочницы кадра — оно в origin сайта и правит страницу
    // через opener, а затем уводит вкладку.
    if (pathname === '/popup-frame.html') return reply(res, 'text/html', '<button id="go" style="position:fixed;inset:0" onclick="window.open(\'/popup.html\')">Окно</button>');
    if (pathname === '/popup.html') {
      return reply(res, 'text/html', '<script>try{opener.top.document.body.dataset.xss="popup";document.title="access"}catch(e){document.title="blocked:"+e.name}try{opener.top.location="/landed-own"}catch(e){}</script>');
    }
    if (pathname === '/landed-own') return reply(res, 'text/html', '<p>вкладка ушла</p>');
    // Редирект своего адреса на чужой origin.
    if (pathname === '/redirect-out') {
      res.writeHead(302, { location: FOREIGN + '/panel.html' });
      return res.end();
    }
    // Свой источник подсказок и свой источник, уводящий 302 на чужой сервер.
    if (pathname === '/suggest.json') return reply(res, 'application/json', LIST);
    if (pathname === '/redirect-suggest') {
      res.writeHead(302, { location: FOREIGN + '/nocors.json' + new URL(req.url, 'http://host').search });
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

test('лайтбокс: data-gr-type="iframe" с адресом вне списка кадров — окна нет, щелчок остаётся ссылке', async ({ page }) => {
  await open(page, 'lightbox-foreign', `
<a id="l" href="#no-frame" data-gr-lightbox data-gr-type="iframe" data-gr-src="${FOREIGN}/player.html">Видео</a>`);

  await page.click('#l');
  await expect.poll(() => page.evaluate(() => location.hash), 'щелчок не дошёл до ссылки').toBe('#no-frame');
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('лайтбокс: хост из списка кадров — фрейм в песочнице, щелчок внутри кадра вкладку не уводит', async ({ page }) => {
  await open(page, 'lightbox-listed', `
<a id="l" href="#no-frame" data-gr-lightbox data-gr-type="iframe" data-gr-src="${FOREIGN}/player.html">Видео</a>`);
  await page.evaluate(() => (window.GriffinJS.config.frames || []).push('127.0.0.1'));

  await page.click('#l');

  const frame = page.locator('dialog iframe');

  await expect(frame).toHaveCount(1);

  const sandbox = (await frame.getAttribute('sandbox')) || '';

  expect(sandbox.split(/\s+/).sort()).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox', 'allow-same-origin', 'allow-scripts']);

  const player = page.frameLocator('dialog iframe');

  await player.locator('#go').click();
  await expect.poll(() => player.locator('body').getAttribute('data-blocked'), 'переход вкладки не отклонён').toBeTruthy();
  expect(page.url(), 'вкладка ушла на чужой сайт').toContain(OWN);
});

test('лайтбокс: свой SVG со <script> в кадре self — доступа к странице нет', async ({ page }) => {
  await open(page, 'lightbox-svg', `
<a id="l" href="#no-frame" data-gr-lightbox data-gr-type="iframe" data-gr-src="/evil.svg">SVG</a>`);

  await page.click('#l');
  await expect(page.locator('dialog iframe')).toHaveCount(1);
  await expect.poll(() => page.frames().some((f) => f.url().endsWith('/evil.svg')), 'кадр SVG не загрузился').toBe(true);

  const frame = page.frames().find((f) => f.url().endsWith('/evil.svg'));

  await expect.poll(() => frame.evaluate(() => document.documentElement.getAttribute('data-blocked')), 'скрипт SVG добрался до страницы или не отработал').toBeTruthy();
  expect(await xss(page)).toBe('');
});

// Окно, открытое своим кадром, наследует его песочницу: origin непрозрачный,
// до страницы через opener не дотянуться, увести вкладку нельзя. С выходом
// из песочницы окно жило бы в origin сайта.
test('лайтбокс: окно, открытое кадром self, остаётся в песочнице — к странице доступа нет, вкладка на месте', async ({ page, context }) => {
  await open(page, 'lightbox-popup', `
<a id="l" href="#no-frame" data-gr-lightbox data-gr-type="iframe" data-gr-src="/popup-frame.html">Свой плеер</a>`);

  await page.click('#l');

  const frame = page.locator('dialog iframe');

  await expect(frame).toHaveCount(1);
  expect.soft(((await frame.getAttribute('sandbox')) || '').split(/\s+/).sort(), 'песочница своего кадра').toEqual(['allow-popups', 'allow-scripts']);

  const popup = context.waitForEvent('page');

  await page.frameLocator('dialog iframe').locator('#go').click();

  const opened = await popup;

  await expect.soft.poll(() => opened.title(), 'окно добралось до страницы через opener').toMatch(/^blocked/);
  // Окно на уход вкладки, будь он: проверяется, что его не было.
  await page.waitForTimeout(500);
  expect.soft(await page.evaluate(() => location.pathname), 'окно увело вкладку').toBe('/lightbox-popup.html');
  expect.soft(hits.get('own:/landed-own') || 0, 'вкладка запросила адрес окна').toBe(0);
  expect.soft(await xss(page), 'окно правило страницу').toBe('');
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

test('комбобокс: переход по javascript: из ответа своего источника не выполняется', async ({ page }) => {
  await open(page, 'combobox', `
<div class="gr-combobox" data-gr-combobox='src: /suggest.json?q={q}; navigate'>
  <form action="/search" onsubmit="return false"><input id="q" type="search" name="q"></form>
</div>`);

  await page.click('#q');
  await page.keyboard.type('Ива');
  await expect(page.locator('[role="option"]')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');

  const refused = page.waitForEvent('console', { predicate: (m) => m.text().includes('navigation refused'), timeout: 5000 });

  await page.keyboard.press('Enter');
  await refused;

  await expect(page.locator('#q')).toHaveValue('Иванов');
  expect(await xss(page)).toBe('');
});

// Обёртка вокруг формы заявки: первый <input> — поле имени. Набранное
// не должно уйти ни чужому серверу (CORS запрос не держит), ни data:.
for (const [name, src] of [['чужой сервер без CORS', () => FOREIGN + '/nocors.json?q={q}'], ['data: без сервера', () => 'data:application/json,' + LIST]]) {
  test(`комбобокс: ${name} — источник из разметки не запрашивается, набранное не уходит`, async ({ page }) => {
    hits.delete('foreign:/nocors.json');
    await open(page, 'combobox-foreign', `
<div class="gr-combobox" data-gr-combobox='src: ${src()}; min: 1; delay: 0; navigate'>
  <form action="/lead" method="post" onsubmit="return false"><input id="q" class="gr-input" type="text" name="name"></form>
</div>`);

    const refused = page.waitForEvent('console', { predicate: (m) => m.text().includes('source refused'), timeout: 3000 }).catch(() => null);

    await page.click('#q');
    await page.keyboard.type('Петр');
    await refused;
    // Окно на доставку запросов, будь они отправлены: проверяется отсутствие.
    await page.waitForTimeout(300);

    expect(hits.get('foreign:/nocors.json') || 0, 'набранное ушло чужому серверу').toBe(0);
    await expect(page.locator('[role="option"]'), 'подсказки из чужого источника').toHaveCount(0);
    expect(await refused, 'отказ без предупреждения').not.toBeNull();
  });
}

test('комбобокс: свой источник с 302 на чужой — чужой сервер не получает ничего', async ({ page }) => {
  hits.delete('foreign:/nocors.json');
  await open(page, 'combobox-redirect', `
<div class="gr-combobox" data-gr-combobox='src: /redirect-suggest?q={q}; min: 1; delay: 0'>
  <input id="q" class="gr-input" type="text" name="name">
</div>`);

  const failed = page.waitForEvent('console', { predicate: (m) => m.text().includes('request failed'), timeout: 5000 });

  await page.click('#q');
  await page.keyboard.type('Петр');
  await failed;
  await page.waitForTimeout(300);

  expect(hits.get('own:/redirect-suggest') || 0, 'свой источник не запрошен').toBeGreaterThan(0);
  expect(hits.get('foreign:/nocors.json') || 0, 'набранное ушло по редиректу').toBe(0);
});

test('комбобокс: origin из GriffinJS.config.sources — подсказки с другого сайта приходят', async ({ page }) => {
  await open(page, 'combobox-sources', `
<div class="gr-combobox" data-gr-combobox='src: ${FOREIGN}/s.json?q={q}; min: 1; delay: 0'>
  <input id="q" class="gr-input" type="search" name="q">
</div>`);

  await page.evaluate((origin) => { window.GriffinJS.config.sources.push(origin); }, FOREIGN);
  await page.click('#q');
  await page.keyboard.type('Ива');

  await expect(page.locator('[role="option"]')).toHaveCount(1);
});

// <img name="currentScript"> и <iframe name="currentScript"> перекрывают
// свойство документа (именованные элементы — [LegacyOverrideBuiltIns]).
// Картинка дала бы загрузчику адрес бандла полей из разметки, окно фрейма
// роняло автостарт слоя. Слой — с defer, как в шапке темы.
async function openRaw(page, name, body) {
  pages.set(`/${name}.html`, `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>currentScript</title>
<script defer src="/griffinjs.js"></script></head><body>
${body}
<script src="/griffincss.js"></script>
</body></html>`);

  await page.goto(`${OWN}/${name}.html`);
}

test('currentScript: <img name> с data-fields не вставляет чужой скрипт', async ({ page }) => {
  const warned = page.waitForEvent('console', { predicate: (m) => m.text().includes('is not loaded'), timeout: 5000 }).catch(() => null);

  hits.delete('foreign:/evil.js');
  await openRaw(page, 'current-img', `
<img name="currentScript" data-fields="${FOREIGN}/evil.js" alt="">
<input data-gr-mask="000">`);
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started(), null, { timeout: 5000 });

  const said = await warned;

  expect(await xss(page), 'чужой скрипт исполнен в origin страницы').toBe('');
  expect(hits.get('foreign:/evil.js') || 0, 'запрос к адресу из разметки ушёл').toBe(0);
  expect(said, 'загрузчик не сказал, что полей нет').not.toBeNull();
});

for (const [name, src] of [['чужого origin', () => FOREIGN + '/blank.html'], ['своего origin', () => '/blank.html']]) {
  test(`currentScript: <iframe name> ${name} — слой и раскладка поднимаются`, async ({ page }) => {
    await openRaw(page, 'current-frame', `
<iframe name="currentScript" src="${src()}" title="кадр"></iframe>
<div id="grid" data-gr-layout="a1b1"><div>a</div><div>b</div></div>`);

    await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started(), null, { timeout: 5000 });
    await expect(page.locator('#grid')).toHaveClass(/gr-ready/);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('grid')).display)).toBe('grid');
  });
}
