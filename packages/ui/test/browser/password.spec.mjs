// Пароль «показать / скрыть» — рецепт, не виджет (Этап 42d).
//
// Три строки на странице переключают type поля, aria-pressed и подпись
// кнопки. Что проверяется в браузере, а не на мок-DOM: смена type
// у поля с autocomplete="current-password" — в WebKit поле с
// автозаполнением ведёт себя иначе, и значение при переключении обязано
// остаться на месте на всех трёх движках; после переключения в поле
// можно печатать дальше.

import { test, expect } from '@playwright/test';

const PAGE = '/docs/patterns.html#forma-vhoda';

test('щелчок показывает пароль, второй прячет, значение на месте', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  const field = page.locator('#p-pass');
  const button = field.locator('xpath=following-sibling::button[1]');

  await field.fill('griffin-2026');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveText('Показать');

  await button.click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveText('Скрыть');
  await expect(field, 'смена type потеряла значение').toHaveValue('griffin-2026');

  // Печатать дальше можно — поле живое, а не пересозданное.
  await field.click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(field).toHaveValue('griffin-2026!');

  await button.click();
  await expect(field).toHaveAttribute('type', 'password');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveText('Показать');
  await expect(field).toHaveValue('griffin-2026!');
});

test('переключатель доступен с клавиатуры', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  const field = page.locator('#p-pass');
  const button = field.locator('xpath=following-sibling::button[1]');

  await field.fill('secret');
  // Фокус — программно: WebKit по умолчанию пропускает кнопки по Tab
  // (настройка macOS), а проверяется здесь активация пробелом.
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Space');
  await expect(field).toHaveAttribute('type', 'text');
  await expect(field).toHaveValue('secret');
});
