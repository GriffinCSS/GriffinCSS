// Модули движения на полигоне: цикл с клонами у scroll, движок fade,
// параллакс — в трёх движках браузера.

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

test('цикл: с последнего слайда «вперёд» ведёт на первый без отката через дорожку', async ({ page }) => {
  await open(page);

  const slider = page.locator('#gr-lab-loop');
  const info = () => slider.evaluate((el) => {
    const t = window.GriffinJS.instance(el, 'slider').track;
    const track = el.querySelector('.gr-track');
    const real = [...track.children].filter((c) => !c.hasAttribute('data-gr-clone'));
    return {
      index: t.index, physical: t.physical(t.index), clones: track.children.length - real.length,
      atFirst: Math.abs(track.scrollLeft - (real[0].offsetLeft - track.offsetLeft)) <= 1,
      current: real.map((s) => s.getAttribute('aria-current') === 'true'),
    };
  });

  expect((await info()).clones).toBe(2);
  await expect(slider.locator('.gr-slider-dot')).toHaveCount(3);

  // Пока дорожка едет, команды не принимаются — между нажатиями ждём остановки.
  for (let i = 0; i < 3; i++) {
    await slider.locator('[data-gr-next]').click();
    await expect.poll(async () => (await info()).index, { timeout: 3000 }).toBe(i + 1);
    await expect.poll(() => slider.evaluate((el) => window.GriffinJS.instance(el, 'slider').track.moving), { timeout: 3000 }).toBe(false);
  }

  await expect.poll(async () => (await info()).index).toBe(3);
  await expect.poll(async () => (await info()).atFirst, { timeout: 3000 }).toBe(true);
  expect((await info()).physical).toBe(0);
  expect((await info()).current).toEqual([true, false, false]);
  await expect(slider.locator('.gr-slider-dot').nth(0)).toHaveAttribute('aria-current', 'true');
});

test('fade: слайды стопкой, активный непрозрачен, соседи прозрачны, без клонов', async ({ page }) => {
  await open(page);

  const slider = page.locator('#gr-lab-fade');
  const opacities = () => slider.locator('.gr-track > *').evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
  const boxes = () => slider.locator('.gr-track > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));

  await expect(slider.locator('.gr-track > *')).toHaveCount(3);
  expect(await opacities()).toEqual([1, 0, 0]);
  expect(new Set(await boxes()).size).toBe(1, 'слайды в одной ячейке');

  await slider.locator('[data-gr-prev]').click();
  await expect.poll(opacities).toEqual([0, 0, 1]);
  await expect(slider.locator('.gr-track > *').nth(2)).toHaveAttribute('aria-current', 'true');
});

test('параллакс: --gr-progress меняется с прокруткой страницы', async ({ page }) => {
  await open(page);

  const block = page.locator('#gr-lab-parallax');
  const value = () => block.evaluate((el) => Number(el.style.getPropertyValue('--gr-progress')));

  await block.scrollIntoViewIfNeeded();
  await expect.poll(value).toBeGreaterThan(0);

  const before = await value();

  // Колесо крутит то, что под курсором: без наведения это была бы боковая панель.
  await block.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(value).not.toBe(before);
});
