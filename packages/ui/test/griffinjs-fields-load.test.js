'use strict';

// Догрузка бандла полей по потребности (Этап 48c) — модуль core/loader.js
// вне ядра, подписанный на init(root). Встретив data-gr-<поле> без
// зарегистрированного виджета из набора полей, он либо вставляет <script>
// из GriffinJS.config.fields — один раз, с nonce со своего тега, поля
// раньше таблицы стран, — и после загрузки поднимает виджеты и шлёт
// griffinjs:fields-loaded; либо, без config, предупреждает раз на имя
// поля. Ошибка загрузки — предупреждение, узлы остаются базой без скрипта,
// второй попытки нет.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { setup, el, mount, event, SRC } = require('./helpers/griffinjs-dom');

const BASE = ['core/options.js', 'core/registry.js', 'core/scanner.js'];
const CORE = [...BASE, 'core/loader.js'];

// Список полей загрузчика обязан совпадать со списком сборки: поле,
// добавленное в build-griffinjs.mjs и забытое здесь, не догружалось бы молча.
const BUILD = readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'build-griffinjs.mjs'), 'utf8');
const BUILD_FIELDS = [...BUILD.slice(BUILD.indexOf('export const FIELDS'), BUILD.indexOf('];', BUILD.indexOf('export const FIELDS')))
  .matchAll(/'fields\/([a-z]+)\.js'/g)].map((m) => m[1]);

function capture(fn) {
  const warnings = [];
  const original = console.warn;

  console.warn = (m) => warnings.push(m);

  try { fn(); } finally { console.warn = original; }

  return warnings;
}

// Мок: документ с <head>, куда загрузчик вставляет теги, и dispatchEvent
// на документе — для события о загрузке.
function ready(parts = CORE) {
  const { G, doc } = setup(parts);

  doc.head = el('head');
  doc.documentElement.insertBefore(doc.head, doc.body);
  doc.head.ownerDocument = doc;
  doc.dispatchEvent = (e) => { doc.fire(e.type, e); return true; };

  return { G, doc, scripts: () => doc.head.children.filter((n) => n.tagName === 'SCRIPT') };
}

test('список полей загрузчика совпадает со списком сборки', () => {
  const { G } = ready();

  assert.ok(BUILD_FIELDS.length >= 9, 'список сборки не прочитан: ' + BUILD_FIELDS.join(' '));
  assert.deepEqual(G.loader._fields(), BUILD_FIELDS);
});

test('без загрузчика поле без виджета молчит, как раньше; config — поверхность ядра', () => {
  const { G, doc, scripts } = ready(BASE);

  mount(doc, el('input', { 'data-gr-mask': '00' }));

  const warnings = capture(() => G.start());

  assert.deepEqual(warnings, []);
  assert.equal(scripts().length, 0);
  assert.deepEqual(G.config, {}, 'config без загрузчика — не пустой объект');
});

test('без config поле без виджета — предупреждение раз на имя, узел не тронут', () => {
  const { G, doc, scripts } = ready();

  const a = mount(doc, el('input', { 'data-gr-mask': '+7 (000)' }));
  const b = mount(doc, el('input', { 'data-gr-mask': '00.00' }));
  const c = mount(doc, el('div', { 'data-gr-phone': '' }));

  const warnings = capture(() => { G.start(); G.init(doc.body); });

  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.match(warnings[0], /GriffinJS: поле «mask» не собрано/);
  assert.match(warnings[0], /GriffinJS\.config\.fields/);
  assert.match(warnings[1], /поле «phone» не собрано/);
  assert.equal(scripts().length, 0, 'без config тег вставлен');
  assert.equal(G._mounted().length, 0);
  assert.equal(a.attributes.size + b.attributes.size + c.attributes.size, 3, 'узлы тронуты');
});

test('с config: один <script> с nonce, после load — виджеты подняты и событие послано', () => {
  const { G, doc, scripts } = ready();

  G.config.fields = { src: '/js/griffinjs-fields.js' };
  G.loader._nonce('r4nd0m');

  const a = mount(doc, el('input', { 'data-gr-mask': '+7 (000)' }));
  const b = mount(doc, el('div', { 'data-gr-file': '' }));
  const loaded = [];

  doc.addEventListener('griffinjs:fields-loaded', (e) => loaded.push(e.detail));

  const warnings = capture(() => { G.start(); G.init(doc.body); G.init(a); });

  assert.deepEqual(warnings, [], 'с config предупреждений быть не должно');
  assert.equal(scripts().length, 1, 'тег вставлен не один раз: ' + scripts().length);

  const tag = scripts()[0];

  assert.equal(tag.src, '/js/griffinjs-fields.js');
  assert.equal(tag.async, false, 'без async = false порядок полей и таблицы стран не гарантирован');
  assert.equal(tag.nonce, 'r4nd0m');
  assert.equal(G._mounted().length, 0, 'виджеты подняты до загрузки');

  // Бандл приехал: поля регистрируются, загрузчик поднимает их на месте.
  const mounted = [];

  G.defineWidget('mask', (node) => { mounted.push(node); return {}; });
  G.defineWidget('file', (node) => { mounted.push(node); return {}; });
  tag.dispatchEvent(event('load', tag, { bubbles: false }));

  assert.deepEqual(mounted, [a, b]);
  assert.equal(loaded.length, 1, 'событие griffinjs:fields-loaded не пришло');
  assert.deepEqual(loaded[0].files, ['/js/griffinjs-fields.js']);

  // Поздний узел поднимается сразу, второй тег не вставляется.
  const late = mount(doc, el('input', { 'data-gr-mask': '00' }));
  G.init(late);
  assert.deepEqual(mounted, [a, b, late]);
  assert.equal(scripts().length, 1);
});

test('таблица стран грузится вторым тегом, подъём ждёт оба файла', () => {
  const { G, doc, scripts } = ready();

  G.config.fields = { src: 'fields.js', countries: 'countries.js' };
  const node = mount(doc, el('div', { 'data-gr-phone': '' }));

  G.start();

  assert.deepEqual(scripts().map((s) => s.src), ['fields.js', 'countries.js']);

  const mounted = [];
  G.defineWidget('phone', (n) => { mounted.push(n); return {}; });

  scripts()[0].dispatchEvent(event('load', scripts()[0], { bubbles: false }));
  assert.equal(mounted.length, 0, 'поднято до загрузки таблицы стран');

  scripts()[1].dispatchEvent(event('load', scripts()[1], { bubbles: false }));
  assert.deepEqual(mounted, [node]);
});

test('ошибка загрузки — предупреждение, база без скрипта, второй попытки нет', () => {
  const { G, doc, scripts } = ready();

  G.config.fields = { src: '/nope/griffinjs-fields.js' };
  mount(doc, el('input', { 'data-gr-mask': '00' }));

  G.start();

  const tag = scripts()[0];
  const warnings = capture(() => tag.dispatchEvent(event('error', tag, { bubbles: false })));

  assert.equal(warnings.length, 1, warnings.join('\n'));
  assert.match(warnings[0], /GriffinJS: бандл полей не загружен: \/nope\/griffinjs-fields\.js/);

  const again = capture(() => G.init(mount(doc, el('input', { 'data-gr-mask': '00' }))));

  assert.deepEqual(again, [], 'после ошибки загрузчик шумит на каждом узле');
  assert.equal(scripts().length, 1, 'после ошибки тег вставлен снова');
  assert.equal(G._mounted().length, 0);
});

test('тег без полей на странице ничего не грузит', () => {
  const { G, doc, scripts } = ready();

  G.config.fields = { src: 'fields.js' };
  mount(doc, el('div', { 'data-gr-slider': '' }));
  G.defineWidget('slider', () => ({}));

  G.start();

  assert.equal(scripts().length, 0);
});

test('data-fields, data-countries и nonce читаются с тега в момент загрузки модуля', () => {
  const { G, doc } = ready(BASE);

  doc.currentScript = el('script', { 'data-fields': '/js/griffinjs-fields.js', 'data-countries': '/js/griffinjs-countries.js' });
  doc.currentScript.nonce = 'abc';

  require(path.join(SRC, 'core', 'loader.js'));

  assert.deepEqual(G.config.fields, { src: '/js/griffinjs-fields.js', countries: '/js/griffinjs-countries.js' });
  assert.equal(G.loader._nonce(), 'abc');
});
