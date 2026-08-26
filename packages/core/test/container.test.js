'use strict';

// Контейнерные запросы: объявление контейнера, обёртка @container
// и контейнерные раскладки рантайма.

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileScss, normalizeCss, topLevelBlocks, layerBody } = require('./helpers/css');

const CORE = layerBody(compileScss("@use 'griffincss-core';"), 'griffincss.core');

const norm = (text) => text.replace(/\s+/g, ' ').replace(/"/g, '').trim();

function blockBody(selector, css) {
  const found = topLevelBlocks(css).find((b) => norm(b.prelude) === norm(selector));
  return found ? found.body : '';
}

// --- 14a: контейнер в CSS ---------------------------------------------------

test('.gr-cq объявляет контейнер по инлайн-оси', () => {
  const rule = blockBody('.gr-cq', CORE);

  assert.match(rule, /container-type:\s*inline-size/);
});

test('имя контейнера приходит из --gr-name и по умолчанию отсутствует', () => {
  const rule = blockBody('.gr-cq', CORE);

  assert.match(rule, /container-name:\s*var\(--gr-name,\s*none\)/);
});

test('--gr-name не наследуется: вложенный .gr-cq не перенимает имя предка', () => {
  const property = topLevelBlocks(CORE).find((b) => norm(b.prelude) === '@property --gr-name');

  assert.ok(property, 'свойство --gr-name зарегистрировано через @property');
  assert.match(property.body, /inherits:\s*false/);
});

test('gr-container-media выдаёт range-синтаксис на значении из карты', () => {
  const css = normalizeCss(compileScss(
    "@use 'container-mixins' as cq;\n"
    + '@include cq.gr-container-media(md) { .probe { color: red; } }',
  ));

  assert.equal(css, '@container (width>=768px){.probe{color:red}}');
});

test('gr-container-media умеет именованный контейнер', () => {
  const css = normalizeCss(compileScss(
    "@use 'container-mixins' as cq;\n"
    + '@include cq.gr-container-media(lg, card) { .probe { color: red; } }',
  ));

  assert.equal(css, '@container card (width>=1024px){.probe{color:red}}');
});

test('контейнерный ключ читает значение того же брейкпоинта, что и оконный', () => {
  const css = normalizeCss(compileScss(
    "@use 'container-mixins' as cq;\n"
    + '.probe { width: cq.gr-bp-value(cmd); height: cq.gr-bp-value(md); }',
  ));

  assert.equal(css, '.probe{width:768px;height:768px}');
});

test('незнакомый брейкпоинт — ошибка компиляции, а не пустой запрос', () => {
  assert.throws(
    () => compileScss("@use 'container-mixins' as cq;\n.probe { width: cq.gr-bp-value(zz); }"),
    /Griffincss/,
  );
});

// --- 14b: контейнерные раскладки рантайма -----------------------------------

const { setupDom, el, cssSection } = require('./helpers/dom');

// CSS раскладок для одного контейнера, с хеш-классом, заменённым
// на читаемое имя, — чтобы сравнивать с выводом миксина.
function runtimeCSS(attrs) {
  const container = el('div', attrs);
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  const cls = container.classList.items.filter((c) => c.startsWith('gr-l-'))[0];

  assert.ok(cls, 'контейнер получил класс раскладки');

  return cssSection(doc, 'Grid Layouts').split(cls).join('gr-l-hero');
}

test('data-gr-layout-cmd раскладывается внутри @container, а не @media', () => {
  const css = normalizeCss(runtimeCSS({ 'data-gr-layout-cmd': 'a1b1' }));

  assert.ok(css.includes('@container (width>=768px)'), css);
  assert.ok(!css.includes('@media'), 'контейнерная раскладка не должна порождать @media: ' + css);
});

test('контейнерные диапазоны не пересекаются — та же range-запись, что у окна', () => {
  const css = normalizeCss(runtimeCSS({
    'data-gr-layout': 'a1',
    'data-gr-layout-cmd': 'a1b1',
    'data-gr-layout-clg': 'a1b1c1',
  }));

  assert.ok(css.includes('@container (width<768px)'), css);
  assert.ok(css.includes('@container (768px<=width<1024px)'), css);
  assert.ok(css.includes('@container (width>=1024px)'), css);
});

test('оконная и контейнерная цепочки на одном элементе независимы', () => {
  const css = normalizeCss(runtimeCSS({
    'data-gr-layout': 'a1',
    'data-gr-layout-md': 'a1b1',
    'data-gr-layout-cmd': 'a2b1',
  }));

  assert.ok(css.includes('@media (width>=768px)'), 'оконный диапазон открыт сверху: ' + css);
  assert.ok(css.includes('@container (width>=768px)'), 'контейнерный диапазон открыт сверху: ' + css);
  // База закрыта обоими условиями сразу: иначе она перекрыла бы то один,
  // то другой диапазон в зависимости от порядка правил.
  assert.ok(css.includes('@media (width<768px){@container (width<768px)'), css);
});

test('контейнерный вариант стоит в таблице после оконного', () => {
  const css = normalizeCss(runtimeCSS({
    'data-gr-layout-md': 'a1b1',
    'data-gr-layout-cmd': 'a2b1',
  }));

  assert.ok(css.indexOf('@media') < css.indexOf('@container'), css);
});

test('брейкпоинты в rem доезжают и до контейнерных запросов', () => {
  const container = el('div', { 'data-gr-layout': 'a1', 'data-gr-layout-cmd': 'a1b1' });
  const { doc, griffin } = setupDom(el('body', {}, [container]), { '--gr-bp-md': '48rem' });

  griffin.init();

  const css = normalizeCss(cssSection(doc, 'Grid Layouts'));

  assert.ok(css.includes('@container (width<48rem)'), css);
  assert.ok(css.includes('@container (width>=48rem)'), css);
});

test('FOUC-защита ловит и контейнерные атрибуты', () => {
  const container = el('div', { 'data-gr-layout-cmd': 'a1b1' });
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  assert.ok(cssSection(doc, 'FOUC guard').includes('[data-gr-layout-cmd]'), 'атрибут не попал в защиту');
  assert.ok(container.classList.contains('gr-ready'), 'контейнер остался закрытым защитой');
});
