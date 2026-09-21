'use strict';

// Состояние closing у виджетов на <details> (Этап 48d): мегаменю
// и дропдаун не снимают open в первом же кадре — ставят
// data-gr-state="closing", ждут transitionend/animationend на самой панели
// с таймаутом в длительность --gr-transition плюс 50 мс и лишь затем
// закрывают. Щелчок по заголовку открытого пункта идёт тем же путём.
// Во всех браузерах: развилки по ::details-content нет — Firefox 153
// поддерживает признаки, а закрытие не анимирует (решение владельца
// 2026-09-21). При --gr-transition: 0s или без токена закрывается
// сразу, как раньше.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, wide } = require('./helpers/griffinjs-dom');

const MEGA = ['core/options.js', 'core/registry.js', 'core/media.js', 'widgets/megamenu.js'];
const DROP = ['core/options.js', 'core/registry.js', 'widgets/dropdown.js'];

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// Полоса с двумя пунктами; --gr-transition на панелях — 20 мс, чтобы
// таймаут (70 мс) укладывался в тест.
function bar(doc, transition = '0.02s ease') {
  const sumA = el('summary', { class: 'gr-nav-link' });
  const panelA = el('div', { class: 'gr-megamenu-panel' }, [el('a', { href: '/a' })]);
  const itemA = el('details', { class: 'gr-megamenu-item' }, [sumA, panelA]);
  const sumB = el('summary', { class: 'gr-nav-link' });
  const panelB = el('div', { class: 'gr-megamenu-panel' });
  const itemB = el('details', { class: 'gr-megamenu-item' }, [sumB, panelB]);
  const root = mount(doc, el('nav', { class: 'gr-navbar gr-megamenu', 'data-gr-megamenu': '' }, [
    el('ul', { class: 'gr-nav' }, [el('li', {}, [itemA]), el('li', {}, [itemB])]),
  ]));

  if (transition) {
    panelA.style.setProperty('--gr-transition', transition);
    panelB.style.setProperty('--gr-transition', transition);
  }

  return { root, itemA, sumA, panelA, itemB, sumB, panelB };
}

function dropdown(doc, transition = '0.02s ease') {
  const summary = el('summary', { class: 'gr-btn' });
  const panel = el('div', { class: 'gr-dropdown-panel' }, [el('ul', { class: 'gr-menu' }, [el('a', { href: '/x' })])]);
  const root = mount(doc, el('details', { class: 'gr-dropdown', 'data-gr-dropdown': '' }, [summary, panel]));

  if (transition) panel.style.setProperty('--gr-transition', transition);

  return { root, summary, panel };
}

const withStyles = (doc) => wide(doc);

test('мегаменю: close ставит closing, снимает open по transitionend с самой панели, состояние возвращает', () => {
  const { G, doc } = setup(MEGA);
  const restore = withStyles(doc);
  const b = bar(doc);

  G.start();

  const w = G.instance(b.root, 'megamenu');

  b.itemA.open = true;
  w.close(w.items[0]);

  assert.equal(b.itemA.open, true, 'open снят в первом же кадре');
  assert.equal(b.itemA.getAttribute('data-gr-state'), 'closing');

  // transitionend от потомка панели — не конец её собственного перехода.
  b.panelA.children[0].dispatchEvent(event('transitionend', b.panelA.children[0]));
  assert.equal(b.itemA.open, true, 'закрыт по переходу потомка');

  b.panelA.dispatchEvent(event('transitionend', b.panelA));
  assert.equal(b.itemA.open, false, 'не закрыт по transitionend панели');
  assert.equal(b.itemA.hasAttribute('data-gr-state'), false, 'состояние closing осталось');

  restore();
  G.destroy();
});

test('мегаменю: без transitionend закрывает по таймауту --gr-transition + 50 мс; animationend тоже считается', async () => {
  const { G, doc } = setup(MEGA);
  const restore = withStyles(doc);
  const b = bar(doc);

  G.start();

  const w = G.instance(b.root, 'megamenu');

  b.itemA.open = true;
  w.close(w.items[0]);
  await tick(40);
  assert.equal(b.itemA.open, true, 'закрыт раньше таймаута');
  await tick(50);
  assert.equal(b.itemA.open, false, 'не закрыт по таймауту');

  b.itemB.open = true;
  w.close(w.items[1]);
  b.panelB.dispatchEvent(event('animationend', b.panelB));
  assert.equal(b.itemB.open, false, 'не закрыт по animationend');

  restore();
  G.destroy();
});

test('мегаменю: открытие другого пункта и щелчок мимо закрывают через closing; повторное open отменяет закрытие', () => {
  const { G, doc } = setup(MEGA);
  const restore = withStyles(doc);
  const b = bar(doc);

  G.start();

  const w = G.instance(b.root, 'megamenu');

  b.itemA.open = true;
  b.itemB.open = true;
  assert.equal(b.itemA.open, true, 'первый пункт закрыт без состояния');
  assert.equal(b.itemA.getAttribute('data-gr-state'), 'closing');

  // Указатель вернулся на закрывающийся пункт — он остаётся открытым.
  w.open(w.items[0]);
  assert.equal(b.itemA.hasAttribute('data-gr-state'), false, 'closing не снят при повторном открытии');
  b.panelA.dispatchEvent(event('transitionend', b.panelA));
  assert.equal(b.itemA.open, true, 'отменённое закрытие всё же закрыло');

  const outside = mount(doc, el('p'));
  doc.fire('pointerdown', event('pointerdown', outside));
  assert.equal(b.itemA.getAttribute('data-gr-state'), 'closing');
  assert.equal(b.itemB.getAttribute('data-gr-state'), 'closing');

  restore();
  G.destroy();
});

test('мегаменю: щелчок по заголовку открытого пункта закрывает через closing, ajax-состояние возвращается', () => {
  const { G, doc } = setup(MEGA);
  const restore = withStyles(doc);
  const b = bar(doc);

  G.start();

  b.itemA.open = true;
  b.itemA.setAttribute('data-gr-state', 'ready');

  const click = event('click', b.sumA);
  b.sumA.dispatchEvent(click);

  assert.equal(click.defaultPrevented, true, 'платформенный toggle не остановлен');
  assert.equal(b.itemA.getAttribute('data-gr-state'), 'closing');

  b.panelA.dispatchEvent(event('transitionend', b.panelA));
  assert.equal(b.itemA.open, false);
  assert.equal(b.itemA.getAttribute('data-gr-state'), 'ready', 'ajax-состояние пункта потеряно');

  // Щелчок по закрытому заголовку — платформе.
  const open = event('click', b.sumA);
  b.sumA.dispatchEvent(open);
  assert.equal(open.defaultPrevented, false);

  // Щелчок по закрывающемуся пункту — передумали: остаётся открытым.
  b.itemA.open = true;
  b.sumA.dispatchEvent(event('click', b.sumA));
  assert.equal(b.itemA.getAttribute('data-gr-state'), 'closing');
  const again = event('click', b.sumA);
  b.sumA.dispatchEvent(again);
  assert.equal(again.defaultPrevented, true);
  assert.equal(b.itemA.getAttribute('data-gr-state'), 'ready', 'closing не отменён вторым щелчком');
  b.panelA.dispatchEvent(event('transitionend', b.panelA));
  assert.equal(b.itemA.open, true, 'отменённое закрытие всё же закрыло');

  restore();
  G.destroy();
});

test('мегаменю: destroy завершает закрытие, а без токена и с 0s закрывает сразу', () => {
  const { G, doc } = setup(MEGA);
  const restore = withStyles(doc);
  const b = bar(doc, '0s');

  G.start();

  const w = G.instance(b.root, 'megamenu');

  b.itemA.open = true;
  w.close(w.items[0]);
  assert.equal(b.itemA.open, false, 'при 0s ждёт таймаута');
  assert.equal(b.itemA.hasAttribute('data-gr-state'), false);

  b.panelB.style.setProperty('--gr-transition', '0.02s ease');
  b.itemB.open = true;
  w.close(w.items[1]);
  assert.equal(b.itemB.getAttribute('data-gr-state'), 'closing');

  G.destroy();
  assert.equal(b.itemB.open, false, 'destroy оставил пункт открытым');
  assert.equal(b.itemB.hasAttribute('data-gr-state'), false);

  restore();
});

test('мегаменю: поддержка ::details-content и allow-discrete не отменяет состояние — closing ставится везде', () => {
  const { G, doc } = setup(MEGA);
  const restore = withStyles(doc);
  const b = bar(doc);

  // Признаки есть — как в Firefox 153, который при этом закрытие не анимирует.
  global.CSS = { supports: (q) => q === 'selector(::details-content)' || q === 'transition-behavior: allow-discrete' };

  try {
    G.start();

    const w = G.instance(b.root, 'megamenu');

    b.itemA.open = true;
    w.close(w.items[0]);
    assert.equal(b.itemA.open, true, 'open снят сразу — развилка по ::details-content вернулась');
    assert.equal(b.itemA.getAttribute('data-gr-state'), 'closing');
    b.panelA.dispatchEvent(event('transitionend', b.panelA));
    assert.equal(b.itemA.open, false);

    b.itemA.open = true;
    const click = event('click', b.sumA);
    b.sumA.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true, 'щелчок по заголовку отдан платформе');
    assert.equal(b.itemA.getAttribute('data-gr-state'), 'closing');
  } finally {
    delete global.CSS;
    restore();
    G.destroy();
  }
});

test('дропдаун на <details>: Esc и щелчок мимо закрывают через closing, состояние open → closing → ready', () => {
  const { G, doc } = setup(DROP);
  const restore = withStyles(doc);
  const d = dropdown(doc);

  G.start();

  const w = G.instance(d.root, 'dropdown');

  d.root.open = true;
  assert.equal(d.root.getAttribute('data-gr-state'), 'open');

  d.summary.dispatchEvent(event('keydown', d.summary, { key: 'Escape' }));
  assert.equal(d.root.open, true, 'open снят в первом же кадре');
  assert.equal(d.root.getAttribute('data-gr-state'), 'closing');
  assert.equal(w.isOpen(), true);

  d.panel.dispatchEvent(event('transitionend', d.panel));
  assert.equal(d.root.open, false);
  assert.equal(d.root.getAttribute('data-gr-state'), 'ready');
  assert.equal(d.summary.getAttribute('aria-expanded'), 'false');

  // Повторное открытие во время закрытия отменяет его.
  d.root.open = true;
  w.close();
  assert.equal(d.root.getAttribute('data-gr-state'), 'closing');
  w.open();
  assert.equal(d.root.getAttribute('data-gr-state'), 'open');
  d.panel.dispatchEvent(event('transitionend', d.panel));
  assert.equal(d.root.open, true, 'отменённое закрытие всё же закрыло');

  // Щелчок по кнопке открытого дропдауна — через closing; второй щелчок
  // во время закрытия — передумали.
  const click = event('click', d.summary);
  d.summary.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(d.root.getAttribute('data-gr-state'), 'closing');

  const again = event('click', d.summary);
  d.summary.dispatchEvent(again);
  assert.equal(again.defaultPrevented, true);
  assert.equal(d.root.getAttribute('data-gr-state'), 'open', 'closing не отменён вторым щелчком');
  assert.equal(d.root.open, true);

  restore();
  G.destroy();
});

test('дропдаун на <details>: таймаут, destroy и 0s', async () => {
  const { G, doc } = setup(DROP);
  const restore = withStyles(doc);
  const d = dropdown(doc);

  G.start();

  const w = G.instance(d.root, 'dropdown');

  d.root.open = true;
  w.close();
  await tick(40);
  assert.equal(d.root.open, true, 'закрыт раньше таймаута');
  await tick(50);
  assert.equal(d.root.open, false, 'не закрыт по таймауту');

  d.panel.style.setProperty('--gr-transition', '0s');
  d.root.open = true;
  w.close();
  assert.equal(d.root.open, false, 'при 0s ждёт таймаута');

  d.panel.style.setProperty('--gr-transition', '0.02s');
  d.root.open = true;
  w.close();
  assert.equal(d.root.getAttribute('data-gr-state'), 'closing');
  G.destroy();
  assert.equal(d.root.open, false, 'destroy оставил дропдаун открытым');
  assert.equal(d.root.hasAttribute('data-gr-state'), false);

  restore();
});
