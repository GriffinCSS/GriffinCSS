// Имена контейнеров классом и лента столбиком (Этап 47d, фидбек темы
// griffin по 0.25.0, п. 8). Проверяется вычисленным стилем: именованный
// запрос @container aside (…) из CSS страницы находит .gr-cq-aside, а лента
// в узком гнезде течёт столбиком при той же ширине окна, что и в широком.

import { test, expect } from '@playwright/test';

const PAGE = '/cq-names-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Имена контейнеров</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/ui/dist/griffinjs.css">
<style>
  /* Правило страницы обращается к слоту по имени через голову ближайшего .gr-cq */
  @container aside (width < 40rem) { .promo { color: rgb(1, 2, 3); } }
</style>
</head><body>
<div style="display:flex;gap:16px;align-items:start">
  <aside class="gr-cq-aside" style="inline-size:260px;flex:none">
    <div class="gr-cq"><p class="promo" id="in-aside">промо</p></div>
    <div class="gr-track gr-track-stack-csm" id="narrow"><div>1</div><div>2</div><div>3</div></div>
  </aside>
  <main class="gr-cq-main" style="flex:1;min-inline-size:0">
    <div class="gr-cq"><p class="promo" id="in-main">промо</p></div>
    <div class="gr-track gr-track-stack-csm gr-track-3-cmd" id="wide"><div>1</div><div>2</div><div>3</div><div>4</div></div>
  </main>
</div>
<!-- Гнездо между 640 и 768 px: доля .gr-track-2-csm и столбик .gr-track-stack-cmd
     совпадают, и побеждать обязан столбик — порядком правил в файле. -->
<div class="gr-cq" style="inline-size:700px">
  <div class="gr-track gr-track-2-csm gr-track-stack-cmd" id="between"><div>1</div><div>2</div><div>3</div></div>
</div>
</body></html>`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  }));
  await page.goto(PAGE);
});

const styleOf = (page, id, prop) => page.evaluate(([id, prop]) => getComputedStyle(document.getElementById(id))[prop], [id, prop]);

test('.gr-cq-aside отвечает именованному запросу через голову безымянного .gr-cq', async ({ page }) => {
  expect(await styleOf(page, 'in-aside', 'color')).toBe('rgb(1, 2, 3)');
  // Содержимое шире 40rem, и имя другое: правило не срабатывает.
  expect(await styleOf(page, 'in-main', 'color')).not.toBe('rgb(1, 2, 3)');
});

test('.gr-track-stack-csm: столбик в узком гнезде, лента в широком — окно одно', async ({ page }) => {
  expect(await styleOf(page, 'narrow', 'flexDirection')).toBe('column');
  expect(await styleOf(page, 'narrow', 'scrollSnapType')).toBe('none');
  expect(await styleOf(page, 'wide', 'flexDirection')).toBe('row');
  expect(await styleOf(page, 'wide', 'scrollSnapType')).toBe('x mandatory');

  // Слайды столбика — каждый своей высотой, друг под другом.
  const tops = await page.evaluate(() => Array.from(document.getElementById('narrow').children, (c) => c.getBoundingClientRect().top));

  expect(tops[1]).toBeGreaterThan(tops[0]);
  expect(tops[2]).toBeGreaterThan(tops[1]);
});

test('.gr-track-3-cmd: три слайда в ряд по ширине гнезда', async ({ page }) => {
  const m = await page.evaluate(() => {
    const track = document.getElementById('wide');
    const gap = parseFloat(getComputedStyle(track).columnGap);
    const slide = track.children[0].getBoundingClientRect().width;

    return { expected: (track.clientWidth - 2 * gap) / 3, slide, visible: Array.from(track.children).filter((c) => c.getBoundingClientRect().right <= track.getBoundingClientRect().right + 1).length };
  });

  expect(Math.abs(m.slide - m.expected)).toBeLessThan(1);
  expect(m.visible).toBe(3);
});

test('между 640 и 768 px гнезда столбик старше доли: .gr-track-2-csm + .gr-track-stack-cmd — столбик', async ({ page }) => {
  expect(await styleOf(page, 'between', 'flexDirection')).toBe('column');

  const widths = await page.evaluate(() => Array.from(document.getElementById('between').children, (c) => Math.round(c.getBoundingClientRect().width)));

  // Слайды столбика во всю ширину гнезда, а не в половину.
  expect(widths.every((w) => w === 700)).toBe(true);
});
