// Семейство прокрутки на полигоне: слайдер с точками и автоплеем,
// галерея с превью, лайтбокс на <dialog> — в трёх движках.

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

test('слайдер: точки построены, щелчок по точке листает, наведение держит автоплей', async ({ page }) => {
  await open(page);

  const slider = page.locator('#gr-lab-slider');

  await expect(slider).toHaveAttribute('data-gr-state', 'playing');
  await expect(slider.locator('.gr-slider-dot')).toHaveCount(3);
  await expect(slider.locator('[data-gr-pause]')).toHaveCount(1);

  await slider.locator('.gr-slider-dot').nth(2).click();
  await expect(slider.locator('.gr-slider-dot').nth(2)).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => slider.evaluate((el) => window.GriffinJS.instance(el, 'slider').track.physical(
    window.GriffinJS.instance(el, 'slider').track.index))).toBe(2);

  // Щелчок по точке оставил фокус внутри — фокус тоже держит паузу,
  // поэтому сперва уводится фокус, потом проверяется наведение.
  await page.evaluate(() => document.activeElement.blur());
  await page.mouse.move(0, 0);
  await expect(slider).toHaveAttribute('data-gr-state', 'playing');
  await slider.hover();
  await expect(slider).toHaveAttribute('data-gr-state', 'paused');
  await page.mouse.move(0, 0);
  await expect(slider).toHaveAttribute('data-gr-state', 'playing');
});

test('галерея: превью ведёт дорожку и получает aria-current', async ({ page }) => {
  await open(page);

  const gallery = page.locator('#gr-lab-gallery');
  const thumbs = gallery.locator('.gr-gallery-thumbs > button');

  await expect(thumbs.nth(0)).toHaveAttribute('aria-current', 'true');
  await thumbs.nth(1).click();
  await expect(thumbs.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(gallery.locator('.gr-track > *').nth(1)).toHaveAttribute('aria-current', 'true');
});

test('лайтбокс: открывается по щелчку, стрелка листает, Esc закрывает и убирает окно', async ({ page }) => {
  await open(page);
  await page.locator('#gr-lab-lightbox-2').click();

  const dialog = page.locator('dialog.gr-lightbox');

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('2 / 2');
  await expect(dialog.locator('.gr-lightbox-item:not([data-gr-clone]) .gr-lightbox-caption').nth(1)).toHaveText('Второй кадр');

  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('1 / 2');

  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.gr-lightbox')).toHaveCount(0);
  await expect(page.locator('#gr-lab-lightbox-2')).toBeFocused();
});

test('страница «Слайды»: все виджеты поднимаются, консоль чистая, без скрипта органы управления скрыты', async ({ page }) => {
  const errors = [];

  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/docs/griffinjs-slides.html');

  await expect(page.locator('[data-gr-slider][data-gr-state]')).toHaveCount(await page.locator('[data-gr-slider]').count());
  await expect(page.locator('[data-gr-gallery] .gr-gallery-thumbs > [aria-current="true"]')).toHaveCount(2);
  expect(errors).toEqual([]);

  // Без скрипта: кнопки и точки слайдеров не видны, дорожки остаются.
  await page.route('**/griffinjs.js', (route) => route.abort());
  await page.goto('/docs/griffinjs-slides.html');
  await expect(page.locator('.gr-slider-prev').first()).toBeHidden();
  await expect(page.locator('.gr-track').first()).toBeVisible();
});

test('несколько в ряд: точки по страницам, последняя доезжает до конца, rewind возвращает к началу', async ({ page }) => {
  await open(page);

  const slider = page.locator('#gr-lab-pages');
  const dots = slider.locator('.gr-slider-dot');
  const state = () => slider.evaluate((el) => {
    const t = window.GriffinJS.instance(el, 'slider').track;
    const track = el.querySelector('.gr-track');
    return { index: t.index, perView: t.perView, last: t.last, pages: t.pages,
      atEnd: Math.abs(track.scrollLeft + track.clientWidth - track.scrollWidth) <= 1 };
  });

  expect(await state()).toMatchObject({ perView: 3, last: 2, pages: 2 });
  await expect(dots).toHaveCount(2);

  await dots.nth(1).click();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect.poll(async () => (await state()).atEnd).toBe(true);
  expect((await state()).index).toBe(2);

  await slider.locator('[data-gr-next]').click();
  await expect.poll(async () => (await state()).index).toBe(0);
  await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');
});

test('постранично: свайп на середину страницы снапится к её началу, а не к произвольному слайду', async ({ page }) => {
  await page.goto(LAB);

  const slider = page.locator('#gr-lab-pages');
  const snaps = await slider.locator('.gr-track > *').evaluateAll((els) => els.map((e) => getComputedStyle(e).scrollSnapAlign));

  expect(snaps).toEqual(['start', 'none', 'none', 'none', 'end']);

  // Прокрутка «пальцем» на второй слайд: без страничного снапа дорожка
  // осталась бы на нём, точки указали бы мимо.
  await slider.locator('.gr-track').evaluate((el) => {
    el.scrollTo({ left: el.children[1].offsetLeft - el.offsetLeft + 5, behavior: 'auto' });
  });

  const rest = () => slider.locator('.gr-track').evaluate((el) => ({
    left: Math.round(el.scrollLeft),
    end: Math.round(el.scrollWidth - el.clientWidth),
    index: window.GriffinJS.instance(el.parentElement, 'slider').track.index,
  }));

  await expect.poll(async () => { const r = await rest(); return r.left === 0 || r.left === r.end; }, { timeout: 3000 }).toBe(true);

  const r = await rest();
  expect([0, 2]).toContain(r.index);
  await expect(slider.locator('.gr-slider-dot').nth(r.index === 0 ? 0 : 1)).toHaveAttribute('aria-current', 'true');
});
