#!/usr/bin/env node
// Griffincss — сверка фолбэков брейкпоинтов в JS-рантайме.
// Единственный источник значений — packages/core/scss/_breakpoints.scss.
// Рантайм в браузере читает --gr-bp-*, но при неподключённом CSS падает
// на фолбэки, и они обязаны совпадать с картой.
// Запуск с --fix переписывает блок между маркерами gr:breakpoints.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAP = 'packages/core/scss/_breakpoints.scss';
const RUNTIME = 'packages/core/src/griffincss.js';

const OPEN = '/* gr:breakpoints */';
const CLOSE = '/* /gr:breakpoints */';

const fix = process.argv.includes('--fix');

function readBreakpoints(scss) {
  // Объявление карты — только с начала строки: в комментариях файла
  // есть примеры вызова @use ... with ($gr-breakpoints: (...)).
  const map = scss.replace(/^\s*\/\/.*$/gm, '').match(/^\$gr-breakpoints:\s*\(([^)]*)\)/m);
  if (!map) throw new Error(`sync-breakpoints: карта $gr-breakpoints не найдена в ${MAP}`);

  return [...map[1].matchAll(/([\w-]+)\s*:\s*([^,\n]+)/g)].map(([, name, value]) => [
    name,
    value.trim(),
  ]);
}

const breakpoints = readBreakpoints(readFileSync(join(root, MAP), 'utf8'));

if (breakpoints.length === 0) {
  console.error(`sync-breakpoints: в ${MAP} нет ни одного брейкпоинта`);
  process.exit(1);
}

// Имя вроде `2xl` — не идентификатор JS, такой ключ обязан быть в кавычках.
const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`);

const expected = breakpoints
  .map(([name, value], index) => `    ${key(name)}: '${value}'${index === breakpoints.length - 1 ? '' : ','}`)
  .join('\n');

const runtime = readFileSync(join(root, RUNTIME), 'utf8');
const start = runtime.indexOf(OPEN);
const end = runtime.indexOf(CLOSE);

if (start === -1 || end === -1) {
  console.error(`sync-breakpoints: в ${RUNTIME} нет маркеров ${OPEN} … ${CLOSE}`);
  process.exit(1);
}

const actual = runtime.slice(start + OPEN.length, end).replace(/^\n|\n\s*$/g, '');

if (actual === expected) process.exit(0);

if (fix) {
  const patched = runtime.slice(0, start + OPEN.length) + '\n' + expected + '\n    ' + runtime.slice(end);
  writeFileSync(join(root, RUNTIME), patched);
  console.log(`sync-breakpoints: обновлён ${RUNTIME}`);
  process.exit(0);
}

console.error(`sync-breakpoints: фолбэки в ${RUNTIME} разошлись с ${MAP}`);
console.error('  ожидается:\n' + expected);
console.error('  в файле:\n' + actual);
console.error('sync-breakpoints: запустите `npm run sync-breakpoints -- --fix`');
process.exit(1);
