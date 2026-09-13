'use strict';

// Поле телефона GriffinJS на мок-DOM: смена кода меняет маску, вставка
// полного номера с кодом выбирает страну, имя приходит из Intl.DisplayNames
// в языке страницы, флаг собирается из ISO, а отсутствие таблицы стран
// виджет не роняет. Таблица — отдельный модуль, который ничего
// не регистрирует: он кладёт состав в G.phone.table на старте.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/mask.js', 'fields/phone.js'];
const WITH_TABLE = [...PARTS, 'fields/countries.js'];

const option = (code, iso, mask, attrs) => el('option', Object.assign({ value: code, 'data-gr-iso': iso, 'data-gr-format': mask }, attrs));

// Группа «код + номер»; без options список пустой — путь таблицы.
function phone(doc, options, attrs) {
  const select = el('select', { class: 'gr-select', name: 'code', 'aria-label': 'Код страны' }, options || []);
  const input = el('input', { class: 'gr-input', type: 'tel', name: 'phone' });
  const group = mount(doc, el('div', Object.assign({ class: 'gr-input-group', 'data-gr-phone': '' }, attrs), [select, input]));

  input.setSelectionRange(0, 0);

  return { group, select, input };
}

const RU = () => option('+7', 'RU', '(000) 000-00-00', { selected: '' });
const BY = () => option('+375', 'BY', '(00) 000-00-00');

function quiet(fn) {
  const said = [];
  const before = console.warn;

  console.warn = (message) => said.push(String(message));

  try {
    fn();
  } finally {
    console.warn = before;
  }

  return said;
}

test('флаг собирается из ISO кодовыми точками, имя страны — у платформы в языке страницы', () => {
  const { G } = setup(PARTS);

  assert.equal(G.phone.flag('RU'), '🇷🇺');
  assert.equal(G.phone.flag('by'), '🇧🇾', 'регистр ISO не важен');
  assert.equal(G.phone.flag(''), '');
  assert.equal(G.phone.flag('RUS'), '', 'три буквы — не ISO2');

  assert.equal(G.phone.name('RU', 'ru'), 'Россия');
  assert.equal(G.phone.name('DE', 'en'), 'Germany');
  assert.equal(G.phone.name('DE', 'de'), 'Deutschland');
  assert.equal(G.phone.name('', 'ru'), '', 'пустой ISO — пустое имя, а не исключение');
});

test('состав — из разметки: маска по выбранному коду, подписи стран из Intl, смена кода меняет маску', () => {
  const { G, doc } = setup(PARTS);

  doc.documentElement.setAttribute('lang', 'ru');

  const { group, select, input } = phone(doc, [RU(), BY()]);
  const seen = [];

  group.addEventListener('griffin:change', (e) => seen.push(e.detail));
  G.start();

  const widget = G.instance(group, 'phone');

  assert.ok(widget, 'виджет не поднялся');
  assert.ok(G.instance(input, 'mask'), 'маска на номере не надета');
  assert.equal(input.getAttribute('placeholder'), '(___) ___-__-__');

  // Подписи: флаг + имя в языке страницы + код. Значения не тронуты.
  assert.equal(select.options[0].textContent, '🇷🇺 Россия +7');
  assert.equal(select.options[1].textContent, '🇧🇾 Беларусь +375');
  assert.equal(select.options[0].value, '+7');

  input.setSelectionRange(0, 0);
  input.dispatchEvent(event('beforeinput', input, { inputType: 'insertText', data: '9123456789' }));
  assert.equal(input.value, '(912) 345-67-89');
  assert.equal(widget.value(), '+79123456789');

  // Смена страны: знаки те же, раскладка другая, событие с составом.
  select.selectedIndex = 1;
  select.dispatchEvent(event('change', select));

  assert.equal(input.value, '(91) 234-56-78');
  assert.equal(input.getAttribute('placeholder'), '(__) ___-__-__');
  assert.equal(seen.length, 1);
  assert.deepEqual([seen[0].iso, seen[0].code, seen[0].value], ['BY', '+375', '+375912345678']);

  G.destroy();

  assert.equal(select.options[0].textContent, '', 'destroy не вернул подпись автора');
  assert.equal(G.instance(input, 'mask'), null, 'destroy не снял маску');
  assert.equal(input.getAttribute('placeholder'), null);
});

test('полный номер с кодом — вставка и автозаполнение — выбирает страну по самому длинному коду', () => {
  const { G, doc } = setup(PARTS);
  const { group, select, input } = phone(doc, [RU(), BY(), option('+1', 'US', '(000) 000-0000'), option('+1', 'CA', '(000) 000-0000')]);

  G.start();

  const widget = G.instance(group, 'phone');

  // Вставка: событие paste идёт раньше beforeinput, и виджет забирает его целиком.
  const paste = event('paste', input, { clipboardData: { getData: () => '+375 29 123-45-67' } });

  input.dispatchEvent(paste);

  assert.equal(paste.defaultPrevented, true);
  assert.equal(select.selectedIndex, 1);
  assert.equal(input.value, '(29) 123-45-67');
  assert.equal(widget.value(), '+375291234567');

  // Вставка без плюса — обычный ввод, страна не меняется.
  const plain = event('paste', input, { clipboardData: { getData: () => '29 765-43-21' } });

  input.dispatchEvent(plain);
  assert.equal(plain.defaultPrevented, false);
  assert.equal(select.selectedIndex, 1);

  // Автозаполнение: браузер записал полный номер и прислал input без beforeinput.
  input.value = '+79995554433';
  input.dispatchEvent(event('input', input));

  assert.equal(select.selectedIndex, 0);
  assert.equal(input.value, '(999) 555-44-33');

  // Первая из стран с одним кодом.
  input.value = '+12025550123';
  input.dispatchEvent(event('input', input));
  assert.equal(select.selectedIndex, 2);
  assert.equal(input.value, '(202) 555-0123');

  // Неизвестный код: страна прежняя, знаки ложатся в её маску.
  input.value = '+9991234567';
  input.dispatchEvent(event('input', input));
  assert.equal(select.selectedIndex, 2);

  G.destroy();
});

test('национальный префикс: одиннадцатый знак к десяти в маске снимает восьмёрку — набором, вставкой и автозаполнением', () => {
  const { G, doc } = setup(PARTS);
  const { select, input } = phone(doc, [option('+7', 'RU', '(000) 000-00-00', { selected: '', 'data-gr-trunk': '8' }), BY()]);

  G.start();

  // Набор по знаку: «8912345678» — десять знаков, обычный номер с восьмёрки.
  input.setSelectionRange(0, 0);
  input.dispatchEvent(event('beforeinput', input, { inputType: 'insertText', data: '8912345678' }));
  assert.equal(input.value, '(891) 234-56-78');

  // Одиннадцатый знак: восьмёрка была префиксом, номер сдвигается.
  input.setSelectionRange(input.value.length, input.value.length);

  const eleventh = event('beforeinput', input, { inputType: 'insertText', data: '9' });

  input.dispatchEvent(eleventh);
  assert.equal(eleventh.defaultPrevented, true);
  assert.equal(input.value, '(912) 345-67-89');

  // Вставка полного номера с восьмёркой — без плюса.
  const paste = event('paste', input, { clipboardData: { getData: () => '8 (999) 111-22-33' } });

  input.dispatchEvent(paste);
  assert.equal(paste.defaultPrevented, true);
  assert.equal(input.value, '(999) 111-22-33');

  // Автозаполнение.
  input.value = '89995554433';
  input.dispatchEvent(event('input', input));
  assert.equal(input.value, '(999) 555-44-33');

  // У страны без префикса восьмёрка — обычная цифра.
  select.selectedIndex = 1;
  select.dispatchEvent(event('change', select));
  input.value = '';
  input.setSelectionRange(0, 0);
  input.dispatchEvent(event('beforeinput', input, { inputType: 'insertText', data: '8291234567' }));
  assert.equal(input.value, '(82) 912-34-56');

  G.destroy();
});

test('пустой список без таблицы виджет не роняет: предупреждение, номер без маски', () => {
  const { G, doc } = setup(PARTS);
  const { group, input } = phone(doc, []);
  const said = quiet(() => G.start());

  assert.ok(G.instance(group, 'phone'), 'виджет упал на пустом списке');
  assert.equal(G.instance(input, 'mask'), null);
  assert.equal(said.length, 1, `предупреждений — ${said.length}: ${said}`);
  assert.match(said[0], /griffinjs-countries\.js/);

  input.value = '9123456789';
  input.dispatchEvent(event('input', input));
  assert.equal(input.value, '9123456789', 'без маски значение не трогается');

  G.destroy();
});

test('таблица стран: пустой список заполняется на старте и сортируется по имени в языке страницы', () => {
  const { G, doc } = setup(WITH_TABLE);

  doc.documentElement.setAttribute('lang', 'ru');

  const { group, select, input } = phone(doc, [], { 'data-gr-phone': 'country: by' });
  const said = quiet(() => G.start());

  assert.deepEqual(said, [], `таблица подключена, а виджет жалуется: ${said}`);
  assert.ok(G.phone.table.length > 50, 'таблица короче ожидаемого');

  // Подпись — «флаг имя код»; порядок задаёт имя, а не флаг.
  const names = select.options.map((o) => o.textContent.replace(/^\S+ /, '').replace(/ \+\d+$/, ''));

  assert.ok(select.options.length > 50);
  assert.equal(names[0], 'Австралия');
  assert.deepEqual(names.slice().sort(new Intl.Collator('ru').compare), names, 'список не по алфавиту');

  // Начальная страна — из параметра, регистр не важен.
  const current = select.options[select.selectedIndex];

  assert.equal(current.getAttribute('data-gr-iso'), 'BY');
  assert.equal(current.value, '+375');
  assert.equal(input.getAttribute('placeholder'), '(__) ___-__-__');

  // Каждая строка таблицы — ISO2, код, маска и, где есть, национальный
  // префикс; ничего больше.
  for (const row of G.phone.table) {
    assert.ok(row.length === 3 || row.length === 4, `строка ${row[0]} длиной ${row.length}`);
    assert.match(row[0], /^[A-Z]{2}$/);
    assert.match(row[1], /^\+\d{1,4}$/);
    assert.match(row[2], /^[0 ()?-]+$/, `маска ${row[0]} с чужими знаками: ${row[2]}`);
    if (row.length === 4) assert.match(row[3], /^\d$/);
  }

  // Префикс из таблицы попадает на позицию: у России и Казахстана — «8».
  const ru = select.options.find((o) => o.getAttribute('data-gr-iso') === 'RU');

  assert.equal(ru.getAttribute('data-gr-trunk'), '8');

  G.destroy();

  assert.equal(select.options.length, 0, 'destroy не убрал добавленные страны');
});

test('таблица без country: первая страна по алфавиту остаётся, но виджет предупреждает; авторский список молчит', () => {
  // Список из таблицы без country — на русской странице первой стоит
  // Австралия, +61. Поведение не меняется: угадывать страну за автора
  // значило бы ошибаться тише, чем сейчас. Меняется только тишина.
  {
    const { G, doc } = setup(WITH_TABLE);

    doc.documentElement.setAttribute('lang', 'ru');

    const { group, select } = phone(doc, []);
    const said = quiet(() => G.start());

    assert.ok(G.instance(group, 'phone'), 'виджет не поднялся');
    assert.equal(select.selectedIndex, 0, 'первая по алфавиту — поведение прежнее');
    assert.equal(select.options[0].getAttribute('data-gr-iso'), 'AU');
    assert.equal(said.length, 1, `предупреждений — ${said.length}: ${said}`);
    assert.match(said[0], /страна не задана/);
    assert.match(said[0], /country/, 'предупреждение обязано назвать параметр, которым снимается');

    G.destroy();
  }

  // Авторские <option> без country — порядок выбрал автор, предупреждать
  // не о чем; таблица при этом подключена и не при делах.
  {
    const { G, doc } = setup(WITH_TABLE);
    const { select } = phone(doc, [BY(), option('+7', 'RU', '(000) 000-00-00')]);
    const said = quiet(() => G.start());

    assert.deepEqual(said, [], `авторский список, а виджет жалуется: ${said}`);
    assert.equal(select.selectedIndex, 0);

    G.destroy();
  }
});

test('таблица без поля телефона предупреждает на старте, а не молчит', () => {
  const { G } = setup(['core/options.js', 'core/registry.js', 'fields/countries.js']);
  const said = quiet(() => G.start());

  assert.ok(said.some((line) => line.includes('countries') && line.includes('griffinjs-phone.js')), `сказано: ${said}`);

  G.destroy();
});

test('names: false — подписи автора не переписываются', () => {
  const { G, doc } = setup(PARTS);
  const ru = RU();

  ru.textContent = 'Россия';

  const { select } = phone(doc, [ru, BY()], { 'data-gr-phone': 'names: false' });

  G.start();
  assert.equal(select.options[0].textContent, 'Россия');
  G.destroy();
});

test('смена страны пересчитывает недобор: десять знаков RU — девять BY; полнота уезжает в событие', () => {
  const { G, doc } = setup(PARTS);
  const { group, select, input } = phone(doc, [RU(), BY()]);
  const seen = [];

  group.addEventListener('griffin:change', (e) => seen.push(e.detail));
  G.start();

  const widget = G.instance(group, 'phone');

  // Девять знаков при десяти в маске RU — недобор.
  input.setSelectionRange(0, 0);
  input.dispatchEvent(event('beforeinput', input, { inputType: 'insertText', data: '912345678' }));

  assert.equal(input.checkValidity(), false, 'девять знаков из десяти форму не проходят');
  assert.equal(widget.value(), '+7912345678', 'value отражает набранное — это его работа');

  // BY: тех же девяти знаков хватает — значение стало полным.
  select.selectedIndex = 1;
  select.dispatchEvent(event('change', select));

  assert.equal(input.value, '(91) 234-56-78');
  assert.equal(input.checkValidity(), true, 'полное значение битым от смены страны не становится');
  assert.equal(seen[seen.length - 1].complete, true, 'полнота уезжает признаком, а не догадкой по длине');

  // И обратно: в маске RU тех же знаков снова мало.
  select.selectedIndex = 0;
  select.dispatchEvent(event('change', select));

  assert.equal(input.checkValidity(), false, 'неполное значение валидным от смены страны не становится');
  assert.equal(seen[seen.length - 1].complete, false);

  // Десятый знак — и номер полон.
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(event('beforeinput', input, { inputType: 'insertText', data: '9' }));

  assert.equal(input.value, '(912) 345-67-89');
  assert.equal(input.checkValidity(), true);

  G.destroy();
  assert.equal(input.validationMessage, '', 'destroy вернул поле в валидное состояние');
});
