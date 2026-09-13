'use strict';

// Сумма с разрядами GriffinJS на мок-DOM (Этап 43b). Договор: на экране —
// текст с разделителями по локали документа, число в точечной записи —
// в скрытом спутнике с прежним именем (тот же приём, что у даты); каретка
// держится относительно цифр; вставка «1 250 000,50» и «1250000.50»
// читаются одинаково; границы min/max с поля проверяет виджет через
// setCustomValidity; destroy() возвращает имя и число в поле.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/number.js'];

function field(doc, attrs, lang) {
  if (lang !== null) doc.documentElement.setAttribute('lang', lang || 'ru');

  const input = el('input', Object.assign({ class: 'gr-input', type: 'text', name: 'amount', id: 'amount', 'data-gr-number': '' }, attrs));
  const wrap = mount(doc, el('div', { class: 'gr-field' }, [input]));

  input.setSelectionRange(0, 0);

  return { wrap, input, companion: () => wrap.children[1] };
}

function edit(node, type, at, extra) {
  const [start, end] = Array.isArray(at) ? at : [at, at];

  node.setSelectionRange(start, end);

  const e = event('beforeinput', node, Object.assign({ inputType: type }, extra));

  node.dispatchEvent(e);

  return e;
}

const typed = (node, text, at) => edit(node, 'insertText', at === undefined ? node.value.length : at, { data: text });
const paste = (node, text) => edit(node, 'insertFromPaste', [0, node.value.length], { data: text });
const caret = (node) => node.selectionStart;

// Разделитель разрядов у ru — неразрывный пробел (обычный или узкий).
const plain = (s) => s.replace(/[\u00a0\u202f]/g, ' ');

test('разбор: разряды, оба разделителя дроби, знак, буквы отбрасываются', () => {
  const { G } = setup(PARTS);
  const { parse } = G.number;

  assert.equal(parse('1 250 000', 'ru', 0).value, '1250000');
  assert.equal(parse('1 250 000,50', 'ru', 2).value, '1250000.50');
  assert.equal(parse('1250000.50', 'ru', 2).value, '1250000.50');
  assert.equal(parse('1.250.000', 'ru', 2).value, '1250000', 'три цифры за точкой — разряды, не дробь');
  assert.equal(parse('1,250,000', 'en', 2).value, '1250000', 'разделитель разрядов локали — никогда не дробь');
  assert.equal(parse('1,250,000.5', 'en', 2).value, '1250000.5');
  assert.equal(parse('1,25', 'en', 2).value, '125', 'запятая в en — разряды');
  assert.equal(parse('1 250 000,50', 'en', 2).value, '1250000.50', 'разряды пробелами — запятая дробь и в en');
  assert.equal(parse('12,5', 'ru', 2).value, '12.5');
  assert.equal(parse('12,5', 'ru', 0).value, '12', 'без дроби — дробь отбрасывается');
  assert.equal(parse('1,999', 'ru', 2).value, '1.99', 'лишние цифры дроби отбрасываются, не округляются');
  assert.equal(parse('abc', 'ru', 2).value, '');
  assert.equal(parse('12abc3', 'ru', 0).value, '123');
  assert.equal(parse('-1 250', 'ru', 0, true).value, '-1250');
  assert.equal(parse('-1 250', 'ru', 0, false).value, '1250', 'минус не принимается, если min ≥ 0');
  assert.equal(parse('007', 'ru', 0).value, '7');
  assert.equal(parse('-', 'ru', 0, true).value, '', 'один знак — не число');
  assert.equal(parse(',5', 'ru', 2).value, '0.5');
});

test('монтирование: спутник с именем и числом, на экране — разряды по локали документа', () => {
  const { G, doc } = setup(PARTS);
  const { input, companion } = field(doc, { value: '1250000' });

  G.start();

  assert.ok(G.instance(input, 'number'), 'виджет не поднялся');
  assert.equal(plain(input.value), '1 250 000');
  assert.equal(input.getAttribute('name'), null, 'имя осталось на видимом поле');
  assert.equal(input.getAttribute('inputmode'), 'decimal');

  const c = companion();

  assert.ok(c && c.tagName === 'INPUT', 'спутник не создан');
  assert.equal(c.getAttribute('type'), 'number');
  assert.equal(c.getAttribute('name'), 'amount');
  assert.equal(c.hasAttribute('hidden'), true);
  assert.equal(c.getAttribute('step'), 'any');
  assert.equal(c.value, '1250000');

  G.destroy();

  assert.equal(input.value, '1250000', 'destroy не вернул число в поле');
  assert.equal(input.getAttribute('name'), 'amount');
  assert.equal(input.getAttribute('inputmode'), null);
  assert.equal(companion(), undefined, 'спутник остался после destroy');
});

test('ввод: разряды вставляются на ходу, каретка держится за той же цифрой, дробь — по локали', () => {
  const { G, doc } = setup(PARTS);
  const { input, companion } = field(doc, { 'data-gr-number': 'decimals: 2' }, 'ru');
  const seen = [];

  input.addEventListener('griffin:change', (e) => seen.push(e.detail.value));
  input.addEventListener('input', () => seen.push('input'));
  G.start();

  const w = G.instance(input, 'number');

  assert.equal(w.el, input);

  typed(input, '1');
  typed(input, '2');
  typed(input, '5');
  typed(input, '0');
  assert.equal(plain(input.value), '1 250');
  assert.equal(caret(input), input.value.length);
  assert.equal(companion().value, '1250');

  typed(input, '000');
  assert.equal(plain(input.value), '1 250 000');
  assert.equal(companion().value, '1250000');
  assert.deepEqual(seen.filter((v) => v !== 'input'), ['1', '12', '125', '1250', '1250000']);
  assert.equal(seen.filter((v) => v === 'input').length, 5, 'input не по одному на правку');

  // Цифра в середину — перед разделителем: каретка остаётся за ней.
  // «1 250 000» → вставка «9» после «1» → «19 250 000», каретка после «19».
  typed(input, '9', 1);
  assert.equal(plain(input.value), '19 250 000');
  assert.equal(caret(input), 2);

  // Дробь: точка принимается, на экране — запятая локали.
  typed(input, '.');
  assert.equal(plain(input.value), '19 250 000,');
  assert.equal(companion().value, '19250000');
  typed(input, '5');
  assert.equal(plain(input.value), '19 250 000,5');
  assert.equal(companion().value, '19250000.5');
  typed(input, '05');
  assert.equal(plain(input.value), '19 250 000,50', 'вторая цифра дроби принята, третья — отброшена');
  assert.equal(companion().value, '19250000.50');

  // Backspace перешагивает разделитель разрядов и снимает цифру.
  edit(input, 'deleteContentBackward', 3);
  assert.equal(plain(input.value), '1 250 000,50');
  assert.equal(caret(input), 1);

  // Уход фокуса дополняет дробь до decimals и шлёт change.
  const changes = [];

  input.addEventListener('change', () => changes.push(input.value));
  input.dispatchEvent(event('focus', input));
  typed(input, '9', 0);
  assert.equal(plain(input.value), '91 250 000,50');
  edit(input, 'deleteContentBackward', input.value.length);
  edit(input, 'deleteContentBackward', input.value.length);
  assert.equal(plain(input.value), '91 250 000,');
  input.dispatchEvent(event('blur', input));
  assert.equal(plain(input.value), '91 250 000,00');
  assert.equal(companion().value, '91250000');
  assert.equal(changes.length, 1);

  G.destroy();
});

test('decimals: 2 — значение с дробью показывается с двумя знаками; en — точка и запятые', () => {
  const { G, doc } = setup(PARTS);
  const { input, companion } = field(doc, { value: '1250000.5', 'data-gr-number': 'decimals: 2' }, 'en');

  G.start();
  assert.equal(input.value, '1,250,000.50');
  assert.equal(companion().value, '1250000.5', 'спутник несёт число как есть, дополняет дробь только экран');

  // Вставка в любой записи читается одинаково.
  paste(input, '1 250 000,50');
  assert.equal(input.value, '1,250,000.50');
  assert.equal(companion().value, '1250000.50');
  paste(input, '2500000.75');
  assert.equal(input.value, '2,500,000.75');
  assert.equal(companion().value, '2500000.75');
  paste(input, '3,000,000');
  assert.equal(companion().value, '3000000');

  // Буква не принимается: значение и каретка на месте.
  typed(input, 'x');
  assert.equal(input.value, '3,000,000');
  assert.equal(caret(input), input.value.length);

  G.destroy();
  assert.equal(input.value, '3000000');
});

test('decimals по умолчанию 0: дробь отбрасывается; без lang — язык navigator, иначе en', () => {
  const { G, doc } = setup(PARTS);
  const { input, companion } = field(doc, { value: '1250000.5' }, null);

  doc.documentElement.removeAttribute('lang');
  G.start();
  assert.equal(companion().value, '1250000');

  const expected = new Intl.NumberFormat(typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en', { maximumFractionDigits: 0 }).format(1250000);

  assert.equal(input.value, expected);

  G.destroy();
});

test('границы min/max с поля: спутник несёт их, вне границ checkValidity() false; красное — по уходу фокуса', () => {
  const { G, doc } = setup(PARTS);
  const { input, companion } = field(doc, { min: '100', max: '5000', value: '250' });

  G.start();

  const c = companion();

  assert.equal(c.getAttribute('min'), '100');
  assert.equal(c.getAttribute('max'), '5000');
  assert.equal(input.checkValidity(), true);

  typed(input, '0');
  assert.equal(companion().value, '2500');
  typed(input, '0');
  assert.equal(companion().value, '25000');
  assert.equal(input.checkValidity(), false, 'значение выше max прошло проверку');
  assert.equal(input.validationMessage, 'Значение вне допустимых границ');
  assert.equal(input.getAttribute('aria-invalid'), null, 'покраснело до ухода фокуса');

  input.dispatchEvent(event('blur', input));
  assert.equal(input.getAttribute('aria-invalid'), 'true');

  edit(input, 'deleteContentBackward', input.value.length);
  assert.equal(input.checkValidity(), true);
  assert.equal(input.getAttribute('aria-invalid'), null, 'верное значение осталось красным');

  // Минус при min ≥ 0 не принимается; свой текст сообщения — параметром.
  typed(input, '-', 0);
  assert.equal(companion().value, '2500');

  // Пустое поле — забота required платформы, не виджета.
  paste(input, '');
  assert.equal(companion().value, '');
  assert.equal(input.validationMessage, '');

  G.destroy();
  assert.equal(input.validationMessage, '');
});

test('отрицательные при min < 0; API set пишет число и шлёт input; своё сообщение о границах', () => {
  const { G, doc } = setup(PARTS);
  const { input, companion } = field(doc, { min: '-1000', 'data-gr-number': 'range: Не в пределах' });
  const seen = [];

  input.addEventListener('input', () => seen.push(input.value));
  G.start();

  const w = G.instance(input, 'number');

  typed(input, '-');
  typed(input, '5');
  assert.equal(input.value, '-5');
  assert.equal(companion().value, '-5');

  w.set('-2500');
  assert.equal(plain(input.value), '-2 500');
  assert.equal(companion().value, '-2500');
  assert.equal(w.value(), '-2500');
  assert.equal(input.validationMessage, 'Не в пределах');
  assert.equal(seen.length, 3);

  w.set(1250.5);
  assert.equal(plain(input.value), '1 250', 'set с дробью при decimals: 0');

  G.destroy();
});

test('композиция и автозаполнение: виджет отступает, потом приводит значение к формату', () => {
  const { G, doc } = setup(PARTS);
  const { input, companion } = field(doc, {});

  G.start();

  const e = edit(input, 'insertCompositionText', 0, { data: '１', isComposing: true });

  assert.equal(e.defaultPrevented, false);

  // Автозаполнение: браузер записал сам — виджет приводит к формату по input.
  input.value = '1250000';
  input.dispatchEvent(event('input', input));
  assert.equal(plain(input.value), '1 250 000');
  assert.equal(companion().value, '1250000');

  G.destroy();
});
