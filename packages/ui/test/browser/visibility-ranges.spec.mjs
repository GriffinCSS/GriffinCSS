// Скрытие по диапазонам и запись медиазапросов окна (Этап 78).
//
// Окно — в записи Media Queries 3: «от X» — (min-width: X), «ниже X» —
// not all and (min-width: X), средний диапазон — вложенным @media. Это
// точное дополнение без вычитания пикселя: на любой ширине из пары
// «ниже X» / «от X» действует ровно одно. Ширины — рамками <iframe>:
// у рамки своё окно. Окно рамки дробной ширины движки округляют до целого
// (767,5 → 768 во всех трёх), поэтому для дробных рамок ожидание берётся
// по innerWidth, а дополнение пар проверяется на каждой ширине.
//
// Ожидания — от руки, по шкале 640 / 768 / 1024 / 1280, а не из CSS.

import { test, expect } from '@playwright/test';

const PAGE = '/visibility-ranges-fixture.html';
const WIDTHS = [639, 640, 767, 767.5, 768, 1023, 1023.5, 1024, 1279, 1280, 1400];

const SM = 640;
const MD = 768;
const LG = 1024;
const XL = 1280;

// Скрыт ли элемент с классом на ширине w.
const EXPECTED = {
  'in-sm': (w) => w >= SM && w < MD,
  'to-sm': (w) => w < MD,
  'under-sm': (w) => w < SM,
  'from-sm': (w) => w >= SM,
  'over-sm': (w) => w >= MD,
  'in-md': (w) => w >= MD && w < LG,
  'to-md': (w) => w < LG,
  'under-md': (w) => w < MD,
  'from-md': (w) => w >= MD,
  'over-md': (w) => w >= LG,
  'in-lg': (w) => w >= LG && w < XL,
  'to-lg': (w) => w < XL,
  'under-lg': (w) => w < LG,
  'from-lg': (w) => w >= LG,
  'over-lg': (w) => w >= XL,
  'in-xl': (w) => w >= XL,
  'under-xl': (w) => w < XL,
  'from-xl': (w) => w >= XL,
  // Голый суффикс — то же, что from.
  md: (w) => w >= MD,
};

const LINKS = `<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">`;

const frame = `<!doctype html><html><head>${LINKS}</head><body>
${Object.keys(EXPECTED).map((name) => `<div class="gr-flex gr-hidden-${name}" data-name="${name}">x</div>`).join('\n')}
<div id="layout" data-gr-layout="a1" data-gr-layout-md="a1b1" data-gr-layout-lg="a1b1c1"><div>a</div><div>b</div><div>c</div></div>
<script src="/packages/core/dist/griffincss.js"></script>
</body></html>`;

// Контейнеры — те же слова с буквой c, по ширине предка с .gr-cq.
const containers = WIDTHS.map((w) => `<div class="gr-cq" style="width:${w}px" data-width="${w}">
${Object.keys(EXPECTED).map((name) => {
    const cls = name === 'md' ? 'cmd' : name.replace(/-(\w+)$/, '-c$1');

    return `<div class="gr-flex gr-hidden-${cls}" data-name="${name}">x</div>`;
  }).join('')}
</div>`).join('\n');

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Диапазоны</title>${LINKS}
<style>body { margin: 0; } iframe { display: block; border: 0; height: 40px; }</style>
</head><body>
${WIDTHS.map((w) => `<iframe style="width:${w}px" data-width="${w}" srcdoc="${frame.replace(/"/g, '&quot;')}"></iframe>`).join('\n')}
${containers}
</body></html>`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  }));
  await page.goto(PAGE);
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every((f) => {
    const doc = f.contentDocument;

    return doc && doc.readyState === 'complete' && doc.querySelector('#layout.gr-ready');
  }));
});

test('окно: каждый класс скрывает ровно в своём диапазоне — и на дробной ширине', async ({ page }) => {
  const seen = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => ({
    width: Number(f.dataset.width),
    inner: f.contentWindow.innerWidth,
    hidden: Object.fromEntries([...f.contentDocument.querySelectorAll('[data-name]')]
      .map((el) => [el.dataset.name, f.contentWindow.getComputedStyle(el).display === 'none'])),
  })));

  for (const { width, inner, hidden } of seen) {
    const w = Number.isInteger(width) ? width : inner;

    for (const [name, rule] of Object.entries(EXPECTED)) {
      expect(hidden[name], `.gr-hidden-${name} на ширине ${width} (окно ${inner})`).toBe(rule(w));
    }

    // Без щели и наложения: ровно одно из пары, in — ровно между.
    for (const bp of ['sm', 'md', 'lg', 'xl']) {
      expect(hidden[`under-${bp}`], `under-${bp} и from-${bp} на ширине ${width}`).toBe(!hidden[`from-${bp}`]);
      expect(hidden[`in-${bp}`], `in-${bp} на ширине ${width}`).toBe(!hidden[`under-${bp}`] && !(hidden[`over-${bp}`] ?? false));
      if (bp !== 'xl') expect(hidden[`to-${bp}`], `to-${bp} и over-${bp} на ширине ${width}`).toBe(!hidden[`over-${bp}`]);
    }
  }
});

test('окно: раскладка рантайма — средний диапазон вложенным @media, без щели и наложения', async ({ page }) => {
  const seen = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => ({
    width: Number(f.dataset.width),
    inner: f.contentWindow.innerWidth,
    areas: f.contentWindow.getComputedStyle(f.contentDocument.querySelector('#layout')).gridTemplateAreas,
  })));

  for (const { width, inner, areas } of seen) {
    const w = Number.isInteger(width) ? width : inner;
    const want = w >= LG ? '"a b c"' : w >= MD ? '"a b"' : '"a"';

    expect(areas, `раскладка на ширине ${width} (окно ${inner})`).toBe(want);
  }
});

test('контейнер: те же слова с буквой c — по ширине предка с .gr-cq', async ({ page }) => {
  const seen = await page.evaluate(() => [...document.querySelectorAll('.gr-cq')].map((box) => ({
    width: Number(box.dataset.width),
    hidden: Object.fromEntries([...box.querySelectorAll('[data-name]')]
      .map((el) => [el.dataset.name, getComputedStyle(el).display === 'none'])),
  })));

  for (const { width, hidden } of seen) {
    for (const [name, rule] of Object.entries(EXPECTED)) {
      expect(hidden[name], `контейнерный вариант ${name} на ширине ${width}`).toBe(rule(width));
    }
  }
});

// Оговорка «Адаптивного скрытия» (ревью CHU, пп. 34, 35): классы скрытия —
// в слое утилит, и правило сайта с display их перебивает вне слоёв
// и в своём слое верхнего уровня, объявленном после библиотеки (он целиком
// старше griffincss); в подслое griffincss.app, объявленном в порядке слоёв
// до библиотеки, — нет: он ниже утилит.
test('CSS сайта вне слоёв и в слое после библиотеки скрытие перебивает, в griffincss.app — нет', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 400 });
  await page.route('**/visibility-layer-fixture.html', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><head>
<style>@layer griffincss.reset, griffincss.tokens, griffincss.core, griffincss.app, griffincss.ui, griffincss.utils, griffincss.style, griffincss.hidden;</style>
${LINKS}
<style>.site { display: flex; } @layer theme { .theme { display: flex; } } @layer griffincss.app { .app { display: flex; } }</style>
</head><body>
<nav class="site gr-hidden-under-md" id="site">x</nav>
<nav class="theme gr-hidden-under-md" id="theme">x</nav>
<nav class="app gr-hidden-under-md" id="app">x</nav>
</body></html>`,
  }));
  await page.goto('/visibility-layer-fixture.html');

  const display = await page.evaluate(() => ['site', 'theme', 'app'].map((id) => getComputedStyle(document.getElementById(id)).display));

  expect(display).toEqual(['flex', 'flex', 'none']);
});
