// Полигон GriffinJS: страница обязана работать и со скриптом, и без него.
// Первый тест этапа — каркас: глобал, версия, чистая консоль, и та же
// страница с заблокированным griffinjs.js остаётся страницей.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const LAB = '/docs/griffinjs-lab.html';
const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

test('слой подключён: window.GriffinJS с версией пакета, консоль чистая', async ({ page }) => {
  const errors = [];

  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(LAB);

  await expect(page.locator('#gr-lab-status')).toHaveText(`GriffinJS v${VERSION}`);
  expect(await page.evaluate(() => window.GriffinJS.version)).toBe(VERSION);
  expect(await page.evaluate(() => Object.keys(window.GriffinJS.widgets))).toEqual(['track', 'slider', 'gallery', 'parallax', 'megamenu', 'dropdown', 'tooltip', 'dialog', 'combobox']);
  expect(errors).toEqual([]);
});

test('без griffinjs.js полигон остаётся рабочей страницей', async ({ page }) => {
  // Скрипт не грузится — как у читателя, который не стал его подключать.
  await page.route('**/griffinjs.js', (route) => route.abort());
  await page.goto(LAB);

  expect(await page.evaluate(() => typeof window.GriffinJS)).toBe('undefined');
  await expect(page.locator('#gr-lab-status')).toHaveText('griffinjs.js не подключён');

  // База без JS: scroll-snap-дорожка листается средствами браузера.
  const track = page.locator('[data-gr-lab-track]');

  await expect(track).toBeVisible();
  expect(await track.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});
