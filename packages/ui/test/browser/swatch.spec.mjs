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
  // выше; между ним и группой — второй переключатель с <legend>, строки
  // выбора с модификаторами (Этап 45: флажок, две ссылки в подписи, два
  // тумблера) и кнопки вкладок примера, поэтому Tab жмётся до попадания
  // в радио. WebKit по умолчанию обходит радио по Tab (настройка macOS) —
  // там по всем контролам ходит Option+Tab.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

  await page.locator('input[name="demo-period"]:checked').focus();

  for (let i = 0; i < 30 && !(await radio.evaluate((el) => el === document.activeElement)); i++) {
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

// --- Образец-ссылка -----------------------------------------------------------
//
// Значение варианта — ссылка на его адрес: без скрипта выбор идёт переходами,
// поисковик видит все варианты. Выбранное у ссылки — aria-current, фокус —
// на ней самой. Вид обязан совпадать с радио: сравнение по вычисленным
// стилям с соседней радио на той же странице. Стенд — маршрутом, только
// файлы библиотеки; переходы обнулены, чтобы читать конечные значения.

const LINKS = '/swatch-links-fixture.html';

// Фото варианта — не квадратное (96 × 64): object-fit: cover обязан
// заполнить квадрат образца, а не вписать картинку с полями.
const PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='64'%3E%3Crect width='96' height='64' fill='%23b06a4e'/%3E%3C/svg%3E";

// Подслой griffincss.app подчёркивает ссылки, как это делает тема для ссылок
// в тексте: он старше ресета, и плашка обязана снять подчёркивание сама.
const links = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Образцы-ссылки</title>
<style>
@layer griffincss.reset, griffincss.tokens, griffincss.core, griffincss.app, griffincss.ui, griffincss.utils, griffincss.style, griffincss.hidden;
@layer griffincss.app { a { text-decoration: underline; } }
</style>
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
<style>:root { --gr-transition: 0s; }</style>
</head><body>
<button type="button" id="start">Начало</button>
<p>
  <label class="gr-choice"><input class="gr-radio" type="radio" name="size" checked><span class="gr-swatch-tag" id="radio-tag">M</span></label>
  <label class="gr-choice"><input class="gr-radio" type="radio" name="size"><span class="gr-swatch-tag" id="radio-tag-idle">L</span></label>
  <label class="gr-choice"><input class="gr-radio" type="radio" name="color" checked aria-label="Красный"><span class="gr-swatch" id="radio-circle" style="--gr-swatch: #d9534f"></span></label>
  <label class="gr-choice"><input class="gr-radio" type="radio" name="color" aria-label="Синий"><span class="gr-swatch" id="radio-circle-idle" style="--gr-swatch: #3355cc"></span></label>
</p>
<p>
  <a class="gr-swatch-tag" id="link-tag" href="#m" aria-current="true">M</a>
  <a class="gr-swatch-tag" id="link-tag-idle" href="#l">L</a>
  <a class="gr-swatch-tag gr-line-through" id="link-tag-out" href="#xl">XL<span class="gr-sr-only">, нет в наличии</span></a>
  <a class="gr-swatch" id="link-circle" href="#red" aria-current="true" style="--gr-swatch: #d9534f"><span class="gr-sr-only">Красный</span></a>
  <a class="gr-swatch" id="link-circle-idle" href="#blue" style="--gr-swatch: #3355cc"><span class="gr-sr-only">Синий</span></a>
</p>
<p>
  <a class="gr-swatch" id="photo" href="#photo" aria-current="true" style="--gr-swatch-size: 3rem; --gr-swatch-radius: var(--gr-radius)"><img src="${PHOTO}" alt=""><span class="gr-sr-only">Терракота</span></a>
  <a class="gr-swatch" id="photo-round" href="#round" style="--gr-swatch-size: 3rem"><img src="${PHOTO}" alt=""><span class="gr-sr-only">Терракота</span></a>
</p>
</body></html>`;

async function openLinks(page) {
  await page.route(`**${LINKS}`, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: links }));
  await page.goto(LINKS);
}

const look = (page, id) => page.evaluate((el) => {
  const s = getComputedStyle(document.getElementById(el));

  return {
    shadow: s.boxShadow,
    background: s.backgroundColor,
    border: s.borderTopColor,
    color: s.color,
    outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
    offset: s.outlineOffset,
  };
}, id);

test('образец-ссылка с aria-current — как выбранная радио: кольцо у кружка, заливка у плашки', async ({ page }) => {
  await openLinks(page);

  const [radioTag, radioTagIdle, linkTag, linkTagIdle] = await Promise.all(
    ['radio-tag', 'radio-tag-idle', 'link-tag', 'link-tag-idle'].map((id) => look(page, id)),
  );

  expect(radioTag.background, 'контроль: выбранная радио-плашка не залита').not.toBe(radioTagIdle.background);
  expect(linkTag.background).toBe(radioTag.background);
  expect(linkTag.border).toBe(radioTag.border);
  expect(linkTag.color).toBe(radioTag.color);
  expect(linkTagIdle.background).toBe(radioTagIdle.background);

  const [radioCircle, linkCircle, linkCircleIdle] = await Promise.all(
    ['radio-circle', 'link-circle', 'link-circle-idle'].map((id) => look(page, id)),
  );

  expect(radioCircle.shadow, 'контроль: у выбранной радио нет кольца').not.toBe('none');
  expect(linkCircle.shadow).toBe(radioCircle.shadow);
  expect(linkCircleIdle.shadow).toBe('none');
});

test('плашка-ссылка сама снимает подчёркивание, зачёркивает её утилита', async ({ page }) => {
  await openLinks(page);

  const line = (id) => page.evaluate((el) => getComputedStyle(document.getElementById(el)).textDecorationLine, id);

  expect(await line('link-tag'), 'подчёркивание из подслоя дошло до выбранной плашки').toBe('none');
  expect(await line('link-tag-idle'), 'подчёркивание из подслоя дошло до плашки').toBe('none');

  // «Нет в наличии»: слой утилит старше компонентов — черта побеждает.
  expect(await line('link-tag-out')).toBe('line-through');
});

test('образец-ссылка: фокус с клавиатуры — кольцо на самом образце, как у радио', async ({ page, browserName }) => {
  await openLinks(page);

  // WebKit по умолчанию обходит ссылки и радио по Tab (настройка macOS) —
  // там по всем элементам ходит Option+Tab.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  const reach = async (selector) => {
    await page.locator('#start').focus();

    for (let i = 0; i < 12 && !(await page.evaluate((s) => document.activeElement === document.querySelector(s), selector)); i++) {
      await page.keyboard.press(tab);
    }
  };

  await reach('input[name="size"]:checked');
  await expect(page.locator('input[name="size"]:checked')).toBeFocused();

  const radio = await look(page, 'radio-tag');

  expect(radio.outline.startsWith('solid'), `контроль: у радио нет кольца фокуса — ${radio.outline}`).toBe(true);

  for (const id of ['link-tag', 'link-circle']) {
    await reach(`#${id}`);
    await expect(page.locator(`#${id}`)).toBeFocused();

    const link = await look(page, id);

    expect(link.outline, `${id}: кольцо фокуса не библиотечное`).toBe(radio.outline);
    expect(link.offset).toBe(radio.offset);
  }
});

// Размер и скругление кружка — токенами --gr-swatch-size и --gr-swatch-radius
// с прежними значениями по умолчанию; картинка внутри образца ложится
// на всю площадь внутри рамки и скругляется вместе с ним. Так собирается
// фото варианта: квадрат 3rem со скруглением --gr-radius, кольцо
// выбранного и фокус — от кружка.
test('фото-образец: размер и скругление токенами, картинка на всю площадь, умолчания прежние', async ({ page }) => {
  await openLinks(page);

  const box = (id) => page.evaluate((el) => {
    const node = document.getElementById(el);
    const r = node.getBoundingClientRect();
    const s = getComputedStyle(node);
    const img = node.querySelector('img');
    const i = img && img.getBoundingClientRect();
    const is = img && getComputedStyle(img);

    return {
      w: r.width,
      h: r.height,
      radius: s.borderTopLeftRadius,
      border: parseFloat(s.borderTopWidth),
      shadow: s.boxShadow,
      img: img && { w: i.width, h: i.height, dx: i.left - r.left, dy: i.top - r.top, radius: is.borderTopLeftRadius, fit: is.objectFit },
    };
  }, id);

  const token = await page.evaluate(() => {
    const probe = document.createElement('div');

    probe.style.borderRadius = 'var(--gr-radius)';
    document.body.append(probe);

    const value = getComputedStyle(probe).borderTopLeftRadius;

    probe.remove();

    return value;
  });

  // Без токенов — прежний кружок: 1.5rem и полное скругление.
  const plain = await box('link-circle-idle');

  expect(plain.w).toBeCloseTo(24, 1);
  expect(plain.h).toBeCloseTo(24, 1);
  expect(parseFloat(plain.radius)).toBeGreaterThanOrEqual(12);

  const photo = await box('photo');

  expect(photo.w).toBeCloseTo(48, 1);
  expect(photo.h).toBeCloseTo(48, 1);
  expect(photo.radius).toBe(token);
  expect(photo.shadow, 'у выбранного фото нет кольца').not.toBe('none');
  expect(photo.img.fit).toBe('cover');
  expect(photo.img.radius).toBe(photo.radius);
  expect(photo.img.w).toBeCloseTo(48 - 2 * photo.border, 1);
  expect(photo.img.h).toBeCloseTo(48 - 2 * photo.border, 1);
  expect(photo.img.dx).toBeCloseTo(photo.border, 1);
  expect(photo.img.dy).toBeCloseTo(photo.border, 1);

  // Только размер — круглое фото: скругление остаётся полным.
  const round = await box('photo-round');

  expect(round.w).toBeCloseTo(48, 1);
  expect(parseFloat(round.radius)).toBeGreaterThanOrEqual(24);
  expect(round.img.radius).toBe(round.radius);
});
