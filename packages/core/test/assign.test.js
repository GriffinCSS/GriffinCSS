'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupDom, el } = require('./helpers/dom');

function areaClasses(container) {
  return container.children.map((child) =>
    child.classList.items.filter((c) => c.startsWith('gr-area-')).join(' '),
  );
}

// Дефект ②: авто-присвоение не учитывает уже занятые имена и
// выдаёт дубликаты, из-за которых элементы накладываются в одной ячейке.
test('явно заданная область не выдаётся второй раз', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1c1' }, [
    el('div'),
    el('div', { class: 'gr-area-b' }),
    el('div'),
  ]);
  const { griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  assert.deepEqual(areaClasses(container), ['gr-area-a', 'gr-area-b', 'gr-area-c']);
});

test('раздача идёт по свободным именам в порядке первого появления', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1-c1d1' }, [
    el('div', { class: 'gr-area-c' }),
    el('div'),
    el('div'),
    el('div'),
  ]);
  const { griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  assert.deepEqual(areaClasses(container), ['gr-area-c', 'gr-area-a', 'gr-area-b', 'gr-area-d']);
});

test('имена не дублируются, если детей больше, чем областей', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1' }, [
    el('div'),
    el('div'),
    el('div'),
  ]);
  const { griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  assert.deepEqual(areaClasses(container), ['gr-area-a', 'gr-area-b', '']);
});

test('повторная обработка не выдаёт вторых классов', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1' }, [el('div'), el('div')]);
  const { griffin } = setupDom(el('body', {}, [container]));

  griffin.init();
  griffin.refresh();

  assert.deepEqual(areaClasses(container), ['gr-area-a', 'gr-area-b']);
});

test('все явно заданные области — рантайм ничего не добавляет', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1' }, [
    el('div', { class: 'gr-area-b' }),
    el('div', { class: 'gr-area-a' }),
  ]);
  const { griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  assert.deepEqual(areaClasses(container), ['gr-area-b', 'gr-area-a']);
});

// Смена базовой раскладки на живом элементе: выданные раньше области
// устарели. Если их не снять, дети остаются с именами, которых больше нет
// в шаблоне, и правило авто-скрытия прячет их все.
test('смена базовой раскладки переназначает области', () => {
  const container = el('div', { 'data-gr-layout': 'mm1nn1' }, [el('div'), el('div')]);
  const { griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  assert.deepEqual(areaClasses(container), ['gr-area-mm', 'gr-area-nn']);

  container.setAttribute('data-gr-layout', 'oo1uu1');
  griffin.refresh();

  assert.deepEqual(areaClasses(container), ['gr-area-oo', 'gr-area-uu']);
});

// Явно проставленные в разметке классы рантайм не трогает и при переназначении.
test('переназначение не снимает явные классы областей', () => {
  const container = el('div', { 'data-gr-layout': 'mm1nn1' }, [
    el('div', { class: 'gr-area-nn' }),
    el('div'),
  ]);
  const { griffin } = setupDom(el('body', {}, [container]));

  griffin.init();
  container.setAttribute('data-gr-layout', 'nn1uu1');
  griffin.refresh();

  assert.deepEqual(areaClasses(container), ['gr-area-nn', 'gr-area-uu']);
});
