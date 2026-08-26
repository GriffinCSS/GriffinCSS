'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupDom, el } = require('./helpers/dom');

function runtime() {
  return setupDom(el('body')).griffin;
}

test('parseLayout: ряды и повторители', () => {
  const griffin = runtime();

  assert.deepEqual(griffin.parseLayout('a3b4-c2d5'), [
    ['a', 'a', 'a', 'b', 'b', 'b', 'b'],
    ['c', 'c', 'd', 'd', 'd', 'd', 'd'],
  ]);
});

test('parseLayout: имя без счётчика — одна ячейка', () => {
  const griffin = runtime();

  assert.deepEqual(griffin.parseLayout('ab-c'), [['ab'], ['c']]);
});

test('parseLayout: подчёркивание — пустая ячейка', () => {
  const griffin = runtime();

  assert.deepEqual(griffin.parseLayout('_2a1'), [['.', '.', 'a']]);
  assert.deepEqual(griffin.parseLayout('a1_'), [['a', '.']]);
});

test('parseLayout: счётчик без имени области отвергается', () => {
  const griffin = runtime();

  assert.throws(() => griffin.parseLayout('3a'), /Griffincss/);
  assert.throws(() => griffin.parseLayout('a1-2b'), /Griffincss/);
});

test('parseLayout: нулевой счётчик отвергается', () => {
  const griffin = runtime();

  assert.throws(() => griffin.parseLayout('a0b2'), /Griffincss/);
});

test('parseLayout: счётчик больше 64 отвергается', () => {
  const griffin = runtime();

  assert.deepEqual(griffin.parseLayout('a64')[0].length, 64);
  assert.throws(() => griffin.parseLayout('a65'), /Griffincss/);
  assert.throws(() => griffin.parseLayout('a99999b'), /Griffincss/);
});

test('parseLayout: имя длиннее 32 символов отвергается', () => {
  const griffin = runtime();

  assert.doesNotThrow(() => griffin.parseLayout('a'.repeat(32) + '1'));
  assert.throws(() => griffin.parseLayout('a'.repeat(33) + '1'), /Griffincss/);
});

test('parseLayout: пустая строка и пустой ряд отвергаются', () => {
  const griffin = runtime();

  assert.throws(() => griffin.parseLayout(''), /Griffincss/);
  assert.throws(() => griffin.parseLayout('a1-'), /Griffincss/);
  assert.throws(() => griffin.parseLayout('-a1'), /Griffincss/);
});

test('parseLayout: недопустимые символы в имени отвергаются', () => {
  const griffin = runtime();

  assert.throws(() => griffin.parseLayout('a.b1'), /Griffincss/);
  assert.throws(() => griffin.parseLayout('a b1'), /Griffincss/);
});

test('элемент с невалидной раскладкой пропускается целиком', () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const broken = el('div', { 'data-gr-layout': 'a0b2' }, [el('div')]);
    const ok = el('div', { 'data-gr-layout': 'a1b1' }, [el('div'), el('div')]);
    const { doc, griffin } = setupDom(el('body', {}, [broken, ok]));

    griffin.init();

    const css = doc.getElementById('griffincss-dynamic').textContent;

    assert.equal(broken.children[0].className, '', 'детям сломанного контейнера классы не раздаются');
    assert.equal(
      broken.classList.items.filter((c) => c.startsWith('gr-l-')).length,
      0,
      'сломанному контейнеру не выдаётся класс раскладки',
    );
    assert.ok(warnings.some((w) => w.includes('Griffincss')), 'выведено предупреждение');
    assert.equal(ok.children[0].className, 'gr-area-a', 'соседний корректный контейнер обработан');
    assert.ok(css.includes('grid-template-areas'), 'CSS для корректного контейнера сгенерирован');
  } finally {
    console.warn = originalWarn;
  }
});

test('невалидная раскладка не оставляет контейнер невидимым', () => {
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const broken = el('div', { 'data-gr-layout': '3a' }, [el('div')]);
    const { griffin } = setupDom(el('body', {}, [broken]));

    griffin.init();

    assert.ok(broken.classList.contains('gr-ready'), 'FOUC-защита снята даже при ошибке разбора');
  } finally {
    console.warn = originalWarn;
  }
});

// Пустое значение атрибута — не ошибка разбора, поэтому предупреждения нет.
// Но FOUC-защита ловит элемент по наличию атрибута, и без .gr-ready он
// остался бы прозрачным навсегда.
test('пустой data-gr-layout не оставляет контейнер невидимым', () => {
  const empty = el('div', { 'data-gr-layout': '' }, [el('div')]);
  const { griffin } = setupDom(el('body', {}, [empty]));

  griffin.init();

  assert.ok(empty.classList.contains('gr-ready'), 'FOUC-защита снята');
  assert.equal(
    empty.classList.items.filter((c) => c.startsWith('gr-l-')).length,
    0,
    'класса раскладки нет — раскладывать нечего',
  );
});
