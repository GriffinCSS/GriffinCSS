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
