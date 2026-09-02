'use strict';

// Маска GriffinJS на мок-DOM: разбор формата в токены, прогон текста
// по маске, каретка после ввода, удаления и вставки, отступление
// на композиции и автозаполнении, снятие всего в destroy.
//
// Формат — строка токенов, не regex: из неё получаются и подсказка
// пустого поля, и позиция каретки. pattern на элементе виджет не трогает —
// проверяет платформа.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/mask.js'];

const PHONE = '+7 (000) 000-00-00';

function input(doc, attrs) {
  const node = mount(doc, el('input', Object.assign({ class: 'gr-input', type: 'tel' }, attrs)));

  node.setSelectionRange(0, 0);

  return node;
}

// Ввод как в браузере: каретка стоит, приходит beforeinput. Отменённое
// событие браузер не доводит до input — значение пишет сам виджет.
function edit(node, type, at, extra) {
  const [start, end] = Array.isArray(at) ? at : [at, at];

  node.setSelectionRange(start, end);

  const e = event('beforeinput', node, Object.assign({ inputType: type }, extra));

  node.dispatchEvent(e);

  return e;
}

const typed = (node, text, at) => edit(node, 'insertText', at === undefined ? node.value.length : at, { data: text });
const caret = (node) => [node.selectionStart, node.selectionEnd];

test('разбор формата: слоты, литералы, экранирование и необязательный хвост', () => {
  const { G } = setup(PARTS);
  const { parse } = G.mask;

  assert.deepEqual(parse('0-a').map((t) => t.lit !== undefined ? t.lit : t.slot), ['0', '-', 'a']);

  // \0 — литерал «0», а не слот цифры.
  const escaped = parse('\\00');

  assert.deepEqual(escaped, [{ lit: '0' }, { slot: '0', optional: false }]);

  // ? ничего не занимает: всё после него необязательно.
  const tail = parse('000?-00');

  assert.equal(tail.length, 6);
  assert.deepEqual(tail.filter((t) => t.slot).map((t) => t.optional), [false, false, false, true, true]);

  assert.equal(G.mask.hint(parse(PHONE)), '+7 (___) ___-__-__');
  assert.equal(G.mask.hint(parse('AA-00'), '•'), '••-••');
});

test('прогон по маске: литералы ленивые, чужие знаки отбрасываются, лишнее не влезает', () => {
  const { G } = setup(PARTS);
  const tokens = G.mask.parse(PHONE);
  const run = (text) => G.mask.run(tokens, text);

  assert.equal(run('').value, '');
  assert.equal(run('9').value, '+7 (9');
  assert.equal(run('912').value, '+7 (912', 'литерал после заполненной группы ставится только перед следующим знаком');
  assert.equal(run('9123').value, '+7 (912) 3');
  assert.equal(run('9123456789').value, '+7 (912) 345-67-89');
  assert.equal(run('91234567890000').value, '+7 (912) 345-67-89', 'лишние знаки отброшены');
  assert.equal(run('9a1b2').value, '+7 (912', 'буквы в цифровых слотах отброшены');

  // Полный номер с литералами проходит как есть: литерал маски съедает
  // такой же знак текста, а не ждёт цифру.
  const pasted = run('+7 (912) 345-67-89');

  assert.equal(pasted.value, '+7 (912) 345-67-89');
  assert.equal(pasted.raw, '9123456789');
  assert.equal(pasted.complete, true);
  assert.equal(run('912345').complete, false);

  // Позиции знаков в отформатированном значении — по ним считается каретка.
  assert.deepEqual(run('912').slots, [4, 5, 6]);
});

test('слоты букв: a — любая, A — в верхний регистр, * — буква или цифра; хвост после ? необязателен', () => {
  const { G } = setup(PARTS);
  const plate = G.mask.parse('A 000 AA?-000');

  assert.equal(G.mask.run(plate, 'а123вс').value, 'А 123 ВС', 'кириллица — тоже буква, и регистр поднят');
  assert.equal(G.mask.run(plate, 'а123вс').complete, true, 'без хвоста маска полна');
  assert.equal(G.mask.run(plate, 'а123вс77').value, 'А 123 ВС-77');
  assert.equal(G.mask.run(plate, '1').value, '', 'цифра в слоте буквы не принята');

  const mixed = G.mask.parse('**-aa');

  assert.equal(G.mask.run(mixed, '1xЯ7').value, '1x-Я');
});

test('монтирование: значение приводится к формату, подсказка и inputmode — из маски, pattern не тронут', () => {
  const { G, doc } = setup(PARTS);
  const node = input(doc, { 'data-gr-mask': PHONE, value: '9123456789', pattern: '.+' });
  const plain = input(doc, { 'data-gr-mask': 'AA-00', placeholder: 'Свой', inputmode: 'text' });

  G.start();

  assert.equal(node.value, '+7 (912) 345-67-89');
  assert.equal(node.getAttribute('placeholder'), '+7 (___) ___-__-__');
  assert.equal(node.getAttribute('inputmode'), 'numeric', 'маска из одних цифр просит цифровую клавиатуру');
  assert.equal(node.getAttribute('pattern'), '.+', 'pattern — дело платформы');
  assert.equal(node.getAttribute('data-gr-state'), 'complete');

  // Своя подсказка и свой inputmode остаются: маска дописывает, а не переписывает.
  assert.equal(plain.getAttribute('placeholder'), 'Свой');
  assert.equal(plain.getAttribute('inputmode'), 'text');
  assert.equal(plain.getAttribute('data-gr-state'), 'empty');

  G.destroy();

  assert.equal(node.getAttribute('placeholder'), null, 'destroy не снял подсказку');
  assert.equal(node.getAttribute('inputmode'), null, 'destroy не снял inputmode');
  assert.equal(node.getAttribute('data-gr-state'), null);
  assert.equal(node.value, '+7 (912) 345-67-89', 'значение остаётся: оно и есть то, что ввёл человек');
});

test('ввод: значение пишет виджет, каретка встаёт за введённым знаком, после литералов — тоже', () => {
  const { G, doc } = setup(PARTS);
  const node = input(doc, { 'data-gr-mask': PHONE });
  const seen = [];

  node.addEventListener('input', () => seen.push(node.value));
  G.start();

  let e = typed(node, '9');

  assert.equal(e.defaultPrevented, true, 'браузеру оставили писать самому');
  assert.equal(node.value, '+7 (9');
  assert.deepEqual(caret(node), [5, 5]);

  typed(node, '1');
  typed(node, '2');
  assert.equal(node.value, '+7 (912');
  assert.deepEqual(caret(node), [7, 7]);

  // Следующая цифра тянет за собой литералы «) »: каретка — за ней, а не перед ними.
  typed(node, '3');
  assert.equal(node.value, '+7 (912) 3');
  assert.deepEqual(caret(node), [10, 10]);

  // Буква в цифровом слоте: ничего не изменилось, каретка на месте.
  e = typed(node, 'x');
  assert.equal(e.defaultPrevented, true);
  assert.equal(node.value, '+7 (912) 3');
  assert.deepEqual(caret(node), [10, 10]);

  // Каждый принятый знак — событие input: управляемое поле фреймворка
  // узнаёт о значении так же, как о набранном руками. Отброшенная буква
  // события не даёт: значение не менялось.
  assert.deepEqual(seen, ['+7 (9', '+7 (91', '+7 (912', '+7 (912) 3']);
  assert.equal(node.getAttribute('data-gr-state'), 'partial');

  G.destroy();
});

test('ввод в середину сдвигает хвост, каретка остаётся у введённого знака', () => {
  const { G, doc } = setup(PARTS);
  const node = input(doc, { 'data-gr-mask': '000-000', value: '12456' });

  G.start();
  assert.equal(node.value, '124-56');

  // Каретка между «2» и «4»; вводим «3».
  typed(node, '3', 2);
  assert.equal(node.value, '123-456');
  assert.deepEqual(caret(node), [3, 3]);

  // Замена выделения: «-4» выделено, вводим «9» — выделенный знак ушёл.
  typed(node, '9', [3, 5]);
  assert.equal(node.value, '123-956');
  assert.deepEqual(caret(node), [5, 5]);

  G.destroy();
});

test('Backspace и Delete: удаляется знак, а не литерал; вставка из буфера — с литералами и без', () => {
  const { G, doc } = setup(PARTS);
  const node = input(doc, { 'data-gr-mask': PHONE, value: '9123456789' });

  G.start();
  assert.equal(node.value, '+7 (912) 345-67-89');

  // Backspace сразу после «) »: литералы перешагиваются, уходит «2».
  edit(node, 'deleteContentBackward', 9);
  assert.equal(node.value, '+7 (913) 456-78-9');
  assert.deepEqual(caret(node), [6, 6]);

  // Delete перед «) »: уходит первый знак после литералов — «4».
  edit(node, 'deleteContentForward', 7);
  assert.equal(node.value, '+7 (913) 567-89');
  assert.deepEqual(caret(node), [7, 7]);

  // Backspace у начала, перед первым знаком: удалять нечего, ничего не меняется.
  const e = edit(node, 'deleteContentBackward', 4);

  assert.equal(e.defaultPrevented, true);
  assert.equal(node.value, '+7 (913) 567-89');
  assert.deepEqual(caret(node), [4, 4]);

  // Вставка полного номера с литералами поверх всего.
  edit(node, 'insertFromPaste', [0, node.value.length], { dataTransfer: { getData: () => '+7 (999) 111-22-33' } });
  assert.equal(node.value, '+7 (999) 111-22-33');
  assert.deepEqual(caret(node), [18, 18]);

  // И вставка голых цифр в пустое поле.
  edit(node, 'insertFromPaste', [0, node.value.length], { dataTransfer: { getData: () => '9990001122' } });
  assert.equal(node.value, '+7 (999) 000-11-22');

  G.destroy();
});

test('композиция и автозаполнение: маска отступает, а потом приводит значение к формату', () => {
  const { G, doc } = setup(PARTS);
  const node = input(doc, { 'data-gr-mask': PHONE });

  G.start();

  // Событие композиции не отменяется: браузер ведёт ввод сам.
  let e = edit(node, 'insertCompositionText', 0, { data: '9', isComposing: true });

  assert.equal(e.defaultPrevented, false);
  assert.equal(node.value, '');

  // Пока композиция идёт, input с isComposing тоже не трогается.
  node.value = '91';
  node.dispatchEvent(event('input', node, { isComposing: true }));
  assert.equal(node.value, '91');

  // Конец композиции: значение приводится к формату.
  node.dispatchEvent(event('compositionend', node));
  assert.equal(node.value, '+7 (91');

  // Автозаполнение: input без beforeinput и с чужим значением.
  node.value = '+79995554433';
  node.dispatchEvent(event('input', node));
  assert.equal(node.value, '+7 (999) 555-44-33');

  // Неизвестный тип правки (отмена, замена слова) не отменяется.
  e = edit(node, 'historyUndo', 5);
  assert.equal(e.defaultPrevented, false);

  G.destroy();
});

test('API: set пишет значение и шлёт input, use меняет формат с сохранением знаков', () => {
  const { G, doc } = setup(PARTS);
  const node = input(doc, { 'data-gr-mask': PHONE });
  const seen = [];

  node.addEventListener('input', () => seen.push(node.value));
  G.start();

  const mask = G.instance(node, 'mask');

  mask.set('9123456789');
  assert.equal(node.value, '+7 (912) 345-67-89');
  assert.equal(mask.raw(), '9123456789');
  assert.equal(mask.complete(), true);
  assert.deepEqual(seen, ['+7 (912) 345-67-89']);

  // Смена формата (код страны в телефоне): знаки те же, раскладка другая.
  // Ноль в коде страны — литерал, и пишется экранированным.
  mask.use('+38\\0 (00) 000-00-00');
  assert.equal(node.value, '+380 (91) 234-56-78');
  assert.equal(node.getAttribute('placeholder'), '+380 (__) ___-__-__');
  assert.equal(mask.raw(), '912345678');

  G.destroy();
});

test('формат с двоеточием и параметры парами; поле без формата виджет не поднимает', () => {
  const { G, doc } = setup(PARTS);
  const time = input(doc, { 'data-gr-mask': '00:00', value: '1430' });
  const pairs = input(doc, { 'data-gr-mask': 'format: 00:00; hint: false', value: '0915' });
  const none = input(doc, { 'data-gr-mask': '' });
  const warnings = [];
  const before = console.warn;

  console.warn = (message) => warnings.push(message);

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(time.value, '14:30');
  assert.equal(time.getAttribute('placeholder'), '__:__');
  assert.equal(pairs.value, '09:15');
  assert.equal(pairs.getAttribute('placeholder'), null, 'hint: false — подсказки нет');
  assert.equal(G.instance(none, 'mask'), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /формат/);

  G.destroy();
});
