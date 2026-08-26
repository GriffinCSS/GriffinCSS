'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupDom, el, generatedCSS } = require('./helpers/dom');
const { topLevelBlocks, layerBody } = require('./helpers/css');

function layoutClass(element) {
  const found = element.classList.items.filter((c) => c.startsWith('gr-l-'));
  assert.equal(found.length, 1, 'у контейнера ровно один класс раскладки, а не ' + found.length);
  return found[0];
}

// Дефект ①: два контейнера с одинаковым базовым data-gr-layout,
// но разной адаптивностью. Правило по значению атрибута общее на оба,
// поэтому безусловный вариант перебивает адаптивный на всех ширинах.
test('одинаковый базовый layout при разной адаптивности не конфликтует', () => {
  const plain = el('div', { 'data-gr-layout': 'a2b2' });
  const responsive = el('div', {
    'data-gr-layout': 'a2b2',
    'data-gr-layout-md': 'a1b3',
  });
  const { doc, griffin } = setupDom(el('body', {}, [plain, responsive]));

  griffin.init();

  const plainClass = layoutClass(plain);
  const responsiveClass = layoutClass(responsive);

  assert.notEqual(plainClass, responsiveClass, 'разные наборы раскладок — разные классы');

  const css = generatedCSS(doc);

  assert.ok(!css.includes('[data-gr-layout='), 'правила больше не привязаны к значению атрибута');

  // Весь вывод рантайма лежит в слое griffincss.core — «верхний уровень»
  // правил ищем внутри него.
  const blocks = topLevelBlocks(layerBody(css, 'griffincss.core'));
  const plainTop = blocks.filter((b) => !b.prelude.startsWith('@') && b.prelude.includes(plainClass));
  const responsiveTop = blocks.filter((b) => !b.prelude.startsWith('@') && b.prelude.includes(responsiveClass));

  assert.ok(plainTop.length > 0, 'безусловный контейнер получает правило вне @media');
  assert.equal(responsiveTop.length, 0, 'адаптивный контейнер описан только внутри @media');

  const mediaWithResponsive = blocks.filter(
    (b) => b.prelude.startsWith('@media') && b.body.includes(responsiveClass),
  );

  assert.equal(mediaWithResponsive.length, 2, 'адаптивный набор даёт два непересекающихся диапазона');
});

// Одинаковый набор раскладок → один класс и одно правило (дедупликация).
test('одинаковый набор раскладок даёт один класс на оба контейнера', () => {
  const first = el('div', { 'data-gr-layout': 'a2b2', 'data-gr-layout-md': 'a1b3' });
  const second = el('div', { 'data-gr-layout': 'a2b2', 'data-gr-layout-md': 'a1b3' });
  const { doc, griffin } = setupDom(el('body', {}, [first, second]));

  griffin.init();

  const cls = layoutClass(first);

  assert.equal(layoutClass(second), cls);

  const css = generatedCSS(doc);
  const occurrences = css.split('.' + cls + ' {').length - 1;

  assert.equal(occurrences, 2, 'правило сгенерировано один раз на каждый диапазон, не продублировано');
});

// Порядок атрибутов не должен влиять на хеш набора.
test('класс раскладки не зависит от порядка объявления атрибутов', () => {
  const straight = el('div', { 'data-gr-layout': 'a1b1', 'data-gr-layout-lg': 'a1b1c1' });
  const reversed = el('div', { 'data-gr-layout-lg': 'a1b1c1', 'data-gr-layout': 'a1b1' });
  const { griffin } = setupDom(el('body', {}, [straight, reversed]));

  griffin.init();

  assert.equal(layoutClass(straight), layoutClass(reversed));
});

// Смена раскладки на живом элементе: прежний класс обязан сняться.
// Иначе на контейнере оказываются два .gr-l-*, и побеждает тот, чьё правило
// стоит в таблице позже, — то есть, возможно, устаревший.
test('смена раскладки снимает прежний класс контейнера', () => {
  const early = el('div', { 'data-gr-layout': 'a1b1c1' });
  const target = el('div', { 'data-gr-layout': 'a3-b3-c3' });
  const { griffin } = setupDom(el('body', {}, [early, target]));

  griffin.init();

  const before = layoutClass(target);

  target.setAttribute('data-gr-layout', 'a1b1c1');
  griffin.refresh();

  const after = layoutClass(target);

  assert.notEqual(after, before, 'новый набор — новый класс');
  assert.equal(after, layoutClass(early), 'тот же набор, что у первого контейнера');
});
