// Пара ползунков и числовые поля в фасете цены (Этап 42a).
//
// Сегмент 14 в docs/patterns.html: пара «от — до» с параметром fields
// лежит поверх двух <input type="number">. Что здесь ловится и почему
// в браузере, а не на мок-DOM: ползунок в браузере сам приводит value
// к шагу и границам, и от этого зависит, что попадёт в поле; форма
// отправляется по-настоящему — в адресе должны быть два параметра цены,
// а не четыре; порядок при вводе наводится на change, и «9» по пути
// к «90000» не должна толкать вторую ручку — это видно только при наборе
// по символу.

import { test, expect } from '@playwright/test';

const PAGE = '/docs/patterns.html#katalog-s-fasetami';

test('ползунок пишет число в поле, поле двигает ползунок', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  const pair = page.locator('[data-gr-range^="fields"]');
  const from = pair.locator('input[type="range"]').nth(0);
  const to = pair.locator('input[type="range"]').nth(1);
  const min = page.locator('#p-price-min');
  const max = page.locator('#p-price-max');

  // База: поля пусты, ручки по полям стоят на краях.
  await expect(min).toHaveValue('');
  await expect(max).toHaveValue('');
  await expect(from).toHaveValue('0');
  await expect(to).toHaveValue('200000');

  // Клавиатура на ручке — движение ползунка, как и мышью: событие input.
  await from.focus();
  await page.keyboard.press('ArrowRight');
  await expect(from).toHaveValue('1000');
  await expect(min).toHaveValue('1000');
  await expect(max, 'ручку тронули — оба поля получают значения').toHaveValue('200000');

  // Число в поле «до» — ручка едет сразу.
  await max.fill('50000');
  await expect(to).toHaveValue('50000');
});

test('во время набора вторую ручку не толкает, порядок наводится на change', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  const pair = page.locator('[data-gr-range^="fields"]');
  const from = pair.locator('input[type="range"]').nth(0);
  const to = pair.locator('input[type="range"]').nth(1);
  const min = page.locator('#p-price-min');
  const max = page.locator('#p-price-max');

  await max.fill('50000');
  await max.press('Tab');
  await expect(to).toHaveValue('50000');

  // «9» по пути к «90000»: ручка «от» едет на каждый символ, а «до»
  // стоит на месте и поле «до» не переписывается, пока число не дописано.
  await min.click();
  await min.pressSequentially('90000');
  await expect(from).toHaveValue('90000');
  await expect(to).toHaveValue('50000');
  await expect(max).toHaveValue('50000');

  // Число дописано — уход фокуса даёт change, порядок наведён, поле «до»
  // получило толчок.
  await min.press('Tab');
  await expect(to).toHaveValue('90000');
  await expect(max).toHaveValue('90000');
});

test('форма отправляет два параметра цены, а не четыре', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  const pair = page.locator('[data-gr-range^="fields"]');
  const from = pair.locator('input[type="range"]').nth(0);

  await from.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#p-price-min')).toHaveValue('1000');

  await page.locator('form[action="#katalog-s-fasetami"] button[type="submit"]').click();
  await page.waitForURL(/price_min=/);

  const keys = await page.evaluate(() => [...new URL(location.href).searchParams.keys()].sort());

  expect(keys).toEqual(['brand', 'cat', 'price_max', 'price_min', 'sort']);
  expect(await page.evaluate(() => new URL(location.href).searchParams.get('price_min'))).toBe('1000');
  expect(await page.evaluate(() => new URL(location.href).searchParams.get('price_max'))).toBe('200000');
});

test('без griffinjs.js фасет цены — два рабочих числовых поля', async ({ page }) => {
  await page.route('**/griffinjs.js', (route) => route.abort());
  await page.goto(PAGE);

  expect(await page.evaluate(() => typeof window.GriffinJS)).toBe('undefined');

  const min = page.locator('#p-price-min');

  await min.fill('3000');
  await page.locator('form[action="#katalog-s-fasetami"] button[type="submit"]').click();
  await page.waitForURL(/price_min=3000/);

  const keys = await page.evaluate(() => [...new URL(location.href).searchParams.keys()].sort());

  expect(keys).toEqual(['brand', 'cat', 'price_max', 'price_min', 'sort']);
});
