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
        full: document.getElementById('bare-table').getBoundingClientRect().width === document.getElementById('prose').getBoundingClientRect().width,
      };
    });

    expect(m.th).toBe(m.refTh);
    expect(m.td).toBe(m.refTd);
    expect(m.table).toBe(m.refTable);
    expect(m.full).toBe(true);
  });
}

test('.gr-max-w-prose — мера строки 65ch', async ({ page: pw }) => {
  await open(pw, true);

  const m = await pw.evaluate(() => ({
    max: getComputedStyle(document.getElementById('measure')).maxWidth,
    ch: document.getElementById('ch65').getBoundingClientRect().width,
  }));

  expect(Math.abs(px(m.max) - m.ch)).toBeLessThanOrEqual(0.5);
});
