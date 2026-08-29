'use strict';

// Ядро слоя GriffinJS: версия, реестры, монтирование виджетов,
// жизненный цикл, разбор параметров, делегирование, сканер, брейкпоинты.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PKG = require('../package.json');
const SRC = readFileSync(path.join(__dirname, '..', 'src', 'griffinjs', 'core', 'griffinjs-core.js'), 'utf8');

const CORE = ['core/options.js', 'core/registry.js', 'core/scanner.js', 'core/media.js'];

test('версия ядра GriffinJS совпадает с версией пакета ui', () => {
  const { G } = setup();

  assert.equal(G.version, PKG.version);
  assert.ok(SRC.includes('v' + PKG.version), 'версия в шапке файла тоже обновлена');
});

test('реестры пусты, регистрация кладёт фабрику под своим именем', () => {
  const { G } = setup();

  assert.deepEqual(G.engines, {});
  assert.deepEqual(G.widgets, {});

  const engine = () => ({});
  const widget = () => ({});

  G.defineEngine('scroll', engine);
  G.defineWidget('slider', widget);

  assert.equal(G.engines.scroll, engine);
  assert.equal(G.widgets.slider, widget);
});

test('повторная регистрация под тем же именем — ошибка, а не молчаливая замена', () => {
  const { G } = setup();

  G.defineWidget('slider', () => ({}));

  assert.throws(() => G.defineWidget('slider', () => ({})), /уже зарегистрирован/);
  assert.throws(() => G.defineWidget('', () => ({})), /без имени/);
  assert.throws(() => G.defineEngine('fade', null), /не функция/);
});

test('start поднимает виджеты по data-gr-<имя>, destroy зовёт их destroy', () => {
  const { G, doc } = setup(CORE);
  const seen = [];

  G.defineWidget('demo', (node, opts) => {
    seen.push(opts);
    return { destroy() { seen.push('destroyed'); } };
  });

  const a = mount(doc, el('div', { 'data-gr-demo': 'speed: 3; loop' }));
  const b = mount(doc, el('div', {}, [el('p', { 'data-gr-demo': '' })]));

  G.start();

  assert.deepEqual(seen, [{ speed: 3, loop: true }, {}]);
  assert.ok(G.instance(a, 'demo'));
  assert.ok(G.instance(b.children[0], 'demo'));
  assert.equal(G._mounted().length, 2);

  G.destroy();

  assert.deepEqual(seen.slice(2), ['destroyed', 'destroyed']);
  assert.equal(G._mounted().length, 0);
  assert.equal(G._started(), false);
});

test('mount идемпотентен, mount незарегистрированного — предупреждение и null', () => {
  const { G, doc } = setup(CORE);
  let calls = 0;

  G.defineWidget('demo', () => { calls += 1; return {}; });

  const node = mount(doc, el('div'));
  const first = G.mount(node, 'demo', {});
  const second = G.mount(node, 'demo', {});

  assert.equal(first, second);
  assert.equal(calls, 1);

  const warnings = [];
  const original = console.warn;
  console.warn = (m) => warnings.push(m);
  try {
    assert.equal(G.mount(node, 'nope'), null);
  } finally {
    console.warn = original;
  }
  assert.match(warnings[0], /GriffinJS: виджет «nope» не зарегистрирован/);
});

test('упавшая фабрика не оставляет записи и не роняет остальные', () => {
  const { G, doc } = setup(CORE);

  G.defineWidget('bad', () => { throw new Error('нет'); });
  G.defineWidget('good', () => ({}));

  mount(doc, el('div', { 'data-gr-bad': '', 'data-gr-good': '' }));

  const original = console.warn;
  console.warn = () => {};
  try { G.start(); } finally { console.warn = original; }

  assert.equal(G._mounted().length, 1);
  assert.equal(G._mounted()[0].name, 'good');
});

// --- options ----------------------------------------------------------------

test('разбор параметров: ключ без значения, числа, булевы, строки, camelCase', () => {
  const { G } = setup(['core/options.js']);

  assert.deepEqual(
    G.options.parse('autoplay: 4000; loop; effect: fade; per-view: 2.5; pause: false; label: Вперёд'),
    { autoplay: 4000, loop: true, effect: 'fade', perView: 2.5, pause: false, label: 'Вперёд' },
  );
  assert.deepEqual(G.options.parse(''), {});
  assert.deepEqual(G.options.parse(null), {});
  assert.deepEqual(G.options.parse('{"a": [1, 2], "b": "x"}'), { a: [1, 2], b: 'x' });
});

test('read кладёт параметры атрибута поверх умолчаний', () => {
  const { G } = setup(['core/options.js']);
  const node = el('div', { 'data-gr-slider': 'loop' });

  assert.deepEqual(G.options.read(node, 'slider', { loop: false, autoplay: 0 }), { loop: true, autoplay: 0 });
  assert.deepEqual(G.options.read(el('div'), 'slider', { loop: false }), { loop: false });
});

// --- registry ---------------------------------------------------------------

test('делегирование: слушатель на документе, closest по селектору, true останавливает очередь', () => {
  const { G, doc } = setup(['core/registry.js']);
  const log = [];

  G.on('click', '.inner', (e, node) => { log.push('inner:' + node.className); return true; });
  G.on('click', '.outer', (e, node) => { log.push('outer:' + node.className); });

  const inner = el('span', { class: 'inner' });
  const outer = mount(doc, el('div', { class: 'outer' }, [inner]));

  assert.equal(doc.count('click', false), 0, 'до старта слушателей нет');

  G.start();

  assert.equal(doc.count('click', false), 1);

  doc.fire('click', event('click', inner));
  assert.deepEqual(log, ['inner:inner']);

  doc.fire('click', event('click', outer));
  assert.deepEqual(log, ['inner:inner', 'outer:outer']);

  G.destroy();
  assert.equal(doc.count('click', false), 0);
});

test('регистрация после старта подписывается сразу', () => {
  const { G, doc } = setup(['core/registry.js']);

  G.start();
  G.on('keydown', 'body', () => {});

  assert.equal(doc.count('keydown', false), 1);
});

// --- scanner ----------------------------------------------------------------

test('сканер поднимает виджеты на появившихся узлах и снимает с удалённых', () => {
  const { G, doc } = setup(CORE);
  const destroyed = [];
  const mutations = [];

  global.MutationObserver = class {
    constructor(fn) { this.fn = fn; mutations.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };

  try {
    G.defineWidget('demo', (node) => ({ destroy() { destroyed.push(node); } }));
    G.start();

    const late = el('div', { 'data-gr-demo': '' });
    mount(doc, late);
    mutations[0].fn([{ addedNodes: [Object.assign(late, { nodeType: 1 })], removedNodes: [] }]);
    G.scanner._flush();

    assert.ok(G.instance(late, 'demo'), 'виджет на позднем узле не поднят');

    late.remove();
    mutations[0].fn([{ addedNodes: [], removedNodes: [late] }]);
    G.scanner._flush();

    assert.deepEqual(destroyed, [late]);
    assert.equal(G._mounted().length, 0);

    G.destroy();
    assert.equal(mutations[0].disconnected, true);
  } finally {
    delete global.MutationObserver;
  }
});

// --- media ------------------------------------------------------------------

test('брейкпоинты читаются из --gr-bp-*, запрос в range-синтаксисе', () => {
  const { G } = setup(['core/media.js']);
  const queries = [];

  global.getComputedStyle = () => ({ getPropertyValue: (n) => (n === '--gr-bp-md' ? ' 768px ' : '') });
  global.matchMedia = (q) => { queries.push(q); return { matches: true, addEventListener() {}, removeEventListener() {} }; };

  try {
    assert.equal(G.media.value('md'), '768px');
    assert.equal(G.media.query('md'), '(width >= 768px)');
    assert.equal(G.media.matches('md'), true);
    assert.equal(G.media.query('xx'), null);
    assert.equal(G.media.matches('xx'), false, 'неизвестный брейкпоинт — false, не исключение');
    assert.deepEqual(queries, ['(width >= 768px)']);

    const seen = [];
    const off = G.media.on('md', (m) => seen.push(m));
    assert.deepEqual(seen, [true], 'начальный режим сообщается сразу');
    off();
  } finally {
    delete global.getComputedStyle;
    delete global.matchMedia;
  }
});
