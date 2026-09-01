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
