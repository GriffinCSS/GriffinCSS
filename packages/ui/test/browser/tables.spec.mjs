// Сортируемая таблица на полигоне: перестановка строк, круг состояний
// в aria-sort и клавиатура — то, чего мок-DOM не проверяет. Живой браузер
// нужен здесь по трём причинам: фокус на заголовке, порядок узлов после
// перестановки и Intl.Collator движка, а не Node.

import { test, expect } from '@playwright/test';

const LAB = '/docs/griffinjs-lab.html';
const TABLE = '#gr-lab-sortable';

const cities = (page) => page.locator(`${TABLE} tbody tr td:first-child`).allTextContents();
const head = (page, name) => page.locator(`${TABLE} thead th`, { hasText: name });

// Прокрутка, доведённая до конца. Фокус на заголовке в глубине длинной
// страницы браузер доводит плавно, и замер сразу после focus() поймал бы
// середину этой анимации, а не покой: у проверки «пробел не прокручивает»
// не было бы точки отсчёта.
async function still(page) {
  let before = -1;
  let now = await page.evaluate(() => window.scrollY);

  while (now !== before) {
    before = now;
    await page.waitForTimeout(150);
    now = await page.evaluate(() => window.scrollY);
  }

  return now;
}

test('щелчок сортирует, круг состояний замыкается на исходном порядке', async ({ page }) => {
  await page.goto(LAB);

  const initial = await cities(page);

  expect(initial).toEqual(['Пермь', 'Ёлкино', 'Азов', 'Яровое']);

  const city = head(page, 'Город');

  await city.click();
  await expect(city).toHaveAttribute('aria-sort', 'ascending');

  // Русский алфавит, а не коды символов: Ё стоит между А и Я, хотя
  // в Юникоде она идёт раньше обеих.
  expect(await cities(page)).toEqual(['Азов', 'Ёлкино', 'Пермь', 'Яровое']);

  await city.click();
  await expect(city).toHaveAttribute('aria-sort', 'descending');
  expect(await cities(page)).toEqual(['Яровое', 'Пермь', 'Ёлкино', 'Азов']);

  await city.click();
  await expect(city).toHaveAttribute('aria-sort', 'none');
  expect(await cities(page)).toEqual(initial);
});

test('числа и даты сравниваются значением, а не текстом ячейки', async ({ page }) => {
  await page.goto(LAB);

  // Сумма отформатирована для человека — «24 800 ₽»; сортировка идёт
  // по data-gr-sort-value, иначе пробел разрядов и знак валюты сделали бы
  // столбец текстовым. Данные подобраны так, что порядки расходятся:
  // по тексту коллатор сравнил бы 5, 24, 113 и 999 и дал Азов, Пермь,
  // Ёлкино, Яровое — то есть проверка отличает значение от совпадения.
  await head(page, 'Сумма').click();
  expect(await cities(page)).toEqual(['Яровое', 'Азов', 'Пермь', 'Ёлкино']);

  // Дата даёт ДРУГОЙ порядок, чем сумма: иначе проверка не отличала бы
  // разобранное значение от совпадения.
  await head(page, 'Дата').click();
  expect(await cities(page)).toEqual(['Ёлкино', 'Азов', 'Пермь', 'Яровое']);

  // Один столбец отсортирован — один и объявлен: у соседнего aria-sort
  // вернулся в «нет».
  await expect(head(page, 'Сумма')).toHaveAttribute('aria-sort', 'none');
  await expect(head(page, 'Дата')).toHaveAttribute('aria-sort', 'ascending');
});

test('клавиатура: заголовок в порядке обхода, Enter сортирует', async ({ page }) => {
  await page.goto(LAB);

  const city = head(page, 'Город');

  await city.focus();
  await expect(city).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(city).toHaveAttribute('aria-sort', 'ascending');

  // Пробел не прокручивает страницу под уехавшей таблицей.
  const scrolled = await still(page);

  await page.keyboard.press('Space');
  await expect(city).toHaveAttribute('aria-sort', 'descending');
  expect(await still(page)).toBe(scrolled);

  // Столбец действий сортируемым не объявлен: ни состояния, ни остановки Tab.
  const actions = head(page, 'Действия');

  await expect(actions).not.toHaveAttribute('aria-sort', /.*/);
  await expect(actions).not.toHaveAttribute('tabindex', /.*/);
});

test('без griffinjs.js таблица остаётся таблицей и ничего не обещает', async ({ page }) => {
  await page.route('**/griffinjs.js', (route) => route.abort());
  await page.goto(LAB);

  const city = head(page, 'Город');

  // Ни курсора, ни остановки Tab, ни перестановки: предлагать нажатие,
  // которое ничего не сделает, нельзя.
  await expect(city).not.toHaveAttribute('tabindex', /.*/);
  expect(await city.evaluate((el) => getComputedStyle(el).cursor)).toBe('auto');

  await city.click();
  expect(await cities(page)).toEqual(['Пермь', 'Ёлкино', 'Азов', 'Яровое']);
});
