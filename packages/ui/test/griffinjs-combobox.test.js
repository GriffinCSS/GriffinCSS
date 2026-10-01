'use strict';

// Комбобокс: роли, дебаунс и минимальная длина, источник по URL и функцией,
// клавиатура с aria-activedescendant, выбор, Esc без стирания, группы,
// пустой ответ, destroy.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, ORIGIN } = require('./helpers/griffinjs-dom');

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
  global.location = { origin: ORIGIN };
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
  assert.deepEqual(calls, [ORIGIN + '/s?q=%D0%BD%D0%BE']);
  await tick();
  assert.equal(b.root.getAttribute('data-gr-state'), 'open');
  assert.equal(b.input.getAttribute('aria-expanded'), 'true');

  const options = w.list.querySelectorAll('[role="option"]');
  assert.equal(options.length, 3);
  assert.equal(options[0].getAttribute('aria-selected'), 'false');
  assert.ok(options[0].getAttribute('id'));
  assert.equal(options[0].querySelector('mark').textContent, 'Но', 'совпадение не подсвечено');

  delete global.fetch;
  delete global.location;
  G.destroy();
});

test('клавиатура: ↓↑ с aria-activedescendant, Enter выбирает и шлёт griffin:select, Esc закрывает без стирания', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc);
  global.location = { origin: ORIGIN };
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
  delete global.location;
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

test('navigate: переход по http(s) и относительному адресу; javascript: не переходит — предупреждение, выбор остаётся', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc, { 'data-gr-combobox': 'src: /s?q={q}; min: 1; delay: 0; navigate' });
  const picked = [];
  const said = [];
  const before = console.warn;
  global.location = { origin: ORIGIN, href: 'https://example.com/catalog/' };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([
    { value: 'Иванов', href: 'javascript:void(document.body.dataset.xss=1)' },
    { value: 'Петров', href: '/people/petrov' },
    { value: 'Сидоров', href: 'https://other.example/sidorov' },
    { value: 'Смирнов', href: ' JaVaScRiPt:alert(1)' },
  ]) });
  doc.addEventListener('griffin:select', (e) => picked.push(e.detail.item.value));

  G.start();

  const w = G.instance(b.root, 'combobox');

  type(b.input, 'ов');
  await tick(); await tick();

  console.warn = (message) => said.push(String(message));

  try {
    w.select(0);
    assert.equal(global.location.href, 'https://example.com/catalog/', 'переход по javascript:');
    assert.equal(b.input.value, 'Иванов', 'выбор не остался');
    assert.ok(said.some((m) => m.includes('javascript:void(document.body.dataset.xss=1)')), 'нет предупреждения с адресом');

    w.select(3);
    assert.equal(global.location.href, 'https://example.com/catalog/', 'переход по JaVaScRiPt: с пробелом');

    w.select(1);
    assert.equal(global.location.href, '/people/petrov');

    w.select(2);
    assert.equal(global.location.href, 'https://other.example/sidorov');
  } finally {
    console.warn = before;
  }

  assert.deepEqual(picked, ['Иванов', 'Смирнов', 'Петров', 'Сидоров']);

  delete global.fetch;
  delete global.location;
  G.destroy();
});

// Предупреждения слоя за время fn(), в том числе асинхронные.
async function warnings(fn) {
  const said = [];
  const before = console.warn;

  console.warn = (message) => said.push(String(message));

  try { await fn(); } finally { console.warn = before; }

  return said;
}

// Набранное уходит источнику с каждым запросом: CORS держит только чтение
// ответа, а не отправку. Поэтому адрес из разметки — только свой origin;
// чужой — только из JS: GriffinJS.config.sources или функция source.
test('источник из разметки — только свой origin: чужой, //evil, data:, javascript: — запроса нет, предупреждение с адресом', async () => {
  const refused = [
    'https://evil.example/s?q={q}',
    '//evil.example/s?q={q}',
    'http://example.com/s?q={q}',
    'data:application/json,["Иванов"]',
    'javascript:alert(1)//{q}',
  ];

  for (const src of refused) {
    const { G, doc } = setup(PARTS);
    const b = box(doc, { 'data-gr-combobox': JSON.stringify({ src, min: 1, delay: 0 }) });
    const calls = [];
    global.location = { origin: ORIGIN };
    global.fetch = (url) => { calls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(['Иванов']) }); };

    G.start();

    const said = await warnings(async () => { type(b.input, 'Пе'); await tick(); await tick(); });

    assert.deepEqual(calls, [], `запрос ушёл: ${src}`);
    assert.ok(said.some((m) => m.includes('source refused') && m.includes(src.replace('{q}', '').slice(0, 20))), `нет предупреждения с адресом: ${src}\n${said.join('\n')}`);
    assert.equal(G.instance(b.root, 'combobox').list.querySelectorAll('[role="option"]').length, 0);

    delete global.fetch;
    delete global.location;
    G.destroy();
  }
});

// Редирект: ответ 302 своего адреса на чужой унёс бы набранное туда же.
test('свой относительный источник — fetch(url.href, { redirect: \'error\' })', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc, { 'data-gr-combobox': 'src: /s?q={q}; min: 1; delay: 0' });
  const calls = [];
  global.location = { origin: ORIGIN };
  global.fetch = (url, init) => { calls.push([url, init && init.redirect]); return Promise.resolve({ ok: true, json: () => Promise.resolve(['Иванов']) }); };

  G.start();
  type(b.input, 'Ив');
  await tick(); await tick();

  assert.deepEqual(calls, [[ORIGIN + '/s?q=%D0%98%D0%B2', 'error']]);

  delete global.fetch;
  delete global.location;
  G.destroy();
});

test('GriffinJS.config.sources: по умолчанию пуст; origin из списка — запрос, другой порт или схема — отказ', async () => {
  const cases = {
    'https://api.example.ru/s?q={q}': true,
    'https://api.example.ru/v2/search?q={q}': true,
    'https://api.example.ru:8443/s?q={q}': false,
    'http://api.example.ru/s?q={q}': false,
    'https://evil.api.example.ru/s?q={q}': false,
  };

  for (const [src, allowed] of Object.entries(cases)) {
    const { G, doc } = setup(PARTS);

    assert.deepEqual(G.config.sources, [], 'список источников по умолчанию не пуст');

    // Запись нормализуется до origin: путь и слеш в конце не мешают.
    G.config.sources.push('https://api.example.ru/v1/', 'не адрес');

    const b = box(doc, { 'data-gr-combobox': JSON.stringify({ src, min: 1, delay: 0 }) });
    const calls = [];
    global.location = { origin: ORIGIN };
    global.fetch = (url, init) => { calls.push([url, init && init.redirect]); return Promise.resolve({ ok: true, json: () => Promise.resolve(['Иванов']) }); };

    G.start();
    await warnings(async () => { type(b.input, 'Ив'); await tick(); await tick(); });

    assert.deepEqual(calls, allowed ? [[src.replace('{q}', '%D0%98%D0%B2'), 'error']] : [], src);

    delete global.fetch;
    delete global.location;
    G.destroy();
  }
});

test('GriffinJS.config.sources, заданный присваиванием, читается при каждом запросе', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc, { 'data-gr-combobox': 'src: https://api.example.ru/s?q={q}; min: 1; delay: 0; cache: false' });
  const calls = [];
  global.location = { origin: ORIGIN };
  global.fetch = (url) => { calls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(['Иванов']) }); };

  G.start();
  await warnings(async () => { type(b.input, 'Ив'); await tick(); await tick(); });
  assert.deepEqual(calls, [], 'пустой список пропустил чужой origin');

  G.config.sources = ['https://api.example.ru'];
  type(b.input, 'Ива');
  await tick(); await tick();
  assert.deepEqual(calls, ['https://api.example.ru/s?q=%D0%98%D0%B2%D0%B0']);

  delete global.fetch;
  delete global.location;
  G.destroy();
});

// Адрес перехода — строкой один раз: объект с toString, отдающим разное,
// прошёл бы проверку безопасной строкой, а в location лёг бы другой.
test('navigate: href-объект приводится к строке один раз — проверяется и пишется одна строка', async () => {
  const { G, doc } = setup(PARTS);
  const input = el('input', { type: 'text' });
  const root = mount(doc, el('div', {}, [input]));
  let calls = 0;
  const href = { toString() { calls++; return calls === 1 ? 'https://example.com/ok' : 'javascript:alert(1)'; } };
  global.location = { origin: ORIGIN, href: 'https://example.com/catalog/' };

  G.start();

  const w = G.mount(root, 'combobox', { source: () => Promise.resolve([{ value: 'Иванов', href }]), min: 1, delay: 0, navigate: true });

  type(input, 'Ив');
  await tick(); await tick();
  await warnings(async () => w.select(0));

  assert.equal(global.location.href, 'https://example.com/ok');

  delete global.location;
  G.destroy();
});
