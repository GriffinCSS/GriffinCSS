'use strict';

// Модули движения GriffinJS: движок fade (стопка, прогресс, следование
// за пальцем, цикл бесплатно) и параллакс (--gr-progress от окна просмотра).

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, track: build } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'core/motion.js', 'core/gesture.js', 'core/track.js', 'engines/fade.js', 'widgets/parallax.js'];

const progress = (slides) => slides.map((s) => s.style.getPropertyValue('--gr-progress'));

function pointer(type, target, x, t) {
  return event(type, target, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: 50, timeStamp: t, cancelable: true });
}

test('fade: слайды получают прогресс без прокрутки, цикл без клонов, состояние ready на дорожке', () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 3);
  const t = G.track(node, { engine: 'fade', loop: true });

  assert.equal(node.getAttribute('data-gr-state'), 'ready');
  assert.equal(node.children.length, 3, 'клонов нет');
  assert.equal(node.scrollCalls.length, 0, 'ничего не прокручивается');
  assert.deepEqual(progress(slides), ['1', '0', '0']);

  t.prev();
  assert.equal(t.index, -1);
  assert.deepEqual(progress(slides), ['0', '0', '1']);
  assert.equal(slides[2].getAttribute('aria-current'), 'true');
  assert.deepEqual(slides.map((s) => s.hasAttribute('inert')), [true, true, false]);

  t.destroy();
  assert.equal(node.hasAttribute('data-gr-state'), false);
});

test('fade: тяга ведёт прогресс за пальцем, свайп листает, короткая тяга возвращает', () => {
  const { G, doc } = setup(PARTS);
  const { node, slides } = build(doc, 3, 200);
  const t = G.track(node, { engine: 'fade' });

  node.dispatchEvent(pointer('pointerdown', node, 150, 0));
  node.dispatchEvent(pointer('pointermove', node, 50, 50));     // −100 px из 200 → −0.5
  assert.equal(node.getAttribute('data-gr-state'), 'dragging');
  assert.deepEqual(progress(slides), ['0.5', '0.5', '0']);

  node.dispatchEvent(pointer('pointerup', node, 50, 400));
  assert.equal(t.index, 1, 'полширины — свайп');
  assert.equal(node.getAttribute('data-gr-state'), 'ready');
  assert.deepEqual(progress(slides), ['0', '1', '0']);

  node.dispatchEvent(pointer('pointerdown', node, 150, 1000));
  node.dispatchEvent(pointer('pointermove', node, 130, 1300));  // −20 px, медленно
  node.dispatchEvent(pointer('pointerup', node, 130, 1900));
  assert.equal(t.index, 1, 'короткая тяга — не свайп');
  assert.deepEqual(progress(slides), ['0', '1', '0'], 'прогресс вернулся');
});

test('параллакс: --gr-progress по положению блока, destroy снимает всё', () => {
  const { G, doc } = setup(PARTS);
  const listeners = [];

  global.window = {
    innerHeight: 800,
    addEventListener: (type) => listeners.push(type),
    removeEventListener: (type) => listeners.splice(listeners.indexOf(type), 1),
  };
  // scroll подписывается на документе (фаза перехвата), resize — на окне.
  const docAdd = doc.addEventListener.bind(doc);
  const docRemove = doc.removeEventListener.bind(doc);
  doc.addEventListener = (type, fn, opts) => { listeners.push(type); docAdd(type, fn, opts && opts.capture); };
  doc.removeEventListener = (type, fn, opts) => { listeners.splice(listeners.indexOf(type), 1); docRemove(type, fn, opts && opts.capture); };

  try {
    const node = mount(doc, el('section', { 'data-gr-parallax': '' })).at(0, 300, 100, 200);

    G.start();

    const w = G.instance(node, 'parallax');

    assert.ok(w);
    assert.equal(node.style.getPropertyValue('--gr-progress'), '0.5');
    assert.deepEqual(listeners, ['scroll', 'resize']);

    node.at(0, -200, 100, 200);
    w.update();
    assert.equal(node.style.getPropertyValue('--gr-progress'), '1');

    G.destroy();
    assert.equal(node.style.getPropertyValue('--gr-progress'), '');
    assert.deepEqual(listeners, []);
  } finally {
    delete global.window;
  }
});
