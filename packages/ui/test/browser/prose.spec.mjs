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

test('отметка за широкой таблицей идёт дальше по ходу Tab: узкие пропускаются, следующая широкая — следующая остановка', async ({ page: pw }) => {
  const narrow = (id) => T2().replace('id="tb"', `id="${id}"`);
  const wide = (id) => T9().replace('id="tb"', `id="${id}"`);

  await openLayout(pw, `<input id="before"><article class="gr-prose" id="t">
    ${narrow('n1')}${narrow('n2')}${wide('w1')}${narrow('n3')}${wide('w2')}
    </article><input id="after">`, 390, RUNTIME);

  expect(await tabFrom(pw, 'before')).toBe('w1');
  await pw.keyboard.press('Tab');
  expect(await pw.evaluate(() => document.activeElement.id)).toBe('w2');
  await pw.keyboard.press('Tab');
  expect(await pw.evaluate(() => document.activeElement.id)).toBe('after');
  expect(await tabFrom(pw, 'after', true)).toBe('w2');
});

test('Shift+Tab с широкой таблицы приводит на предыдущую широкую, а не мимо неё', async ({ page: pw }) => {
  // Замер назад с самой таблицы начинался с неё же: отмеченная под фокусом
  // останавливала его, предыдущая широкая оставалась без отметки,
  // и Safari её пропускал. Отметка проверяется во всех движках.
  const narrow = (id) => T2().replace('id="tb"', `id="${id}"`);
  const wide = (id) => T9().replace('id="tb"', `id="${id}"`);

  await openLayout(pw, `<input id="before"><article class="gr-prose" id="t">
    ${wide('w1')}${narrow('n1')}${wide('w2')}
    </article><input id="after">`, 390, RUNTIME);

  expect(await tabFrom(pw, 'after', true)).toBe('w2');
  await pw.keyboard.press('Shift+Tab');
  expect(await pw.evaluate(() => document.getElementById('w1').getAttribute('tabindex'))).toBe('0');
  expect(await pw.evaluate(() => document.activeElement.id)).toBe('w1');
  await pw.keyboard.press('Shift+Tab');
  expect(await pw.evaluate(() => document.activeElement.id)).toBe('before');
});

test('Tab меряет только таблицы по ходу фокуса, а не все таблицы прозы', async ({ page: pw }) => {
  // В Chromium каждое чтение раскладки стоит пропорционально числу анимаций
  // по прокрутке: замер всех таблиц на каждый Tab — квадрат их числа.
  // Счётчик — на геттере scrollWidth: Tab с поля перед прозой доходит
  // до первой широкой таблицы, Shift+Tab с поля после — до последней.
  const tables = Array.from({ length: 200 }, (_, i) => T9().replace('id="tb"', `id="w${i}"`)).join('');

  await openLayout(pw, `<input id="before"><article class="gr-prose" id="t">${tables}</article><input id="after">`, 390, RUNTIME);
  await pw.evaluate(() => {
    const own = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');

    window.reads = 0;
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get() { window.reads += 1; return own.get.call(this); },
    });
  });

  expect(await tabFrom(pw, 'before')).toBe('w0');
  expect(await pw.evaluate(() => window.reads)).toBeLessThanOrEqual(2);

  await pw.evaluate(() => { window.reads = 0; });
  expect(await tabFrom(pw, 'after', true)).toBe('w199');
  expect(await pw.evaluate(() => window.reads)).toBeLessThanOrEqual(2);
});

test('таблицу в поверхности редактора рантайм не трогает', async ({ page: pw }) => {
  // В contenteditable фокус у хоста редактирования: tabindex на таблице
  // уводил бы его на <table> щелчком в ячейку (Firefox) или парой
  // focusout/focusin (Chromium), и редактор терял бы выделение.
  await openLayout(pw, `<input id="before"><div class="gr-prose" id="t" contenteditable="true"><p>Абзац.</p>${T9()}
    <table id="bare"><tbody>${row(['1', '2'], 'td')}${row(['3', '4'], 'td')}</tbody></table></div><input id="after">`, 390, RUNTIME);

  await tabFrom(pw, 'before');
  await pw.keyboard.press('Tab');

  const m = await pw.evaluate(() => ({
    tabindex: document.getElementById('tb').getAttribute('tabindex'),
    role: document.getElementById('bare').getAttribute('role'),
  }));

  expect(m.tabindex).toBe(null);
  expect(m.role).toBe(null);
});

test('tabindex, сменённый страницей, рантайм не снимает и не возвращает', async ({ page: pw }) => {
  // Окно-ловушка фокуса и полифилы inert ставят -1 на время и возвращают
  // сохранённое: значение страницы — не отметка рантайма.
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9()}</article><input id="after">`, 390, RUNTIME);
  const tabindex = () => pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'));

  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe('0');
  await pw.evaluate(() => document.getElementById('tb').setAttribute('tabindex', '-1'));

  // Помещается — на Shift+Tab значение страницы на месте.
  await pw.setViewportSize({ width: 1440, height: 800 });
  await tabFrom(pw, 'after', true);
  expect(await tabindex()).toBe('-1');

  // Снова шире колонки — таблица, выведенная из обхода, в него не вернулась.
  await pw.setViewportSize({ width: 390, height: 800 });
  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe('-1');

  await pw.evaluate(() => window.Griffincss.ui.destroy());
  expect(await tabindex()).toBe('-1');
});

test('таблица, отсоединённая на время Tab, остаётся своей: стала помещаться — отметка снята', async ({ page: pw }) => {
  // Перерисовка разметки в SPA: узел убрали и вернули. Рантайм не обязан
  // помнить его вечно, но и бросать свою отметку в обходе не должен.
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9()}</article><input id="after">`, 390, RUNTIME);
  const tabindex = () => pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'));

  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe('0');

  await pw.evaluate(() => { window.detached = document.getElementById('tb'); window.detached.remove(); });
  await tabFrom(pw, 'before');
  await pw.evaluate(() => document.getElementById('t').appendChild(window.detached));

  await pw.setViewportSize({ width: 1440, height: 800 });
  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe(null);
});

for (const [name, inner] of [
  ['tabindex="-1"', '<span tabindex="-1">*</span>'],
  ['скрытое поле', '<input type="hidden" name="sku" value="1">'],
  ['отключённая кнопка', '<button type="button" disabled>*</button>'],
  ['contenteditable="false"', '<span contenteditable="false">*</span>'],
]) {
  test(`широкая таблица, где Tab остановиться не на чем (${name}), — в порядке Tab`, async ({ page: pw }) => {
    await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9().replace('<td>Samsung', `<td>${inner}Samsung`)}</article><input id="after">`, 390, RUNTIME);

    expect(await tabFrom(pw, 'before')).toBe('tb');
  });
}

// --- Firefox: таблица прозы без заголовков ---------------------------------
//
// Gecko считает таблицу без признаков данных (th, thead, tfoot, col, role,
// caption с текстом) таблицей раскладки, если у её рамки один столбец,
// а у таблицы со своей прокруткой (display: block) рамка — блок без столбцов.
// Читалка с Firefox теряет «таблица, N строк», координаты и переход по ячейкам.
// В 0.28.2 те же таблицы были данными; роль возвращает это без CSS.
// Chromium и WebKit роль не меняют — она ставится во всех движках.

const GRID = (id, rows, cols, attrs = '') => `<table id="${id}"${attrs}><tbody>${Array.from({ length: rows }, (_, r) => row(Array.from({ length: cols }, (__, c) => `${r}.${c}`), 'td')).join('')}</tbody></table>`;

test('таблице прозы без признаков данных рантайм ставит role="table"; destroy() снимает свою', async ({ page: pw }) => {
  await openLayout(pw, `<article class="gr-prose" id="t">
    ${GRID('bare', 3, 3)}
    ${GRID('wide', 2, 12)}
    <table id="titled"><tbody><tr><td colspan="3">Заголовок группы</td></tr>${row(['1', '2', '3'], 'td')}</tbody></table>
    ${T2().replace('id="tb"', 'id="headed"')}
    <table id="cols"><colgroup><col><col></colgroup><tbody>${row(['1', '2'], 'td')}${row(['3', '4'], 'td')}</tbody></table>
    ${GRID('own', 2, 2, ' role="grid"')}
    ${GRID('row1', 1, 3)}
    ${GRID('col1', 3, 1)}
    <table id="outer"><tbody><tr><td>${GRID('inner', 2, 2)}</td><td>2</td></tr>${row(['3', '4'], 'td')}</tbody></table>
    ${GRID('lib', 2, 2, ' class="gr-table"')}
    <table id="spans"><tbody><tr><td colspan="2">Только объединённые</td></tr><tr><td colspan="2">ячейки</td></tr></tbody></table>
    ${GRID('empty', 2, 2, ' role=""')}
    </article>`, 1024, RUNTIME);

  const roles = () => pw.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('table')].map((t) => [t.id, t.getAttribute('role')]),
  ));

  // Как Gecko у таблицы с рамкой ячеек без своей прокрутки (0.28.2):
  // вложенная таблица внешнюю раскладкой не делает, столбцы — по карте
  // таблицы (colspan), пустой role — не роль.
  expect(await roles()).toEqual({
    bare: 'table', wide: 'table', titled: 'table',
    headed: null, cols: null, own: 'grid', row1: null, col1: null,
    outer: 'table', inner: 'table', lib: null, spans: 'table', empty: 'table',
  });

  await pw.evaluate(() => window.Griffincss.ui.destroy());
  const after = await roles();

  expect(after.bare).toBe(null);
  expect(after.inner).toBe(null);
  expect(after.own).toBe('grid');
});

test('таблица прозы, вставленная позже, получает роль в проходе перед Tab', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article class="gr-prose" id="t"></article><input id="after">`, 1024, RUNTIME);
  await pw.evaluate((html) => { document.getElementById('t').innerHTML = html; }, GRID('late', 2, 2));

  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => document.getElementById('late').getAttribute('role'))).toBe('table');
});

test('повторный start() ставит роль таблице прозы, вставленной после старта', async ({ page: pw }) => {
  // Смена варианта товара, догруженный текст: читалка идёт по тексту
  // без Tab, и роль нужна, не дожидаясь прохода перед Tab.
  await openLayout(pw, `<article class="gr-prose" id="t"></article>`, 1024, RUNTIME);
  await pw.evaluate((html) => { document.getElementById('t').innerHTML = html; }, GRID('late', 2, 2));
  await pw.evaluate(() => window.Griffincss.ui.start());

  expect(await pw.evaluate(() => document.getElementById('late').getAttribute('role'))).toBe('table');
});

// --- Второй круг: невидимая таблица, чужой "0", destroy(), редактор ----------

const TW = (id) => `<table id="${id}"><tbody>${row(Array.from({ length: 30 }, (_, c) => `Ячейка ${c}`), 'td')}${row(Array.from({ length: 30 }, () => 'x'), 'td')}</tbody></table>`;

// Обход перед Tab встаёт на первой широкой таблице — до неё Tab и дойдёт.
// До невидимой не дойдёт: на ней обход вставать не должен, иначе видимая
// широкая за ней остаётся без отметки, и Safari её пропускает.
for (const [name, wrap] of [
  ['закрытый details', (t) => `<details><summary id="sum">Ещё</summary>${t}</details>`],
  ['visibility: hidden', (t) => `<div style="visibility: hidden">${t}</div>`],
  ['inert', (t) => `<div inert>${t}</div>`],
  ['hidden="until-found"', (t) => `<div hidden="until-found">${t}</div>`],
]) {
  test(`невидимая широкая таблица (${name}) не прячет следующую из порядка Tab`, async ({ page: pw }) => {
    await openLayout(pw, `<input id="before"><article class="gr-prose" id="t">${wrap(TW('hid'))}${T9().replace('id="tb"', 'id="vis"')}</article><input id="after">`, 390, RUNTIME);
    await pw.focus('#before');

    const path = [];

    for (let i = 0; i < 4 && path[path.length - 1] !== 'after'; i++) {
      await pw.keyboard.press('Tab');
      path.push(await pw.evaluate(() => document.activeElement.id || document.activeElement.tagName.toLowerCase()));
    }

    expect(path).toContain('vis');
    expect(await pw.evaluate(() => document.getElementById('vis').getAttribute('tabindex'))).toBe('0');
  });
}

test('отметка за невидимой широкой таблицей снимается, когда таблица стала помещаться', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article class="gr-prose" id="t"><details><summary>Ещё</summary>${TW('hid')}</details>${T9().replace('id="tb"', 'id="vis"')}</article><input id="after">`, 390, RUNTIME);

  // Shift+Tab с поля после — отметка на видимой.
  expect(await tabFrom(pw, 'after', true)).toBe('vis');

  await pw.setViewportSize({ width: 1440, height: 800 });
  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => document.getElementById('vis').getAttribute('tabindex'))).toBe(null);
});

test('страница вернула сохранённый "0" — отметка снова своя: стала помещаться — снята', async ({ page: pw }) => {
  // Окно-ловушка фокуса ставит -1, пока открыто, и возвращает сохранённое.
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9()}</article><input id="after">`, 390, RUNTIME);
  const tabindex = () => pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'));

  await tabFrom(pw, 'before');
  await pw.evaluate(() => document.getElementById('tb').setAttribute('tabindex', '-1'));
  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe('-1');

  await pw.evaluate(() => document.getElementById('tb').setAttribute('tabindex', '0'));
  await pw.setViewportSize({ width: 1440, height: 800 });
  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe(null);
});

for (const [name, move] of [
  ['вынесенной из прозы', 'document.body.appendChild(t)'],
  ['получившей class="gr-table"', 't.classList.add("gr-table")'],
]) {
  test(`destroy() снимает своё и у таблицы, ${name}`, async ({ page: pw }) => {
    await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${TW('tb')}</article><input id="after">`, 390, RUNTIME);

    await tabFrom(pw, 'before');
    expect(await pw.evaluate(() => [document.getElementById('tb').getAttribute('tabindex'), document.getElementById('tb').getAttribute('role')])).toEqual(['0', 'table']);

    await pw.evaluate(`(() => { const t = document.getElementById('tb'); ${move}; window.Griffincss.ui.destroy(); })()`);
    expect(await pw.evaluate(() => [document.getElementById('tb').getAttribute('tabindex'), document.getElementById('tb').getAttribute('role')])).toEqual([null, null]);
  });
}

test('редактор, включённый на показанной прозе: start() снимает свою роль, Tab — свой tabindex', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><div id="t" class="gr-prose">${GRID('bare', 3, 3)}${T9()}</div><input id="after">`, 390, RUNTIME);

  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => [document.getElementById('bare').getAttribute('role'), document.getElementById('tb').getAttribute('tabindex')])).toEqual(['table', '0']);

  await pw.evaluate(() => { document.getElementById('t').contentEditable = 'true'; window.Griffincss.ui.start(); });
  await tabFrom(pw, 'before');

  expect(await pw.evaluate(() => [document.getElementById('bare').getAttribute('role'), document.getElementById('tb').getAttribute('tabindex')])).toEqual([null, null]);
});

for (const [name, inner] of [
  ['ссылка с tabindex="-1"', '<a href="#x" tabindex="-1">*</a>'],
  ['ссылка в hidden', '<span hidden><a href="#x">*</a></span>'],
  ['ссылка в inert', '<span inert><a href="#x">*</a></span>'],
  ['отключённая кнопка с tabindex="0"', '<button type="button" disabled tabindex="0">*</button>'],
]) {
  test(`широкая таблица, где Tab остановиться не на чем (${name}), — в порядке Tab и с отметкой`, async ({ page: pw }) => {
    await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9().replace('<td>Samsung', `<td>${inner}Samsung`)}</article><input id="after">`, 390, RUNTIME);

    expect(await tabFrom(pw, 'before')).toBe('tb');
    expect(await pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'))).toBe('0');
  });
}

// --- Третий круг: таблицы со ссылками, Safari без checkVisibility, края -----

const LINKED = (id) => T9().replace('id="tb"', `id="${id}"`).replace('<td>Samsung', '<td><a href="#x">Samsung</a> ');

test('таблицы со ссылкой внутри обход проходит, не читая раскладку', async ({ page: pw }) => {
  // Остановка внутри решается по дереву: ширину таблицы, где Tab и так
  // остановится, мерить незачем, а в Chromium каждое чтение — цена всех
  // анимаций по прокрутке на странице.
  const tables = Array.from({ length: 200 }, (_, i) => LINKED(`l${i}`)).join('');

  await openLayout(pw, `<input id="before"><article class="gr-prose" id="t">${tables}</article><input id="after">`, 390, RUNTIME);
  await pw.evaluate(() => {
    const own = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');

    window.reads = 0;
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get() { window.reads += 1; return own.get.call(this); },
    });
  });

  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => window.reads)).toBeLessThanOrEqual(2);
});

test('широкая таблица за таблицей со ссылкой — в порядке Tab (Safari ссылки пропускает)', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article class="gr-prose" id="t">${LINKED('lt')}${T9().replace('id="tb"', 'id="w"')}</article><input id="after">`, 390, RUNTIME);
  await pw.focus('#before');

  const path = [];

  for (let i = 0; i < 4 && path[path.length - 1] !== 'after'; i++) {
    await pw.keyboard.press('Tab');
    path.push(await pw.evaluate(() => document.activeElement.id || document.activeElement.tagName.toLowerCase()));
  }

  expect(path).toContain('w');
  expect(await pw.evaluate(() => document.getElementById('lt').getAttribute('tabindex'))).toBe(null);
});

// Safari 15.4–17.3 checkVisibility не знает: невидимость — по дереву
// и вычисленному visibility. Модель — метод, удалённый до старта рантайма.
const NO_CHECK = '<script>delete Element.prototype.checkVisibility;</script>';

for (const [name, wrap] of [
  ['закрытый details', (t) => `<details><summary id="sum">Ещё</summary>${t}</details>`],
  ['visibility: hidden', (t) => `<div style="visibility: hidden">${t}</div>`],
  ['hidden="until-found"', (t) => `<div hidden="until-found">${t}</div>`],
]) {
  test(`без checkVisibility невидимая широкая таблица (${name}) не прячет следующую`, async ({ page: pw }) => {
    await openLayout(pw, `<input id="before"><article class="gr-prose" id="t">${wrap(TW('hid'))}${T9().replace('id="tb"', 'id="vis"')}</article><input id="after">`, 390, NO_CHECK + RUNTIME);
    await pw.focus('#before');

    for (let i = 0; i < 3; i++) await pw.keyboard.press('Tab');

    expect(await pw.evaluate(() => document.getElementById('vis').getAttribute('tabindex'))).toBe('0');
  });
}

test('без checkVisibility ссылка в hidden не запрещает отметку', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9().replace('<td>Samsung', '<td><span hidden><a href="#x">*</a></span>Samsung')}</article><input id="after">`, 390, NO_CHECK + RUNTIME);

  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'))).toBe('0');
});

test('ссылка, скрытая только стилями, считается остановкой (принятое ограничение)', async ({ page: pw }) => {
  // Видимость стилями — цена чтения раскладки у каждой таблицы со ссылкой;
  // остановки внутри ищутся по дереву. Без отметки — как в 0.29.1.
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9().replace('<td>Samsung', '<td><span style="visibility: hidden"><a href="#x">*</a></span>Samsung')}</article><input id="after">`, 390, RUNTIME);

  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'))).toBe(null);
});

test('роль: th только во вложенной таблице и столбцы только из rowspan', async ({ page: pw }) => {
  // Признаки данных — свои у таблицы; столбцы — по карте с rowspan:
  // так у Gecko и у таблицы без своей прокрутки.
  await openLayout(pw, `<article class="gr-prose" id="t">
    <table id="outerTh"><tbody><tr><td><table id="innerTh"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></td><td>2</td></tr>${row(['3', '4'], 'td')}</tbody></table>
    <table id="rows"><tbody><tr><td rowspan="2">Объединённая</td></tr><tr><td>Ячейка</td></tr></tbody></table>
    </article>`, 1024, RUNTIME);

  expect(await pw.evaluate(() => ['outerTh', 'innerTh', 'rows'].map((id) => document.getElementById(id).getAttribute('role')))).toEqual(['table', null, 'table']);
});

test('редактор, включённый на прозе с фокусом на таблице: start() снимает и роль, и tabindex', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><div id="t" class="gr-prose">${TW('tb')}</div><input id="after">`, 390, RUNTIME);

  expect(await tabFrom(pw, 'before')).toBe('tb');
  await pw.evaluate(() => { document.getElementById('t').contentEditable = 'true'; window.Griffincss.ui.start(); });

  expect(await pw.evaluate(() => [document.getElementById('tb').getAttribute('role'), document.getElementById('tb').getAttribute('tabindex')])).toEqual([null, null]);
});

test('остров contenteditable в ячейке — остановка Tab: отметки нет', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9().replace('<td>Samsung', '<td><span id="island" contenteditable="true">правка</span> Samsung')}</article><input id="after">`, 390, RUNTIME);

  await tabFrom(pw, 'before');
  expect(await pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'))).toBe(null);
});

test('страница сняла tabindex совсем — на следующем Tab отметка снова стоит', async ({ page: pw }) => {
  await openLayout(pw, `<input id="before"><article id="t" class="gr-prose">${T9()}</article><input id="after">`, 390, RUNTIME);
  const tabindex = () => pw.evaluate(() => document.getElementById('tb').getAttribute('tabindex'));

  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe('0');

  await pw.evaluate(() => document.getElementById('tb').removeAttribute('tabindex'));
  await tabFrom(pw, 'before');
  expect(await tabindex()).toBe('0');
});
