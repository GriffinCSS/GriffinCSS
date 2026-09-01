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

import { CORE, ENGINES, SHARED, WIDGETS } from './build-griffinjs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/ui/src/griffinjs');
const dist = join(root, 'packages/ui/dist');

const PAGE = 'docs/griffinjs.html';
const OPEN = '<!-- gr:griffinjs-deps -->';
const CLOSE = '<!-- /gr:griffinjs-deps -->';

const fix = process.argv.includes('--fix');

function die(message) {
  console.error(`sync-griffinjs: ${message}`);
  process.exit(1);
}

const name = (rel) => basename(rel, '.js');
const fileOf = {};

for (const rel of [...CORE, ...SHARED, ...ENGINES, ...WIDGETS]) fileOf[name(rel)] = rel;

// Объявления читаются у самого рантайма: слой поднимается в Node без DOM —
// модули только регистрируются, фабрики не исполняются.
const require = createRequire(import.meta.url);
const G = require(join(src, 'core/griffinjs-core.js'));

for (const rel of [...CORE.slice(1), ...SHARED, ...ENGINES, ...WIDGETS]) require(join(src, rel));

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
const ORDER = [...SHARED, ...ENGINES, ...WIDGETS].map(name);
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

const html = readFileSync(join(root, PAGE), 'utf8');
const start = html.indexOf(OPEN);
const end = html.indexOf(CLOSE);

if (start === -1 || end === -1) die(`в ${PAGE} нет маркеров ${OPEN} … ${CLOSE}`);

const actual = html.slice(start + OPEN.length, end).replace(/^\n|\n\s*$/g, '');

if (actual === expected) process.exit(0);

if (fix) {
  writeFileSync(join(root, PAGE), `${html.slice(0, start + OPEN.length)}\n${expected}\n${html.slice(end)}`);
  console.log(`sync-griffinjs: обновлён ${PAGE}`);
  process.exit(0);
}

console.error(`sync-griffinjs: таблица наборов в ${PAGE} разошлась со слоем`);
console.error(`  ожидается:\n${expected}`);
console.error(`  в файле:\n${actual}`);
console.error('sync-griffinjs: запустите `npm run sync-griffinjs -- --fix`');
process.exit(1);
