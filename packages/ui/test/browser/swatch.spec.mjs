// Образец цвета и плашка размера — радио в виде кружка и плашки (Этап 42e).
//
// Замер числами на трёх движках, а не снимком: кружок стоит по центру
// строки с подписью группы, текст плашки — по центру плашки; выбранный
// образец несёт кольцо (box-shadow) или заливку акцентом; фокус
// с клавиатуры виден на образце, а не на прозрачной радио; сама радио
// остаётся в потоке и фокусируемой — display: none снял бы клавиатуру
// и деградацию без :has().

import { test, expect } from '@playwright/test';

const PAGE = '/docs/ui-forms.html#vybor-cveta-i-razmera';

test('кружок стоит по центру строки, текст плашки — по центру плашки', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  // Подпись и образцы меряются одним вызовом: между двумя страница
  // успевает доехать до якоря, и разница координат была бы прокруткой.
  const swatches = await page.evaluate(() => {
    const label = document.getElementById('forms-demo-color-label').getBoundingClientRect();

    return [...document.querySelectorAll('input[name="forms-demo-color"] + .gr-swatch')].map((el) => {
      const r = el.getBoundingClientRect();

      return { w: r.width, h: r.height, dy: (r.top + r.bottom) / 2 - (label.top + label.bottom) / 2 };
    });
  });

  expect(swatches.length).toBe(4);

  swatches.forEach((s, i) => {
    expect(Math.abs(s.w - s.h), `образец ${i} не квадратный`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(s.dy), `образец ${i} не по центру строки`).toBeLessThanOrEqual(1);
  });

  const chips = await page.evaluate(() => [...document.querySelectorAll('input[name="forms-demo-size"] + .gr-swatch-tag')].map((el) => {
    const range = document.createRange();

    range.selectNodeContents(el);

    const text = range.getBoundingClientRect();
    const chip = el.getBoundingClientRect();

    return {
      x: (text.left + text.right) / 2 - (chip.left + chip.right) / 2,
      y: (text.top + text.bottom) / 2 - (chip.top + chip.bottom) / 2,
    };
  }));

  expect(chips.length).toBe(4);

  chips.forEach((offset, i) => {
    expect(Math.abs(offset.x), `текст плашки ${i} смещён по горизонтали`).toBeLessThanOrEqual(1);
    expect(Math.abs(offset.y), `текст плашки ${i} смещён по вертикали`).toBeLessThanOrEqual(1);
  });
});

test('выбранный образец несёт кольцо, выбранная плашка — заливку', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  const shadow = (locator) => locator.evaluate((el) => getComputedStyle(el).boxShadow);
  const black = page.locator('input[value="black"][name="forms-demo-color"] + .gr-swatch');
  const sand = page.locator('input[value="sand"][name="forms-demo-color"] + .gr-swatch');

  expect(await shadow(black)).not.toBe('none');
  expect(await shadow(sand)).toBe('none');

  // Щелчок по образцу — щелчок по label: выбор переходит, кольцо следом
  // (после перехода — box-shadow анимируется).
  await sand.click();
  await expect(page.locator('input[value="sand"][name="forms-demo-color"]')).toBeChecked();
  await expect.poll(() => shadow(sand)).not.toBe('none');
  await expect.poll(() => shadow(black)).toBe('none');

  const fill = (locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const m = page.locator('input[value="m"][name="forms-demo-size"] + .gr-swatch-tag');
  const l = page.locator('input[value="l"][name="forms-demo-size"] + .gr-swatch-tag');
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gr-color-accent').trim());

  expect(accent).not.toBe('');
  expect(await fill(m)).not.toBe(await fill(l));
  await l.click();
  await expect(page.locator('input[value="l"][name="forms-demo-size"]')).toBeChecked();
  await expect.poll(async () => (await fill(l)) !== (await fill(m))).toBe(true);
});

test('радио в потоке и фокусируема, фокус с клавиатуры виден на образце', async ({ page, browserName }) => {
  await page.goto(PAGE, { waitUntil: 'networkidle' });

  const radio = page.locator('input[value="black"][name="forms-demo-color"]');
  const swatch = radio.locator('xpath=following-sibling::span[1]');

  expect(await radio.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  expect(await radio.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

  // Фокус клавиатурой, а не focus(): программный фокус не даёт
  // :focus-visible в Chromium. Отправная точка — сегментный переключатель
  // выше; между ним и группой — кнопки вкладок примера, поэтому Tab
  // жмётся до попадания в радио. WebKit по умолчанию обходит радио
  // по Tab (настройка macOS) — там по всем контролам ходит Option+Tab.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

  await page.locator('input[name="demo-period"]:checked').focus();

  for (let i = 0; i < 10 && !(await radio.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press(tab);
  }

  await expect(radio).toBeFocused();

  const outline = await swatch.evaluate((el) => {
    const s = getComputedStyle(el);

    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });

  expect(outline.style).toBe('solid');
  expect(outline.width).toBeGreaterThan(0);

  // Стрелка переводит выбор на следующий образец — это даёт платформа.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[value="sand"][name="forms-demo-color"]')).toBeChecked();
});
