// Подсказка прокрутки у таблицы: мягкая тень у края, за которым ещё есть
// содержимое. Проверяется по пикселям — яркость фона у левого и правого
// края в середине высоты области: тень темнее подложки. Текст ячеек
// прозрачный, чтобы у края остался только фон области.
//
// Chromium и WebKit ведут тени анимацией по прокрутке, Firefox — шторкой,
// которая едет с содержимым; исход у пользователя обязан совпадать.

import { test, expect } from '@playwright/test';

const PAGE = '/table-scroll-fixture.html';

const row = (cells, tag) => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
const WIDE = (attrs = '') => `<table id="tb"${attrs}><thead>${row(['Модель', 'Диагональ', 'Разрешение', 'Частота', 'Матрица', 'Яркость', 'HDR', 'Вес, кг', 'Гарантия'], 'th')}</thead><tbody>${row(['Samsung QE55Q60C', '55″', '3840×2160', '60 Гц', 'QLED', '400 кд/м²', 'HDR10+', '16,9', '24 мес.'], 'td')}</tbody></table>`;
const NARROW = `<table id="tb"><thead>${row(['Параметр', 'Значение'], 'th')}</thead><tbody>${row(['Вес', '1,2 кг'], 'td')}</tbody></table>`;

const page = (html) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Подсказка прокрутки</title>
<meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<style>body { margin: 12px; } #tb, #tb * { color: transparent !important; }</style>
</head><body>${html}</body></html>`;

async function open(pw, html) {
  await pw.setViewportSize({ width: 390, height: 600 });
  await pw.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: page(html),
  }));
  await pw.goto(PAGE);
}

// Прокрутить на долю f от начала (в RTL — влево) и снять яркость краёв.
async function edges(pw, f) {
  await pw.evaluate((f) => {
    const t = document.getElementById('tb');
    const rtl = getComputedStyle(t).direction === 'rtl';

    t.scrollLeft = (rtl ? -1 : 1) * Math.round(f * (t.scrollWidth - t.clientWidth));
  }, f);
  // Кадр анимации по прокрутке — на следующей отрисовке.
  await pw.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const png = await pw.locator('#tb').screenshot();

  return pw.evaluate(async (b64) => {
    const img = new Image();

    img.src = `data:image/png;base64,${b64}`;
    await img.decode();

    const canvas = document.createElement('canvas');

    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0);

    const lum = (x) => {
      const [r, g, b] = ctx.getImageData(x, img.height >> 1, 1, 1).data;

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    return { left: lum(1), right: lum(img.width - 2) };
  }, png.toString('base64'));
}

// Тень — заметно темнее подложки; без тени края совпадают.
const SHADE = 12;

test('широкая таблица прозы: тень у края, за которым есть содержимое', async ({ page: pw }) => {
  await open(pw, `<article class="gr-prose">${WIDE()}</article>`);

  const start = await edges(pw, 0);
  const middle = await edges(pw, 0.5);
  const end = await edges(pw, 1);

  // В начале — только справа: слева содержимого нет.
  expect(start.left - start.right).toBeGreaterThan(SHADE);
  // В середине — с обеих сторон.
  expect(start.left - middle.left).toBeGreaterThan(SHADE);
  expect(start.left - middle.right).toBeGreaterThan(SHADE);
  // В конце — только слева.
  expect(end.right - end.left).toBeGreaterThan(SHADE);
  expect(Math.abs(end.right - start.left)).toBeLessThanOrEqual(2);
});

test('в RTL прокрутка начинается справа — тень сначала слева', async ({ page: pw }) => {
  await open(pw, `<article class="gr-prose" dir="rtl">${WIDE()}</article>`);

  const start = await edges(pw, 0);
  const end = await edges(pw, 1);

  expect(start.right - start.left).toBeGreaterThan(SHADE);
  expect(end.left - end.right).toBeGreaterThan(SHADE);
});

test('без переполнения теней нет', async ({ page: pw }) => {
  await open(pw, `<article class="gr-prose">${NARROW}</article>`);

  const rest = await edges(pw, 0);

  expect(Math.abs(rest.left - rest.right)).toBeLessThanOrEqual(2);

  // Та же таблица шире колонки — уже с тенью: края выше сравнимы.
  await open(pw, `<article class="gr-prose">${WIDE()}</article>`);
  const wide = await edges(pw, 0);

  expect(Math.abs(rest.left - wide.left)).toBeLessThanOrEqual(2);
});

for (const [name, html] of [
  ['.gr-table-wrap', `<div class="gr-table-wrap" id="tb" tabindex="0" role="region" aria-label="Модели">${WIDE(' class="gr-table"').replace(' id="tb"', '')}</div>`],
  ['.gr-table-scroll', WIDE(' class="gr-table gr-table-scroll" tabindex="0"')],
]) {
  test(`${name}: та же подсказка`, async ({ page: pw }) => {
    await open(pw, html);

    const start = await edges(pw, 0);
    const end = await edges(pw, 1);

    expect(start.left - start.right).toBeGreaterThan(SHADE);
    expect(end.right - end.left).toBeGreaterThan(SHADE);
  });
}

// --- Подложка контейнера и липкий столбец -------------------------------------

const PAGE_FULL = '/table-scroll-fixture-full.html';

async function openFull(pw, html, { theme = '', width = 420 } = {}) {
  await pw.setViewportSize({ width, height: 600 });
  await pw.route(`**${PAGE_FULL}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html>
<html lang="ru"${theme ? ` data-gr-theme="${theme}"` : ''}><head><meta charset="utf-8"><title>Подсказка прокрутки</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
<style>body { margin: 12px; } .ink, .ink * { color: transparent !important; }</style>
</head><body>${html}</body></html>`,
  }));
  await pw.goto(PAGE_FULL);
}

// Яркость точек страницы — по снимку всего окна: снимок элемента в Firefox
// отдаёт у края прозрачный пиксель. Координаты — в CSS-пикселях: у профиля
// WebKit плотность 2, и снимок вдвое больше окна.
async function lumAt(pw, points) {
  const png = await pw.screenshot();

  return pw.evaluate(async ([b64, points]) => {
    const img = new Image();

    img.src = `data:image/png;base64,${b64}`;
    await img.decode();

    const canvas = document.createElement('canvas');

    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0);

    const scale = img.width / window.innerWidth;

    return points.map(([x, y]) => {
      const [r, g, b] = ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    });
  }, [png.toString('base64'), points]);
}

const SMALL = '<table class="gr-table ink"><thead><tr><th>Параметр</th><th>Значение</th></tr></thead><tbody><tr><td>Вес</td><td>1,2 кг</td></tr></tbody></table>';

for (const [name, html] of [
  ['.gr-card-overlay', `<div class="gr-card gr-card-overlay"><div class="gr-card-body"><div class="gr-table-wrap" id="w">${SMALL}</div></div></div>`],
  ['.gr-modal', `<dialog class="gr-modal" open><div class="gr-modal-body"><div class="gr-table-wrap" id="w">${SMALL}</div></div></dialog>`],
  ['.gr-accordion', `<details class="gr-accordion" open><summary>Раздел</summary><div style="padding: 12px"><div class="gr-table-wrap" id="w">${SMALL}</div></div></details>`],
  // Без своего фона — шторка цвета того, что под аккордеоном: страницы
  // или карточки вокруг него.
  ['.gr-accordion-flush на странице', `<details class="gr-accordion gr-accordion-flush" open><summary>Раздел</summary><div style="padding: 12px"><div class="gr-table-wrap" id="w">${SMALL}</div></div></details>`],
  ['.gr-accordion-flush в .gr-card-overlay', `<div class="gr-card gr-card-overlay"><div class="gr-card-body"><details class="gr-accordion gr-accordion-flush" open><summary>Раздел</summary><div style="padding: 12px"><div class="gr-table-wrap" id="w">${SMALL}</div></div></details></div></div>`],
]) {
  test(`шторка подсказки — цвета подложки контейнера: ${name}`, async ({ page: pw }) => {
    // Шторка есть только там, где нет анимации по прокрутке (Firefox):
    // у таблицы, которая помещается, она лежит у обоих краёв. В остальных
    // движках шторка прозрачна, и края совпадают с подложкой и так.
    await openFull(pw, html, { theme: 'dark' });

    // Высота — середина ячейки тела: на середине области может лечь линия под шапкой.
    const box = await pw.locator('#w').boundingBox();
    const cell = await pw.locator('#w td').first().boundingBox();
    const y = cell.y + cell.height / 2;
    const [left, right, surface] = await lumAt(pw, [[box.x + 2, y], [box.x + box.width - 3, y], [box.x - 4, y]]);

    expect(Math.abs(left - surface)).toBeLessThanOrEqual(2);
    expect(Math.abs(right - surface)).toBeLessThanOrEqual(2);
  });
}

// Сравнение товаров: первый столбец липкий, строка группы — на всю ширину
// без липкой ячейки. Ширину столбца держит min-inline-size липкой ячейки
// шапки: ширина у <col> для таблицы, которая не помещается, — лишь пожелание.
const STICKY = (dir = '') => {
  const models = ['Samsung QE55Q60C', 'LG OLED55C3', 'Sony KD-55X85L', 'Xiaomi TV A Pro 55'];
  const cell = 'class="gr-sticky gr-start-0 gr-bg-page"';
  const row = (h, v) => `<tr><th scope="row" ${cell}>${h}</th>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`;

  return `<div class="gr-table-wrap" id="w"${dir} style="--gr-scroll-hint-inset: 9rem">
<table class="gr-table ink"><thead><tr><th ${cell} style="min-inline-size: var(--gr-scroll-hint-inset)">Модель</th>${models.map((m) => `<th>${m}</th>`).join('')}</tr></thead>
<tbody><tr id="group"><th colspan="5">Экран</th></tr>${row('Диагональ', ['55″', '55″', '55″', '55″'])}${row('Разрешение', ['3840×2160', '3840×2160', '3840×2160', '3840×2160'])}</tbody></table></div>`;
};

for (const [label, dir] of [['LTR', ''], ['RTL', ' dir="rtl"']]) {
  test(`липкий первый столбец: начальная тень у его края, а не у края области (${label})`, async ({ page: pw }) => {
    await openFull(pw, STICKY(dir));

    // Середина прокрутки: начальная тень видна.
    const inset = await pw.evaluate(() => {
      const w = document.getElementById('w');
      const rtl = getComputedStyle(w).direction === 'rtl';

      w.scrollLeft = (rtl ? -1 : 1) * Math.round((w.scrollWidth - w.clientWidth) / 2);

      return parseFloat(getComputedStyle(w).getPropertyValue('--gr-scroll-hint-inset')) * 16;
    });

    await pw.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const box = await pw.locator('#w').boundingBox();
    const g = await pw.locator('#group').boundingBox();
    const y = g.y + g.height / 2;
    const rtl = label === 'RTL';
    const edge = rtl ? box.x + box.width - 3 : box.x + 2;
    const column = rtl ? box.x + box.width - inset - 2 : box.x + inset + 1;
    const [atEdge, atColumn, page] = await lumAt(pw, [[edge, y], [column, y], [box.x - 4, y]]);

    // У края области в строке группы — подложка, у края липкого столбца — тень.
    expect(Math.abs(atEdge - page)).toBeLessThanOrEqual(2);
    expect(page - atColumn).toBeGreaterThan(SHADE);
  });
}
