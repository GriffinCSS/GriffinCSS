'use strict';

// Контроллер окон поверх <dialog>: data-gr-open, стек, блокировка прокрутки
// под окном, остановка медиа при закрытии, ajax-содержимое, hash.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'widgets/dialog.js'];

const tick = () => new Promise((r) => setTimeout(r, 0));

function dialog(doc, id, attrs = {}, children = []) {
  return mount(doc, el('dialog', Object.assign({ class: 'gr-modal', id }, attrs), children));
}

test('data-gr-open открывает окно showModal, состояние и блокировка прокрутки, закрытие снимает', () => {
  const { G, doc } = setup(PARTS);
  const d = dialog(doc, 'm');
  const btn = mount(doc, el('button', { 'data-gr-open': '#m' }));

  G.start();

  doc.fire('click', event('click', btn));

  assert.equal(d.hasAttribute('open'), true, 'showModal не вызван');
  assert.equal(d.getAttribute('data-gr-state'), 'open');
  assert.equal(doc.documentElement.getAttribute('data-gr-state'), 'locked');
  assert.equal(G.dialog.top(), d);

  d.close();
  assert.equal(d.getAttribute('data-gr-state'), 'ready');
  assert.equal(doc.documentElement.hasAttribute('data-gr-state'), false, 'прокрутка не разблокирована');
  assert.equal(G.dialog.top(), null);

  G.destroy();
});

test('стек: второе окно поверх первого, closeAll закрывает оба, блокировка держится до последнего', () => {
  const { G, doc } = setup(PARTS);
  const a = dialog(doc, 'a');
  const b = dialog(doc, 'b');

  G.start();

  G.dialog.open(a);
  G.dialog.open(b);
  assert.equal(G.dialog.top(), b);
  assert.equal(G.dialog.stack().length, 2);

  b.close();
  assert.equal(G.dialog.top(), a);
  assert.equal(doc.documentElement.getAttribute('data-gr-state'), 'locked');

  G.dialog.open(b);
  G.dialog.closeAll();
  assert.equal(a.hasAttribute('open'), false);
  assert.equal(b.hasAttribute('open'), false);
  assert.equal(doc.documentElement.hasAttribute('data-gr-state'), false);

  G.destroy();
});

test('медиа: видео ставится на паузу, iframe разгружается при закрытии и возвращается при открытии', () => {
  const { G, doc } = setup(PARTS);
  const video = el('video');
  let paused = 0;
  video.pause = () => { paused += 1; };
  const frame = el('iframe', { src: 'https://youtube.com/embed/x' });
  const d = dialog(doc, 'v', { 'data-gr-dialog': '' }, [video, frame]);

  G.start();

  G.dialog.open(d);
  d.close();
  assert.equal(paused, 1);
  assert.equal(frame.getAttribute('src'), 'about:blank');

  G.dialog.open(d);
  assert.equal(frame.getAttribute('src'), 'https://youtube.com/embed/x');

  G.destroy();
  assert.equal(frame.getAttribute('src'), 'https://youtube.com/embed/x', 'destroy оставляет исходный src');
});

test('ajax: data-gr-src грузится один раз в [data-gr-content], состояния loading → ready', async () => {
  const { G, doc } = setup(PARTS);
  const body = el('div', { 'data-gr-content': '' });
  const d = dialog(doc, 'x', { 'data-gr-dialog': '' , 'data-gr-src': '/win.html' }, [el('div', { class: 'gr-modal-header' }), body]);
  const calls = [];
  global.fetch = (url) => { calls.push(url); return Promise.resolve({ ok: true, text: () => Promise.resolve('<p>Окно</p>') }); };

  G.start();

  G.dialog.open(d);
  assert.equal(d.getAttribute('data-gr-state'), 'loading');
  await tick(); await tick();
  assert.equal(body.innerHTML, '<p>Окно</p>');
  assert.equal(d.getAttribute('data-gr-state'), 'open');

  d.close();
  G.dialog.open(d);
  await tick();
  assert.equal(calls.length, 1);

  delete global.fetch;
  G.destroy();
});

test('hash: открытие пишет #id в историю, закрытие возвращает назад, popstate закрывает окно', () => {
  const { G, doc } = setup(PARTS);
  const pushed = [];
  let backs = 0;
  global.location = { hash: '', pathname: '/p', search: '' };
  global.history = { pushState: (s, t, url) => { pushed.push(url); global.location.hash = url; }, back: () => { backs += 1; } };
  const d = dialog(doc, 'h', { 'data-gr-dialog': 'hash' });

  G.start();

  G.dialog.open(d);
  assert.deepEqual(pushed, ['#h']);

  d.close();
  assert.equal(backs, 1, 'закрытие не вернуло историю назад');

  global.location.hash = '#h';
  G.dialog.open(d);
  assert.equal(pushed.length, 1, 'hash уже стоит — повторно не пишется');

  // Кнопка «Назад»: hash ушёл, окно закрывается без back().
  global.location.hash = '';
  G.dialog._popstate();
  assert.equal(d.hasAttribute('open'), false);
  assert.equal(backs, 1);

  G.destroy();
  delete global.location;
  delete global.history;
});

test('destroy снимает состояние с окна и с <html>', () => {
  const { G, doc } = setup(PARTS);
  const d = dialog(doc, 'z', { 'data-gr-dialog': '' });

  G.start();
  G.dialog.open(d);
  G.destroy();

  assert.equal(d.hasAttribute('data-gr-state'), false);
  assert.equal(doc.documentElement.hasAttribute('data-gr-state'), false);
});

// --- Рост окна (Этап 48d) -----------------------------------------------------
//
// По data-gr-dialog="grow": ResizeObserver на окне, смена высоты больше
// 24 px — element.animate от прежней высоты к новой. Открытие и закрытие
// (0 ↔ высота) не трогаются, prefers-reduced-motion — без анимации,
// без атрибута наблюдателя нет вовсе. На время анимации окно снято
// с наблюдения: она меняет его размер, и под наблюдением это цикл
// ResizeObserver — ошибка на window во всех движках.

function growSetup(reduced = false, transition = '0.2s ease') {
  const { G, doc } = setup(PARTS);
  const observers = [];
  const animations = [];

  global.ResizeObserver = class {
    constructor(fn) { this.fn = fn; this.targets = []; observers.push(this); }
    observe(node) { if (!this.targets.includes(node)) this.targets.push(node); }
    unobserve(node) { this.targets = this.targets.filter((t) => t !== node); }
    disconnect() { this.targets = []; this.disconnected = true; }
  };
  global.matchMedia = () => ({ matches: reduced });
  global.getComputedStyle = (node) => node.style;

  const d = dialog(doc, 'g', { 'data-gr-dialog': 'grow' });
  d.style.setProperty('--gr-transition', transition);
  d.animate = (frames, opts) => {
    const animation = { frames, opts, cancel() { this.cancelled = true; if (this.oncancel) this.oncancel(); } };
    animations.push(animation);
    return animation;
  };

  // Наблюдение сообщает высоту через прямоугольник окна — если окно
  // под наблюдением, как и платформа.
  const resize = (height) => {
    d.at(0, 0, 400, height);
    if (observers[0].targets.includes(d)) observers[0].fn([{ target: d }]);
  };

  return {
    G, doc, d, observers, animations, resize,
    teardown() { delete global.ResizeObserver; delete global.matchMedia; delete global.getComputedStyle; },
  };
}

test('grow: наблюдатель только по атрибуту; рост больше 24 px анимируется от прежней высоты к новой', () => {
  const s = growSetup();

  try {
    const plain = dialog(s.doc, 'p');

    s.G.start();

    assert.equal(s.observers.length, 1, 'наблюдатель заведён не только по grow');
    assert.deepEqual(s.observers[0].targets, [s.d]);
    assert.equal(s.G.instance(plain, 'dialog'), null, 'окно без атрибута поднято раньше времени');

    // Закрыто: высота 0. Открытие — 0 → 160 — не рост.
    s.resize(0);
    s.G.dialog.open(s.d);
    s.resize(160);
    assert.equal(s.animations.length, 0, 'открытие анимировано как рост');

    // Содержимое приехало: 160 → 320.
    s.resize(320);
    assert.equal(s.animations.length, 1, 'рост не анимирован');
    assert.deepEqual(s.animations[0].frames, [{ blockSize: '160px' }, { blockSize: '320px' }]);
    assert.equal(s.animations[0].opts.duration, 200);

    // Пока идёт анимация, окно снято с наблюдения: её промежуточные
    // высоты не приходят и новую не начинают.
    assert.deepEqual(s.observers[0].targets, [], 'на время анимации окно под наблюдением');
    s.resize(200);
    s.resize(280);
    assert.equal(s.animations.length, 1);

    // Конец анимации возвращает наблюдение; первым оно сообщает
    // итоговую высоту — это не рост.
    s.animations[0].onfinish();
    assert.deepEqual(s.observers[0].targets, [s.d], 'после анимации наблюдение не вернулось');
    s.resize(320);
    assert.equal(s.animations.length, 1, 'возврат наблюдения анимирован как рост');

    // Мелочь до 24 px (ввод в textarea с автовысотой) — без анимации.
    s.resize(340);
    assert.equal(s.animations.length, 1, 'сдвиг на 20 px анимирован');

    // Уменьшение — тоже плавно.
    s.resize(240);
    assert.equal(s.animations.length, 2);
    assert.deepEqual(s.animations[1].frames, [{ blockSize: '340px' }, { blockSize: '240px' }]);
    s.animations[1].onfinish();

    // Закрытие — 240 → 0 — не рост.
    s.d.close();
    s.resize(0);
    assert.equal(s.animations.length, 2, 'закрытие анимировано как рост');

    s.G.destroy();
    assert.equal(s.observers[0].disconnected, true, 'destroy не снял наблюдателя');
  } finally {
    s.teardown();
  }
});

test('grow: при prefers-reduced-motion и при 0s анимации нет; destroy отменяет идущую', () => {
  const s = growSetup(true);

  try {
    s.G.start();
    s.resize(0);
    s.G.dialog.open(s.d);
    s.resize(160);
    s.resize(320);
    assert.equal(s.animations.length, 0, 'анимация при уменьшенном движении');
  } finally {
    s.teardown();
  }

  const z = growSetup(false, '0s');

  try {
    z.G.start();
    z.resize(0);
    z.G.dialog.open(z.d);
    z.resize(160);
    z.resize(320);
    assert.equal(z.animations.length, 0, 'анимация при 0s');

    z.d.style.setProperty('--gr-modal-transition', '0.3s ease');
    z.resize(480);
    assert.equal(z.animations.length, 1, '--gr-modal-transition не прочитан');
    assert.equal(z.animations[0].opts.duration, 300);

    z.G.destroy();
    assert.equal(z.animations[0].cancelled, true, 'destroy не отменил анимацию');
    assert.deepEqual(z.observers[0].targets, [], 'отмена анимации в destroy вернула наблюдение');
  } finally {
    z.teardown();
  }
});
