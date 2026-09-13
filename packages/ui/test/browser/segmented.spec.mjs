// Сегментный переключатель при крупном скруглении (Этап 40). Полевой отчёт
// по 0.23.1 описал .gr-segmented при --gr-radius: 1rem как кособокий:
// слева круг, справа прямой угол. Радиусы в _choice.scss симметричны
// по построению, поэтому замер — на всех трёх движках, углами. На нашей
// разметке асимметрия не воспроизводится; вероятная причина в отчёте —
// последний ребёнок переключателя не <label>, и label:last-child
// не совпадает.
//
// Ограничение радиуса половиной высоты через min() пробовалось и откачено
// по замеру: в обычном режиме углы те же, а в режиме для слабовидящих
// (интерлиньяж 1,7, сегмент выше --gr-control-height-sm) потолок резал
// пилюлю — 20 px вместо полных 24. Избыточный радиус движок ужимает сам,
// пропорционально и одинаково на всех трёх; последний тест это и сторожит.
//
// Замер идёт не снимком, а hit-testing: elementFromPoint по диагонали
// от угла. Скруглённый угол прозрачен для попадания — первая точка
// диагонали, которая попадает в элемент, и есть глубина скругления.
// Одинаковая глубина слева и справа — симметрия; нулевая — угол прямой.
// Обёртка <label> прямоугольна и прозрачна: она ловила бы точку раньше
// скруглённого <span>, поэтому в фикстуре для неё выключены pointer-events —
// на отрисовку это не влияет, а попадание уходит в span или в рамку.

import { test, expect } from '@playwright/test';

const PAGE = '/segmented-fixture.html';

const html = (radius) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Сегмент</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<style>
  :root { --gr-radius: ${radius}; --gr-transition: 0s; }
  body { padding: 40px; }
  .gr-segmented label { pointer-events: none; }
  .gr-segmented span { pointer-events: auto; }
</style>
</head><body>
<fieldset class="gr-segmented" id="seg" aria-label="Период">
  <label><input type="radio" name="p" value="d" checked><span>День</span></label>
  <label><input type="radio" name="p" value="w"><span>Неделя</span></label>
  <label><input type="radio" name="p" value="m"><span>Месяц</span></label>
</fieldset>
</body></html>`;

async function open(page, radius) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html(radius),
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

// Глубина скругления каждого угла элемента: шаг по диагонали внутрь,
// пока точка не попадёт в элемент или его потомка. Полпикселя — чтобы
// не стоять ровно на границе. Для span попадание считается только в него
// самого: рамка позади него скруглена иначе.
const corners = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  const own = el.tagName === 'SPAN';
  const hits = (x, y) => {
    const found = document.elementFromPoint(x, y);

    return found !== null && (found === el || (!own && el.contains(found)));
  };
  const depth = (sx, sy, dx, dy) => {
    for (let d = 0; d < 40; d += 1) {
      if (hits(sx + dx * (d + 0.5), sy + dy * (d + 0.5))) return d;
    }

    return 40;
  };

  return {
    tl: depth(r.left, r.top, 1, 1),
    tr: depth(r.right, r.top, -1, 1),
    bl: depth(r.left, r.bottom, 1, -1),
    br: depth(r.right, r.bottom, -1, -1),
    height: r.height,
  };
}, selector);

for (const radius of ['1rem', '3rem']) {
  test(`углы переключателя симметричны при --gr-radius: ${radius}`, async ({ page }) => {
    await open(page, radius);

    // Рамка целиком.
    const frame = await corners(page, '#seg');

    expect(frame.tl, `рамка: левый верхний угол прямой (${JSON.stringify(frame)})`).toBeGreaterThan(1);
    expect(Math.abs(frame.tl - frame.tr), `рамка: ${JSON.stringify(frame)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.bl - frame.br), `рамка: ${JSON.stringify(frame)}`).toBeLessThanOrEqual(1);

    // Крайние сегменты — те, у кого свои радиусы: первый скруглён у начала,
    // последний — у конца. Глубина обязана совпасть.
    const first = await corners(page, '#seg label:first-child span');
    const last = await corners(page, '#seg label:last-child span');

    expect(first.tl, `первый сегмент: ${JSON.stringify(first)}`).toBeGreaterThan(1);
    expect(Math.abs(first.tl - last.tr), `сегменты: ${JSON.stringify({ first, last })}`).toBeLessThanOrEqual(1);
    expect(Math.abs(first.bl - last.br), `сегменты: ${JSON.stringify({ first, last })}`).toBeLessThanOrEqual(1);

    // Внутренние углы крайних сегментов — прямые: скруглены только наружные.
    // Единица допуска — дробная ширина сегмента: flex делит ряд на три,
    // и точка в полупикселе от края может лечь на соседа.
    expect(first.tr, `первый сегмент скруглён с внутренней стороны: ${JSON.stringify(first)}`).toBeLessThanOrEqual(1);
    expect(last.tl, `последний сегмент скруглён с внутренней стороны: ${JSON.stringify(last)}`).toBeLessThanOrEqual(1);
  });
}

// Глубина скругления по диагонали — это R·(1 − 1/√2) ≈ 0,29·R, а не R:
// дуга радиуса R отступает от угла квадрата ровно на столько.
const diagonal = (radius) => radius * (1 - Math.SQRT1_2);

test('избыточный радиус движок ужимает до половины высоты — одинаково на всех трёх', async ({ page }) => {
  await open(page, '3rem');

  // Скругление 3rem больше высоты переключателя: по спецификации радиусы
  // ужимаются пропорционально, до полной пилюли. Это и есть та симметрия,
  // на которую полагается модуль вместо собственного потолка.
  const frame = await corners(page, '#seg');
  const cap = diagonal(frame.height / 2);

  expect(frame.tl, `рамка: ${JSON.stringify(frame)}, потолок ${cap.toFixed(1)}`).toBeLessThanOrEqual(Math.ceil(cap));
  expect(frame.tl, `рамка: ${JSON.stringify(frame)}, потолок ${cap.toFixed(1)}`).toBeGreaterThanOrEqual(Math.floor(cap * 0.7));
});
