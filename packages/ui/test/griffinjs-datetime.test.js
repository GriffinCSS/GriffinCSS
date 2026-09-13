'use strict';

// Дата и время GriffinJS на мок-DOM. Главное здесь — договор с платформой:
// на тач-устройстве разметка не трогается вовсе, на указателе мыши тип
// подменяется на text, значение уходит в скрытый спутник в ISO, формат
// берётся из lang документа через Intl.DateTimeFormat, границы min/max
// проверяются виджетом через setCustomValidity, а destroy() возвращает
// нативный тип. Панель и каретка — на Playwright.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'core/anchor.js', 'fields/mask.js', 'fields/datetime.js'];

function field(doc, attrs, lang) {
  doc.documentElement.setAttribute('lang', lang || 'ru');

  const input = el('input', Object.assign({ class: 'gr-input', type: 'date', name: 'from', id: 'from', 'data-gr-datetime': '' }, attrs));
  const wrap = mount(doc, el('div', { class: 'gr-field' }, [input]));

  input.setSelectionRange(0, 0);

  return { wrap, input };
}

// Подмена типа откладывается виджетом на тик после нажатия — ждём его.
const pointer = async (node, type) => {
  node.dispatchEvent(event('pointerdown', node, { pointerType: type }));
  await new Promise((r) => setTimeout(r, 0));
};
const type = (node, text) => {
  node.setSelectionRange(0, node.value.length);
  node.dispatchEvent(event('beforeinput', node, { inputType: 'insertText', data: text }));
};

test('раскладка по локали: порядок частей и литералы — из Intl.DateTimeFormat', () => {
  const { G } = setup(PARTS);
  const { layout } = G.datetime;

  const ru = layout('ru', 'date');

  assert.equal(ru.mask, '00.00.0000');
  assert.deepEqual(ru.order, ['day', 'month', 'year']);

  const us = layout('en-US', 'date');

  assert.equal(us.mask, '00/00/0000');
  assert.deepEqual(us.order, ['month', 'day', 'year']);

  // Литералы экранируются, если совпадают с токенами маски; ISO-подобные
  // локали с дефисом — как есть.
  assert.equal(layout('sv', 'date').mask, '0000-00-00');

  // Время — всегда 24 часа, независимо от локали.
  assert.equal(layout('en-US', 'time').mask, '00:00');
  assert.deepEqual(layout('en-US', 'time').order, ['hour', 'minute']);

  const both = layout('ru', 'datetime');

  assert.deepEqual(both.order, ['day', 'month', 'year', 'hour', 'minute']);
  assert.match(both.mask, /^00\.00\.0000.+00:00$/);
});

test('разбор и запись: текст ↔ ISO, невозможные даты не проходят', () => {
  const { G } = setup(PARTS);
  const { layout, parse, format } = G.datetime;
  const ru = layout('ru', 'date');

  assert.equal(parse(ru, '15092026'), '2026-09-15');
  assert.equal(parse(ru, '29022024'), '2024-02-29', 'високосный год');
  assert.equal(parse(ru, '29022026'), '', 'февраль 2026 без 29-го');
  assert.equal(parse(ru, '31042026'), '', 'в апреле 30 дней');
  assert.equal(parse(ru, '00012026'), '', 'нулевой день');
  assert.equal(parse(ru, '0112'), '', 'неполный ввод — не дата');

  assert.equal(format(ru, '2026-09-15'), '15.09.2026');
  assert.equal(format(layout('en-US', 'date'), '2026-09-15'), '09/15/2026');

  const time = layout('ru', 'time');

  assert.equal(parse(time, '0930'), '09:30');
  assert.equal(parse(time, '2460'), '', 'часов и минут столько не бывает');
  assert.equal(format(time, '14:05'), '14:05');

  const both = layout('ru', 'datetime');

  assert.equal(parse(both, '150920261430'), '2026-09-15T14:30');
  assert.equal(format(both, '2026-09-15T14:30').replace(/\s+/g, ' '), '15.09.2026, 14:30');
});

test('на тач-устройстве виджет разметку не трогает: системный календарь остаётся', async () => {
  const { G, doc } = setup(PARTS);
  const { wrap, input } = field(doc, { value: '2026-09-01' });

  G.start();

  assert.ok(G.instance(input, 'datetime'), 'виджет не поднялся');
  assert.equal(input.getAttribute('type'), 'date');

  await pointer(input, 'touch');

  assert.equal(input.getAttribute('type'), 'date', 'тип подменён на тач-устройстве');
  assert.equal(input.value, '2026-09-01');
  assert.equal(input.getAttribute('name'), 'from');
  assert.equal(wrap.children.length, 1, 'спутник создан без надобности');
  assert.equal(G.instance(input, 'mask'), null);

  G.destroy();
});

test('на указателе мыши: тип text, маска по локали, ISO в спутнике, текст через Intl', async () => {
  const { G, doc } = setup(PARTS);
  const { wrap, input } = field(doc, { value: '2026-09-01', min: '2026-01-01', max: '2026-12-31' });
  const seen = [];

  input.addEventListener('griffin:change', (e) => seen.push(e.detail.value));
  G.start();
  await pointer(input, 'mouse');

  assert.equal(input.getAttribute('type'), 'text');
  assert.equal(input.value, '01.09.2026', 'текст — по локали ru');
  assert.equal(input.getAttribute('placeholder'), '__.__.____');
  assert.equal(input.getAttribute('inputmode'), 'numeric');
  assert.ok(G.instance(input, 'mask'), 'маска не надета');

  // Спутник: имя, нативный тип, границы и ISO — форма отправляет его.
  const companion = wrap.children[1];

  assert.ok(companion && companion.tagName === 'INPUT', 'спутник не создан');
  assert.equal(companion.getAttribute('type'), 'date');
  assert.equal(companion.getAttribute('name'), 'from');
  assert.equal(companion.getAttribute('min'), '2026-01-01');
  assert.equal(companion.hasAttribute('hidden'), true);
  assert.equal(companion.value, '2026-09-01');
  assert.equal(input.getAttribute('name'), null, 'имя осталось на видимом поле — форма отправит два значения');

  // Ввод: текст → ISO в спутнике, событие с ISO.
  type(input, '15092026');
  assert.equal(input.value, '15.09.2026');
  assert.equal(companion.value, '2026-09-15');
  assert.deepEqual(seen, ['2026-09-15']);
  assert.equal(input.validationMessage, '', 'верная дата помечена ошибкой');

  // Невозможная дата — своё сообщение, спутник пуст, поле помечено сразу.
  type(input, '31022026');
  assert.equal(companion.value, '');
  assert.equal(input.validationMessage, 'Такой даты нет');
  assert.equal(input.getAttribute('aria-invalid'), 'true', 'набранная целиком невозможная дата не покраснела');

  // Неполный ввод — не ошибка на экране, но и не значение для формы.
  type(input, '3102');
  assert.equal(input.getAttribute('aria-invalid'), null, 'неполная дата покраснела раньше времени');
  assert.ok(input.validationMessage);

  // Дата вне границ: платформа на text их не проверяет — проверяет виджет.
  type(input, '01012020');
  assert.equal(companion.value, '2020-01-01');
  assert.ok(input.validationMessage, 'дата ниже min не помечена');

  type(input, '15092026');
  assert.equal(input.validationMessage, '');

  // destroy возвращает нативный тип, ISO и имя; спутник исчезает.
  G.destroy();

  assert.equal(input.getAttribute('type'), 'date');
  assert.equal(input.value, '2026-09-15');
  assert.equal(input.getAttribute('name'), 'from');
  assert.equal(input.getAttribute('placeholder'), null);
  assert.equal(wrap.children.length, 1, 'спутник остался после destroy');
  assert.equal(G.instance(input, 'mask'), null);
});

test('время остаётся нативным, дата-время — маска по локали и время в панели', async () => {
  const { G, doc } = setup(PARTS);
  const { input: time } = field(doc, { type: 'time', value: '14:30', id: 't', name: 't' });
  const { input: both } = field(doc, { type: 'datetime-local', value: '2026-09-15T14:30', id: 'dt', name: 'dt' }, 'en-US');

  G.start();
  await pointer(time, 'mouse');
  await pointer(both, 'mouse');

  // Время виджет не трогает: выбор у платформы встроен в само поле.
  assert.equal(time.getAttribute('type'), 'time');
  assert.equal(time.value, '14:30');
  assert.equal(time.getAttribute('placeholder'), null);
  assert.equal(G.instance(time, 'mask'), null);

  assert.equal(both.value.replace(/\s+/g, ' '), '09/15/2026, 14:30');

  type(both, '123120261005');
  assert.equal(both.nextSibling.value, '2026-12-31T10:05');

  // Панель даты-времени несёт время нативным полем: смена времени пишет ISO.
  const widget = G.instance(both, 'datetime');

  widget.open();

  const clock = widget.panel.querySelector('.gr-datetime-clock-input');

  assert.ok(clock, 'в панели даты-времени нет времени');
  assert.equal(clock.getAttribute('type'), 'time');
  assert.equal(clock.value, '10:05');
  clock.value = '18:45';
  clock.dispatchEvent(event('change', clock));
  assert.equal(both.nextSibling.value, '2026-12-31T18:45');
  assert.equal(both.value.replace(/\s+/g, ' '), '12/31/2026, 18:45');

  // Выбор дня сохраняет время из панели.
  widget.panel.querySelector('[data-gr-date="2026-12-24"]').dispatchEvent(event('click', widget.panel.querySelector('[data-gr-date="2026-12-24"]')));
  assert.equal(both.nextSibling.value, '2026-12-24T18:45');

  G.destroy();

  assert.equal(both.getAttribute('type'), 'datetime-local');
  assert.equal(both.value, '2026-12-24T18:45');
  assert.equal(time.getAttribute('type'), 'time');
  assert.equal(time.value, '14:30');
});

test('уход фокуса возвращает нативный тип; фокус в панели его не трогает', async () => {
  const { G, doc } = setup(PARTS);
  const { wrap, input } = field(doc, { value: '2026-09-15' });
  const other = mount(doc, el('input', { id: 'other' }));

  G.start();
  await pointer(input, 'mouse');
  assert.equal(input.getAttribute('type'), 'text');

  const widget = G.instance(input, 'datetime');

  widget.open();

  // Фокус ушёл в список лет панели — поле остаётся текстовым.
  const years = widget.panel.querySelector('.gr-datetime-year');

  input.dispatchEvent(event('blur', input, { relatedTarget: years }));
  years.focus();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(input.getAttribute('type'), 'text', 'фокус в панели вернул нативный тип');

  // Фокус ушёл на другое поле — нативный тип, значок и подсказка платформы.
  other.focus();
  input.dispatchEvent(event('blur', input, { relatedTarget: other }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(input.getAttribute('type'), 'date');
  assert.equal(input.value, '2026-09-15');
  assert.equal(input.getAttribute('name'), 'from');
  assert.equal(wrap.children.length, 1, 'спутник остался после возврата');
  assert.equal(widget.panel.getAttribute('data-gr-state'), 'closed');

  // Следующий указатель мыши подменяет снова.
  await pointer(input, 'mouse');
  assert.equal(input.getAttribute('type'), 'text');
  assert.equal(input.value, '15.09.2026');

  G.destroy();
});

test('панель: сетка месяца, выбор клавиатурой через aria-activedescendant, Esc закрывает', async () => {
  const { G, doc } = setup(PARTS);
  const { input } = field(doc, { value: '2026-09-15' });

  G.start();
  await pointer(input, 'mouse');

  const widget = G.instance(input, 'datetime');

  widget.open();

  const panel = widget.panel;

  assert.ok(panel, 'панель не создана');
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('data-gr-state'), 'open');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  assert.equal(input.getAttribute('aria-controls'), panel.getAttribute('id'));

  // Сетка: 7 столбцов, выбранный день помечен, заголовок месяца — из Intl.
  const cells = panel.querySelectorAll('[role="gridcell"]');

  assert.equal(cells.length % 7, 0);
  assert.ok(cells.length >= 35);

  const selected = cells.filter((c) => c.getAttribute('aria-selected') === 'true');

  assert.equal(selected.length, 1);
  assert.equal(selected[0].textContent, '15');
  assert.match(panel.querySelector('[aria-live]').textContent, /сентябрь/i);

  // Год — отдельным списком в шапке; смена года листает сетку.
  const years = panel.querySelector('.gr-datetime-year');

  assert.equal(years.value, '2026');
  assert.ok(years.options.length > 100, 'список лет короче века');
  years.value = '2024';
  years.dispatchEvent(event('change', years));
  assert.equal(years.value, '2024');
  assert.equal(panel.querySelectorAll('[data-gr-date="2024-09-15"]').length, 1, 'сетка не перелистнулась на выбранный год');
  years.value = '2026';
  years.dispatchEvent(event('change', years));

  // Стрелка вниз — через неделю, Enter — выбор.
  const down = event('keydown', input, { key: 'ArrowDown' });

  input.dispatchEvent(down);
  assert.equal(down.defaultPrevented, true);

  let active = doc.body.querySelector('#' + input.getAttribute('aria-activedescendant'));

  assert.equal(active.textContent, '22');

  input.dispatchEvent(event('keydown', input, { key: 'ArrowRight' }));
  active = doc.body.querySelector('#' + input.getAttribute('aria-activedescendant'));
  assert.equal(active.textContent, '23');

  input.dispatchEvent(event('keydown', input, { key: 'PageDown' }));
  assert.match(panel.querySelector('[aria-live]').textContent, /октябрь/i);
  assert.equal(panel.querySelector('.gr-datetime-year').value, '2026');

  input.dispatchEvent(event('keydown', input, { key: 'Enter' }));
  assert.equal(input.value, '23.10.2026');
  assert.equal(input.nextSibling.value, '2026-10-23');
  assert.equal(panel.getAttribute('data-gr-state'), 'closed', 'выбор не закрыл панель');

  widget.open();

  const esc = event('keydown', input, { key: 'Escape' });

  input.dispatchEvent(esc);
  assert.equal(esc.defaultPrevented, true);
  assert.equal(panel.getAttribute('data-gr-state'), 'closed');
  assert.equal(input.getAttribute('aria-activedescendant'), null);

  G.destroy();

  assert.equal(doc.body.querySelector('[role="dialog"]'), null, 'destroy не убрал панель');
});

test('поле не того типа виджет не поднимает', () => {
  const { G, doc } = setup(PARTS);
  const { input } = field(doc, { type: 'text' });
  const said = [];
  const before = console.warn;

  console.warn = (m) => said.push(String(m));

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(input, 'datetime'), null);
  assert.equal(said.length, 1);
  assert.match(said[0], /type/);

  G.destroy();
});

// --- Диапазон «с — по» (Этап 43a) ------------------------------------------------
// Пара нативных полей, связанная атрибутом to: граница одного — значение
// другого через уже существующий путь min/max → спутник → check(); панель
// пустого поля открывается на месяце соседа; дни между концами — data-gr-in-range.

function pair(doc) {
  const { input: from } = field(doc, { id: 'from', name: 'from', max: '2026-12-31', 'data-gr-datetime': 'to: #until' });
  const { input: to } = field(doc, { id: 'until', name: 'until', min: '2026-01-01' });

  return { from, to };
}

test('пара: значение «с» — min у «по», значение «по» — max у «с»; авторская граница уже — остаётся', async () => {
  const { G, doc } = setup(PARTS);
  const { from, to } = pair(doc);
  const seen = [];

  from.addEventListener('griffin:change', (e) => seen.push(['from', e.detail]));
  to.addEventListener('griffin:change', (e) => seen.push(['to', e.detail]));
  G.start();

  assert.ok(G.instance(from, 'datetime') && G.instance(to, 'datetime'), 'пара не поднялась');
  assert.equal(to.getAttribute('min'), '2026-01-01', 'пустое «с» тронуло авторскую границу');
  assert.equal(from.getAttribute('max'), '2026-12-31');

  await pointer(from, 'mouse');
  type(from, '10092026');
  assert.equal(to.getAttribute('min'), '2026-09-10');
  assert.deepEqual(seen, [['from', { value: '2026-09-10', range: { from: '2026-09-10', to: '' } }]]);

  // Спутник «по» несёт ту же границу — платформа проверяет её сама.
  await pointer(to, 'mouse');
  assert.equal(to.nextSibling.getAttribute('min'), '2026-09-10');

  type(to, '20092026');
  assert.equal(from.getAttribute('max'), '2026-09-20');
  assert.equal(from.nextSibling.getAttribute('max'), '2026-09-20');
  assert.deepEqual(seen[1], ['to', { value: '2026-09-20', range: { from: '2026-09-10', to: '2026-09-20' } }]);
  assert.equal(to.checkValidity(), true);

  // «по» раньше «с» — ошибка ввода у «по», а не молчаливая правка «с».
  type(to, '05092026');
  assert.equal(to.checkValidity(), false);
  assert.equal(to.validationMessage, 'Дата вне допустимых границ');
  assert.equal(from.nextSibling.value, '2026-09-10', 'виджет переставил «с»');

  // Авторская граница уже, чем значение соседа, — остаётся авторская.
  type(from, '01062025');
  assert.equal(to.getAttribute('min'), '2026-01-01');
  assert.equal(to.nextSibling.getAttribute('min'), '2026-01-01');

  // Очистка снимает границу — обратно к авторской.
  type(to, '');
  assert.equal(from.getAttribute('max'), '2026-12-31');
  assert.equal(from.nextSibling.getAttribute('max'), '2026-12-31');

  type(from, '10092026');
  type(to, '20092026');
  assert.equal(to.getAttribute('min'), '2026-09-10');

  // destroy снимает границы, поставленные виджетом, и не трогает авторские.
  G.destroy();

  assert.equal(from.getAttribute('max'), '2026-12-31');
  assert.equal(to.getAttribute('min'), '2026-01-01');
  assert.equal(from.value, '2026-09-10');
  assert.equal(to.value, '2026-09-20');
});

test('пара на нативном поле: ввод платформы связывает границы, разметка не тронута', () => {
  const { G, doc } = setup(PARTS);
  const { from, to } = pair(doc);

  G.start();

  // Тач-устройство: тип нативный, спутника нет, но min у «по» стоит.
  from.value = '2026-09-10';
  from.dispatchEvent(event('input', from));
  assert.equal(from.getAttribute('type'), 'date');
  assert.equal(from.nextSibling, null, 'спутник заведён без указателя мыши');
  assert.equal(to.getAttribute('min'), '2026-09-10');

  // set() из API — тот же путь.
  G.instance(to, 'datetime').set('2026-09-20');
  assert.equal(from.getAttribute('max'), '2026-09-20');

  G.destroy();
  assert.equal(to.getAttribute('min'), '2026-01-01');
});

test('пара в панели: пустое «по» открывается на месяце «с», отрезок между концами помечен', async () => {
  const { G, doc } = setup(PARTS);
  const { from, to } = pair(doc);

  G.start();
  await pointer(from, 'mouse');
  type(from, '10092026');
  await pointer(to, 'mouse');

  const b = G.instance(to, 'datetime');

  b.open();
  assert.match(b.panel.querySelector('[aria-live]').textContent, /сентябрь/i);
  assert.equal(b.panel.querySelector('.gr-datetime-year').value, '2026');

  // Единственный конец — «с» — помечен выбранным и в панели «по».
  let ends = b.panel.querySelectorAll('[aria-selected="true"]');

  assert.equal(ends.length, 1);
  assert.equal(ends[0].getAttribute('data-gr-date'), '2026-09-10');
  assert.equal(b.panel.querySelectorAll('[data-gr-in-range]').length, 0);

  // Дни до «с» недоступны — граница дошла до панели тем же путём, что и всегда.
  assert.equal(b.panel.querySelector('[data-gr-date="2026-09-09"]').getAttribute('aria-disabled'), 'true');
  assert.equal(b.panel.querySelector('[data-gr-date="2026-09-11"]').getAttribute('aria-disabled'), null);

  b.panel.querySelector('[data-gr-date="2026-09-20"]').dispatchEvent(event('click', b.panel.querySelector('[data-gr-date="2026-09-20"]')));
  assert.equal(to.nextSibling.value, '2026-09-20');

  // В панели «с» — оба конца и отрезок между ними.
  const a = G.instance(from, 'datetime');

  a.open();
  ends = a.panel.querySelectorAll('[aria-selected="true"]').map((c) => c.getAttribute('data-gr-date'));
  assert.deepEqual(ends, ['2026-09-10', '2026-09-20']);

  const between = a.panel.querySelectorAll('[data-gr-in-range]').map((c) => c.getAttribute('data-gr-date'));

  assert.deepEqual(between, ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
  assert.equal(a.panel.querySelector('[data-gr-date="2026-09-21"]').getAttribute('aria-disabled'), 'true', 'max от «по» не дошёл до панели «с»');

  // Смена «по» при открытой панели «с» перерисовывает отрезок.
  type(to, '15092026');
  assert.equal(a.panel.querySelectorAll('[data-gr-in-range]').length, 4);

  G.destroy();
});
