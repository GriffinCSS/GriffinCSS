// Разметка из данных не трогает чужие узлы.
//
// Значения data-gr-* и class пишет не только разработчик: редактор CMS,
// данные API. Селектор, id или имя группы из такой разметки не должны
// сносить, прятать и переписывать узлы вне своего виджета, а кусок
// разметки своего сайта — уводить страницу (<meta http-equiv="refresh">)
// или менять базу адресов (<base>). Скрипт здесь нигде не исполняется —
// проверяется, что страница остаётся целой.
//
// Сервер — свой, на свободном порту, как в urls.spec.mjs: фрагмент окна
// грузится настоящим fetch своего origin. Рантаймы и слой — опубликованные
// сборки из dist.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const DIST = {
  '/griffincss.js': new URL('../../../core/dist/griffincss.js', import.meta.url),
  '/griffincss-utils.js': new URL('../../../utils/dist/griffincss-utils.js', import.meta.url),
  '/griffincss-ui.js': new URL('../../dist/griffincss-ui.js', import.meta.url),
  '/griffinjs.js': new URL('../../dist/griffinjs.js', import.meta.url),
  '/griffinjs-fields.js': new URL('../../dist/griffinjs-fields.js', import.meta.url),
};
// Лист слоя — как на любой странице с griffinjs.js: без него дорожка
// лайтбокса — вертикальный блок, и клоны краёв растят её высоту.
const CSS = new URL('../../dist/griffinjs.css', import.meta.url);

// Кусок разметки своего сайта: refresh увёл бы страницу, base сменил бы
// базу адресов всей страницы, link потянул бы лист, script исполнился бы.
const FRAGMENT = `<p id="frag">Фрагмент</p>
<meta http-equiv="refresh" content="0;url=/landed">
<base href="/elsewhere/">
<link rel="stylesheet" href="/evil.css">
<script>document.body.dataset.xss = 'script';</script>`;

let server;
let OWN = '';
const pages = new Map();
const headers = new Map();   // заголовки ответа страницы — для CSP
const hits = new Map();

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://host');

    hits.set(pathname, (hits.get(pathname) || 0) + 1);

    if (pathname === '/griffinjs.css') {
      res.writeHead(200, { 'content-type': 'text/css' });
      return res.end(readFileSync(CSS));
    }
    if (DIST[pathname]) {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(readFileSync(DIST[pathname]));
    }
    if (pathname === '/frag.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(FRAGMENT);
    }
    if (pages.has(pathname)) {
      res.writeHead(200, Object.assign({ 'content-type': 'text/html; charset=utf-8' }, headers.get(pathname) || {}));
      return res.end(pages.get(pathname));
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

// Страница: рантаймы и слой — теги в конце <body>, как в шаблоне темы.
async function open(page, name, body, scripts, hash = '') {
  pages.set(`/${name}.html`, `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Разметка из данных</title>
<link rel="stylesheet" href="/griffinjs.css"></head><body>
${body}
${scripts.map((src) => `<script src="${src}"></script>`).join('\n')}
</body></html>`);

  const errors = [];

  // «ResizeObserver loop…» Chromium и Firefox отдают только на window.
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => window.addEventListener('error', (e) => { (window.__errors = window.__errors || []).push(e.message); }));
  await page.goto(`${OWN}/${name}.html${hash}`);

  return errors;
}

const started = (page) => page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());

test('крестик с data-gr-dismiss="main" не сносит <main>', async ({ page }) => {
  const errors = await open(page, 'dismiss', `
<main id="m"><p>Содержимое страницы</p></main>
<button id="x" type="button" data-gr-dismiss="main">×</button>
<div class="gr-alert" id="a"><button id="y" type="button" data-gr-dismiss="#a">×</button></div>`, ['/griffincss-ui.js']);

  await page.click('#x');
  await page.click('#y');

  await expect(page.locator('#a'), 'сообщение не закрылось').toHaveCount(0);
  await expect(page.locator('main#m'), '<main> снесён крестиком').toHaveCount(1);
  expect(errors).toEqual([]);
});

test('лайтбокс: имя группы с кавычкой не роняет щелчок и не собирает чужие ссылки', async ({ page }) => {
  const img = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
  // Имя, которое склейкой в селектор дало бы [data-gr-lightbox="x"],a[href^="data:"].
  const name = 'x"],a[href^="data:';
  const errors = await open(page, 'lightbox-name', `
<a id="g1" href="${img}#1" data-gr-lightbox='${name}'>1</a>
<a id="g2" href="${img}#2" data-gr-lightbox='${name}'>2</a>
<a id="other" href="${img}#3">Чужая ссылка</a>
<a id="q" href="${img}#4" data-gr-lightbox='a"b'>кавычка</a>`, ['/griffinjs.js']);

  await started(page);
  await page.click('#g2');

  const frames = page.locator('dialog.gr-lightbox .gr-lightbox-item:not([data-gr-clone])');

  await expect(frames, 'в группу попала чужая ссылка').toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.gr-lightbox')).toHaveCount(0);

  await page.click('#q');
  await expect(page.locator('dialog.gr-lightbox'), 'кавычка в имени уронила лайтбокс').toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__errors || [])).toEqual([]);
});

test('поля: цели summary и out — в своей форме, <main> не тронут; id с кавычкой не роняет проверку формы', async ({ page }) => {
  const errors = await open(page, 'fields', `
<main id="m"><p>Содержимое страницы</p></main>
<form id="f" action="/sent" data-gr-validate="summary: main">
  <input id='a"b' name="x" required>
  <textarea name="t" maxlength="20" data-gr-counter="out: main"></textarea>
  <button id="go" type="submit">Отправить</button>
</form>`, ['/griffinjs.js', '/griffinjs-fields.js']);

  await started(page);
  await page.click('#go');

  expect(page.url(), 'форма ушла без проверки').not.toContain('/sent');
  await expect(page.locator('#f .gr-validate'), 'своя сводка не показана').toBeVisible();
  await expect(page.locator('main#m')).toBeVisible();
  expect(await page.locator('main#m').getAttribute('aria-live'), '<main> стал подписью счётчика').toBeNull();
  expect(errors).toEqual([]);
});

test('чужой узел с id="griffincss-dynamic": раскладка работает, CSS в текст узла не пишется', async ({ page }) => {
  const errors = await open(page, 'dynamic', `
<div id="griffincss-dynamic"></div>
<div id="grid" data-gr-layout="a1b1"><div>a</div><div>b</div></div>`, ['/griffincss.js']);

  await expect(page.locator('#grid')).toHaveClass(/gr-ready/);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('grid')).display)).toBe('grid');
  expect(await page.locator('div#griffincss-dynamic').textContent(), 'CSS записан текстом в чужой узел').toBe('');
  expect(errors).toEqual([]);
});

// Чужой <style> с тем же id рантайм принимал за свой лист: под CSP с nonce
// писал правила в лист без nonce — браузер его блокировал, и раскладка
// не складывалась. Рантайм больше не ищет узел по id — лист всегда свой.
test('чужой <style id="griffincss-dynamic"> под CSP с nonce: раскладка складывается, его текст цел', async ({ page }) => {
  pages.set('/dynamic-style.html', `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Чужой лист</title>
<script defer src="/griffincss.js" nonce="r4nd0m"></script></head><body>
<style id="griffincss-dynamic">.orig{color:rgb(1,2,3)}</style>
<p id="o" class="orig">чужое правило</p>
<div id="grid" data-gr-layout="a1b1"><div>a</div><div>b</div></div>
</body></html>`);
  headers.set('/dynamic-style.html', { 'content-security-policy': "default-src 'self'; script-src 'nonce-r4nd0m'; style-src 'self' 'nonce-r4nd0m'" });

  await page.goto(`${OWN}/dynamic-style.html`);
  await expect(page.locator('#grid')).toHaveClass(/gr-ready/);

  expect(await page.evaluate(() => getComputedStyle(document.getElementById('grid')).display), 'раскладка не сложилась').toBe('grid');
  expect(await page.locator('body > style#griffincss-dynamic').textContent(), 'текст чужого <style> переписан').toBe('.orig{color:rgb(1,2,3)}');
});

test('кавычка в произвольном значении не ломает следующие правила', async ({ page }) => {
  const errors = await open(page, 'arbitrary', `
<div id="bad" class='gr-p-["x]'>плохое значение</div>
<div id="good" class="gr-mt-[13px]">хорошее значение</div>`, ['/griffincss.js', '/griffincss-utils.js']);

  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('good')).marginTop), 'правило после кавычки пропало').toBe('13px');
  expect(errors).toEqual([]);
});

// Фаззер общего листа: значения, которые рантайм утилит переносит в текст
// правил, — из имени класса и из --gr-r/--gr-p атрибута style. После каждого
// значения стоит маяк — своё правило с отступом N px; маяк обязан выжить,
// чужой узел — остаться неперекрашенным, адрес из url() — незапрошенным.
// Значения идут одной страницей подряд: строка или блок, открытые одним,
// закрылись бы другим — так и выглядела находка со style.
const PIECES = ['(', ')', '[', ']', 'url(', 'calc(', 'min(1px,', '"', "'", '\\', '/*', '*/', '{', '}', ';', 'a', '1px', ',', '#victim{background-color:rgb(255,0,0)}', 'p{background-image:url(/leak)}'];
// Находки идут первыми: пара Chromium (строка), пара Firefox (комментарий),
// затем незакрытые скобки — после них потерялось бы всё, и пары не сработали бы.
const KNOWN = ["8px '", "a' } #victim{background-color:rgb(255,0,0)} p{background-image:url(/leak-q)} '", '8px /*', '"*/} #victim{background-color:rgb(255,0,0)} p{background-image:url(/leak-c)} /*"', 'calc(1px', 'a[b', 'url(x'];

function fuzzValues(seed, count, spaces) {
  const out = KNOWN.filter((v) => spaces || !/\s/.test(v));
  let x = seed;
  const next = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;

  while (out.length < count) {
    let v = '';
    const n = 1 + Math.floor(next() * 4);

    for (let i = 0; i < n; i++) v += PIECES[Math.floor(next() * PIECES.length)] + (spaces && next() < 0.3 ? ' ' : '');
    if (!spaces) v = v.replace(/\s/g, '');
    if (v) out.push(v);
  }

  return out;
}

const attr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Маяк — правило той же секции листа, что и значения: правила произвольных
// значений выдаются раньше правил каскада скруглений, и маяк-класс
// пережил бы любое значение из style. Поэтому у каждого входа свой маяк.
const BEACONS = {
  // Правило .gr-mt-[N px] — отступ маяка.
  class: (i) => `<div id="b${i}" class="gr-mt-[${i + 1}px]">маяк</div>`,
  // Правило выведенного радиуса: у среднего уровня --gr-r — выражение
  // max(0px,calc(N px - 1px)), а без правила — унаследованные N px.
  style: (i) => `<div class="gr-radius" style="--gr-r: ${i + 1}px; --gr-p: 1px"><div id="b${i}" class="gr-radius"><div class="gr-radius">маяк</div></div></div>`,
};

async function fuzzPage(page, name, values, item, kind) {
  hits.clear();

  const body = values.map((v, i) => item(v, i) + BEACONS[kind](i)).join('\n');
  // Стартовый маяк стоит до всех значений: его правило выдаётся первым,
  // и по нему видно, что проход рантайма уже записан в лист.
  const errors = await open(page, name, `<div id="start" class="gr-mb-[3px]">старт</div>\n${body}\n<div id="victim">чужой узел</div><p>абзац</p>`, ['/griffincss.js', '/griffincss-utils.js']);

  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('start')).marginBottom)).toBe('3px');

  const lost = await page.evaluate(({ n, kind }) => {
    const out = [];

    for (let i = 0; i < n; i++) {
      const style = getComputedStyle(document.getElementById('b' + i));
      const alive = kind === 'class'
        ? style.marginTop === (i + 1) + 'px'
        : style.getPropertyValue('--gr-r').replace(/\s/g, '').includes('calc(' + (i + 1) + 'px-1px)');

      if (!alive) out.push(i);
    }

    return out;
  }, { n: values.length, kind });

  expect.soft(lost.map((i) => `#b${i} после ${JSON.stringify(values[i])}`), 'маяки потеряли правила').toEqual([]);
  expect.soft(await page.evaluate(() => getComputedStyle(document.getElementById('victim')).backgroundColor), 'чужой узел перекрашен').not.toBe('rgb(255, 0, 0)');
  expect.soft([...hits.keys()].filter((p) => p.startsWith('/leak')), 'запрос url() из значения').toEqual([]);
  expect(errors).toEqual([]);
}

test('фаззер: произвольное значение класса не трогает следующие правила листа', async ({ page }) => {
  await fuzzPage(page, 'fuzz-class', fuzzValues(7, 80, false), (v) => `<div class="gr-w-[${attr(v)}]">значение</div>`, 'class');
});

// Три уровня: у верхнего значение объявлено, средний получает правило
// с ним. Известные пары идут подряд через --gr-r, как в находке;
// дальше значения чередуются между радиусом и зазором.
test('фаззер: --gr-r и --gr-p из style не становятся правилами для чужих узлов', async ({ page }) => {
  await fuzzPage(page, 'fuzz-style', fuzzValues(11, 80, true), (v, i) => {
    const style = i < KNOWN.length || i % 2 ? `--gr-r: ${attr(v)}` : `--gr-r: 8px; --gr-p: ${attr(v)}`;

    return `<div class="gr-radius" style="${style}"><div class="gr-radius"><div class="gr-radius">значение</div></div></div>`;
  }, 'style');
});

// Проверка значения из style не должна занимать поток: длинное значение
// отклоняется до разбора скобок, разбор линеен. Под одним значением
// в 8 КБ — сто контейнеров, и каждый проверяет его у всех предков.
// Автостарт выключен: замеряется один явный проход каскада.
test('значение из style в 8 КБ над сотней контейнеров: проход каскада — меньше 100 мс', async ({ page }) => {
  const nested = '('.repeat(4000) + ')'.repeat(4000);

  pages.set('/style-long.html', `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Длинное значение</title></head><body>
<div class="gr-radius" style="--gr-r: ${nested}">${'<div class="gr-radius">x</div>'.repeat(100)}</div>
<script src="/griffincss.js" data-auto="false"></script>
<script src="/griffincss-utils.js" data-auto="false"></script>
</body></html>`);

  await page.goto(`${OWN}/style-long.html`);
  await page.waitForFunction(() => window.Griffincss && window.Griffincss.utils);

  const ms = await page.evaluate(() => {
    const t = performance.now();

    window.Griffincss.utils.radiusCascade(document);

    return performance.now() - t;
  });

  expect(ms, `проход каскада занял ${Math.round(ms)} мс`).toBeLessThan(100);
});

test('фрагмент окна с meta refresh, base, link и script: страница на месте, база адресов прежняя, скрипт не исполнен', async ({ page }) => {
  hits.delete('/evil.css');
  hits.delete('/landed');

  const errors = await open(page, 'fragment', `<div id="d" data-gr-dialog="hash" data-gr-src="/frag.html"></div>`, ['/griffinjs.js'], '#d');
  const base = await page.evaluate(() => document.baseURI);

  await expect(page.locator('#d #frag'), 'фрагмент не вставлен').toHaveCount(1);
  // Окно на срабатывание refresh с задержкой 0, будь он вставлен: проверяется отсутствие.
  await page.waitForTimeout(700);

  expect(page.url(), 'страница ушла по meta refresh').toBe(`${OWN}/fragment.html#d`);
  expect(await page.evaluate(() => document.baseURI), 'база адресов сменилась').toBe(base);
  await expect(page.locator('#d meta, #d base, #d link'), 'meta, base или link вставлены').toHaveCount(0);
  expect(hits.get('/evil.css') || 0, 'лист из фрагмента запрошен').toBe(0);
  expect(await page.evaluate(() => document.body.dataset.xss || ''), 'скрипт фрагмента исполнен').toBe('');
  expect(errors).toEqual([]);
});
