// Окна и комбобокс на полигоне: data-gr-open, блокировка прокрутки под
// окном, стек, hash с кнопкой «Назад», ajax-содержимое; комбобокс —
// список по вводу, клавиатура с aria-activedescendant, выбор Enter.

import { test, expect } from '@playwright/test';

const LAB = '/docs/griffinjs-lab.html';

async function open(page) {
  await page.goto(LAB);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
}

test.describe('окна', () => {
  test('data-gr-open открывает модально, прокрутка под окном заблокирована, Esc закрывает и снимает', async ({ page }) => {
    await open(page);

    const modal = page.locator('#gr-lab-modal');
    const html = page.locator('html');

    await page.locator('[data-gr-open="#gr-lab-modal"]').click();
    await expect(modal).toHaveJSProperty('open', true);
    await expect(modal).toHaveAttribute('data-gr-state', 'open');
    await expect(html).toHaveAttribute('data-gr-state', 'locked');
    await expect(html).toHaveCSS('overflow', 'hidden');
    expect(await page.evaluate(() => document.getElementById('gr-lab-modal').matches(':modal'))).toBe(true);

    // Стек: панель поверх окна, закрытие панели оставляет окно и блокировку.
    await modal.locator('[data-gr-open="#gr-lab-drawer"]').click();
    const drawer = page.locator('#gr-lab-drawer');
    await expect(drawer).toHaveJSProperty('open', true);
    expect(await page.evaluate(() => window.GriffinJS.dialog.stack().map((d) => d.id))).toEqual(['gr-lab-modal', 'gr-lab-drawer']);

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveJSProperty('open', false);
    await expect(modal).toHaveJSProperty('open', true);
    await expect(html).toHaveAttribute('data-gr-state', 'locked');

    await page.keyboard.press('Escape');
    await expect(modal).toHaveJSProperty('open', false);
    await expect(modal).toHaveAttribute('data-gr-state', 'ready');
    await expect(html).not.toHaveAttribute('data-gr-state', 'locked');
  });

  test('hash: панель пишет #id, «Назад» закрывает её; ajax-окно грузит содержимое один раз', async ({ page }) => {
    await open(page);

    const drawer = page.locator('#gr-lab-drawer');

    await page.locator('.demo-block [data-gr-open="#gr-lab-drawer"]').click();
    await expect(drawer).toHaveJSProperty('open', true);
    expect(await page.evaluate(() => location.hash)).toBe('#gr-lab-drawer');

    await page.goBack();
    await expect(drawer).toHaveJSProperty('open', false);
    expect(await page.evaluate(() => location.hash)).toBe('');

    const ajax = page.locator('#gr-lab-ajax');
    await page.locator('[data-gr-open="#gr-lab-ajax"]').click();
    await expect(ajax).toHaveJSProperty('open', true);
    await expect(ajax.locator('[data-gr-content]')).toContainText('приехало с сервера');
    await expect(ajax).toHaveAttribute('data-gr-state', 'open');
    await page.keyboard.press('Escape');
    await expect(ajax).toHaveJSProperty('open', false);
  });
});

test('комбобокс: список по вводу, ↓ и Enter выбирают, Esc закрывает без стирания', async ({ page }) => {
  await open(page);

  const root = page.locator('#gr-lab-combobox');
  const input = root.locator('input');
  const list = root.locator('[role="listbox"]');

  await expect(input).toHaveAttribute('role', 'combobox');
  await input.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await input.click();
  await input.type('a');

  await expect(root).toHaveAttribute('data-gr-state', 'open');
  await expect(list).toBeVisible();
  await expect(list.locator('[role="option"]')).toHaveCount(5);
  await expect(list.locator('[role="presentation"]').first()).toHaveText('Ноутбуки');

  await page.keyboard.press('ArrowDown');
  const first = list.locator('[role="option"]').first();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', await first.getAttribute('id'));
  await expect(first.locator('mark')).toHaveText('A');

  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-gr-state', 'ready');
  await expect(input).toHaveValue('a');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('Asus Zenbook');
  await expect(root).toHaveAttribute('data-gr-state', 'ready');

  await input.fill('zzz');
  await expect(list.locator('[role="status"]')).toHaveText('Ничего не найдено');
});

test('без griffinjs.js: поле комбобокса — обычное поле, окна закрываются формой', async ({ page }) => {
  await page.route('**/griffinjs.js', (route) => route.abort());
  await open(page);

  const input = page.locator('#gr-lab-combobox input');
  await expect(input).not.toHaveAttribute('role', 'combobox');
  await input.fill('a');
  await expect(page.locator('#gr-lab-combobox [role="listbox"]')).toHaveCount(0);

  const modal = page.locator('#gr-lab-modal');
  await modal.evaluate((d) => d.showModal());
  await expect(modal).toHaveJSProperty('open', true);
  await modal.locator('form[method="dialog"] button').first().click();
  await expect(modal).toHaveJSProperty('open', false);
});
