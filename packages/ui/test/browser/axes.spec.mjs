// Оси темы в сочетаниях (Этап 40): тема × стиль оформления × режим для
// слабовидящих × фирменный цвет. До этого этапа ни один тест не включал
// airy + low-vision или бренд + low-vision и не читал итоговую пару
// «заливка + чернила» — три критичные находки полевого отчёта по 0.23.1
// ломались молча, по одной оси всё было зелёным.
//
// Страница подменяется маршрутом, как в csp.spec.mjs: сценарию нужна
// разметка из пяти элементов и полный набор файлов библиотеки, а не
// страница документации с её собственным CSS. Переходы обнулены снаружи
// слоёв, чтобы читать конечные цвета, а не середину анимации.

import { test, expect } from '@playwright/test';

const PAGE = '/axes-fixture.html';

// Свой CSS страницы — вне слоёв, как его напишет пользователь: только так
// проверяется каскад «пользовательское объявление против блока режима».
const html = (own = '') => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Оси</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-styles.css">
<style>:root { --gr-transition: 0s; }</style>
<style>${own}</style>
</head><body>
<button class="gr-btn gr-btn-primary" id="btn" type="button">Кнопка</button>
<a class="gr-btn gr-btn-primary" id="link-btn" href="#">Ссылка-кнопка</a>
<a class="gr-btn gr-btn-link" id="link-like" href="#">Как ссылка</a>
<a class="gr-btn gr-btn-ghost" id="ghost" href="#">Призрак</a>
<p><a class="gr-link gr-link-quiet" id="quiet" href="#">Тихая ссылка</a></p>
<div class="gr-tabs gr-tabs-pills">
  <div class="gr-tablist">
    <a class="gr-tab" id="pill" aria-current="page" href="#">Активная</a>
    <a class="gr-tab" id="pill-idle" href="#">Другая</a>
  </div>
</div>
<p><a class="gr-swatch-tag" id="swatch-link" href="#m" aria-current="true">M</a> <a class="gr-swatch-tag" href="#l">L</a></p>
<nav class="gr-pagination" aria-label="Страницы"><a class="gr-page" href="#1">1</a><a class="gr-page" id="page-link" href="#2" aria-current="page">2</a></nav>
<nav class="gr-pagination gr-pagination-joined" aria-label="Страницы"><a class="gr-page" href="#1">1</a><a class="gr-page" id="page-joined" href="#2" aria-current="page">2</a></nav>
<span id="probe"></span>
</body></html>`;

async function open(page, own) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html(own),
  }));

  await page.goto(PAGE);
  await page.waitForFunction(() => document.readyState === 'complete');
}

// Оси ставятся атрибутами на <html> — ровно так, как их ставит рантайм
// темы. null снимает атрибут.
const axes = (page, { theme = null, style = null, a11y = null } = {}) => page.evaluate(([t, s, a]) => {
  const root = document.documentElement;
  const set = (name, value) => (value === null ? root.removeAttribute(name) : root.setAttribute(name, value));

  set('data-gr-theme', t);
  set('data-gr-style', s);
  set('data-gr-a11y', a);
}, [theme, style, a11y]);

const paint = (page, id) => page.evaluate((el) => {
  const cs = getComputedStyle(document.getElementById(el));

  return { color: cs.color, background: cs.backgroundColor, line: cs.textDecorationLine };
}, id);

// Готовый цвет по записи CSS: пробный элемент красится ею, и движок сам
// переводит hsl() в rgb(). Сравниваются строки одного и того же движка,
// поэтому разброс округления между Chrome, Firefox и WebKit не мешает.
const rendered = (page, css) => page.evaluate((value) => {
  const probe = document.getElementById('probe');

  probe.style.backgroundColor = value;

  return getComputedStyle(probe).backgroundColor;
}, css);

// --- контраст по WCAG 2.x --------------------------------------------------

const channels = (text) => text.match(/[\d.]+/g).slice(0, 3).map(Number);

function luminance([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;

    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(channels(a)), luminance(channels(b))].sort((x, y) => y - x);

  return (hi + 0.05) / (lo + 0.05);
}

const STYLES = ['standard', 'airy', 'strict', 'compact'];
const THEMES = ['light', 'dark'];

// --- 40a: стиль × режим — чернила на акценте ---------------------------------

for (const style of STYLES) {
  for (const theme of THEMES) {
    test(`главная кнопка читается: ${style} + ${theme} + low-vision`, async ({ page }) => {
      await open(page);
      await axes(page, { theme, style });

      // Контроль: без режима пара стиля сходится сама — иначе падение ниже
      // говорило бы не о сочетании осей, а о самом стиле.
      const plain = await paint(page, 'btn');

      expect(contrast(plain.color, plain.background), `${style}/${theme} без режима`).toBeGreaterThanOrEqual(4.5);

      await axes(page, { theme, style, a11y: 'low-vision' });

      const mode = await paint(page, 'btn');

      // 4,5 : 1 — порог AA для обычного текста; сам режим целится в 7 : 1
      // для текста на поверхности, а здесь белое на accent-max даёт больше.
      expect(contrast(mode.color, mode.background), `${style}/${theme} в режиме: ${mode.color} на ${mode.background}`)
        .toBeGreaterThanOrEqual(4.5);
    });
  }
}

// --- 40b: правила режима и компоненты с заливкой ------------------------------
//
// Правило [data-gr-a11y="low-vision"] a[href] стоит в слое компонентов
// намеренно — оно обязано побеждать .gr-link-quiet и .gr-link-inherit.
// Компонент с заливкой поэтому защищается сам, собственным правилом,
// а не переездом правила в ядро.

const token = (page, name) => page.evaluate(
  (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
  name,
);

// Выбранная плашка-ссылка и текущая страница пагинации — заливка акцентом,
// и правило режима весом (0,2,1) сильнее их состояния (0,2,0): без своего
// правила того же веса текст красился бы в цвет ссылки, а в режиме он
// совпадает с заливкой — 1,00 : 1.
for (const theme of THEMES) {
  test(`ссылки с заливкой читаются в режиме — кнопка, вкладка-таблетка, плашка, страница: ${theme}`, async ({ page }) => {
    await open(page);
    await axes(page, { theme, a11y: 'low-vision' });

    for (const id of ['link-btn', 'pill', 'swatch-link', 'page-link', 'page-joined']) {
      const p = await paint(page, id);

      expect(contrast(p.color, p.background), `${id}/${theme}: ${p.color} на ${p.background}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('тихая ссылка в режиме подчёркнута и в цвете ссылки — вживую', async ({ page }) => {
  await open(page);

  const plain = await paint(page, 'quiet');

  expect(plain.line).toBe('none');

  await axes(page, { a11y: 'low-vision' });

  const mode = await paint(page, 'quiet');

  expect(mode.line).toContain('underline');
  expect(mode.color).toBe(await rendered(page, await token(page, '--gr-color-link')));
});

test('щит не задел варианты: «как ссылка» остаётся ссылкой, призрак — в цвете текста', async ({ page }) => {
  await open(page);

  const like = await paint(page, 'link-like');
  const ghost = await paint(page, 'ghost');

  expect(like.line).toContain('underline');
  expect(like.color).toBe(await rendered(page, await token(page, '--gr-color-link')));
  expect(ghost.color).toBe(await rendered(page, await token(page, '--gr-color-text')));

  await axes(page, { a11y: 'low-vision' });

  // «Как ссылка» в режиме ведёт себя как ссылка: подчёркивание и цвет
  // ссылки — щит на неё не распространяется.
  const likeMode = await paint(page, 'link-like');
  const ghostMode = await paint(page, 'ghost');

  expect(likeMode.line).toContain('underline');
  expect(likeMode.color).toBe(await rendered(page, await token(page, '--gr-color-link')));

  // Призрак — кнопка без заливки, но кнопка: чернила варианта, без линии.
  expect(ghostMode.color).toBe(await rendered(page, await token(page, '--gr-color-text')));
  expect(ghostMode.line).toBe('none');
});

// --- 40c: бренд × режим × стиль ----------------------------------------------
//
// Рецепт из docs/theme.html, дословно и вне слоёв — как его напишет
// пользователь. Три пары на тему: -base (повседневный), -max (режим для
// слабовидящих), -soft (воздушный стиль) плюс чернила на пастели.
// Тёмные значения стоят дважды: для явного data-gr-theme="dark" и для
// auto под тёмной системной темой — у пользовательского CSS нет другого
// способа попасть в носитель, который выбирает медиазапрос.

const BRAND = {
  light: { base: '152, 60%, 32%', max: '152, 100%, 20%', soft: '152, 45%, 55%' },
  dark: { base: '152, 45%, 60%', max: '152, 80%, 75%', soft: '152, 40%, 65%' },
};

const NEW_RECIPE = `
:root {
  --gr-hsl-accent-base: ${BRAND.light.base};
  --gr-hsl-accent-base-hover: 152, 60%, 26%;
  --gr-hsl-accent-max: ${BRAND.light.max};
  --gr-hsl-accent-max-hover: 152, 100%, 14%;
  --gr-hsl-accent-soft: ${BRAND.light.soft};
  --gr-hsl-accent-soft-hover: 152, 45%, 47%;
  --gr-hsl-on-accent-soft: 152, 60%, 10%;
}

[data-gr-theme="dark"] {
  --gr-hsl-accent-base: ${BRAND.dark.base};
  --gr-hsl-accent-base-hover: 152, 45%, 70%;
  --gr-hsl-accent-max: ${BRAND.dark.max};
  --gr-hsl-accent-max-hover: 152, 80%, 85%;
  --gr-hsl-accent-soft: ${BRAND.dark.soft};
  --gr-hsl-accent-soft-hover: 152, 40%, 73%;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-gr-theme]),
  [data-gr-theme="auto"] {
    --gr-hsl-accent-base: ${BRAND.dark.base};
    --gr-hsl-accent-base-hover: 152, 45%, 70%;
    --gr-hsl-accent-max: ${BRAND.dark.max};
    --gr-hsl-accent-max-hover: 152, 80%, 85%;
    --gr-hsl-accent-soft: ${BRAND.dark.soft};
    --gr-hsl-accent-soft-hover: 152, 40%, 73%;
  }
}
`;

// Прежний рецепт: семантический триплет напрямую, вне слоёв.
const OLD_RECIPE = `
:root { --gr-hsl-accent: ${BRAND.light.base}; }
[data-gr-theme="dark"] { --gr-hsl-accent: ${BRAND.dark.base}; }
`;

const hsl = (triplet) => `hsl(${triplet})`;

for (const theme of THEMES) {
  test(`бренд: какую пару берёт ось — её забота (${theme})`, async ({ page }) => {
    await open(page, NEW_RECIPE);

    const expectAccent = async (label, triplet) => {
      const { background } = await paint(page, 'btn');

      expect(background, label).toBe(await rendered(page, hsl(triplet)));
    };

    await axes(page, { theme });
    await expectAccent('повседневный', BRAND[theme].base);

    await axes(page, { theme, a11y: 'low-vision' });
    await expectAccent('режим для слабовидящих → -max', BRAND[theme].max);

    // Пороги из рецепта: -max даёт 7 : 1 на поверхности режима, и чернила
    // режима на нём читаются.
    const mode = await paint(page, 'btn');
    const bg = await rendered(page, await token(page, '--gr-color-bg'));

    expect(contrast(mode.background, bg), 'accent-max к поверхности').toBeGreaterThanOrEqual(7);
    expect(contrast(mode.color, mode.background), 'чернила режима на accent-max').toBeGreaterThanOrEqual(4.5);

    await axes(page, { theme, style: 'airy' });
    await expectAccent('воздушный стиль → -soft', BRAND[theme].soft);

    const airy = await paint(page, 'btn');

    expect(contrast(airy.color, airy.background), 'on-accent-soft на пастели').toBeGreaterThanOrEqual(4.5);

    await axes(page, { theme, style: 'airy', a11y: 'low-vision' });
    await expectAccent('стиль и режим вместе → снова -max', BRAND[theme].max);
  });
}

test('бренд следует системной теме без атрибута', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, NEW_RECIPE);

  const { background } = await paint(page, 'btn');

  expect(background).toBe(await rendered(page, hsl(BRAND.dark.base)));
});

// Запись того, что ломал прежний рецепт и почему документация его больше
// не даёт: небезслойное объявление --gr-hsl-accent выигрывает у блока
// режима внутри слоя при любой специфичности — акцент остаётся
// повседневным там, где просили контрастный.
test('прежний рецепт отключал режим для слабовидящих — и это записано', async ({ page }) => {
  await open(page, OLD_RECIPE);
  await axes(page, { a11y: 'low-vision' });

  const { background } = await paint(page, 'btn');

  expect(background).toBe(await rendered(page, hsl(BRAND.light.base)));
  expect(background).not.toBe(await rendered(page, hsl(BRAND.light.max)));
});
