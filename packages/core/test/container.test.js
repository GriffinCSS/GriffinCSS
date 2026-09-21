'use strict';

// Контейнерные запросы: объявление контейнера, обёртка @container
// и контейнерные раскладки рантайма.

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileScss, normalizeCss, topLevelBlocks, layersBody } = require('./helpers/css');

// @property --gr-name с Этапа 46 едет в слое токенов, .gr-cq — в ядре.
const CORE = layersBody(compileScss("@use 'griffincss-core';"), ['griffincss.tokens', 'griffincss.core']);

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

// 47d (фидбек темы griffin, п. 8): имя контейнера классом, а не инлайновым
// style="--gr-name: …" — инлайновый стиль в теме запрещён. Четыре имени —
// соглашение библиотеки для слотов раскладки; attr() в container-name
// не поддерживается, поэтому data-gr-cq="…" не делается.
test('.gr-cq-{page,main,aside,card} — контейнер с именем классом', () => {
  for (const name of ['page', 'main', 'aside', 'card']) {
    const rule = normalizeCss(blockBody(`.gr-cq-${name}`, CORE));

    assert.ok(rule, `.gr-cq-${name} нет в ядре`);
    assert.equal(rule, `container:${name}/inline-size;`);
  }
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

// 47c: обратная сторона той же шкалы — «ниже порога». Нужна классам,
// описывающим узкое состояние: карточки вместо таблицы, столбик вместо ленты.
test('gr-container-below выдаёт запрос «уже порога» на том же значении', () => {
  const css = normalizeCss(compileScss(
    "@use 'container-mixins' as cq;\n"
    + '@include cq.gr-container-below(md) { .probe { color: red; } }',
  ));

  assert.equal(css, '@container (width<768px){.probe{color:red}}');
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

// --- 47a: контейнерные варианты сетки и флекса ------------------------------

// Тела всех верхнеуровневых блоков слоя ядра с заданной прелюдией —
// @container (width >= 768px) встречается в файле не один раз.
function queryBodies(prelude) {
  return topLevelBlocks(CORE)
    .filter((b) => norm(b.prelude) === norm(prelude))
    .map((b) => b.body)
    .join('\n');
}

function ruleIn(css, selector) {
  const found = topLevelBlocks(css).find((b) => norm(b.prelude) === selector);
  return found ? normalizeCss(found.body).replace(/;$/, '') : '';
}

test('.gr-grid-N-c{bp} повторяет .gr-grid-N-{bp} внутри @container', () => {
  for (const [bp, value] of Object.entries({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px' })) {
    const container = queryBodies(`@container (width >= ${value})`);
    const media = queryBodies(`@media (width >= ${value})`);

    for (let n = 1; n <= 12; n += 1) {
      const rule = ruleIn(container, `.gr-grid-${n}-c${bp}`);

      assert.ok(rule, `.gr-grid-${n}-c${bp} не найден в @container (width >= ${value})`);
      assert.equal(rule, ruleIn(media, `.gr-grid-${n}-${bp}`), `.gr-grid-${n}-c${bp} разошёлся с оконным вариантом`);
    }
  }
});

test('.gr-flex-{row,col,wrap}-c{bp} — направление и перенос по ширине контейнера', () => {
  const container = queryBodies('@container (width >= 768px)');

  assert.equal(ruleIn(container, '.gr-flex-row-cmd'), 'flex-direction:row');
  assert.equal(ruleIn(container, '.gr-flex-col-cmd'), 'flex-direction:column');
  assert.equal(ruleIn(container, '.gr-flex-wrap-cmd'), 'flex-wrap:wrap');
});

test('контейнерных вариантов выравнивания флекса нет: их не просили', () => {
  const container = queryBodies('@container (width >= 768px)');

  for (const selector of ['.gr-flex-center-cmd', '.gr-flex-between-cmd', '.gr-flex-items-start-cmd', '.gr-flex-self-end-cmd', '.gr-flex-nowrap-cmd', '.gr-flex-cmd', '.gr-grid-cmd']) {
    assert.equal(ruleIn(container, selector), '', `${selector} появился без решения`);
  }
});
