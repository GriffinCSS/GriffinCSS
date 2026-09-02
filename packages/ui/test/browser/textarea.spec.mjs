// Автовысота многострочного поля (Этап 38g): field-sizing: content
// в модуле .gr-textarea, ноль байт JS. Там, где движок свойство знает,
// поле растёт вместе с текстом от min-block-size; где не знает —
// правило отброшено, высота прежняя, ручка resize на месте. Обе ветки
// проверяются на одной странице: какая из них у движка, говорит он сам.

import { test, expect } from '@playwright/test';

const PAGE = '/docs/ui-forms.html';
const AREA = '#demo-about';

test('textarea: растёт по содержимому там, где есть field-sizing, и держит высоту там, где нет', async ({ page }) => {
  await page.goto(PAGE);

  const area = page.locator(AREA);
  const supported = await page.evaluate(() => CSS.supports('field-sizing', 'content'));
  const before = (await area.boundingBox()).height;

  await area.fill(Array.from({ length: 8 }, (_, i) => `строка ${i + 1}`).join('\n'));

  const after = (await area.boundingBox()).height;

  if (supported) {
    expect(after).toBeGreaterThan(before + 40);
  } else {
    expect(after).toBe(before);
  }

  // Ручка остаётся: тянуть поле можно только по вертикали.
  expect(await area.evaluate((el) => getComputedStyle(el).resize)).toBe('vertical');
});
