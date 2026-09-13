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

// Строка подсказки карточкой (Этап 39c): рецепт из docs собран утилитами
// поверх .gr-combobox-option, ни одного нового класса. Проверяется ЗАМЕРОМ,
// а не снимком: у строки свои отступы и минимальная высота, и картинка
// внутри может их перебить — на каждом движке по-своему.

const DOCS = '/docs/griffinjs-overlays.html';
const RICH = '#ov-combobox-rich';

test('строка подсказки карточкой: картинка, категория и цена держат высоту и выравнивание', async ({ page }) => {
  await page.goto(DOCS);

  const root = page.locator(RICH);
  const input = root.locator('input');

  await input.pressSequentially('a');

  const options = root.locator('.gr-combobox-option');

  await expect(options).toHaveCount(5);

  const first = options.first();

  // Все прямоугольники снимаются одним заходом: список живой, и четыре
  // отдельных замера могут прийтись на разные его состояния.
  const { line, image, price, list } = await first.evaluate((li) => {
    const box = (el) => {
      const r = el.getBoundingClientRect();

      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };

    return {
      line: box(li),
      image: box(li.querySelector('img')),
      price: box(li.querySelector('span.gr-ms-auto')),
      list: box(li.closest('.gr-combobox-list')),
    };
  });

  // Картинка ровно та, что заказана разметкой: 40×40 без дрожания списка.
  expect(image.width).toBe(40);
  expect(image.height).toBe(40);

  // Строка не ниже картинки и не выросла вдвое: min-block-size компонента
  // и отступы остались на месте, картинка их не перебила.
  expect(line.height).toBeGreaterThanOrEqual(40);
  expect(line.height).toBeLessThan(80);

  // Центры картинки и строки совпадают — это и есть gr-flex-items-center.
  expect(Math.abs((image.y + image.height / 2) - (line.y + line.height / 2))).toBeLessThanOrEqual(1);

  // Цена у конца строки: между её краем и краем строки — только отступ.
  const tail = line.x + line.width - (price.x + price.width);

  expect(tail).toBeGreaterThan(0);
  expect(tail).toBeLessThanOrEqual(24);

  // Длинные названия не растягивают список: строка не шире своего списка.
  expect(line.width).toBeLessThanOrEqual(list.width + 1);

  // Подсветка нарисована рецептом, а не слоем, — и она на месте.
  await expect(first.locator('mark').first()).toHaveText('A');

  // Клавиатура и aria-activedescendant работают как на простой строке.
  await input.press('ArrowDown');
  expect(await input.getAttribute('aria-activedescendant')).toBe(await first.getAttribute('id'));
  await expect(first).toHaveAttribute('aria-selected', 'true');

  await input.press('ArrowDown');
  expect(await input.getAttribute('aria-activedescendant')).toBe(await options.nth(1).getAttribute('id'));

  await input.press('Enter');
  expect(await input.inputValue()).toBe('Asus Zenbook 14');
});

// Свободные теги (Этап 42f): Enter на тексте, которого нет в выдаче,
// создаёт тег; Enter на активной позиции по-прежнему берёт позицию.
test('free: Enter на своём слове создаёт тег, на активной позиции — берёт позицию', async ({ page }) => {
  await page.goto('/docs/griffinjs-overlays.html', { waitUntil: 'networkidle' });

  const root = page.locator('#ov-combobox-free');
  const input = root.locator('input');
  const labels = root.locator('.gr-combobox-tag span');
  const values = () => root.locator('select').evaluate((el) => Array.from(el.selectedOptions).map((o) => o.value));

  await expect(labels).toHaveText(['ноутбук']);

  await input.click();
  await page.keyboard.type('react');
  await page.keyboard.press('Enter');
  await expect(labels).toHaveText(['ноутбук', 'react']);
  expect(await values()).toEqual(['ноутбук', 'react']);
  expect(await input.inputValue()).toBe('');

  // Подсказка активна — Enter берёт её, а не набранный префикс.
  await page.keyboard.type('нау');
  await expect(root).toHaveAttribute('data-gr-state', 'open');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(labels).toHaveText(['ноутбук', 'react', 'наушники']);

  // Повтор своего слова дубликата не даёт.
  await page.keyboard.type('react');
  await page.keyboard.press('Enter');
  await expect(labels).toHaveText(['ноутбук', 'react', 'наушники']);
});
