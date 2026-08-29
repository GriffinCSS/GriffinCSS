// Дорожка GriffinJS в настоящих движках: снап, клавиатура, отчёт
// о позиции после прокрутки пользователем — то, что мок-DOM не проверит.

import { test, expect } from '@playwright/test';

const LAB = '/docs/griffinjs-lab.html';

// Полигон без плавной прокрутки (её включает ресет ядра): плавный подъезд
// страницы к элементу при focus() перебивает в Firefox плавную прокрутку
// дорожки, и замер scrollLeft ловит обрыв анимации. Поведение виджетов
// от этого не зависит.
async function open(page) {
  await page.goto(LAB);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
}
const TRACK = '[data-gr-track]';

async function state(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const t = window.GriffinJS.instance(el, 'track');
    const slides = [...el.children];
    return {
      index: t.index,
      scrollLeft: Math.round(el.scrollLeft),
      offset: Math.round(slides[t.index].offsetLeft - el.offsetLeft),
      current: slides.map((s) => s.getAttribute('aria-current') === 'true'),
      inert: slides.map((s) => s.hasAttribute('inert')),
    };
  }, TRACK);
}

test('goTo снапит дорожку к слайду, aria-current и inert следуют за индексом', async ({ page }) => {
  await open(page);
  await page.locator(TRACK).evaluate((el) => window.GriffinJS.instance(el, 'track').goTo(2, { instant: true }));

  await expect.poll(async () => (await state(page)).scrollLeft).toBeGreaterThan(0);

  const s = await state(page);

  expect(s.index).toBe(2);
  expect(Math.abs(s.scrollLeft - s.offset)).toBeLessThanOrEqual(1);
  expect(s.current).toEqual([false, false, true, false]);
  expect(s.inert[2]).toBe(false);
  expect(s.inert[0]).toBe(true);
});

test('стрелка вправо листает на следующий слайд с плавной прокруткой', async ({ page }) => {
  await open(page);
  await page.locator(TRACK).focus();
  await page.keyboard.press('ArrowRight');

  await expect.poll(async () => (await state(page)).index).toBe(1);
  await expect.poll(async () => {
    const s = await state(page);
    return Math.abs(s.scrollLeft - s.offset);
  }).toBeLessThanOrEqual(1);
});

test('прокрутка пользователем меняет индекс после остановки и шлёт griffin:change', async ({ page }) => {
  await open(page);

  await page.locator(TRACK).evaluate((el) => {
    window.__changes = [];
    el.addEventListener('griffin:change', (e) => window.__changes.push(e.detail.index));
    const target = el.children[3].offsetLeft - el.offsetLeft;
    el.scrollTo({ left: target, behavior: 'auto' });
  });

  await expect.poll(async () => (await state(page)).index, { timeout: 3000 }).toBe(3);
  expect(await page.evaluate(() => window.__changes)).toEqual([3]);
});
