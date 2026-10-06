// Форматированный текст: .gr-prose на обёртке HTML из редактора, у детей
// которого классов нет. Проверяется вычисленным стилем в трёх движках —
// со сбросом и без него: ресет подключают не все, а без него у абзаца
// поля браузера, с ним — ноль. Класс обязан дать один и тот же ритм.

import { test, expect } from '@playwright/test';

const PAGE = '/prose-fixture.html';

const body = `
<div id="prose" class="gr-prose">
  <p id="p1">Первый абзац.</p>
  <p id="p2">Второй абзац со <a id="bare" href="#x">ссылкой</a> и <a id="btn" class="gr-btn" href="#y">кнопкой</a>.</p>
  <h2 id="h2">Подзаголовок</h2>
  <p id="after-h2">Абзац под подзаголовком.</p>
  <ul id="ul"><li id="li1">Пункт</li><li id="li2">Пункт<ul id="ul2"><li>Вложенный</li></ul></li></ul>
  <ol id="ol"><li>Первый</li></ol>
  <blockquote id="quote"><p id="q1">Цитата.</p><p id="q2">Её второй абзац.</p></blockquote>
  <p id="util" class="gr-mt-0">Абзац с утилитой.</p>
  <hr id="hr">
  <table id="bare-table"><thead><tr><th id="bth">Параметр</th><th>Значение</th></tr></thead>
    <tbody><tr><td id="btd">Вес</td><td>1,2 кг</td></tr></tbody></table>
  <table id="cls-table" class="gr-table"><thead><tr><th>Параметр</th><th>Значение</th></tr></thead>
    <tbody><tr><td>Вес</td><td>1,2 кг</td></tr></tbody></table>
  <ul id="menu" class="gr-menu"><li><a class="gr-menu-item" href="#m">Пункт меню</a></li></ul>
  <p id="last">Последний абзац.</p>
</div>
<table id="ref-table" class="gr-table"><thead><tr><th id="rth">Параметр</th><th>Значение</th></tr></thead>
  <tbody><tr><td id="rtd">Вес</td><td>1,2 кг</td></tr></tbody></table>
<a id="ref-link" class="gr-link" href="#z">эталон</a>
<p id="measure" class="gr-max-w-prose">Мера строки.</p>
<span id="ch65" style="display:inline-block;inline-size:65ch"></span>`;

const page = (reset) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Проза</title>
${reset ? '<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">' : ''}
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
</head><body>${body}</body></html>`;

async function open(pw, reset) {
  await pw.setViewportSize({ width: 1024, height: 900 });
  await pw.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: page(reset),
  }));
  await pw.goto(PAGE);
}

const px = (value) => parseFloat(value);

for (const reset of [true, false]) {
  const label = reset ? 'со сбросом' : 'без сброса';

  test(`ритм ${label}: поле только между соседями, подзаголовок ближе к своему тексту`, async ({ page: pw }) => {
    await open(pw, reset);

    const m = await pw.evaluate(() => {
      const cs = (id) => getComputedStyle(document.getElementById(id));

      return {
        gap: getComputedStyle(document.documentElement).getPropertyValue('--gr-gap'),
        p1Top: cs('p1').marginBlockStart,
        p2Top: cs('p2').marginBlockStart,
        h2Top: cs('h2').marginBlockStart,
        afterH2: cs('after-h2').marginBlockStart,
        lastBottom: cs('last').marginBlockEnd,
        q2Top: cs('q2').marginBlockStart,
        q1Top: cs('q1').marginBlockStart,
        util: cs('util').marginBlockStart,
      };
    });

    expect(px(m.p1Top)).toBe(0);
    expect(px(m.lastBottom)).toBe(0);
    expect(px(m.p2Top)).toBeGreaterThan(0);
    expect(px(m.h2Top)).toBeGreaterThan(px(m.p2Top));
    expect(px(m.afterH2)).toBeGreaterThan(0);
    expect(px(m.afterH2)).toBeLessThan(px(m.p2Top));
    // Абзацы внутри цитаты — тот же ритм, первый без поля.
    expect(px(m.q1Top)).toBe(0);
    expect(px(m.q2Top)).toBe(px(m.p2Top));
    // Утилита на ребёнке сильнее прозы.
    expect(px(m.util)).toBe(0);
  });

  test(`списки, цитата, ссылка, разделитель ${label}`, async ({ page: pw }) => {
    await open(pw, reset);

    const m = await pw.evaluate(() => {
      const cs = (id) => getComputedStyle(document.getElementById(id));

      return {
        ul: cs('ul').listStyleType,
        ul2: cs('ul2').listStyleType,
        ol: cs('ol').listStyleType,
        ulPad: cs('ul').paddingInlineStart,
        li2Top: cs('li2').marginBlockStart,
        ul2Top: cs('ul2').marginBlockStart,
        p2Top: cs('p2').marginBlockStart,
        menuStyle: cs('menu').listStyleType,
        menuPad: cs('menu').paddingInlineStart,
        quoteLine: cs('quote').borderInlineStartWidth,
        quoteLineStyle: cs('quote').borderInlineStartStyle,
        quoteMargin: cs('quote').marginInlineStart,
        quoteStyle: cs('quote').fontStyle,
        bareColor: cs('bare').color,
        bareLine: cs('bare').textDecorationLine,
        refColor: cs('ref-link').color,
        btnLine: cs('btn').textDecorationLine,
        hrTop: cs('hr').borderBlockStartWidth,
        hrStyle: cs('hr').borderBlockStartStyle,
        hrBottom: cs('hr').borderBlockEndWidth,
      };
    });

    expect(m.ul).toBe('disc');
    expect(m.ul2).toBe('circle');
    expect(m.ol).toBe('decimal');
    expect(px(m.ulPad)).toBeGreaterThan(0);
    // Пункты теснее абзацев, вложенный список — тоже.
    expect(px(m.li2Top)).toBeGreaterThan(0);
    expect(px(m.li2Top)).toBeLessThan(px(m.p2Top));
    expect(px(m.ul2Top)).toBe(px(m.li2Top));
    // Список с классом компонента прозой не тронут.
    expect(m.menuStyle).toBe('none');
    expect(px(m.menuPad)).toBe(0);
    // Цитата — линия у начала строки, без полей браузера сбоку.
    expect(px(m.quoteLine)).toBeGreaterThanOrEqual(3);
    expect(m.quoteLineStyle).toBe('solid');
    expect(px(m.quoteMargin)).toBe(0);
    expect(m.quoteStyle).toBe('italic');
    // Ссылка без класса — как .gr-link; ссылка-кнопка — со своим видом.
    expect(m.bareColor).toBe(m.refColor);
    expect(m.bareLine).toBe('underline');
    expect(m.btnLine).toBe('none');
    // Разделитель — одна линия, а не рамка браузера.
    expect(px(m.hrTop)).toBeGreaterThan(0);
    expect(m.hrStyle).toBe('solid');
    expect(px(m.hrBottom)).toBe(0);
  });

  test(`таблица без класса выглядит как .gr-table ${label}`, async ({ page: pw }) => {
    await open(pw, reset);

    const m = await pw.evaluate(() => {
      const pick = (id) => {
        const s = getComputedStyle(document.getElementById(id));

        return [s.paddingTop, s.paddingLeft, s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor, s.fontSize, s.fontWeight, s.textAlign].join(' ');
      };
      const table = (id) => {
        const s = getComputedStyle(document.getElementById(id));

        return [s.borderCollapse, s.color].join(' ');
      };

      return {
        th: pick('bth'), refTh: pick('rth'),
        td: pick('btd'), refTd: pick('rtd'),
        table: table('bare-table'), refTable: table('ref-table'),
        // Во всю ширину — таблица с .gr-table: без класса таблица прозы
        // прокручивается сама и стоит по ширине содержимого.
        full: document.getElementById('cls-table').getBoundingClientRect().width === document.getElementById('prose').getBoundingClientRect().width,
      };
    });

    expect(m.th).toBe(m.refTh);
    expect(m.td).toBe(m.refTd);
    expect(m.table).toBe(m.refTable);
    expect(m.full).toBe(true);
  });
}

// --- Ширина содержимого: колонка, таблица, фрейм -----------------------------
//
// Окно 390 px, поля страницы 12 px: колонка прозы — 366 px, рядом с боковой
// колонкой 100 px через зазор 12 px — 254 px. Содержимое не шире колонки,
// страница вбок не уезжает.

const LAYOUT = '/prose-layout.html';

const layoutPage = (html, head = '') => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Проза: ширина</title>
<meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
<style>
  body { margin: 12px; }
  .row { display: flex; gap: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 100px; gap: 12px; }
  aside { flex: 0 0 100px; }
</style>${head}
</head><body>${html}</body></html>`;

async function openLayout(pw, html, width = 390, head = '') {
  await pw.setViewportSize({ width, height: 800 });
  await pw.route(`**${LAYOUT}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: layoutPage(html, head),
  }));
  await pw.goto(LAYOUT);
}

const URL_TEXT = '<p>Адрес без пробелов: https://example.ru/catalog/elektronika/smartfony/apple-iphone-15-pro-max-256gb-naturalnyj-titan-dve-sim-karty.</p>';
const CODE = '<pre><code>curl -s \'https://example.ru/index.php?route=product/search&amp;search=iphone&amp;category_id=24&amp;sub_category=true\'</code></pre>';

const row = (cells, tag) => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
const T2 = (attrs = '') => `<table id="tb"${attrs}><thead>${row(['Параметр', 'Значение'], 'th')}</thead><tbody>${row(['Вес', '1,2 кг'], 'td')}${row(['Цвет', 'чёрный'], 'td')}</tbody></table>`;
const T4 = `<table id="tb"><thead>${row(['Модель', 'Мощность, Вт', 'Объем чаши, л', 'Гарантия, мес.'], 'th')}</thead><tbody>${row(['Philips HD9252/90', '1400', '4,1', '24'], 'td')}${row(['Tefal EY501D15', '1550', '4,2', '12'], 'td')}</tbody></table>`;
const T9 = (attrs = '') => `<table id="tb"${attrs}><thead>${row(['Модель', 'Диагональ', 'Разрешение', 'Частота', 'Матрица', 'Яркость', 'HDR', 'Вес, кг', 'Гарантия'], 'th')}</thead><tbody>${row(['Samsung QE55Q60C', '55″', '3840×2160', '60 Гц', 'QLED', '400 кд/м²', 'HDR10+', '16,9', '24 мес.'], 'td')}</tbody></table>`;

// Ширина статьи и таблицы, своя прокрутка, уход страницы вбок.
const measure = () => {
  const box = (el) => el && Math.round(el.getBoundingClientRect().width);
  const scrolls = (el) => !!el && el.scrollWidth > el.clientWidth;
  const t = document.getElementById('t');
  const tb = document.getElementById('tb');
  const pre = t.querySelector('pre');

  return {
    article: box(t),
    table: box(tb),
    rows: tb && box(tb.tBodies[0]),
    tableDisplay: tb && getComputedStyle(tb).display,
    tableScrolls: scrolls(tb),
    pre: box(pre),
    preScrolls: scrolls(pre),
    preContent: pre && pre.scrollWidth,
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

for (const [name, html] of [
  ['флекс-элемент', `<div class="row"><article id="t" class="gr-prose">${URL_TEXT}${CODE}</article><aside>колонка</aside></div>`],
  ['дорожка 1fr', `<div class="grid"><article id="t" class="gr-prose">${URL_TEXT}${CODE}</article><aside>колонка</aside></div>`],
]) {
  test(`проза — ${name}: длинный адрес и строка кода не распирают колонку`, async ({ page: pw }) => {
    await openLayout(pw, html);
    const m = await pw.evaluate(measure);

    expect(m.article).toBe(254);
    expect(m.over).toBe(0);
    expect(m.preScrolls).toBe(true);
  });
}

test('проза, сжатая по содержимому, не схлопывается: короткий код без прокрутки', async ({ page: pw }) => {
  // Страж против contain: inline-size у pre — он обнулил бы и полную ширину
  // кода, и статья сжалась бы до «Код:».
  await openLayout(pw, '<div class="row"><article id="t" class="gr-prose"><p>Код:</p><pre><code>npm i griffincss</code></pre></article><aside>колонка</aside></div>');
  const m = await pw.evaluate(measure);

  expect(m.preScrolls).toBe(false);
  expect(m.article).toBeGreaterThanOrEqual(m.preContent);
});

test('таблица прозы: заголовки переносятся, четыре столбца — в колонке и без разрывов посреди слова', async ({ page: pw }) => {
  await openLayout(pw, `<article id="t" class="gr-prose">${T4}</article><table id="ref" class="gr-table"><thead><tr><th id="ref-th">Заголовок</th></tr></thead></table>`);

  const m = await pw.evaluate(() => {
    const tb = document.getElementById('tb');
    const broken = [];

    for (const cell of tb.querySelectorAll('th, td')) {
      const node = cell.firstChild;

      for (const word of node.data.matchAll(/\S+/g)) {
        const range = document.createRange();

        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        if (new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1) broken.push(word[0]);
      }
    }

    return {
      table: Math.round(tb.getBoundingClientRect().width),
      article: Math.round(document.getElementById('t').getBoundingClientRect().width),
      scrolls: tb.scrollWidth > tb.clientWidth,
      wrap: getComputedStyle(tb.querySelector('th')).whiteSpace,
      refWrap: getComputedStyle(document.getElementById('ref-th')).whiteSpace,
      broken,
    };
  });

  expect(m.wrap).toBe('normal');
  expect(m.table).toBeLessThanOrEqual(m.article);
  expect(m.scrolls).toBe(false);
  expect(m.broken).toEqual([]);
  // У таблицы библиотеки заголовки по-прежнему в одну строку.
  expect(m.refWrap).toBe('nowrap');
});

for (const [name, html] of [
  ['без класса', `<article id="t" class="gr-prose">${T9()}</article>`],
  ['с чужим классом', `<article id="t" class="gr-prose">${T9(' class="table table-bordered"')}</article>`],
  ['во флекс-колонке', `<div class="row"><article id="t" class="gr-prose"><p>Сравнение моделей:</p>${T9()}</article><aside>колонка</aside></div>`],
]) {
  test(`широкая таблица прозы ${name} прокручивается сама, страница не уезжает`, async ({ page: pw }) => {
    await openLayout(pw, html);
    const m = await pw.evaluate(measure);

    expect(m.table).toBe(m.article);
    expect(m.tableScrolls).toBe(true);
    expect(m.over).toBe(0);
  });
}

test('.gr-table в прозе отменяет прокрутку, .gr-table-scroll возвращает', async ({ page: pw }) => {
  await openLayout(pw, `<article id="t" class="gr-prose">${T2(' class="gr-table"')}</article>`, 1024);
  const own = await pw.evaluate(measure);

  // Таблица библиотеки — её раскладка: во всю ширину, своей прокрутки нет.
  expect(own.tableDisplay).toBe('table');
  expect(own.table).toBe(own.article);

  await openLayout(pw, `<article id="t" class="gr-prose">${T9(' class="gr-table gr-table-scroll" tabindex="0"')}</article>`);
  const scroll = await pw.evaluate(measure);

  expect(scroll.table).toBe(scroll.article);
  expect(scroll.tableScrolls).toBe(true);
  expect(scroll.over).toBe(0);
});

test('узкая таблица прозы стоит по ширине содержимого', async ({ page: pw }) => {
  // Цена своей прокрутки: строки собирает анонимная таблица внутри блока,
  // и она сжимается по содержимому. Во всю ширину — class="gr-table".
  await openLayout(pw, `<article id="t" class="gr-prose">${T2()}</article>`, 1024);
  const m = await pw.evaluate(measure);

  expect(m.tableDisplay).toBe('block');
  expect(m.table).toBe(m.rows);
  expect(m.table).toBeLessThan(m.article / 2);
  expect(m.tableScrolls).toBe(false);
});

test('фрейм прозы не шире колонки; пропорция — из атрибутов, где движок умеет attr()', async ({ page: pw, browserName }) => {
  await openLayout(pw, `<article id="t" class="gr-prose">
    <iframe id="video" width="560" height="315" src="about:blank" title="видео"></iframe>
    <iframe id="audio" width="560" height="80" src="about:blank" title="аудио"></iframe>
    <iframe id="map" width="100%" height="400" src="about:blank" title="карта"></iframe>
  </article>`);

  const m = await pw.evaluate(() => {
    const size = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();

      return { w: r.width, h: r.height };
    };

    return {
      supports: CSS.supports('aspect-ratio', 'attr(width type(<number>)) / attr(height type(<number>))'),
      article: document.getElementById('t').getBoundingClientRect().width,
      video: size('video'),
      audio: size('audio'),
      map: size('map'),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  // Поддержка закреплена по движку: когда Firefox получит attr(), тест
  // покраснеет и напомнит поправить доки.
  expect(m.supports).toBe(browserName !== 'firefox');
  expect(m.over).toBe(0);
  expect(m.video.w).toBeLessThanOrEqual(m.article);
  expect(m.map.h).toBe(400);

  if (m.supports) {
    // Рамка фрейма по умолчанию — в ширине и высоте одинаково: сравнивается
    // пропорция бокса целиком, с допуском в пиксель.
    expect(Math.abs(m.video.h - (m.video.w * 315) / 560)).toBeLessThanOrEqual(1.5);
    expect(m.audio.h).toBe(80);
  } else {
    expect(m.video.h).toBe(315);
  }
});

test('.gr-max-w-prose — мера строки 65ch', async ({ page: pw }) => {
  await open(pw, true);

  const m = await pw.evaluate(() => ({
    max: getComputedStyle(document.getElementById('measure')).maxWidth,
    ch: document.getElementById('ch65').getBoundingClientRect().width,
  }));

  expect(Math.abs(px(m.max) - m.ch)).toBeLessThanOrEqual(0.5);
});

// --- Встроенная ширина из офисных редакторов --------------------------------
//
// Word и Google Docs вставляют таблицу с style="width:100%" (или в пикселях
// и пунктах). Блок с прокруткой растягивался по ней, а ячейки — анонимная
// таблица внутри — вставали по содержимому: рамка шире строк.

const OFFICE = (width) => `<article id="t" class="gr-prose"><table id="tb" style="width:${width};border:1px solid #888;border-collapse:collapse"><tbody>${row(['Вес', '1,2 кг'], 'td')}${row(['Цвет', 'чёрный'], 'td')}</tbody></table></article>`;

for (const width of ['100%', '600px', '451.3pt']) {
  test(`таблица прозы со встроенной шириной ${width} — блок по строкам, а не шире`, async ({ page: pw }) => {
    await openLayout(pw, OFFICE(width), 1440);
    const m = await pw.evaluate(measure);

    // Разница — только рамка блока.
    expect(m.table - m.rows).toBeLessThanOrEqual(2);
    expect(m.tableScrolls).toBe(false);
  });
}

test('широкая таблица прозы со встроенной шириной по-прежнему прокручивается внутри колонки', async ({ page: pw }) => {
  await openLayout(pw, `<article id="t" class="gr-prose">${T9(' style="width:100%"')}</article>`);
  const m = await pw.evaluate(measure);

  expect(m.table).toBe(m.article);
  expect(m.tableScrolls).toBe(true);
  expect(m.over).toBe(0);
});

// --- Клавиатура: широкая таблица прозы в порядке Tab -------------------------
//
// Chromium и Firefox ставят прокручиваемую область без своих фокусируемых
// потомков в порядок Tab сами, WebKit — нет, а tabindex в тексте из
// редактора поставить некому: его ставит рантайм компонентов перед Tab.
// Прокрутку стрелками безголовый WebKit не воспроизводит — проверяется фокус.

const RUNTIME = '<script src="/packages/ui/dist/griffincss-ui.js"></script>';

async function tabFrom(pw, id, shift = false) {
  await pw.focus(`#${id}`);
  await pw.keyboard.press(shift ? 'Shift+Tab' : 'Tab');

  return pw.evaluate(() => document.activeElement.id || document.activeElement.tagName.toLowerCase());
}

test('Tab с поля перед широкой таблицей прозы приводит на таблицу', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9()}</article><input id="after">`, 390, RUNTIME);

  expect(await tabFrom(pw, 'before')).toBe('tb');
  expect(await tabFrom(pw, 'after', true)).toBe('tb');
});

test('узкой таблице и таблице со ссылкой tabindex не ставится, чужой не трогается', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before">
    <article class="gr-prose" id="t">${T2(' id="narrow"').replace('id="tb" ', '')}
      <table id="linked"><tbody><tr><td><a id="link" href="#x">Samsung QE55Q60C</a></td><td>55 дюймов</td><td>3840×2160</td><td>60 Гц</td><td>QLED</td><td>400 кд/м²</td><td>HDR10+</td><td>20 Вт</td><td>16,9 кг</td><td>24 месяца</td></tr></tbody></table>
      ${T9(' tabindex="-1"').replace('id="tb"', 'id="own"')}
    </article><input id="after">`, 390, RUNTIME);

  await tabFrom(pw, 'before');

  const m = await pw.evaluate(() => ({
    narrow: document.getElementById('narrow').getAttribute('tabindex'),
    linked: document.getElementById('linked').getAttribute('tabindex'),
    own: document.getElementById('own').getAttribute('tabindex'),
  }));

  expect(m.narrow).toBe(null);
  expect(m.linked).toBe(null);
  expect(m.own).toBe('-1');
});

test('таблица, ставшая помещаться, теряет поставленный tabindex; destroy() снимает свои', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9()}</article><input id="after">`, 390, RUNTIME);

  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'))).toBe('0');

  // Окно шире — таблица помещается: на следующем Tab отметка снимается.
  await pw.setViewportSize({ width: 1440, height: 800 });
  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'))).toBe(null);

  await pw.setViewportSize({ width: 390, height: 800 });
  await tabFrom(pw, 'before');
  await pw.evaluate(() => window.Griffincss.ui.destroy());
  expect(await pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'))).toBe(null);
});
