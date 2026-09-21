// Наблюдение за живым деревом по умолчанию (Этап 47b, наблюдение Н2).
//
// FOUC-защита ловит любой контейнер по атрибуту — в том числе вставленный
// после загрузки, — и до Этапа 47 такой контейнер оставался в opacity: 0,
// пока автор не вызовет refresh() или observe() сам. Теперь после init()
// рантайм следит за body; выключатель — data-observe="false" на теге.
//
// Третий тест — замер риска 1 плана: MutationObserver на childList + class
// на тяжёлой странице. Порция из 500 контейнеров обязана дать один проход,
// а не пятьсот: проходы считаются по мутациям класса на уже разложенном
// контейнере-пробе — каждый проход заново ставит ему класс раскладки
// и .gr-ready, и записи об атрибуте приходят даже при неизменном значении.
// Сколько записей даёт один проход, говорит калибровка одним явным
// refresh(), а не число в тесте: оно — свойство рантайма, не спецификации.

import { test, expect } from '@playwright/test';

const PAGE = '/observe-fixture.html';

const html = (attrs) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Наблюдение</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<script src="/packages/core/dist/griffincss.js"${attrs}></script>
</head><body>
<div id="first" data-gr-layout="a1b1"><div>a</div><div>b</div></div>
</body></html>`;

async function open(page, attrs = '') {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html(attrs),
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.getElementById('first').classList.contains('gr-ready'));
}

const insertLate = (page) => page.evaluate(() => {
  const late = document.createElement('div');

  late.id = 'late';
  late.setAttribute('data-gr-layout', 'a1b1-c2');
  late.innerHTML = '<div>a</div><div>b</div><div>c</div>';
  document.body.appendChild(late);
});

const lateState = (page) => page.evaluate(() => {
  const late = document.getElementById('late');
  const css = getComputedStyle(late);

  return {
    ready: late.classList.contains('gr-ready'),
    display: css.display,
    opacity: css.opacity,
    areas: Array.from(late.children, (c) => c.className),
  };
});

test('поздний контейнер раскладывается сам, без refresh()', async ({ page }) => {
  await open(page);
  await insertLate(page);

  await expect.poll(async () => (await lateState(page)).opacity).toBe('1');

  const state = await lateState(page);

  expect(state.ready).toBe(true);
  expect(state.display).toBe('grid');
  expect(state.areas).toEqual(['gr-area-a', 'gr-area-b', 'gr-area-c']);
});

// Отрицательный контроль: без него первый тест не отличал бы наблюдение
// от случайного refresh() из чужого кода.
test('с data-observe="false" поздний контейнер ждёт refresh()', async ({ page }) => {
  await open(page, ' data-observe="false"');
  await insertLate(page);
  await page.waitForTimeout(150);

  const before = await lateState(page);

  expect(before.ready).toBe(false);
  expect(before.opacity).toBe('0');

  await page.evaluate(() => window.Griffincss.refresh());
  await expect.poll(async () => (await lateState(page)).opacity).toBe('1');
});

test('500 контейнеров одной порцией на patterns.html — один проход', async ({ page }) => {
  await page.goto('/docs/patterns.html');
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForFunction(() => document.querySelector('[data-gr-layout].gr-ready'));

  const result = await page.evaluate(async () => {
    const probe = document.querySelector('[data-gr-layout].gr-ready');
    let passes = 0;
    const counter = new MutationObserver((records) => {
      for (const r of records) if (r.attributeName === 'class' && r.target === probe) passes += 1;
    });

    counter.observe(probe, { attributes: true, attributeFilter: ['class'] });

    const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

    // Калибровка: один явный проход — одна запись об атрибуте класса.
    window.Griffincss.refresh();
    await settle();

    const calibration = passes;

    passes = 0;

    const host = document.createElement('div');
    const started = performance.now();

    for (let i = 0; i < 500; i += 1) {
      const box = document.createElement('div');

      box.setAttribute('data-gr-layout', 'a1b1');
      box.setAttribute('data-gr-layout-md', 'a1-b1');
      box.innerHTML = '<div>a</div><div>b</div>';
      host.appendChild(box);
    }

    document.body.appendChild(host);

    // Ждём, пока последний контейнер порции получит .gr-ready.
    await new Promise((resolve) => {
      const tick = () => (host.lastElementChild.classList.contains('gr-ready') ? resolve() : requestAnimationFrame(tick));
      tick();
    });

    const elapsed = performance.now() - started;

    await settle();

    // Стоимость одного прохода по странице с 500 лишними контейнерами.
    const t0 = performance.now();

    window.Griffincss.refresh();

    const pass = performance.now() - t0;
    const ready = host.querySelectorAll('.gr-ready').length;

    counter.disconnect();

    return { calibration, passes, elapsed, pass, ready };
  });

  const passes = result.passes / result.calibration;

  console.log(`observe: 500 вставок — ${passes} проход(а), ${result.elapsed.toFixed(1)} мс до .gr-ready у последнего; явный refresh() по странице с 500 контейнерами — ${result.pass.toFixed(1)} мс`);

  expect(result.calibration).toBeGreaterThan(0);
  expect(result.ready).toBe(500);
  expect(passes).toBe(1);
});
