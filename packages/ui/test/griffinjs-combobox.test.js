'use strict';

// Комбобокс: роли, дебаунс и минимальная длина, источник по URL и функцией,
// клавиатура с aria-activedescendant, выбор, Esc без стирания, группы,
// пустой ответ, destroy.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'widgets/combobox.js'];

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function box(doc, attrs = {}) {
  const input = el('input', { type: 'search', name: 'q' });
  const root = mount(doc, el('div', Object.assign({ class: 'gr-combobox', 'data-gr-combobox': 'src: /s?q={q}; min: 2; delay: 10' }, attrs), [input]));
  input.value = '';
  return { root, input };
}

function type(input, text) {
  input.value = text;
  input.dispatchEvent(event('input', input));
}

test('роли и подъём; ввод короче min не запрашивает; ответ рисуется списком с подсветкой', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc);
  const calls = [];
  global.fetch = (url) => { calls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(['Ноутбук Acer', 'Ноутбук Asus', { value: 'Наушники', href: '/h' }]) }); };

  G.start();

  const w = G.instance(b.root, 'combobox');
  assert.ok(w);
  assert.equal(b.input.getAttribute('role'), 'combobox');
  assert.equal(b.input.getAttribute('aria-autocomplete'), 'list');
  assert.equal(b.input.getAttribute('aria-expanded'), 'false');
  assert.equal(b.input.getAttribute('autocomplete'), 'off');
  assert.ok(w.list, 'список не создан');
  assert.equal(w.list.getAttribute('role'), 'listbox');
  assert.equal(b.input.getAttribute('aria-controls'), w.list.getAttribute('id'));

  type(b.input, 'н');
  await tick(30);
  assert.equal(calls.length, 0, 'запрос короче min ушёл');

  type(b.input, 'но');
  assert.equal(calls.length, 0, 'запрос ушёл без дебаунса');
  await tick(30);
  assert.deepEqual(calls, ['/s?q=%D0%BD%D0%BE']);
  await tick();
  assert.equal(b.root.getAttribute('data-gr-state'), 'open');
  assert.equal(b.input.getAttribute('aria-expanded'), 'true');

  const options = w.list.querySelectorAll('[role="option"]');
  assert.equal(options.length, 3);
  assert.equal(options[0].getAttribute('aria-selected'), 'false');
  assert.ok(options[0].getAttribute('id'));
  assert.equal(options[0].querySelector('mark').textContent, 'Но', 'совпадение не подсвечено');

  delete global.fetch;
  G.destroy();
});

test('клавиатура: ↓↑ с aria-activedescendant, Enter выбирает и шлёт griffin:select, Esc закрывает без стирания', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc);
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(['Alpha', 'Beta']) });

  G.start();

  const w = G.instance(b.root, 'combobox');
  const picked = [];
  doc.addEventListener('griffin:select', (e) => picked.push(e.detail.item.value));

  type(b.input, 'al');
  await tick(30); await tick();

  const options = w.list.querySelectorAll('[role="option"]');

  b.input.dispatchEvent(event('keydown', b.input, { key: 'ArrowDown' }));
  assert.equal(b.input.getAttribute('aria-activedescendant'), options[0].getAttribute('id'));
  assert.equal(options[0].getAttribute('aria-selected'), 'true');
  b.input.dispatchEvent(event('keydown', b.input, { key: 'ArrowDown' }));
  assert.equal(b.input.getAttribute('aria-activedescendant'), options[1].getAttribute('id'));
  b.input.dispatchEvent(event('keydown', b.input, { key: 'ArrowDown' }));
  assert.equal(b.input.getAttribute('aria-activedescendant'), options[0].getAttribute('id'), 'по кругу');
  b.input.dispatchEvent(event('keydown', b.input, { key: 'ArrowUp' }));
  assert.equal(b.input.getAttribute('aria-activedescendant'), options[1].getAttribute('id'));

  const esc = event('keydown', b.input, { key: 'Escape' });
  b.input.dispatchEvent(esc);
  assert.equal(b.root.getAttribute('data-gr-state'), 'ready');
  assert.equal(b.input.value, 'al', 'Esc стёр запрос');
  assert.equal(b.input.hasAttribute('aria-activedescendant'), false);
  assert.equal(esc.defaultPrevented, true);

  // ↓ на закрытом списке показывает прошлую выдачу без нового запроса.
  b.input.dispatchEvent(event('keydown', b.input, { key: 'ArrowDown' }));
  assert.equal(b.root.getAttribute('data-gr-state'), 'open');
  assert.equal(b.input.getAttribute('aria-activedescendant'), options[0].getAttribute('id'));

  const enter = event('keydown', b.input, { key: 'Enter' });
  b.input.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(b.input.value, 'Alpha');
  assert.deepEqual(picked, ['Alpha']);
  assert.equal(b.root.getAttribute('data-gr-state'), 'ready');

  // Без выбранной позиции Enter отдаётся форме.
  type(b.input, 'be');
  await tick(30); await tick();
  const plain = event('keydown', b.input, { key: 'Enter' });
  b.input.dispatchEvent(plain);
  assert.equal(plain.defaultPrevented, false);

  delete global.fetch;
  G.destroy();
});

test('источник функцией, группы, пустой ответ с подписью, щелчок по позиции', async () => {
  const { G, doc } = setup(PARTS);
  const input = el('input', { type: 'text' });
  const root = mount(doc, el('div', {}, [input]));
  const queries = [];
  const source = (q) => {
    queries.push(q);
    if (q === 'zzz') return Promise.resolve([]);
    return Promise.resolve([
      { value: 'Acer', group: 'Ноутбуки' }, { value: 'Asus', group: 'Ноутбуки' }, { value: 'AirPods', group: 'Наушники' },
    ]);
  };

  G.start();

  const w = G.mount(root, 'combobox', { source, min: 1, delay: 0, empty: 'Ничего не найдено' });

  type(input, 'a');
  await tick(); await tick();
  assert.deepEqual(queries, ['a']);
  assert.equal(w.list.querySelectorAll('[role="option"]').length, 3);
  assert.equal(w.list.querySelectorAll('[role="presentation"]').length, 2, 'заголовки групп');

  const second = w.list.querySelectorAll('[role="option"]')[1];
  second.dispatchEvent(event('click', second));
  assert.equal(input.value, 'Asus');

  type(input, 'zzz');
  await tick(); await tick();
  assert.equal(w.list.querySelectorAll('[role="option"]').length, 0);
  assert.equal(w.list.querySelector('[role="status"]').textContent, 'Ничего не найдено');
  assert.equal(root.getAttribute('data-gr-state'), 'open');

  w.destroy();
  assert.equal(input.hasAttribute('role'), false);
  assert.equal(root.querySelector('[role="listbox"]'), null, 'созданный список не убран');
  assert.equal(root.hasAttribute('data-gr-state'), false);
});
