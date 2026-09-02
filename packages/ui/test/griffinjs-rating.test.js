'use strict';

// Ввод оценки GriffinJS на мок-DOM поверх модуля .gr-rating: пять
// радиокнопок в <fieldset> — база без скрипта; скрипт пишет --gr-rating
// (число, из которого CSS рисует картинку) и оценку словом в aria-label,
// показывает наведение указателем мыши и снимает всё в destroy.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/rating.js'];

function rating(doc, attrs, checked) {
  const display = el('span', { class: 'gr-rating', role: 'img', 'aria-label': 'Без оценки' });
  const radios = [];
  const labels = [];

  for (let i = 1; i <= 5; i++) {
    const radio = el('input', Object.assign({ type: 'radio', name: 'score', value: String(i) }, checked === i ? { checked: '' } : {}));
    const label = el('label', {}, [radio]);

    label.textContent = `${i} из 5`;
    radios.push(radio);
    labels.push(label);
  }

  const legend = el('legend', { class: 'gr-label' });
  const root = mount(doc, el('fieldset', Object.assign({ class: 'gr-rating-input', 'data-gr-rating': '' }, attrs), [legend, display, ...labels]));

  return { root, display, radios, labels };
}

const value = (display) => display.style.getPropertyValue('--gr-rating');

test('выбранная радиокнопка — число в --gr-rating и слово в aria-label', () => {
  const { G, doc } = setup(PARTS);
  const { root, display, radios } = rating(doc, {}, 4);
  const seen = [];

  root.addEventListener('griffin:change', (e) => seen.push(e.detail.value));
  G.start();

  assert.ok(G.instance(root, 'rating'), 'виджет не поднялся');
  assert.equal(root.getAttribute('data-gr-state'), 'ready');
  assert.equal(value(display), '4');
  assert.equal(display.getAttribute('aria-label'), '4 из 5');

  radios[1].checked = true;
  radios[1].dispatchEvent(event('change', radios[1]));

  assert.equal(value(display), '2');
  assert.equal(display.getAttribute('aria-label'), '2 из 5');
  assert.deepEqual(seen, [2]);

  G.destroy();

  assert.equal(value(display), '', 'destroy не снял --gr-rating');
  assert.equal(display.getAttribute('aria-label'), 'Без оценки', 'destroy не вернул подпись автора');
  assert.equal(root.getAttribute('data-gr-state'), null);
});

test('без выбора — ноль и подпись автора; наведение мышью показывает оценку и уходит вместе с указателем', () => {
  const { G, doc } = setup(PARTS);
  const { root, display, labels, radios } = rating(doc);

  G.start();

  assert.equal(value(display), '0');
  assert.equal(display.getAttribute('aria-label'), 'Без оценки');

  // Наведение — только указателем мыши: палец не наводит, он выбирает.
  labels[2].dispatchEvent(event('pointerover', labels[2], { pointerType: 'mouse' }));
  assert.equal(value(display), '3');
  assert.equal(display.getAttribute('aria-label'), 'Без оценки', 'наведение переписало подпись');

  root.dispatchEvent(event('pointerleave', root, { pointerType: 'mouse' }));
  assert.equal(value(display), '0');

  labels[4].dispatchEvent(event('pointerover', labels[4], { pointerType: 'touch' }));
  assert.equal(value(display), '0', 'касание сработало как наведение');

  // Выбор после наведения: число остаётся у выбранного.
  radios[0].checked = true;
  radios[0].dispatchEvent(event('change', radios[0]));
  labels[3].dispatchEvent(event('pointerover', labels[3], { pointerType: 'mouse' }));
  root.dispatchEvent(event('pointerleave', root, { pointerType: 'mouse' }));
  assert.equal(value(display), '1');

  G.destroy();
});

test('без радиокнопок или без .gr-rating внутри виджет не поднимается', () => {
  const { G, doc } = setup(PARTS);
  const empty = mount(doc, el('fieldset', { 'data-gr-rating': '' }, [el('span', { class: 'gr-rating' })]));
  const said = [];
  const before = console.warn;

  console.warn = (m) => said.push(String(m));

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(empty, 'rating'), null);
  assert.equal(said.length, 1);
  assert.match(said[0], /radio/);

  G.destroy();
});
