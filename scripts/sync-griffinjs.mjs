#!/usr/bin/env node
// Griffincss — таблица «модуль → что подключить» на странице GriffinJS.
//
// Единственный источник — сам слой: список зависимостей берётся у ядра
// (G.needs, объявленный модулем), состав файлов — из build-griffinjs.mjs,
// вес — из собранного dist. Таблицу, которую ведут руками, расходится
// с кодом на третьем виджете; здесь расходиться нечему.
//
// Запуск без ключа — проверка (exit 1 при расхождении), с --fix —
// переписывает блок между маркерами gr:griffinjs-deps. Идёт ПОСЛЕ сборки:
// вес считается по dist, а не по намерению.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

import { CORE, ENGINES, FIELDS, SHARED, WIDGETS } from './build-griffinjs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/ui/src/griffinjs');
const dist = join(root, 'packages/ui/dist');

const PAGE = 'docs/griffinjs.html';
const OPEN = '<!-- gr:griffinjs-deps -->';
const CLOSE = '<!-- /gr:griffinjs-deps -->';

// Поля второго бандла (Этап 38) — своя таблица на своей странице, той же
// машинерией: набор «ядро + объявленное + поле».
const FIELDS_PAGE = 'docs/griffinjs-fields.html';
const FIELDS_OPEN = '<!-- gr:griffinjs-fields-deps -->';
const FIELDS_CLOSE = '<!-- /gr:griffinjs-fields-deps -->';

const fix = process.argv.includes('--fix');

function die(message) {
  console.error(`sync-griffinjs: ${message}`);
  process.exit(1);
}

const name = (rel) => basename(rel, '.js');
const fileOf = {};

for (const rel of [...CORE, ...SHARED, ...ENGINES, ...WIDGETS, ...FIELDS]) fileOf[name(rel)] = rel;

// Объявления читаются у самого рантайма: слой поднимается в Node без DOM —
// модули только регистрируются, фабрики не исполняются.
const require = createRequire(import.meta.url);
const G = require(join(src, 'core/griffinjs-core.js'));

for (const rel of [...CORE.slice(1), ...SHARED, ...ENGINES, ...WIDGETS, ...FIELDS]) require(join(src, rel));

// Дорожка — единственная, кто берёт движок из реестра, и знает об этом
// только её код. Отсюда и правило: набору с дорожкой нужен движок.
const usesEngine = (module) => /\bG\.engines\b/.test(readFileSync(join(src, fileOf[module]), 'utf8'));

const inCore = new Set(CORE.map(name));

// Замыкание объявленных зависимостей: галерея берёт слайдер, слайдер — дорожку,
// дорожка — анимацию. Части, оставшиеся в ядре, в набор не попадают: они и так есть.
function closureOf(module) {
  const seen = new Set();

  (function collect(current) {
    if (seen.has(current)) return;

    seen.add(current);

    for (const dep of G.needs(current)) collect(dep);
  })(module);

  seen.delete(module);

  return [...seen].filter((dep) => !inCore.has(dep));
}

// Порядок подключения в наборе — тот же, что в полном файле.
const ORDER = [...SHARED, ...ENGINES, ...WIDGETS, ...FIELDS].map(name);
const byOrder = (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b);

function partsOf(module) {
  const parts = closureOf(module);

  // Движок нужен и тому, кто зависит от дорожки, а не только ей самой.
  if ([module, ...parts].some(usesEngine)) parts.push('scroll');

  parts.push(module);

  return parts.sort(byOrder);
}

const gzip = (buffers) => gzipSync(Buffer.concat(buffers), { level: 9 }).length;
const dfile = (module) => readFileSync(join(dist, `griffinjs-${module}.js`));
const core = readFileSync(join(dist, 'griffinjs-core.js'));
const kb = (bytes) => `${(bytes / 1024).toFixed(1).replace('.', ',')} КБ`;

// Строки таблицы: все виджеты и контроллеры в порядке сборки, плюс дорожка —
// она тоже виджет (data-gr-track) и живёт вне ядра.
const MODULES = [...SHARED, ...WIDGETS].map(name).filter((module) => G.widgets[module] || G.needs(module).length);

function row(module) {
  const parts = partsOf(module);
  const weight = gzip([core, ...parts.map(dfile)]);
  const files = parts.map((part) => `<code>griffinjs-${part}.js</code>`).join(' + ');

  return `  <tr><td><code>data-gr-${module}</code></td><td>${files}</td><td>${kb(weight)}</td></tr>`;
}

const full = gzip([readFileSync(join(dist, 'griffinjs.js'))]);

const expected = [
  '<p>',
  `  Весь слой одним файлом — <b>${kb(full)} gzip</b>. Но берут его обычно не целиком:`,
  `  ядро, нужное любому набору, весит <b>${kb(gzip([core]))}</b>, а остальное подключается`,
  '  по потребности. Каждый модуль объявляет, что берёт из ядра, и таблица собрана',
  '  из этих объявлений при сборке — разойтись с кодом ей нечем.',
  '</p>',
  '',
  '<table>',
  '  <tr><th>Виджет</th><th>Подключить после <code>griffinjs-core.js</code></th><th>Набор целиком</th></tr>',
  ...MODULES.map(row),
  '</table>',
].join('\n');

const FIELD_MODULES = FIELDS.map(name);

const fieldsExpected = [
  '<p>',
  `  Все поля одним файлом — <b>${kb(gzip([readFileSync(join(dist, 'griffinjs-fields.js'))]))} gzip</b> без ядра;`,
  `  набор «ядро + anchor + поля» — <b>${kb(gzip([core, dfile('anchor'), readFileSync(join(dist, 'griffinjs-fields.js'))]))}</b>.`,
  '  По одному поля берутся так же, как виджеты: ядро первым, затем объявленное',
  '  и само поле. Таблица собрана из объявлений при сборке.',
  '</p>',
  '',
  '<table>',
  '  <tr><th>Поле</th><th>Подключить после <code>griffinjs-core.js</code></th><th>Набор целиком</th></tr>',
  ...FIELD_MODULES.map(row),
  '</table>',
].join('\n');

let broken = 0;

for (const [page, open, close, expectedBlock] of [[PAGE, OPEN, CLOSE, expected], [FIELDS_PAGE, FIELDS_OPEN, FIELDS_CLOSE, fieldsExpected]]) {
  const html = readFileSync(join(root, page), 'utf8');
  const start = html.indexOf(open);
  const end = html.indexOf(close);

  if (start === -1 || end === -1) die(`в ${page} нет маркеров ${open} … ${close}`);

  const actual = html.slice(start + open.length, end).replace(/^\n|\n\s*$/g, '');

  if (actual === expectedBlock) continue;

  if (fix) {
    writeFileSync(join(root, page), `${html.slice(0, start + open.length)}\n${expectedBlock}\n${html.slice(end)}`);
    console.log(`sync-griffinjs: обновлён ${page}`);
    continue;
  }

  console.error(`sync-griffinjs: таблица наборов в ${page} разошлась со слоем`);
  console.error(`  ожидается:\n${expectedBlock}`);
  console.error(`  в файле:\n${actual}`);
  broken += 1;
}

if (broken > 0) {
  console.error('sync-griffinjs: запустите `npm run sync-griffinjs -- --fix`');
  process.exit(1);
}
