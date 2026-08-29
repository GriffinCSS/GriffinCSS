'use strict';

// Дорожка GriffinJS и движок scroll на мок-DOM: виртуальный индекс,
// цикл, physical(), aria/inert, клавиатура, синхронизация двух дорожек,
// очередь команд во время жеста, destroy().

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, track: build } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'core/motion.js', 'core/track.js', 'engines/scroll.js'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function changes(node) {
  const log = [];
  node.addEventListener('griffin:change', (e) => log.push([e.detail.previous, e.detail.index, e.detail.physical]));
  return log;
}

test('дорожка поднимается по data-gr-track: aria на слайдах, активный — aria-current, остальные inert', () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 4, 100, { 'data-gr-track': '' });

  G.start();

  const t = G.instance(node, 'track');

  assert.ok(t, 'виджет track не поднят');
  assert.equal(t.index, 0);
  assert.equal(t.count, 4);
  assert.deepEqual(slides.map((s) => s.getAttribute('aria-current')), ['true', null, null, null]);
  assert.deepEqual(slides.map((s) => s.hasAttribute('inert')), [false, true, true, true]);
  assert.equal(slides[1].getAttribute('role'), 'group');
  assert.equal(slides[1].getAttribute('aria-roledescription'), 'slide');
  assert.equal(slides[1].getAttribute('aria-label'), 'Слайд 2 из 4');
  assert.equal(node.scrollCalls[0].behavior, 'auto', 'начальная привязка — мгновенная');
});

test('goTo/next/prev без цикла зажимаются в границах и шлют griffin:change', () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 3);
  const t = G.track(node);
  const log = changes(node);

  assert.equal(t.prev(), false, 'назад с нуля без цикла — некуда');
  assert.equal(t.next(), true);
  assert.equal(t.index, 1);
  assert.equal(node.scrollCalls[node.scrollCalls.length - 1].left, 100);
  assert.equal(node.scrollCalls[node.scrollCalls.length - 1].behavior, 'smooth');

  t.goTo(2);
  assert.equal(t.next(), false);
  assert.equal(t.index, 2);
  assert.deepEqual(slides.map((s) => s.getAttribute('aria-current')), [null, null, 'true']);
  assert.deepEqual(log, [[0, 1, 1], [1, 2, 2]]);
  assert.equal(t.goTo(7), false, 'за пределы — отказ');
});

// Цикл у scroll — клонами краёв: по одному видимому с каждой стороны.
// Дети дорожки из трёх слайдов: [клон 2] 0 1 2 [клон 0] — смещения 0…400.
test('цикл: индекс виртуальный, physical — по модулю, prev с нуля едет на клон последнего', () => {
  const { G, doc } = setup(PARTS);
  const { node } = build(doc, 3);
  const t = G.track(node, { loop: true });
  const log = changes(node);

  assert.equal(t.loop, true);
  assert.equal(t._engine()._clones().length, 2);
  assert.equal(node.children.length, 5);
  assert.equal(t.count, 3, 'клоны — не слайды');
  assert.equal(node.scrollCalls[0].left, 100, 'начальная привязка — к настоящему первому');

  t.prev();
  assert.equal(t.index, -1);
  assert.equal(t.physical(-1), 2);
  assert.equal(node.scrollCalls[node.scrollCalls.length - 1].left, 0, 'к клону последнего, а не назад через дорожку');

  t.next(); t.next(); t.next(); t.next();
  assert.equal(t.index, 3);
  assert.equal(t.physical(3), 0);
  assert.deepEqual(log.map((r) => r[2]), [2, 0, 1, 2, 0]);
});

test('прокрутка пользователем: движок отчитывается позицией и после паузы фиксирует индекс', async () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 4);
  const t = G.track(node);
  const log = changes(node);

  node.scrollLeft = 150;                 // на полпути между 1 и 2
  node.dispatchEvent(event('scroll', node));

  assert.equal(slides[1].style.getPropertyValue('--gr-progress'), '0.5');
  assert.equal(slides[2].style.getPropertyValue('--gr-progress'), '0.5');
  assert.equal(slides[0].style.getPropertyValue('--gr-progress'), '0');
  assert.equal(node.style.getPropertyValue('--gr-progress'), '0.5');
  assert.equal(t.index, 0, 'до остановки индекс не меняется');

  node.scrollLeft = 200;
  node.dispatchEvent(event('scroll', node));
  await wait(160);

  assert.equal(t.index, 2);
  assert.deepEqual(log, [[0, 2, 2]]);
  assert.deepEqual(slides.map((s) => s.hasAttribute('inert')), [true, true, false, true]);
});

test('в цикле остановка выбирает ближайший виртуальный индекс, а не прыжок через дорожку', async () => {
  const { G, doc } = setup(PARTS);
  const { node } = build(doc, 4);
  const t = G.track(node, { loop: true });

  t.goTo(4);                             // physical 0 на втором круге
  node.scrollLeft = 400;                 // пользователь ушёл на physical 3 (дети: клон, 0, 1, 2, 3, клон)
  node.dispatchEvent(event('scroll', node));
  await wait(160);

  assert.equal(t.index, 3, 'ближайший к 4 индекс с physical 3 — это 3, а не 7 и не −1');
});

test('остановка на клоне мгновенно перескакивает на настоящий слайд', async () => {
  const { G, doc } = setup(PARTS);
  const { node } = build(doc, 3);
  const t = G.track(node, { loop: true });

  // Из 0 к 2 в цикле из трёх ближе назад — на клон последнего; на остановке
  // перескок на настоящий третий.
  t.goTo(2);
  assert.equal(node.scrollCalls[node.scrollCalls.length - 1].left, 0);
  node.dispatchEvent(event('scroll', node));
  await wait(160);
  assert.equal(node.scrollCalls[node.scrollCalls.length - 1].left, 300);
  assert.equal(t.index, 2);

  t.next();                              // index 3 → physical 0 → едем на клон первого (дети: клон2, 0, 1, 2, клон0)
  assert.equal(node.scrollCalls[node.scrollCalls.length - 1].left, 400);

  node.scrollLeft = 400;
  node.dispatchEvent(event('scroll', node));
  await wait(160);

  const last = node.scrollCalls[node.scrollCalls.length - 1];
  assert.equal(last.left, 100, 'перескок на настоящий первый');
  assert.equal(last.behavior, 'auto', 'перескок мгновенный');
  assert.equal(t.index, 3);
  assert.equal(t.physical(t.index), 0);
});

test('в цикле прогресс считается по кругу', () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 3);
  G.track(node, { loop: true });

  node.scrollLeft = 50;                  // между клоном последнего и первым: позиция −0.5
  node.dispatchEvent(event('scroll', node));

  assert.equal(slides[0].style.getPropertyValue('--gr-progress'), '0.5');
  assert.equal(slides[2].style.getPropertyValue('--gr-progress'), '0.5');
  assert.equal(slides[1].style.getPropertyValue('--gr-progress'), '0');
});

test('команда во время жеста ставится в очередь и выполняется после остановки', async () => {
  const { G, doc } = setup(PARTS);
  const { node } = build(doc, 4);
  const t = G.track(node);
  const before = node.scrollCalls.length;

  node.dispatchEvent(event('touchstart', node));
  t.goTo(2);

  assert.equal(node.scrollCalls.length, before, 'scrollTo во время жеста не зовётся');
  assert.equal(t.index, 2, 'состояние обновлено сразу');

  node.dispatchEvent(event('scroll', node));
  await wait(160);

  assert.equal(node.scrollCalls.length, before + 1);
  assert.equal(node.scrollCalls[before].left, 200);
});

test('клавиатура: стрелки, Home, End; в RTL стрелки меняются местами', () => {
  const { G, doc } = setup(PARTS);
  const { node } = build(doc, 4);
  const t = G.track(node);

  const press = (key) => { const e = event('keydown', node, { key }); node.dispatchEvent(e); return e.defaultPrevented; };

  assert.equal(press('ArrowRight'), true);
  assert.equal(t.index, 1);
  press('End');
  assert.equal(t.index, 3);
  press('Home');
  assert.equal(t.index, 0);
  assert.equal(press('ArrowLeft'), false, 'некуда — событие не перехвачено');
  assert.equal(press('a'), false);

  node.setAttribute('dir', 'rtl');
  press('ArrowLeft');
  assert.equal(t.index, 1, 'в RTL ArrowLeft — вперёд');
});

test('синхронизация двух дорожек без эха', () => {
  const { G, doc } = setup(PARTS);
  const a = G.track(build(doc, 3).node);
  const b = G.track(build(doc, 3).node);
  const logA = changes(a.el);
  const logB = changes(b.el);

  a.sync(b);

  a.goTo(2);
  assert.equal(b.index, 2);
  b.goTo(1);
  assert.equal(a.index, 1);

  assert.equal(logA.length, 2, 'по одному событию на каждое изменение');
  assert.equal(logB.length, 2);
});

test('мутация слайдов: refresh перечитывает, перемеривает и держит индекс в границах', () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 3);
  const t = G.track(node);

  t.goTo(2);
  slides[2].remove();
  t.refresh();

  assert.equal(t.count, 2);
  assert.equal(t.index, 1);
  assert.deepEqual(t._engine()._offsets(), [0, 100]);
  assert.equal(node.scrollCalls[node.scrollCalls.length - 1].behavior, 'auto', 'перепривязка мгновенная');
});

test('destroy снимает всё: атрибуты, --gr-progress, слушатели', () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 3);

  slides[0].setAttribute('aria-label', 'Своя подпись');

  const t = G.track(node);

  node.scrollLeft = 50;
  node.dispatchEvent(event('scroll', node));
  t.destroy();

  for (const s of slides) {
    assert.equal(s.hasAttribute('aria-current'), false);
    assert.equal(s.hasAttribute('inert'), false);
    assert.equal(s.hasAttribute('role'), false);
    assert.equal(s.style.getPropertyValue('--gr-progress'), '');
  }
  assert.equal(slides[0].getAttribute('aria-label'), 'Своя подпись', 'чужой атрибут не тронут');
  assert.equal(slides[1].hasAttribute('aria-label'), false);
  assert.equal(node.count('keydown'), 0);
  assert.equal(node.count('scroll'), 0);
  assert.equal(node.count('touchstart'), 0);
});

test('без зарегистрированного движка дорожка держит состояние и предупреждает', () => {
  const { G, doc } = setup(['core/motion.js', 'core/track.js']);
  const { node } = build(doc, 3);
  const warnings = [];
  const original = console.warn;
  console.warn = (m) => warnings.push(m);

  try {
    const t = G.track(node);
    t.next();
    assert.equal(t.index, 1);
  } finally {
    console.warn = original;
  }

  assert.match(warnings[0], /движок «scroll» не зарегистрирован/);
});

test('loop без поддержки движка вырождается в rewind: страницы по достижимому, перескок с края', () => {
  const { G, doc } = setup(PARTS);
  // Движок без цикла: тот же scroll, но loop он не объявляет и не получает.
  G.defineEngine('plain', (t, el, o) => Object.assign(G.engines.scroll(t, el, Object.assign({}, o, { loop: false })), { loop: false }));
  const { node } = build(doc, 4, 100, {}, 3);
  const t = G.track(node, { loop: true, engine: 'plain' });

  assert.equal(t.loop, false);
  assert.equal(t.rewind, true);
  assert.equal(t.last, 1);
  assert.equal(t.pages, 2, 'а не 4 точки, из которых две ведут в никуда');
  assert.equal(t.goTo(3), false);

  t.next();
  assert.equal(t.index, 1);
  t.next();
  assert.equal(t.index, 0, 'с края — на другой край');
  t.prev();
  assert.equal(t.index, 1);
});
