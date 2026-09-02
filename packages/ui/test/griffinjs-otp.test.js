'use strict';

// Одноразовый код GriffinJS на мок-DOM: маска, разложенная по ячейкам.
// Вставка кода из буфера раскладывается по ячейкам, набранная цифра
// переводит фокус дальше, Backspace на пустой ячейке возвращает
// на предыдущую и чистит её, автозаполнение целым кодом в одну ячейку
// раскладывается так же. База без скрипта — ряд ячеек maxlength="1".

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/otp.js'];

function otp(doc, n, attrs) {
  const cells = [];

  for (let i = 0; i < (n || 6); i++) {
    cells.push(el('input', Object.assign({ class: 'gr-input gr-otp-cell', type: 'text', inputmode: 'numeric', maxlength: '1', name: 'code[]' }, i === 0 ? { autocomplete: 'one-time-code' } : {})));
  }

  const root = mount(doc, el('div', Object.assign({ class: 'gr-otp', 'data-gr-otp': '', role: 'group', 'aria-label': 'Код из СМС' }, attrs), cells));

  for (const cell of cells) cell.setSelectionRange(0, 0);

  return { root, cells };
}

const values = (cells) => cells.map((c) => c.value).join('');
const focused = (doc) => doc.activeElement;

function type(cell, ch) {
  cell.value = ch;
  cell.dispatchEvent(event('input', cell, { inputType: 'insertText', data: ch }));
}

test('разбор вставки: только цифры для цифровых ячеек, ровно столько, сколько ячеек', () => {
  const { G } = setup(PARTS);
  const { split } = G.otp;

  assert.deepEqual(split('123456', 6, true), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(split('12 34-56', 6, true), ['1', '2', '3', '4', '5', '6'], 'пробелы и дефисы из СМС отброшены');
  assert.deepEqual(split('Код: 4321', 4, true), ['4', '3', '2', '1'], 'буквы вокруг кода отброшены');
  assert.deepEqual(split('12345678', 6, true), ['1', '2', '3', '4', '5', '6'], 'лишнее отброшено');
  assert.deepEqual(split('12', 6, true), ['1', '2']);
  assert.deepEqual(split('a1 b2', 4, false), ['a', '1', 'b', '2'], 'не цифровые ячейки принимают буквы');
});

test('набранная цифра переводит фокус дальше, последняя — завершает код событием', () => {
  const { G, doc } = setup(PARTS);
  const { root, cells } = otp(doc, 4);
  const seen = [];

  root.addEventListener('griffin:complete', (e) => seen.push(e.detail.value));
  G.start();

  const widget = G.instance(root, 'otp');

  assert.ok(widget, 'виджет не поднялся');
  assert.equal(root.getAttribute('data-gr-state'), 'empty');

  cells[0].focus();
  type(cells[0], '1');
  assert.equal(focused(doc), cells[1], 'фокус не ушёл на вторую ячейку');
  assert.equal(root.getAttribute('data-gr-state'), 'partial');

  type(cells[1], '2');
  type(cells[2], '3');
  assert.equal(focused(doc), cells[3]);
  assert.deepEqual(seen, []);

  type(cells[3], '4');
  assert.equal(focused(doc), cells[3], 'после последней ячейки фокусу некуда идти');
  assert.equal(values(cells), '1234');
  assert.equal(widget.value(), '1234');
  assert.deepEqual(seen, ['1234']);
  assert.equal(root.getAttribute('data-gr-state'), 'complete');

  // Чужой знак в цифровую ячейку не принимается.
  type(cells[0], 'x');
  assert.equal(cells[0].value, '');
  assert.equal(root.getAttribute('data-gr-state'), 'partial');

  G.destroy();

  assert.equal(root.getAttribute('data-gr-state'), null);
});

test('Backspace на пустой ячейке возвращает на предыдущую и чистит её; стрелки ходят по ячейкам', () => {
  const { G, doc } = setup(PARTS);
  const { cells } = otp(doc, 4);

  G.start();

  type(cells[0], '1');
  type(cells[1], '2');
  assert.equal(focused(doc), cells[2]);

  const back = event('keydown', cells[2], { key: 'Backspace' });

  cells[2].dispatchEvent(back);
  assert.equal(back.defaultPrevented, true);
  assert.equal(focused(doc), cells[1]);
  assert.equal(cells[1].value, '', 'предыдущая ячейка не очищена');

  // Знак поверх занятой ячейки заменяет её знак и идёт дальше: maxlength
  // не пустил бы его, а WebKit не заменяет выделенное — кладётся на keydown.
  cells[0].focus();
  cells[0].value = '1';

  const over = event('keydown', cells[0], { key: '7' });

  cells[0].dispatchEvent(over);
  assert.equal(over.defaultPrevented, true);
  assert.equal(cells[0].value, '7');
  assert.equal(focused(doc), cells[1]);

  const letter = event('keydown', cells[0], { key: 'x' });

  cells[0].focus();
  cells[0].dispatchEvent(letter);
  assert.equal(letter.defaultPrevented, true);
  assert.equal(cells[0].value, '7', 'буква заменила цифру');

  const combo = event('keydown', cells[0], { key: 'a', ctrlKey: true });

  cells[0].dispatchEvent(combo);
  assert.equal(combo.defaultPrevented, false, 'сочетание клавиш перехвачено');

  // Backspace в заполненной ячейке — обычное удаление, браузеру.
  const own = event('keydown', cells[0], { key: 'Backspace' });

  cells[0].focus();
  cells[0].dispatchEvent(own);
  assert.equal(own.defaultPrevented, false);

  cells[1].focus();
  cells[1].dispatchEvent(event('keydown', cells[1], { key: 'ArrowRight' }));
  assert.equal(focused(doc), cells[2]);
  cells[2].dispatchEvent(event('keydown', cells[2], { key: 'ArrowLeft' }));
  assert.equal(focused(doc), cells[1]);

  G.destroy();
});

test('вставка кода из буфера раскладывается по ячейкам с той, куда вставили', () => {
  const { G, doc } = setup(PARTS);
  const { root, cells } = otp(doc, 6);
  const seen = [];

  root.addEventListener('griffin:complete', (e) => seen.push(e.detail.value));
  G.start();

  const paste = event('paste', cells[0], { clipboardData: { getData: () => '12 34 56' } });

  cells[0].focus();
  cells[0].dispatchEvent(paste);

  assert.equal(paste.defaultPrevented, true);
  assert.equal(values(cells), '123456');
  assert.equal(focused(doc), cells[5]);
  assert.deepEqual(seen, ['123456']);

  // Со средней ячейки — хвост, остальное не тронуто.
  cells[2].focus();
  cells[2].dispatchEvent(event('paste', cells[2], { clipboardData: { getData: () => '99' } }));
  assert.equal(values(cells), '129956');
  assert.equal(focused(doc), cells[4]);

  G.destroy();
});

test('автозаполнение целым кодом в первую ячейку раскладывается так же', () => {
  const { G, doc } = setup(PARTS);
  const { root, cells } = otp(doc, 6);

  G.start();

  // Браузер вписал весь код в ячейку с autocomplete="one-time-code".
  cells[0].value = '654321';
  cells[0].dispatchEvent(event('input', cells[0], { inputType: 'insertReplacementText' }));

  assert.equal(values(cells), '654321');
  assert.equal(root.getAttribute('data-gr-state'), 'complete');

  G.destroy();
});

test('без ячеек виджет не поднимается', () => {
  const { G, doc } = setup(PARTS);
  const empty = mount(doc, el('div', { 'data-gr-otp': '' }));
  const said = [];
  const before = console.warn;

  console.warn = (m) => said.push(String(m));

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(empty, 'otp'), null);
  assert.equal(said.length, 1);

  G.destroy();
});
