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
