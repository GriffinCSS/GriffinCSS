'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { setupDom, el, generatedCSS, cssSection, MockMutationObserver } = require('./helpers/dom');
const { compileScss } = require('./helpers/css');

const PKG = require('../package.json');
const RUNTIME_SRC = readFileSync(path.join(__dirname, '..', 'src', 'griffincss.js'), 'utf8');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('версия рантайма совпадает с версией пакета', () => {
  const { griffin } = setupDom(el('body'));

  assert.equal(griffin.version, PKG.version);
  assert.ok(RUNTIME_SRC.includes('v' + PKG.version), 'версия в шапке файла тоже обновлена');
});

// Дефект ④: FOUC-защита в статическом CSS оставляла страницу пустой,
// если JS не выполнился.
test('статический CSS не содержит FOUC-защиты', () => {
  const css = compileScss("@use 'griffincss-core';");

  assert.ok(!css.includes('gr-ready'), 'opacity:0 больше не приходит из собранного CSS');
});

test('FOUC-защиту ставит рантайм', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1' });
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  const css = generatedCSS(doc);

  assert.ok(css.includes('[data-gr-layout]:not(.gr-ready)'), css);
  assert.ok(css.includes('opacity: 0'), css);
  assert.ok(container.classList.contains('gr-ready'), 'обработанный контейнер открыт');
});

// 37a: FOUC-защита открывала контейнер переходом 0,3 с — заметным
// движением, которое пользователь с `prefers-reduced-motion: reduce`
// просил не показывать. Появление содержимого остаётся мгновенным.
test('FOUC-защита уважает reduced-motion', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1' });
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  const guard = cssSection(doc, 'FOUC guard');

  assert.ok(guard.includes('@media (prefers-reduced-motion: reduce)'), guard);
  assert.ok(/prefers-reduced-motion[\s\S]*transition: none/.test(guard), guard);
  assert.ok(guard.includes('transition: opacity 0.3s ease'), 'обычный переход остался на месте');
});

// 2h: каскад скруглений перешёл на чистый CSS.
test('рантайм не трогает inline-стили .gr-radius', () => {
  const card = el('div', { class: 'gr-radius' });
  const { griffin } = setupDom(el('body', {}, [card]));

  griffin.init();

  assert.equal(card.style.size, 0, 'inline-стили не пишутся, forced reflow не нужен');
  assert.ok(!RUNTIME_SRC.includes('getComputedStyle(el)'), 'цикл по computed-стилям удалён');
});

// 2i: refresh по конкретному корню, с дебаунсом.
test('observe перерисовывает только свой корень', async () => {
  const root = el('div');
  const outside = el('div', { 'data-gr-layout': 'a1b1' }, [el('div')]);
  const { griffin } = setupDom(el('body', {}, [root, outside]));

  griffin.init();
  griffin.destroy();
  griffin.observe(root);

  const added = el('div', { 'data-gr-layout': 'a1b1' }, [el('div')]);
  root.appendChild(added);
  MockMutationObserver.instances[0].fireAdded([added]);

  await sleep(60);

  assert.ok(added.classList.contains('gr-ready'), 'добавленный в корень контейнер обработан');
  assert.ok(!outside.classList.contains('gr-ready'), 'элемент вне корня не трогается');
});

// 37a: перерисовка фреймворка присваивает className целиком, и с узла
// слетают .gr-ready и .gr-l-<хеш>. Раскладка исчезает, а FOUC-защита
// держит контейнер в opacity: 0 — наблюдение за childList такую мутацию
// не видит. Воспроизведено в браузере: packages/ui/test/browser/reframe.spec.mjs.
test('перезапись className контейнера возвращает маркеры', async () => {
  const root = el('div');
  const box = el('div', { 'data-gr-layout': 'a1b1' }, [el('div'), el('div')]);
  const { griffin } = setupDom(el('body', {}, [root]));

  root.appendChild(box);
  griffin.init();
  griffin.observe(root);

  const layoutClass = box.classList.items.find((c) => c.startsWith('gr-l-'));

  assert.ok(layoutClass, 'контейнер разложен до перезаписи');

  box.className = 'foo';
  MockMutationObserver.instances[0].fireAttribute(box);

  await sleep(60);

  assert.ok(box.classList.contains('gr-ready'), 'контейнер снова открыт');
  assert.ok(box.classList.contains(layoutClass), 'класс раскладки вернулся');
  assert.ok(box.classList.contains('foo'), 'класс фреймворка не тронут');
});

// Риск 2 плана: возврат класса — сам мутация атрибута. Если ответ
// «работа есть» опирается на oldValue, а не на текущее состояние узла,
// перерисовка вызывает саму себя без конца.
test('возврат маркеров не зацикливает перерисовку', async () => {
  const root = el('div');
  const box = el('div', { 'data-gr-layout': 'a1b1' }, [el('div'), el('div')]);
  const { griffin } = setupDom(el('body', {}, [root]));

  root.appendChild(box);
  griffin.init();
  griffin.observe(root);

  const observer = MockMutationObserver.instances[0];

  // Наблюдатель откладывает перерисовку таймером: заведённый таймер
  // и есть ответ «работа есть». Считаем их, а не перерисовки.
  const scheduled = () => {
    const real = global.setTimeout;
    let count = 0;

    global.setTimeout = (fn, ms) => { count += 1; return real(fn, ms); };

    try {
      observer.fireAttribute(box);
    } finally {
      global.setTimeout = real;
    }

    return count;
  };

  box.className = 'foo';

  assert.equal(scheduled(), 1, 'потеря маркеров будит наблюдатель');

  await sleep(60);

  assert.ok(box.classList.contains('gr-ready'), 'маркеры вернулись');

  // Та же запись по восстановленному узлу — работы больше нет.
  // Иначе возврат класса будил бы сам себя без конца.
  assert.equal(scheduled(), 0, 'по целому контейнеру перерисовка не назначается');
});

test('серия мутаций даёт одну перерисовку', async () => {
  const root = el('div');
  const { doc, griffin } = setupDom(el('body', {}, [root]));

  griffin.observe(root);

  const observer = MockMutationObserver.instances[0];

  for (let i = 0; i < 5; i += 1) {
    const added = el('div', { 'data-gr-layout': 'a1b1' });
    root.appendChild(added);
    observer.fireAdded([added]);
  }

  await sleep(60);

  const css = generatedCSS(doc);
  const occurrences = css.split('grid-template-areas').length - 1;

  assert.equal(occurrences, 1, 'одинаковый набор раскладок описан один раз');
  assert.equal(root.children.filter((c) => c.classList.contains('gr-ready')).length, 5);
});

test('destroy снимает всё, что поставил рантайм', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1c1' }, [
    el('div'),
    el('div', { class: 'gr-area-b' }),
    el('div'),
  ]);
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();
  griffin.observe(doc.body);
  griffin.destroy();

  assert.ok(!container.classList.contains('gr-ready'), 'gr-ready снят');
  assert.equal(container.classList.items.filter((c) => c.startsWith('gr-l-')).length, 0, 'gr-l-* снят');
  assert.deepEqual(
    container.children.map((child) => child.className),
    ['', 'gr-area-b', ''],
    'снимаются только назначенные рантаймом области',
  );
  assert.equal(doc.getElementById('griffincss-dynamic'), null, '<style> удалён');
  assert.ok(MockMutationObserver.instances[0].disconnected, 'наблюдатель отключён');
});

test('после destroy рантайм можно запустить заново', () => {
  const container = el('div', { 'data-gr-layout': 'a1b1' }, [el('div'), el('div')]);
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();
  griffin.destroy();
  griffin.init();

  assert.ok(container.classList.contains('gr-ready'));
  assert.ok(generatedCSS(doc).includes('grid-template-areas'));
  assert.deepEqual(
    container.children.map((child) => child.className),
    ['gr-area-a', 'gr-area-b'],
  );
});

// Потоковый режим: раскладка выдаётся во время парсинга, а не после него.
test('контейнер размечается, будучи добавленным без детей', () => {
  const body = el('body');
  const script = el('script');
  const { doc, griffin } = setupDom(body, {}, { readyState: 'loading', script });

  griffin._autoStart();

  const container = el('div', { 'data-gr-layout': 'a1b1' });
  body.appendChild(container);
  MockMutationObserver.instances[0].fireAdded([container]);

  assert.ok(container.classList.contains('gr-ready'), 'контейнер открыт сразу');
  assert.match(container.className, /gr-l-/, container.className);
  assert.match(generatedCSS(doc), /grid-template-areas/, 'правило уже в таблице');
});

test('ребёнок, пришедший следующей порцией, получает область', () => {
  const body = el('body');
  const script = el('script');
  const { griffin } = setupDom(body, {}, { readyState: 'loading', script });

  griffin._autoStart();

  const container = el('div', { 'data-gr-layout': 'a1b1' });
  body.appendChild(container);
  MockMutationObserver.instances[0].fireAdded([container]);

  const child = el('div');
  container.appendChild(child);
  MockMutationObserver.instances[0].fireAdded([child]);

  assert.ok(child.classList.contains('gr-area-a'), child.className);
});

test('явный класс отбирает имя у ребёнка, которому его выдал рантайм', () => {
  const body = el('body');
  const script = el('script');
  const { griffin } = setupDom(body, {}, { readyState: 'loading', script });

  griffin._autoStart();

  const container = el('div', { 'data-gr-layout': 'a1b1c1' });
  body.appendChild(container);
  MockMutationObserver.instances[0].fireAdded([container]);

  const auto1 = el('div');
  const auto2 = el('div');
  const explicit = el('div', { class: 'gr-area-a' });

  // Порции идут одна за другой, как при парсинге.
  for (const child of [auto1, auto2, explicit]) {
    container.appendChild(child);
    MockMutationObserver.instances[0].fireAdded([child]);
  }

  assert.ok(explicit.classList.contains('gr-area-a'), 'явный класс остался');
  assert.ok(auto1.classList.contains('gr-area-b'), auto1.className);
  assert.ok(auto2.classList.contains('gr-area-c'), auto2.className);
});

test('поток и пакет раскладывают один контейнер одинаково', () => {
  const markup = () => [el('div'), el('div'), el('div', { class: 'gr-area-a' })];

  const batchContainer = el('div', { 'data-gr-layout': 'a1b1c1' }, markup());
  const batch = setupDom(el('body', {}, [batchContainer]));
  batch.griffin.init();
  const expected = batchContainer.children.map((c) => c.className);

  const body = el('body');
  const script = el('script');
  const { griffin } = setupDom(body, {}, { readyState: 'loading', script });

  griffin._autoStart();

  const streamed = el('div', { 'data-gr-layout': 'a1b1c1' });
  body.appendChild(streamed);
  MockMutationObserver.instances[0].fireAdded([streamed]);

  for (const child of markup()) {
    streamed.appendChild(child);
    MockMutationObserver.instances[0].fireAdded([child]);
  }

  assert.deepEqual(streamed.children.map((c) => c.className), expected);
});

test('data-stream="false" возвращает разбор после DOMContentLoaded', () => {
  const body = el('body');
  const script = el('script', { 'data-stream': 'false' });
  const { griffin } = setupDom(body, {}, { readyState: 'loading', script });

  griffin._autoStart();

  const container = el('div', { 'data-gr-layout': 'a1b1' });
  body.appendChild(container);

  assert.equal(MockMutationObserver.instances.length, 0, 'наблюдателя нет');
  assert.ok(!container.classList.contains('gr-ready'), 'до DOMContentLoaded ничего');
});

test('destroy() гасит наблюдателя парсинга', () => {
  const body = el('body');
  const script = el('script');
  const { griffin } = setupDom(body, {}, { readyState: 'loading', script });

  griffin._autoStart();
  griffin.destroy();

  assert.ok(MockMutationObserver.instances[0].disconnected, 'наблюдатель отключён');
});

// Скрипт выше <link>: в потоковом режиме брейкпоинты прочлись дефолтными.
test('init() пересобирает CSS, если брейкпоинты доехали позже', () => {
  const body = el('body');
  const script = el('script');
  const { doc, griffin } = setupDom(body, { '--gr-bp-md': '' }, {
    readyState: 'loading',
    script,
  });

  griffin._autoStart();

  const container = el('div', { 'data-gr-layout': 'a1b1', 'data-gr-layout-md': 'a1-b1' });
  body.appendChild(container);
  MockMutationObserver.instances[0].fireAdded([container]);

  assert.match(generatedCSS(doc), /768px/, 'пока действует фолбэк');

  global.getComputedStyle = () => ({
    getPropertyValue: (name) => (name === '--gr-bp-md' ? '900px' : ''),
  });

  doc.fire('DOMContentLoaded');

  const css = generatedCSS(doc);

  assert.match(css, /900px/, 'значение из CSS-токена подхвачено');
  assert.ok(!css.includes('768px'), 'старое правило не осталось в таблице');
});

// Этап 18: машинерия наблюдения — фабрика в ядре, рантаймы-надстройки
// берут её через _scanner вместо собственных копий.
test('ядро отдаёт _scanner, поток фабрики фильтрует и флашит по порции', () => {
  const { griffin } = setupDom(el('body'));

  assert.equal(typeof griffin._scanner, 'function');

  const calls = [];
  const scanner = griffin._scanner({
    delay: 0,
    hasWork: () => true,
    handleAdded: (nodes) => { calls.push(nodes.length); return true; },
    flush: () => calls.push('flush'),
    refresh: () => {},
  });

  scanner.observeParsing();
  MockMutationObserver.instances.at(-1).fireAdded([el('div'), el('div')]);

  assert.deepEqual(calls, [2, 'flush'], 'порция целиком, флаш один на порцию');

  scanner.stop();
  assert.ok(MockMutationObserver.instances.at(-1).disconnected, 'stop() отключает поток');
});

test('observe без MutationObserver — тихий no-op', () => {
  const { griffin } = setupDom(el('body'));

  delete global.MutationObserver;

  assert.doesNotThrow(() => griffin.observe());
});
