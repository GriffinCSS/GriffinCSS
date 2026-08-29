'use strict';

// Мегаменю на мок-DOM: состояние и клавиатура. Наведение с задержкой
// намерения, единственная открытая панель, стрелки по верхнему ряду,
// ajax-панели, мобильный режим без наведения и стрелок, destroy.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, wide } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'core/media.js', 'widgets/megamenu.js'];

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// Шапка: бренд, переключатель <details> без панели, два пункта-details
// с панелями и обычная ссылка между ними.
function bar(doc, attrs = {}) {
  const brand = el('a', { class: 'gr-navbar-brand', href: '/' });
  const toggleSummary = el('summary');
  const toggle = el('details', { class: 'gr-nav-toggle' }, [toggleSummary]);

  const sumA = el('summary', { class: 'gr-nav-link' });
  const linkA1 = el('a', { href: '/a1' });
  const linkA2 = el('a', { href: '/a2' });
  const panelA = el('div', { class: 'gr-megamenu-panel' }, [el('div', {}, [linkA1, linkA2])]);
  const itemA = el('details', { class: 'gr-megamenu-item' }, [sumA, panelA]);

  const plain = el('a', { class: 'gr-nav-link', href: '/plain' });

  const sumB = el('summary', { class: 'gr-nav-link' });
  const panelB = el('div', { class: 'gr-megamenu-panel' });
  const itemB = el('details', Object.assign({ class: 'gr-megamenu-item' }, attrs.itemB || {}), [sumB, panelB]);

  const nav = el('ul', { class: 'gr-nav gr-nav-collapse gr-megamenu' }, [
    el('li', {}, [itemA]), el('li', {}, [plain]), el('li', {}, [itemB]),
  ]);
  const root = mount(doc, el('nav', Object.assign({ class: 'gr-navbar', 'data-gr-megamenu': '' }, attrs.root || {}), [brand, toggle, nav]));

  [sumA, sumB, linkA1, linkA2, plain, panelA].forEach((n, i) => n.at(i * 100, 0, 100, 40));
  panelA.at(0, 40, 600, 300);

  return { root, toggle, toggleSummary, itemA, sumA, panelA, linkA1, linkA2, plain, itemB, sumB, panelB, brand };
}

test('подъём: aria-expanded/aria-controls на пунктах, переключатель шапки — не пункт', () => {
  const { G, doc } = setup(PARTS);
  const b = bar(doc);

  G.start();

  const w = G.instance(b.root, 'megamenu');

  assert.ok(w);
  assert.equal(b.root.getAttribute('data-gr-state'), 'ready');
  assert.equal(b.sumA.getAttribute('aria-expanded'), 'false');
  assert.ok(b.panelA.getAttribute('id'));
  assert.equal(b.sumA.getAttribute('aria-controls'), b.panelA.getAttribute('id'));
  assert.equal(b.toggleSummary.hasAttribute('aria-expanded'), false);
  assert.equal(w.items.length, 2);

  w.destroy();
  assert.equal(b.root.hasAttribute('data-gr-state'), false);
  assert.equal(b.sumA.hasAttribute('aria-expanded'), false);
  assert.equal(b.panelA.hasAttribute('id'), false);
});

test('открыта только одна панель; aria-expanded следует за open', () => {
  const { G, doc } = setup(PARTS);
  const b = bar(doc);

  G.start();

  b.itemA.open = true;
  assert.equal(b.sumA.getAttribute('aria-expanded'), 'true');

  b.itemB.open = true;
  assert.equal(b.itemA.open, false, 'первая панель не закрылась');
  assert.equal(b.sumA.getAttribute('aria-expanded'), 'false');
  assert.equal(b.sumB.getAttribute('aria-expanded'), 'true');

  // Щелчок мимо полосы закрывает.
  const outside = mount(doc, el('p'));
  doc.fire('pointerdown', event('pointerdown', outside));
  assert.equal(b.itemB.open, false);

  G.destroy();
});

test('клавиатура на широком экране: стрелки по верхнему ряду, ↓ открывает, Esc закрывает и возвращает фокус', () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const b = bar(doc);

  G.start();

  b.sumA.focus();
  b.sumA.dispatchEvent(event('keydown', b.sumA, { key: 'ArrowRight' }));
  assert.equal(doc.activeElement, b.plain, '→ идёт к следующему пункту ряда, минуя панель');

  b.plain.dispatchEvent(event('keydown', b.plain, { key: 'ArrowRight' }));
  assert.equal(doc.activeElement, b.sumB);

  b.sumB.dispatchEvent(event('keydown', b.sumB, { key: 'ArrowRight' }));
  assert.equal(doc.activeElement, b.sumA, 'ряд замкнут');

  b.sumA.dispatchEvent(event('keydown', b.sumA, { key: 'End' }));
  assert.equal(doc.activeElement, b.sumB);
  b.sumB.dispatchEvent(event('keydown', b.sumB, { key: 'Home' }));
  assert.equal(doc.activeElement, b.sumA);

  const down = event('keydown', b.sumA, { key: 'ArrowDown' });
  b.sumA.dispatchEvent(down);
  assert.equal(b.itemA.open, true, '↓ не открыл панель');
  assert.equal(down.defaultPrevented, true);
  assert.equal(doc.activeElement, b.linkA1, 'фокус не ушёл на первую ссылку панели');

  b.linkA1.dispatchEvent(event('keydown', b.linkA1, { key: 'ArrowDown' }));
  assert.equal(doc.activeElement, b.linkA2, '↓ внутри панели идёт по ссылкам');

  b.linkA2.dispatchEvent(event('keydown', b.linkA2, { key: 'Escape' }));
  assert.equal(b.itemA.open, false, 'Esc не закрыл');
  assert.equal(doc.activeElement, b.sumA, 'фокус не вернулся на заголовок');

  restore();
  G.destroy();
});

test('наведение с задержкой намерения: мышь открывает, касание — нет, уход закрывает', async () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const b = bar(doc, { root: { 'data-gr-megamenu': 'delay: 10; hide: 10' } });

  G.start();

  b.sumA.dispatchEvent(event('pointerover', b.sumA, { pointerType: 'touch' }));
  await tick(20);
  assert.equal(b.itemA.open, false, 'касание не должно открывать по наведению');

  b.sumA.dispatchEvent(event('pointerover', b.sumA, { pointerType: 'mouse' }));
  assert.equal(b.itemA.open, false, 'открылось без задержки намерения');
  await tick(20);
  assert.equal(b.itemA.open, true, 'не открылось по наведению мыши');

  // Уход с полосы: relatedTarget снаружи.
  const outside = mount(doc, el('p'));
  b.sumA.dispatchEvent(event('pointerout', b.sumA, { pointerType: 'mouse', relatedTarget: outside }));
  assert.equal(b.itemA.open, true, 'закрылось мгновенно');
  await tick(20);
  assert.equal(b.itemA.open, false, 'не закрылось после ухода');

  restore();
  G.destroy();
});

test('узкий экран: наведение и стрелки выключены, панели — аккордеон', async () => {
  const { G, doc } = setup(PARTS);
  const b = bar(doc, { root: { 'data-gr-megamenu': 'delay: 10' } });

  G.start();

  b.sumA.dispatchEvent(event('pointerover', b.sumA, { pointerType: 'mouse' }));
  await tick(20);
  assert.equal(b.itemA.open, false);

  b.sumA.focus();
  b.sumA.dispatchEvent(event('keydown', b.sumA, { key: 'ArrowRight' }));
  assert.equal(doc.activeElement, b.sumA);

  b.itemA.open = true;
  b.itemB.open = true;
  assert.equal(b.itemA.open, false, 'в аккордеоне тоже одна открытая');

  G.destroy();
});

test('ajax-панель: data-gr-src грузится при первом открытии, состояния loading → ready, ошибка → error', async () => {
  const { G, doc } = setup(PARTS);
  const b = bar(doc, { itemB: { 'data-gr-src': '/menu/b.html' } });
  const calls = [];

  global.fetch = (url) => {
    calls.push(url);
    return Promise.resolve({ ok: true, text: () => Promise.resolve('<p>Бренды</p>') });
  };

  G.start();

  b.itemB.open = true;
  assert.equal(b.itemB.getAttribute('data-gr-state'), 'loading');
  await tick();
  await tick();
  assert.equal(b.panelB.innerHTML, '<p>Бренды</p>');
  assert.equal(b.itemB.getAttribute('data-gr-state'), 'ready');

  b.itemB.open = false;
  b.itemB.open = true;
  await tick();
  assert.equal(calls.length, 1, 'панель грузится один раз');

  global.fetch = () => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') });
  const b2 = bar(doc, { itemB: { 'data-gr-src': '/menu/fail.html' } });
  G.init(b2.root);
  b2.itemB.open = true;
  await tick();
  await tick();
  assert.equal(b2.itemB.getAttribute('data-gr-state'), 'error');

  delete global.fetch;
  G.destroy();
});
