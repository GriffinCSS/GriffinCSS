// Мультивыбор в комбобоксе на полигоне (Этап 38g): теги из <select multiple>,
// выбор позиции добавляет тег и позицию, удаление тега снимает выбор,
// значение уходит в форму через тот же <select>. Без скрипта <select
// multiple> остаётся на экране и выбирается сам.

import { test, expect } from '@playwright/test';

const LAB = '/docs/griffinjs-lab.html';
const ROOT = '#gr-lab-combobox-multi';

const chosen = (page) => page.locator(`${ROOT} select`).evaluate((el) => Array.from(el.selectedOptions).map((o) => o.value));

test('мультивыбор: теги перед полем, выбор добавляет, крестик и Backspace снимают', async ({ page }) => {
  await page.goto(LAB);

  const root = page.locator(ROOT);
  const input = root.locator('input');
  const tags = root.locator('.gr-combobox-tag');
  const labels = root.locator('.gr-combobox-tag span');

  await expect(root.locator('select')).toBeHidden();
  await expect(labels).toHaveText(['Acer Aspire']);
  expect(await chosen(page)).toEqual(['Acer Aspire']);

  await input.click();
  await page.keyboard.type('air');
  await expect(root).toHaveAttribute('data-gr-state', 'open');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(labels).toHaveText(['Acer Aspire', 'AirPods']);
  expect(await chosen(page)).toEqual(['Acer Aspire', 'AirPods']);
  expect(await input.inputValue()).toBe('');
  await expect(root).toHaveAttribute('data-gr-state', 'ready');

  // Позиции нет в <select>: добавляется и выбирается.
  await page.keyboard.type('zen');
  await expect(root).toHaveAttribute('data-gr-state', 'open');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await chosen(page)).toEqual(['Acer Aspire', 'AirPods', 'Asus Zenbook']);
  await expect(tags).toHaveCount(3);

  // Крестик снимает выбор, фокус возвращается в поле.
  await tags.nth(0).locator('.gr-combobox-tag-remove').click();
  expect(await chosen(page)).toEqual(['AirPods', 'Asus Zenbook']);
  await expect(input).toBeFocused();

  // Backspace в пустом поле — последний тег; добавленная позиция уходит целиком.
  await page.keyboard.press('Backspace');
  expect(await chosen(page)).toEqual(['AirPods']);
  expect(await root.locator('select option').count()).toBe(2);
});

test('без griffinjs.js <select multiple> остаётся на экране и выбирается сам', async ({ page }) => {
  await page.route('**/griffinjs.js', (route) => route.abort());
  await page.goto(LAB);

  const select = page.locator(`${ROOT} select`);

  await expect(select).toBeVisible();
  await select.selectOption(['Acer Aspire', 'AirPods']);
  expect(await chosen(page)).toEqual(['Acer Aspire', 'AirPods']);
  expect(await page.locator('.gr-combobox-tag').count()).toBe(0);
});
