'use strict';

// Примитивы motion и gesture слоя GriffinJS на последовательностях событий.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

// --- motion.set -------------------------------------------------------------

test('set пишет --gr-progress в пределах 0…1 с точностью до тысячных', () => {
  const { G } = setup(['core/motion.js']);
  const node = el('div');

  G.motion.set(node, 1 / 3);
  assert.equal(node.style.getPropertyValue('--gr-progress'), '0.333');

  G.motion.set(node, 7);
  assert.equal(node.style.getPropertyValue('--gr-progress'), '1');

  G.motion.set(node, -2);
  assert.equal(node.style.getPropertyValue('--gr-progress'), '0');

  G.motion.clear(node);
  assert.equal(node.style.getPropertyValue('--gr-progress'), '');
});

// --- motion.time ------------------------------------------------------------

// Ручные часы и планировщик: тик выполняется по вызову, время двигаем сами.
function clock() {
  let t = 0;
  const queue = [];
  return {
    now: () => t,
    schedule: (fn) => { queue.push(fn); return queue.length; },
    cancel: () => {},
    advance(ms) { t += ms; const fns = queue.splice(0); fns.forEach((fn) => fn()); },
  };
}

test('тикер публикует прогресс по времени, доходит до 1 и зовёт onEnd', () => {
  const { G } = setup(['core/motion.js']);
  const c = clock();
  const node = el('div');
  const seen = [];
  let ended = 0;

  const t = G.motion.time({
    el: node, duration: 1000, now: c.now, schedule: c.schedule, cancel: c.cancel,
    onProgress: (p) => seen.push(p), onEnd: () => { ended += 1; },
  });

  t.start();
  c.advance(250);
  c.advance(250);
  assert.deepEqual(seen, [0.25, 0.5]);
  assert.equal(node.style.getPropertyValue('--gr-progress'), '0.5');

  c.advance(600);
  assert.equal(seen[seen.length - 1], 1);
  assert.equal(ended, 1);
  assert.equal(t.running(), false);
});

test('пауза замораживает прогресс, resume продолжает с того же места, loop начинает заново', () => {
  const { G } = setup(['core/motion.js']);
  const c = clock();
  const seen = [];
  let ended = 0;

  const t = G.motion.time({
    duration: 1000, loop: true, now: c.now, schedule: c.schedule, cancel: c.cancel,
    onProgress: (p) => seen.push(p), onEnd: () => { ended += 1; },
  });

  t.start();
  c.advance(400);
  t.pause();
  c.advance(5000);          // пауза: время идёт, прогресс — нет
  t.resume();
  c.advance(100);
  assert.equal(seen[seen.length - 1], 0.5);

  c.advance(500);           // конец круга
  assert.equal(ended, 1);
  assert.equal(t.running(), true, 'loop продолжает');
  assert.equal(seen[seen.length - 1], 0, 'новый круг начат с нуля');

  t.stop();
  assert.equal(t.running(), false);
});

// --- motion.viewportProgress ------------------------------------------------

test('прогресс в окне просмотра: 0 при входе снизу, 1 при выходе сверху', () => {
  const { G } = setup(['core/motion.js']);
  const vp = G.motion.viewportProgress;

  assert.equal(vp({ top: 800, height: 200 }, 800), 0);
  assert.equal(vp({ top: -200, height: 200 }, 800), 1);
  assert.equal(vp({ top: 300, height: 200 }, 800), 0.5);
  assert.equal(vp({ top: 2000, height: 200 }, 800), 0, 'ниже экрана — ноль, не отрицательное');
});

// --- gesture ----------------------------------------------------------------

function pointer(type, target, x, y, t, pointerType = 'touch', extra = {}) {
  return event(type, target, Object.assign({ pointerId: 1, pointerType, clientX: x, clientY: y, timeStamp: t, cancelable: true }, extra));
}

function swipe(node, points, pointerType) {
  const [x0, y0, t0] = points[0];
  node.dispatchEvent(pointer('pointerdown', node, x0, y0, t0, pointerType));
  for (const [x, y, t] of points.slice(1)) node.dispatchEvent(pointer('pointermove', node, x, y, t, pointerType));
  const [xn, yn, tn] = points[points.length - 1];
  node.dispatchEvent(pointer('pointerup', node, xn, yn, tn, pointerType));
}

test('свайп: порог, прогресс в долях ширины, swipe по расстоянию', () => {
  const { G, doc } = setup(['core/gesture.js']);
  const node = mount(doc, el('div')).at(0, 0, 200, 100);
  const log = [];

  G.gesture(node, {
    onStart: () => log.push('start'),
    onMove: (s) => log.push(s.progress),
    onEnd: (s) => log.push('end:' + s.swipe + ':' + s.pointerType),
  });

  swipe(node, [[100, 50, 0], [104, 50, 20], [60, 50, 100], [20, 50, 400]]);

  assert.deepEqual(log, ['start', -0.2, -0.4, 'end:-1:touch']);
});

test('короткий медленный сдвиг — не свайп; быстрый короткий — свайп', () => {
  const { G, doc } = setup(['core/gesture.js']);
  const node = mount(doc, el('div')).at(0, 0, 200, 100);
  const ends = [];

  G.gesture(node, { onEnd: (s) => ends.push(s.swipe) });

  swipe(node, [[100, 50, 0], [90, 50, 300], [80, 50, 900]]);   // 20 px за 900 мс
  swipe(node, [[100, 50, 0], [90, 50, 10], [70, 50, 40]]);     // 30 px за 40 мс — 0.75 px/мс

  assert.deepEqual(ends, [0, -1]);
});

test('вертикальное движение отдаётся браузеру: жест не начинается, preventDefault не зовётся', () => {
  const { G, doc } = setup(['core/gesture.js']);
  const node = mount(doc, el('div')).at(0, 0, 200, 100);
  const log = [];

  G.gesture(node, { onStart: () => log.push('start'), onEnd: () => log.push('end'), onCancel: () => log.push('cancel') });

  const move = pointer('pointermove', node, 102, 90, 20);
  node.dispatchEvent(pointer('pointerdown', node, 100, 50, 0));
  node.dispatchEvent(move);
  node.dispatchEvent(pointer('pointerup', node, 102, 90, 50));

  assert.deepEqual(log, ['cancel']);
  assert.equal(move.defaultPrevented, false);
});

test('pointers ограничивает типы указателя, destroy снимает слушатели', () => {
  const { G, doc } = setup(['core/gesture.js']);
  const node = mount(doc, el('div')).at(0, 0, 200, 100);
  const ends = [];

  const g = G.gesture(node, { pointers: ['touch'], onEnd: (s) => ends.push(s.pointerType) });

  swipe(node, [[100, 50, 0], [20, 50, 100]], 'mouse');
  swipe(node, [[100, 50, 0], [20, 50, 100]], 'touch');

  assert.deepEqual(ends, ['touch']);

  g.destroy();
  assert.equal(node.count('pointerdown'), 0);
  assert.equal(node.count('pointermove'), 0);
});
