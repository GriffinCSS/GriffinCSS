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

  // Дорожка, индекс и точка сходятся не одновременно, и мерить их тремя
  // снимками подряд нельзя: WebKit на пути к концу проходит через нулевую
  // позицию, замер «дорожка снапнута» ловит её раньше времени, индекс
  // после этого уезжает на 2 — и ожидание aria-current на первой точке
  // висит до таймаута. Поэтому согласие трёх величин проверяется одним
  // опросом: щели между замерами просто нет.
  await expect.poll(async () => {
    const r = await rest();

    if (r.left !== 0 && r.left !== r.end) return `дорожка между страницами (${r.left})`;

    const dot = await slider.locator('.gr-slider-dot').nth(r.index === 0 ? 0 : 1).getAttribute('aria-current');

    return `${r.index}:${dot}`;
  }).toMatch(/^(0|2):true$/);
});

test('страницы с остатком на странице «Слайды»: вперёд-вперёд-назад-назад-назад по кнопкам', async ({ page }) => {
  await page.goto('/docs/griffinjs-slides.html');

  const slider = page.locator('[aria-label="Шаг на страницу"]');
  const track = slider.locator('.gr-track');
  const info = () => track.evaluate((el) => {
    const t = window.GriffinJS.instance(el.parentElement, 'slider').track;
    const offsets = [...el.children].map((c) => Math.round(c.offsetLeft - el.offsetLeft));
    return { index: t.index, left: Math.round(el.scrollLeft), at: offsets.indexOf(Math.round(el.scrollLeft)), end: Math.round(el.scrollWidth - el.clientWidth) };
  });
  const dot = (k) => expect(slider.locator('.gr-slider-dot').nth(k)).toHaveAttribute('aria-current', 'true');
  const settled = async (index, at) => {
    await expect.poll(async () => { const s = await info(); return s.index === index && (at === 'end' ? s.left === s.end : s.at === at); }, { timeout: 3000 }).toBe(true);
  };

  await slider.scrollIntoViewIfNeeded();
  await slider.locator('[data-gr-next]').click(); await settled(2, 2); await dot(1);
  await slider.locator('[data-gr-next]').click(); await settled(3, 'end'); await dot(2);
  await slider.locator('[data-gr-prev]').click(); await settled(2, 2); await dot(1);
  await slider.locator('[data-gr-prev]').click(); await settled(0, 0); await dot(0);
  await slider.locator('[data-gr-prev]').click(); await settled(3, 'end'); await dot(2);
});

test('быстрые нажатия: принимается меньше команд, чем нажатий, а индекс, дорожка и точки сходятся', async ({ page }) => {
  await page.goto(LAB);

  for (const sel of ['#gr-lab-loop', '#gr-lab-pages']) {
    const slider = page.locator(sel);
    const next = slider.locator('[data-gr-next]');

    await slider.scrollIntoViewIfNeeded();
    await slider.evaluate((el) => { window.__accepted = 0; el.addEventListener('griffin:change', () => { window.__accepted += 1; }); });
    for (let i = 0; i < 4; i++) { await next.click({ force: true }); await page.waitForTimeout(40); }

    const info = () => slider.evaluate((el) => {
      const t = window.GriffinJS.instance(el, 'slider').track;
      const track = el.querySelector('.gr-track');
      const real = [...track.children].filter((c) => !c.hasAttribute('data-gr-clone'));
      const target = real[t.physical(t.index)].offsetLeft - track.offsetLeft;
      const end = track.scrollWidth - track.clientWidth;
      return { accepted: window.__accepted, page: t.pageOf(t.index), moving: t.moving, atTarget: Math.abs(track.scrollLeft - target) <= 1 || Math.abs(track.scrollLeft - end) <= 1 };
    });

    await expect.poll(async () => (await info()).moving, { timeout: 4000 }).toBe(false);
    await expect.poll(async () => (await info()).atTarget, { timeout: 4000 }).toBe(true);

    const s = await info();

    expect(s.accepted).toBeGreaterThanOrEqual(1);
    expect(s.accepted).toBeLessThan(4);
    await expect(slider.locator('.gr-slider-dot').nth(s.page)).toHaveAttribute('aria-current', 'true');
  }
});

test('свайп: индекс и точка переключаются до остановки прокрутки', async ({ page }) => {
  await page.goto(LAB);

  const slider = page.locator('#gr-lab-slider');
  const track = slider.locator('.gr-track');

  await slider.scrollIntoViewIfNeeded();
  await track.evaluate((el) => {
    window.__t = { change: null, end: null };
    el.addEventListener('griffin:change', () => { if (window.__t.change === null) window.__t.change = performance.now(); });
    el.addEventListener('scrollend', () => { if (window.__t.end === null) window.__t.end = performance.now(); });
    // «Палец» отпустили на 0.7 слайда: браузер сам доснапит ко второму.
    const real = [...el.children].filter((c) => !c.hasAttribute('data-gr-clone'));
    el.scrollTo({ left: real[0].offsetLeft - el.offsetLeft + (real[1].offsetLeft - real[0].offsetLeft) * 0.7, behavior: 'auto' });
  });

  await expect.poll(() => track.evaluate((el) => window.GriffinJS.instance(el.parentElement, 'slider').track.index), { timeout: 3000 }).toBe(1);
  await expect(slider.locator('.gr-slider-dot').nth(1)).toHaveAttribute('aria-current', 'true');

  const t = await track.evaluate(() => window.__t);
  if (t.end !== null) expect(t.change).toBeLessThanOrEqual(t.end);
});
