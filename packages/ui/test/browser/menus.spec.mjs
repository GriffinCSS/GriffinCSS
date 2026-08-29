// Семейство выпадающего на полигоне: мегаменю (клавиатура WAI-ARIA
// disclosure navigation, наведение, ajax-панель, одна открытая),
// дропдаун (позиция popover-панели, роли, Esc) и подсказка в верхнем
// слое. Плюс прогон без скрипта: <details> раскрываются сами.

import { test, expect } from '@playwright/test';

const LAB = '/docs/griffinjs-lab.html';

// Полигон открывается без плавной прокрутки (её включает ресет ядра):
// Playwright перед каждым действием ждёт покоя элемента, а хвост плавной
// прокрутки по пикселю на кадр под нагрузкой тянется дольше таймаута —
// действия зависают, щелчки попадают мимо. Поведение виджетов от этого
// не зависит.
async function open(page) {
  await page.goto(LAB);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
}

const activeText = (page) => page.evaluate(() => (document.activeElement.textContent || '').trim());

// Наведение «как у читателя»: мгновенная прокрутка к элементу и движение
// указателя к его центру. locator.hover() тут не годится: у доксайта плавная
// прокрутка, и Playwright, не дождавшись покоя элемента, повторяет
// scrollIntoView с другим выравниванием уже после открытия панели —
// страница уезжает, заголовок уходит из-под курсора.
async function hover(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
}
const activeTag = (page) => page.evaluate(() => document.activeElement.tagName);

test.describe('мегаменю', () => {
  test('клавиатура: ↓ открывает и ведёт в панель, Esc закрывает и возвращает фокус, → по ряду', async ({ page }) => {
    await open(page);

    const items = page.locator('#gr-lab-megamenu details.gr-megamenu-item');
    const first = items.nth(0);
    const summary = first.locator('summary');

    await summary.focus();
    await page.keyboard.press('ArrowDown');

    await expect(first).toHaveJSProperty('open', true);
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => !!document.activeElement.closest('.gr-megamenu-panel'))).toBe(true);
    expect(await activeText(page)).toBe('Ноутбуки');

    await page.keyboard.press('ArrowDown');
    expect(await activeText(page)).toBe('Планшеты');

    await page.keyboard.press('Escape');
    await expect(first).toHaveJSProperty('open', false);
    expect(await activeTag(page)).toBe('SUMMARY');
    expect(await activeText(page)).toBe('Каталог');

    await page.keyboard.press('ArrowRight');
    expect(await activeText(page)).toBe('Бренды');
    await page.keyboard.press('End');
    expect(await activeText(page)).toBe('Акции');
    await page.keyboard.press('ArrowRight');
    expect(await activeText(page)).toBe('Каталог');
  });

  test('наведение: открывает с задержкой, одна панель на полосу, ajax-панель грузится, уход закрывает', async ({ page }) => {
    await open(page);

    const bar = page.locator('#gr-lab-megamenu');
    const items = bar.locator('details.gr-megamenu-item');
    const first = items.nth(0);
    const second = items.nth(1);

    await hover(page, first.locator('summary'));
    await expect(first).toHaveJSProperty('open', true);

    // Панель во всю ширину полосы.
    const barBox = await bar.boundingBox();
    const panelBox = await first.locator('.gr-megamenu-panel').boundingBox();
    expect(Math.abs(panelBox.width - barBox.width)).toBeLessThanOrEqual(1);
    expect(panelBox.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 1);

    await hover(page, second.locator('summary'));
    await expect(second).toHaveJSProperty('open', true);
    await expect(first).toHaveJSProperty('open', false);
    await expect(second).toHaveAttribute('data-gr-state', 'ready');
    await expect(second.locator('.gr-megamenu-panel')).toContainText('загружена с сервера');

    await hover(page, page.locator('#gr-lab-status'));
    await expect(second).toHaveJSProperty('open', false);
  });
});

test.describe('дропдаун', () => {
  test('popover-панель ложится под кнопку по началу строки; Esc прячет', async ({ page }) => {
    await open(page);

    const root = page.locator('#gr-lab-dd-popover');
    const button = root.locator('button').first();
    const panel = root.locator('[popover]');

    // Кнопка — в середине экрана: у нижнего края панель честно
    // перевернулась бы вверх, а проверяется здесь положение «снизу».
    await button.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await button.click();
    await expect(panel).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    // Оба прямоугольника — одним вызовом, чтобы между замерами страница
    // не успела прокрутиться. Допуск по вертикали — на переход появления
    // (панель в ui выезжает сдвигом на половину зазора).
    await expect.poll(async () => {
      const [b, p] = await root.evaluate((el) => [el.firstElementChild, el.lastElementChild].map((n) => n.getBoundingClientRect().toJSON()));
      return Math.abs(p.y - (b.y + b.height + 4)) <= 5 && Math.abs(p.x - b.x) <= 1;
    }).toBe(true);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('<details>: роли меню, ↓ ведёт в меню, Esc закрывает и возвращает фокус', async ({ page }) => {
    await open(page);

    const root = page.locator('#gr-lab-dd-details');
    const summary = root.locator('summary');

    await expect(summary).toHaveAttribute('aria-haspopup', 'menu');
    await expect(root.locator('ul')).toHaveAttribute('role', 'menu');
    await expect(root.locator('.gr-menu-item').first()).toHaveAttribute('role', 'menuitem');

    await summary.focus();
    await page.keyboard.press('ArrowDown');
    await expect(root).toHaveJSProperty('open', true);
    expect(await activeText(page)).toBe('Переименовать');

    await page.keyboard.press('End');
    expect(await activeText(page)).toBe('Удалить');

    await page.keyboard.press('Escape');
    await expect(root).toHaveJSProperty('open', false);
    expect(await activeTag(page)).toBe('SUMMARY');
  });
});

test('подсказка в верхнем слое: над якорем, не обрезана, Esc прячет', async ({ page }) => {
  await open(page);

  const root = page.locator('#gr-lab-tip');
  const button = root.locator('button');
  const tip = root.locator('[role="tooltip"]');

  await expect(tip).toHaveAttribute('popover', 'manual');

  await hover(page, button);
  await expect(tip).toBeVisible();
  await expect(root).toHaveAttribute('data-gr-state', 'open');

  // Содержимое подсказки появляется с переходом; ждём, пока она вырастет
  // до текста, и сверяем положение одним замером.
  await expect.poll(async () => {
    const [b, t] = await root.evaluate((el) => [el.firstElementChild, el.lastElementChild].map((n) => n.getBoundingClientRect().toJSON()));
    return t.height > 10 && t.y + t.height <= b.y;
  }).toBe(true);

  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('без griffinjs.js: <details> дропдауна и мегаменю раскрываются сами', async ({ page }) => {
  await page.route('**/griffinjs.js', (route) => route.abort());
  await open(page);

  const dd = page.locator('#gr-lab-dd-details');
  await dd.locator('summary').click();
  await expect(dd).toHaveJSProperty('open', true);
  await expect(dd.locator('summary')).not.toHaveAttribute('aria-haspopup', 'menu');

  const item = page.locator('#gr-lab-megamenu details.gr-megamenu-item').first();
  await item.locator('summary').click();
  await expect(item).toHaveJSProperty('open', true);
  await expect(item.locator('.gr-megamenu-panel')).toBeVisible();
});
