// Матрица приёмки (21g): все страницы слоя с чистой консолью — со скриптом
// и без него; полигон в RTL, в тёмной теме и в режиме для слабовидящих:
// стрелки дорожки зеркалятся, панели верхнего слоя ложатся к нужному краю,
// состояния виджетов не зависят от темы.

import { test, expect } from '@playwright/test';

const PAGES = [
  '/docs/griffinjs.html', '/docs/griffinjs-slides.html', '/docs/griffinjs-parallax.html',
  '/docs/griffinjs-menus.html', '/docs/griffinjs-overlays.html', '/docs/griffinjs-architecture.html',
  '/docs/griffinjs-lab.html', '/docs/ui-overlays.html', '/docs/ui-nav.html',
];

// Заблокированный самим тестом griffinjs.js Chromium честно записывает
// в консоль как ошибку загрузки — это не ошибка страницы.
const OWN_ABORT = /ERR_FAILED|griffinjs\.js/;

function watch(page) {
  const errors = [];

  page.on('console', (m) => { if (m.type() === 'error' && !OWN_ABORT.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  return errors;
}

for (const path of PAGES) {
  test(`консоль чистая: ${path}`, async ({ page }) => {
    const errors = watch(page);

    await page.goto(path);
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test(`страница открывается с начала: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test(`консоль чистая без griffinjs.js: ${path}`, async ({ page }) => {
    const errors = watch(page);

    await page.route('**/griffinjs.js', (route) => route.abort());
    await page.goto(path);
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
}

async function lab(page, prepare, query = '') {
  await page.goto('/docs/griffinjs-lab.html' + query);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  if (prepare) await page.evaluate(prepare);
}

test('RTL: стрелки дорожки зеркальны, popover-панель прижата к концу строки, панель выезжает слева', async ({ page }) => {
  await lab(page, null, '?dir=rtl');

  const track = page.locator('[data-gr-lab-track]');
  const index = () => page.evaluate(() => window.GriffinJS.instance(document.querySelector('[data-gr-lab-track]'), 'track').index);

  await track.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(index).toBe(1);
  await page.keyboard.press('ArrowRight');
  await expect.poll(index).toBe(0);

  const root = page.locator('#gr-lab-dd-popover');
  const button = root.locator('button').first();
  await button.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await button.click();
  await expect(root.locator('[popover]')).toBeVisible();
  await expect.poll(async () => {
    const [b, p] = await root.evaluate((el) => [el.firstElementChild, el.lastElementChild].map((n) => n.getBoundingClientRect().toJSON()));
    return Math.abs(p.right - b.right) <= 1 && p.y >= b.bottom;
  }).toBe(true);
  await page.keyboard.press('Escape');

  await page.locator('.demo-block [data-gr-open="#gr-lab-drawer"]').click();
  const drawer = page.locator('#gr-lab-drawer');
  await expect(drawer).toHaveJSProperty('open', true);
  // Панель выезжает переходом — ждём конца.
  await expect.poll(async () => (await drawer.boundingBox()).x).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
});

for (const [name, prepare] of [
  ['тёмная тема', () => window.Griffincss.theme.set('dark')],
  ['режим для слабовидящих', () => window.Griffincss.theme.a11y('contrast')],
]) {
  test(`${name}: виджеты живы, состояния те же`, async ({ page }) => {
    const errors = watch(page);

    await lab(page, prepare);

    await expect(page.locator('#gr-lab-slider')).toHaveAttribute('data-gr-state', /playing|paused|ready/);
    await expect(page.locator('#gr-lab-megamenu')).toHaveAttribute('data-gr-state', 'ready');

    const first = page.locator('#gr-lab-megamenu details.gr-megamenu-item').first();
    await first.locator('summary').focus();
    await page.keyboard.press('ArrowDown');
    await expect(first).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');

    await page.locator('[data-gr-open="#gr-lab-modal"]').click();
    await expect(page.locator('#gr-lab-modal')).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('');
    expect(errors).toEqual([]);
  });
}
