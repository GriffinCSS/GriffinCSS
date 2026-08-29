'use strict';

// Позиционирование у якоря: панель в верхнем слое кладётся под кнопку
// по getBoundingClientRect, переворачивается при нехватке места
// и не вылезает за окно. CSS anchor positioning не является зависимостью.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, wide } = require('./helpers/griffinjs-dom');

const PARTS = ['core/anchor.js'];

function pair(doc) {
  const anchor = mount(doc, el('button')).at(100, 100, 80, 32);
  const panel = mount(doc, el('div')).at(0, 0, 200, 120);
  return { anchor, panel };
}

test('place: снизу, по началу строки, с зазором', () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const { anchor, panel } = pair(doc);

  const result = G.anchor.place(panel, anchor, { side: 'bottom', align: 'start', gap: 4 });

  assert.equal(panel.style.getPropertyValue('top'), '136px');
  assert.equal(panel.style.getPropertyValue('left'), '100px');
  assert.equal(panel.style.getPropertyValue('right'), 'auto');
  assert.equal(panel.style.getPropertyValue('bottom'), 'auto');
  assert.equal(result.side, 'bottom');
  restore();
});

test('place: переворот вверх, когда снизу места нет; по центру и к концу', () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const { anchor, panel } = pair(doc);

  anchor.at(100, 740, 80, 32);
  assert.equal(G.anchor.place(panel, anchor, { side: 'bottom', gap: 4 }).side, 'top');
  assert.equal(panel.style.getPropertyValue('top'), '616px');

  anchor.at(100, 100, 80, 32);
  G.anchor.place(panel, anchor, { side: 'bottom', align: 'center' });
  assert.equal(panel.style.getPropertyValue('left'), '40px');

  G.anchor.place(panel, anchor, { side: 'bottom', align: 'end' });
  assert.equal(panel.style.getPropertyValue('left'), '0px', 'к концу кнопки, прижато к краю окна');
  restore();
});

test('place: панель не выходит за край окна', () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const { anchor, panel } = pair(doc);

  anchor.at(1150, 100, 80, 32);
  G.anchor.place(panel, anchor, { side: 'bottom', align: 'start', margin: 8 });
  assert.equal(panel.style.getPropertyValue('left'), '992px');

  // Сбоку: end — к концу строки; в RTL — зеркально.
  anchor.at(100, 100, 80, 32);
  G.anchor.place(panel, anchor, { side: 'end', gap: 4 });
  assert.equal(panel.style.getPropertyValue('left'), '184px');
  assert.equal(panel.style.getPropertyValue('top'), '56px', 'по центру высоты');

  // В RTL end — слева; места там нет, и сторона переворачивается.
  doc.documentElement.setAttribute('dir', 'rtl');
  const flipped = G.anchor.place(panel, anchor, { side: 'end', gap: 4 });
  assert.equal(flipped.side, 'start');
  assert.equal(panel.style.getPropertyValue('left'), '184px');
  restore();
});

test('clear снимает всё, что place написал', () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const { anchor, panel } = pair(doc);

  G.anchor.place(panel, anchor, {});
  G.anchor.clear(panel);
  assert.equal(panel.style.getPropertyValue('top'), '');
  assert.equal(panel.style.getPropertyValue('left'), '');
  restore();
});
