// Шаги лендинга: .gr-steps-plain — все шаги равноправны, и .gr-steps-stack-*
// — колонка ниже порога (окно или ближайший .gr-cq), ряд от порога.
// Линию шага рисует ::after; её концы считаются из вычисленного стиля
// псевдоэлемента — прямоугольника у него нет, а «дотягивается ли линия
// до следующего маркера» и есть то, что ломается при смене направления.

import { test, expect } from '@playwright/test';

const PAGE = '/steps-fixture.html';

const step = (n, label, note) => `
  <li class="gr-step">
    <span class="gr-step-marker" aria-hidden="true">${n}</span>
    <span class="gr-step-body"><span class="gr-step-label">${label}</span><span class="gr-step-note">${note}</span></span>
  </li>`;

const list = (id, cls) => `<ol id="${id}" class="gr-steps ${cls}">
  ${step(1, 'Бриф и созвон', 'Цели, аудитория и бюджет — в тот же день план работ и смета.')}
  ${step(2, 'Прототип', 'Структура страниц и тексты в сером макете.')}
  ${step(3, 'Запуск', 'Перенос на хостинг и обучение.')}
</ol>`;

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Шаги</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
</head><body>
${list('win', 'gr-steps-plain gr-steps-stack-md')}
<div class="gr-cq" style="inline-size:420px">${list('narrow', 'gr-steps-stack-cmd')}</div>
<div class="gr-cq" style="inline-size:900px">${list('wide', 'gr-steps-stack-cmd')}</div>
<ol id="plain-current" class="gr-steps gr-steps-plain">
  <li class="gr-step"><span class="gr-step-marker">1</span><span class="gr-step-label">Раз</span></li>
  <li class="gr-step" aria-current="step"><span class="gr-step-marker">2</span><span class="gr-step-label">Два</span></li>
</ol>
<ol id="default" class="gr-steps">
  <li class="gr-step"><span class="gr-step-marker">1</span><span class="gr-step-label">Раз</span></li>
</ol>
<span id="c-text" style="color:var(--gr-color-text)"></span>
<span id="c-accent" style="color:var(--gr-color-accent)"></span>
<span id="c-border" style="color:var(--gr-color-border)"></span>
</body></html>`;

async function open(page, width) {
  await page.setViewportSize({ width, height: 1400 });
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  }));
  await page.goto(PAGE);
}

// Геометрия списка: направление, маркеры и концы линии первого шага.
const geometry = (page, id) => page.evaluate((id) => {
  const list = document.getElementById(id);
  const steps = [...list.children].map((li) => li.querySelector('.gr-step') || li);
  const box = (el) => el.getBoundingClientRect();
  const first = steps[0];
  const line = getComputedStyle(first, '::after');
  const at = box(first);
  const m1 = box(first.querySelector('.gr-step-marker'));
  const m2 = box(steps[1].querySelector('.gr-step-marker'));
  const label = box(first.querySelector('.gr-step-label'));
  const note = box(first.querySelector('.gr-step-note'));
  const top = at.top + parseFloat(line.top);
  const left = at.left + parseFloat(line.left);

  return {
    direction: getComputedStyle(list).flexDirection,
    m1, m2, label, note,
    line: { top, left, bottom: top + parseFloat(line.height), right: left + parseFloat(line.width) },
  };
}, id);

test('узкое окно: колонка — маркер слева от подписи, линия от маркера до следующего', async ({ page }) => {
  await open(page, 375);

  const g = await geometry(page, 'win');

  expect(g.direction).toBe('column');
  expect(g.m2.top).toBeGreaterThan(g.m1.bottom);
  expect(g.label.left).toBeGreaterThan(g.m1.right);
  expect(g.note.top).toBeGreaterThanOrEqual(g.label.bottom - 0.5);
  // Вертикальная линия: сверху — низ первого маркера, снизу — верх второго,
  // по центру маркера.
  expect(Math.abs(g.line.top - g.m1.bottom)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(g.line.bottom - g.m2.top)).toBeLessThanOrEqual(0.5);
  expect(Math.abs((g.line.left + g.line.right) / 2 - (g.m1.left + g.m1.right) / 2)).toBeLessThanOrEqual(0.5);
});

test('с 768 px: ряд — подпись под маркером, линия доходит до следующего маркера', async ({ page }) => {
  await open(page, 1024);

  const g = await geometry(page, 'win');

  expect(g.direction).toBe('row');
  expect(g.m2.top).toBe(g.m1.top);
  expect(g.label.top).toBeGreaterThan(g.m1.bottom);
  // Обёртка подписи в ряду — как её отсутствие: пояснение под названием,
  // обе строки по центру шага.
  expect(g.note.top).toBeGreaterThanOrEqual(g.label.bottom - 0.5);
  expect(Math.abs((g.label.left + g.label.right) / 2 - (g.m1.left + g.m1.right) / 2)).toBeLessThanOrEqual(0.5);
  // Горизонтальная линия — на середине маркера и заходит под следующий.
  expect(Math.abs((g.line.top + g.line.bottom) / 2 - (g.m1.top + g.m1.bottom) / 2)).toBeLessThanOrEqual(0.5);
  expect(g.line.right).toBeGreaterThanOrEqual(g.m2.left);
});

test('контейнер: в узком гнезде колонка, в широком — ряд при одной ширине окна', async ({ page }) => {
  await open(page, 1280);

  const narrow = await geometry(page, 'narrow');
  const wide = await geometry(page, 'wide');

  expect(narrow.direction).toBe('column');
  expect(Math.abs(narrow.line.bottom - narrow.m2.top)).toBeLessThanOrEqual(0.5);
  expect(wide.direction).toBe('row');
  expect(wide.line.right).toBeGreaterThanOrEqual(wide.m2.left);
});

test('.gr-steps-plain: подпись цвета текста, маркер акцентный, линия нейтральная; состояние сильнее', async ({ page }) => {
  await open(page, 1024);

  const c = await page.evaluate(() => {
    const cs = (el, pseudo) => getComputedStyle(el, pseudo);
    const plain = document.querySelector('#win .gr-step');
    const current = document.querySelector('#plain-current [aria-current]');
    const def = document.querySelector('#default .gr-step');

    return {
      text: cs(document.getElementById('c-text')).color,
      accent: cs(document.getElementById('c-accent')).color,
      border: cs(document.getElementById('c-border')).color,
      label: cs(plain.querySelector('.gr-step-label')).color,
      marker: cs(plain.querySelector('.gr-step-marker')).color,
      markerBg: cs(plain.querySelector('.gr-step-marker')).backgroundColor,
      line: cs(plain, '::after').backgroundColor,
      currentBg: cs(current.querySelector('.gr-step-marker')).backgroundColor,
      defaultLabel: cs(def.querySelector('.gr-step-label')).color,
    };
  });

  expect(c.label).toBe(c.text);
  expect(c.marker).toBe(c.accent);
  expect(c.line).toBe(c.border);
  expect(c.markerBg).not.toBe(c.accent);
  // Текущий шаг в равноправном списке по-прежнему залит.
  expect(c.currentBg).toBe(c.accent);
  // Без модификатора — прежний вид: подпись приглушена.
  expect(c.defaultLabel).not.toBe(c.text);
});
