'use strict';

// Мегаменю на мок-DOM: состояние и клавиатура. Наведение с задержкой
// намерения, единственная открытая панель, стрелки по верхнему ряду,
// ajax-панели, мобильный режим без наведения и стрелок, destroy.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, wide, response, ORIGIN } = require('./helpers/griffinjs-dom');

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

  global.location = { origin: ORIGIN };
  global.fetch = (url) => {
    calls.push(url);
    return Promise.resolve(response('<p>Бренды</p>'));
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

  global.fetch = () => Promise.resolve(response('', 'text/html', 500));
  const b2 = bar(doc, { itemB: { 'data-gr-src': '/menu/fail.html' } });
  G.init(b2.root);
  b2.itemB.open = true;
  await tick();
  await tick();
  assert.equal(b2.itemB.getAttribute('data-gr-state'), 'error');

  delete global.fetch;
  delete global.location;
  G.destroy();
});

// Пункт, открытый разметкой: toggle от open браузеры шлют в разное время —
// при разборе, на interactive или после load, — и слой, стартующий
// по DOMContentLoaded, ловил его не всегда: панель оставалась пустой.
// Атрибут open до подъёма мок событий не шлёт — как пропущенный toggle.
test('ajax-панель: пункт, открытый разметкой до подъёма, грузит панель при подъёме', async () => {
  const { G, doc } = setup(PARTS);
  const b = bar(doc, { itemB: { 'data-gr-src': '/menu/b.html', open: '' } });
  const calls = [];

  global.location = { origin: ORIGIN };
  global.fetch = (url) => {
    calls.push(url);
    return Promise.resolve(response('<p>Бренды</p>'));
  };

  try {
    G.start();

    assert.equal(b.itemB.open, true, 'пункт закрылся');
    assert.equal(b.sumB.getAttribute('aria-expanded'), 'true');
    assert.equal(b.itemB.getAttribute('data-gr-state'), 'loading', 'панель не грузится');
    await tick();
    await tick();
    assert.equal(b.panelB.innerHTML, '<p>Бренды</p>');
    assert.equal(b.itemB.getAttribute('data-gr-state'), 'ready');
    assert.equal(calls.length, 1);
  } finally {
    delete global.fetch;
    delete global.location;
    G.destroy();
  }
});

// Открытым бывает один пункт: из двух с open в разметке остаётся первый,
// второй закрывается сразу — без closing (на подъёме смотреть нечему)
// и без запроса. Поздний toggle ничего не меняет.
test('ajax-панель: два пункта с open в разметке — открыт первый, второй закрыт без closing и без запроса', async () => {
  const { G, doc } = setup(PARTS);
  const b = bar(doc, { itemB: { 'data-gr-src': '/menu/b.html', open: '' } });
  const calls = [];

  b.itemA.setAttribute('open', '');
  b.itemA.setAttribute('data-gr-src', '/menu/a.html');
  global.location = { origin: ORIGIN };
  global.fetch = (url) => {
    calls.push(url);
    return Promise.resolve(response('<p>панель</p>'));
  };

  try {
    G.start();
    await tick();
    await tick();

    assert.equal(b.itemA.open, true, 'первый пункт закрыт');
    assert.equal(b.itemA.getAttribute('data-gr-state'), 'ready');
    assert.equal(b.itemB.open, false, 'второй пункт остался открытым');
    assert.notEqual(b.itemB.getAttribute('data-gr-state'), 'closing');
    assert.notEqual(b.itemB.getAttribute('data-gr-state'), 'loading');
    assert.equal(b.sumB.getAttribute('aria-expanded'), 'false');
    assert.equal(calls.length, 1, 'запросов не один');
    assert.match(String(calls[0]), /\/menu\/a\.html$/);
  } finally {
    delete global.fetch;
    delete global.location;
    G.destroy();
  }
});

// Поздний toggle от open из разметки — WebKit присылает его то до старта,
// то после load: после подъёма он ничего не меняет — ни запроса, ни смены
// состояния, ни закрытия первого пункта.
test('ajax-панель: поздний toggle после подъёма ничего не меняет', async () => {
  const { G, doc } = setup(PARTS);
  const b = bar(doc, { itemB: { 'data-gr-src': '/menu/b.html', open: '' } });
  const calls = [];

  b.itemA.setAttribute('open', '');
  b.itemA.setAttribute('data-gr-src', '/menu/a.html');
  global.location = { origin: ORIGIN };
  global.fetch = (url) => {
    calls.push(url);
    return Promise.resolve(response('<p>панель</p>'));
  };

  try {
    G.start();
    await tick();
    await tick();

    const before = [b.itemA.open, b.itemA.getAttribute('data-gr-state'), b.itemB.open, b.itemB.getAttribute('data-gr-state')];

    for (const item of [b.itemA, b.itemB]) item.dispatchEvent(event('toggle', item, { bubbles: false }));
    await tick();
    await tick();

    assert.deepEqual([b.itemA.open, b.itemA.getAttribute('data-gr-state'), b.itemB.open, b.itemB.getAttribute('data-gr-state')], before);
    assert.equal(calls.length, 1, 'поздний toggle дал запрос');
  } finally {
    delete global.fetch;
    delete global.location;
    G.destroy();
  }
});

// Предупреждения слоя за время fn(), в том числе асинхронные — до конца промиса.
async function warnings(fn) {
  const said = [];
  const before = console.warn;

  console.warn = (message) => said.push(String(message));

  try { await fn(); } finally { console.warn = before; }

  return said;
}

test('ajax-панель: чужой origin, data: и прочие схемы не грузятся — error и предупреждение, запроса нет', async () => {
  const { G, doc } = setup(PARTS);
  const calls = [];

  global.location = { origin: ORIGIN };
  global.fetch = (url) => { calls.push(url); return Promise.resolve(response('<img src=x onerror=alert(1)>')); };

  G.start();

  for (const src of [
    'https://evil.example/panel.html',
    '//evil.example/panel.html',
    'http://example.com/panel.html',
    'data:text/html,<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
  ]) {
    const b = bar(doc, { itemB: { 'data-gr-src': src } });

    G.init(b.root);

    const said = await warnings(async () => { b.itemB.open = true; await tick(); await tick(); });

    assert.equal(b.itemB.getAttribute('data-gr-state'), 'error', src);
    assert.equal(b.panelB.innerHTML, '', `вставлено из ${src}`);
    assert.ok(said.some((m) => m.includes(src)), `нет предупреждения с адресом: ${src}`);
  }

  assert.deepEqual(calls, [], 'запрос ушёл');

  delete global.fetch;
  delete global.location;
  G.destroy();
});

test('ajax-панель: страница с непрозрачным origin (файл с диска) — data: и file: не грузятся, хотя origin обоих тоже «null»', async () => {
  const { G, doc } = setup(PARTS);
  const calls = [];

  doc.baseURI = 'file:///Users/me/site/page.html';
  global.location = { origin: 'null' };
  global.fetch = (url) => { calls.push(url); return Promise.resolve(response('<img src=x onerror=alert(1)>')); };

  G.start();

  for (const src of ['data:text/html,<img src=x onerror=alert(1)>', 'panel.html']) {
    const b = bar(doc, { itemB: { 'data-gr-src': src } });

    G.init(b.root);
    await warnings(async () => { b.itemB.open = true; await tick(); await tick(); });

    assert.equal(b.itemB.getAttribute('data-gr-state'), 'error', src);
    assert.equal(b.panelB.innerHTML, '', `вставлено из ${src}`);
  }

  assert.deepEqual(calls, [], 'запрос ушёл');

  delete global.fetch;
  delete global.location;
  G.destroy();
});

// Тип — целиком, а не префиксом: text/htmlx — не HTML, а склеенный из двух
// заголовков «text/html, application/json» браузер при прямом открытии
// читает по последнему типу.
test('ajax-панель: тип ответа — только text/html с параметрами; префикс и склейка типов — error', async () => {
  const types = {
    'text/htmlx': false,
    'text/html-x': false,
    'text/html, application/json': false,
    'text/html; charset=utf-8, application/json': false,
    'text/html': true,
    'TEXT/HTML; charset=UTF-8': true,
  };

  for (const [type, ok] of Object.entries(types)) {
    const { G, doc } = setup(PARTS);
    const b = bar(doc, { itemB: { 'data-gr-src': '/menu/b.html' } });

    global.location = { origin: ORIGIN };
    global.fetch = () => Promise.resolve(response('<p>Панель</p>', type));

    G.start();
    await warnings(async () => { b.itemB.open = true; await tick(); await tick(); });

    assert.equal(b.itemB.getAttribute('data-gr-state'), ok ? 'ready' : 'error', type);
    assert.equal(b.panelB.innerHTML, ok ? '<p>Панель</p>' : '', type);

    delete global.fetch;
    delete global.location;
    G.destroy();
  }
});

test('ajax-панель: свой адрес — запрос в режиме same-origin; ответ не text/html — error, панель не тронута', async () => {
  const { G, doc } = setup(PARTS);
  const calls = [];
  const b = bar(doc, { itemB: { 'data-gr-src': '/menu/b.txt' } });

  global.location = { origin: ORIGIN };
  global.fetch = (url, init) => {
    calls.push([url, init && init.mode]);
    return Promise.resolve(response('<img src=x onerror=alert(1)>', 'text/plain'));
  };

  G.start();

  const said = await warnings(async () => { b.itemB.open = true; await tick(); await tick(); });

  assert.deepEqual(calls, [[ORIGIN + '/menu/b.txt', 'same-origin']]);
  assert.equal(b.itemB.getAttribute('data-gr-state'), 'error');
  assert.equal(b.panelB.innerHTML, '');
  assert.ok(said.some((m) => m.includes('/menu/b.txt')));

  delete global.fetch;
  delete global.location;
  G.destroy();
});
