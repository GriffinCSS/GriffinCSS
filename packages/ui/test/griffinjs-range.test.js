'use strict';

// Ползунок GriffinJS на мок-DOM: доля пройденного пути одним свойством
// и порядок значений в паре «от — до».

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'widgets/range.js'];

const PROP = '--gr-progress';

const slider = (attrs) => el('input', Object.assign({ class: 'gr-range', type: 'range' }, attrs));
const doneOf = (input) => input.style.getPropertyValue(PROP);
const edgesOf = (pair) => [pair.style.getPropertyValue('--gr-range-from'), pair.style.getPropertyValue('--gr-range-to')];

test('одиночный ползунок: доля считается от min/max, а не от голого значения', () => {
  const { G, doc } = setup(PARTS);
  const input = mount(doc, slider({ 'data-gr-range': '', min: '1000', max: '5000', value: '2000' }));

  G.start();

  // (2000 − 1000) / (5000 − 1000) = 0.25: диапазон начинается не с нуля,
  // и доля от значения напрямую дала бы 0.4.
  assert.equal(doneOf(input), '0.25');

  input.value = '5000';
  input.dispatchEvent(event('input', input));
  assert.equal(doneOf(input), '1');

  G.destroy();

  // destroy снимает всё, что рантайм поставил: свойство уходит вместе
  // с виджетом, иначе закраска замерла бы на последнем значении.
  assert.equal(doneOf(input), '');
});

test('доля не выходит за отрезок и переживает вырожденный диапазон', () => {
  const { G, doc } = setup(PARTS);
  const wide = mount(doc, slider({ 'data-gr-range': '', min: '0', max: '10', value: '99' }));
  const flat = mount(doc, slider({ 'data-gr-range': '', min: '5', max: '5', value: '5' }));

  G.start();

  assert.equal(doneOf(wide), '1');
  assert.equal(doneOf(flat), '0', 'деление на нулевой диапазон дало NaN');

  G.destroy();
});

test('пара «от — до»: обе границы отрезка уходят на обёртку', () => {
  // Отрезок между ручками рисует обёртка одна: полупрозрачная дорожка
  // верхнего ползунка не закрыла бы акцент нижнего, а лишь притенила бы его.
  // Значит, обе границы нужны ей сразу — и на самих ползунках доли не нужны.
  const { G, doc } = setup(PARTS);
  const from = slider({ min: '0', max: '20000', value: '5000' });
  const to = slider({ min: '0', max: '20000', value: '15000' });
  const pair = mount(doc, el('div', { class: 'gr-range-pair', 'data-gr-range': '' }, [from, to]));

  G.start();

  assert.ok(G.instance(pair, 'range'), 'виджет не поднялся на обёртке');
  assert.deepEqual(edgesOf(pair), ['0.25', '0.75']);
  assert.equal(doneOf(from), '', 'доля осталась и на ползунке — лишняя запись');

  G.destroy();

  assert.deepEqual(edgesOf(pair), ['', ''], 'destroy не снял доли с обёртки');
});

test('ручки в паре не пересекаются: ведомая уходит перед ведущей', () => {
  const { G, doc } = setup(PARTS);
  const from = slider({ min: '0', max: '100', value: '20' });
  const to = slider({ min: '0', max: '100', value: '80' });
  const pair = mount(doc, el('div', { class: 'gr-range-pair', 'data-gr-range': '' }, [from, to]));

  G.start();

  // Нижнюю границу тянут за верхнюю — верхняя обязана уйти вперёд,
  // а не остановить ведущую под пальцем.
  from.value = '90';
  from.dispatchEvent(event('input', from));
  assert.equal(from.value, '90', 'ведущую ручку остановили');
  assert.equal(to.value, '90', 'ведомая не ушла перед ведущей');
  assert.deepEqual(edgesOf(pair), ['0.9', '0.9']);

  // И симметрично сверху вниз.
  to.value = '10';
  to.dispatchEvent(event('input', to));
  assert.equal(to.value, '10');
  assert.equal(from.value, '10');

  G.destroy();
});

test('пара сообщает о движении событием, и в нём порядок уже наведён', () => {
  // Подпись рядом с фильтром обязана показывать значения ПОСЛЕ толчка.
  // Свой обработчик на ползунке отработает раньше нашего — он стоит
  // на обёртке, — поэтому единственный надёжный источник чисел — событие.
  const { G, doc } = setup(PARTS);
  const from = slider({ min: '0', max: '100', value: '20' });
  const to = slider({ min: '0', max: '100', value: '80' });
  const pair = mount(doc, el('div', { class: 'gr-range-pair', 'data-gr-range': '' }, [from, to]));
  const seen = [];

  pair.addEventListener('griffin:change', (e) => seen.push(e.detail));

  G.start();

  // Подъём виджета — не движение ручки: события на нём быть не должно.
  assert.equal(seen.length, 0, 'событие пришло на монтаже');

  from.value = '90';
  from.dispatchEvent(event('input', from));

  assert.equal(seen.length, 1);
  assert.deepEqual([seen[0].from, seen[0].to], [90, 90], 'в событии значения до толчка');
  assert.deepEqual(seen[0].values, [90, 90]);

  G.destroy();
});

test('обёртка без ползунков внутри не поднимает виджет молча', () => {
  const { G, doc } = setup(PARTS);
  const empty = mount(doc, el('div', { class: 'gr-range-pair', 'data-gr-range': '' }));
  const warnings = [];
  const before = console.warn;

  console.warn = (message) => warnings.push(message);

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(empty, 'range'), null, 'виджет поднялся на пустой обёртке');
  assert.equal(warnings.length, 1, `предупреждений — ${warnings.length}`);
  assert.match(warnings[0], /range/);

  G.destroy();
});

// Связка пары с числовыми полями (Этап 42a): fields: #a, #b — виджет
// пишет значения в поля на движении ручки, а ввод в поле двигает ручку.
// Форму отправляют поля — у ползунков name нет.

const number = (attrs) => el('input', Object.assign({ class: 'gr-input', type: 'number' }, attrs));

function pairWithFields(doc, values) {
  const from = slider({ min: '0', max: '20000', step: '500', value: '4000' });
  const to = slider({ min: '0', max: '20000', step: '500', value: '12000' });
  const min = number({ id: 'price-min', name: 'price_min', value: values ? values[0] : '' });
  const max = number({ id: 'price-max', name: 'price_max', value: values ? values[1] : '' });
  const pair = el('div', { class: 'gr-range-pair', 'data-gr-range': 'fields: #price-min, #price-max' }, [from, to]);

  mount(doc, el('div', {}, [pair, min, max]));

  return { pair, from, to, min, max };
}

test('fields: движение ручки пишет число в своё поле, порядок наведён до записи', () => {
  const { G, doc } = setup(PARTS);
  const { from, to, min, max } = pairWithFields(doc);

  G.start();

  // Подъём виджета — не движение: пустые поля остаются пустыми, иначе
  // форма отправила бы «от 0 до 20000» там, где фильтра не задавали.
  // Ручки при этом встают по полям — на края.
  assert.equal(min.value, '', 'поле заполнено на монтаже');
  assert.equal(max.value, '', 'поле заполнено на монтаже');
  assert.deepEqual([from.value, to.value], ['0', '20000'], 'ручки не встали по пустым полям');

  from.value = '6000';
  from.dispatchEvent(event('input', from));
  assert.equal(min.value, '6000');
  assert.equal(max.value, '20000', 'второе поле не получило значение своей ручки');

  // Ручку «до» тянут за «от»: в поля попадают значения ПОСЛЕ толчка.
  to.value = '3000';
  to.dispatchEvent(event('input', to));
  assert.equal(max.value, '3000');
  assert.equal(min.value, '3000', 'в поле «от» значение до толчка');

  G.destroy();
});

test('fields: ввод в поле двигает ручку с зажимом по min/max, порядок — на change', () => {
  const { G, doc } = setup(PARTS);
  const { pair, from, to, min, max } = pairWithFields(doc, ['4000', '12000']);
  const seen = [];

  pair.addEventListener('griffin:change', (e) => seen.push(e.detail));

  G.start();

  max.value = '9000';
  max.dispatchEvent(event('input', max));
  assert.equal(to.value, '9000', 'ручка «до» не поехала за полем');
  assert.deepEqual(edgesOf(pair), ['0.2', '0.45']);
  assert.equal(seen.length, 1, 'ввод в поле не сообщил событием');
  assert.deepEqual([seen[0].from, seen[0].to], [4000, 9000]);

  // Выше max — зажим: ручка встаёт на край, поле не трогается.
  max.value = '99999';
  max.dispatchEvent(event('input', max));
  assert.equal(to.value, '20000', 'значение выше max не зажато');
  assert.equal(max.value, '99999', 'поле переписано во время ввода');

  // «1» по пути к «1000» в поле «от» — на input ручка едет, но вторую
  // ручку не толкает и второе поле не трогает: число ещё не дописано.
  to.value = '9000';
  to.dispatchEvent(event('input', to));
  min.value = '12000';
  min.dispatchEvent(event('input', min));
  assert.equal(from.value, '12000');
  assert.equal(to.value, '9000', 'на input ручка «до» уже толкнута');
  assert.equal(max.value, '9000', 'на input переписано поле «до»');

  // Число дописано — change наводит порядок и пишет толкнутое поле.
  min.dispatchEvent(event('change', min));
  assert.equal(to.value, '12000', 'change не толкнул ручку «до»');
  assert.equal(max.value, '12000', 'толчок не дошёл до поля «до»');
  assert.equal(min.value, '12000');

  G.destroy();
});

test('fields: пустое поле ставит ручку на край, а монтаж берёт значения из полей', () => {
  // Страница вернулась с GET-параметрами — числа стоят в полях, а атрибуты
  // value у ползунков остались начальными. Правда — в полях.
  const { G, doc } = setup(PARTS);
  const { pair, from, to, min } = pairWithFields(doc, ['5000', '']);

  G.start();

  assert.equal(from.value, '5000', 'ручка не взяла значение поля на монтаже');
  assert.equal(to.value, '20000', 'пустое поле «до» не поставило ручку на край');
  assert.deepEqual(edgesOf(pair), ['0.25', '1']);

  // Очистили «от» — нижней границы нет, ручка уходит на min.
  min.value = '';
  min.dispatchEvent(event('input', min));
  assert.equal(from.value, '0');

  G.destroy();
});

test('fields: destroy снимает слушатели с полей, без fields поведение прежнее', () => {
  const { G, doc } = setup(PARTS);
  const { from, min } = pairWithFields(doc, ['4000', '12000']);

  G.start();
  G.destroy();

  min.value = '7000';
  min.dispatchEvent(event('input', min));
  assert.equal(from.value, '4000', 'после destroy поле всё ещё двигает ручку');

  from.value = '8000';
  from.dispatchEvent(event('input', from));
  assert.equal(min.value, '7000', 'после destroy ручка всё ещё пишет в поле');
});

test('fields: селектор без элемента — виджет не поднимается и называет поле', () => {
  // Опечатка в id — ошибка разметки, и молчать о ней нельзя: пара без
  // полей выглядела бы рабочей, а форма отправляла бы не то, что показано.
  const { G, doc } = setup(PARTS);
  const from = slider({ min: '0', max: '100', value: '20' });
  const to = slider({ min: '0', max: '100', value: '80' });
  const pair = mount(doc, el('div', { class: 'gr-range-pair', 'data-gr-range': 'fields: #nope-a, #nope-b' }, [from, to]));
  const warnings = [];
  const before = console.warn;

  console.warn = (message) => warnings.push(message);

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(pair, 'range'), null, 'виджет поднялся без поля');
  assert.equal(warnings.length, 1, `предупреждений — ${warnings.length}`);
  assert.match(warnings[0], /nope-a/);

  G.destroy();
});
