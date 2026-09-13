#!/usr/bin/env node
// Griffincss — сборка рантаймов пакета: src/<файл>.js → dist/<файл>.js
// и карта кода рядом (Этап 41).
//
// Заменяет строки build:js с terser-CLI в package.json пакетов: флаги
// читаются из terser-options.mjs — оттуда же, откуда их берёт сверка
// происхождения dist (check-origin.mjs). Запускается из каталога пакета,
// как остальные команды build:* — `npm run build --workspace griffincss-core`:
//
//   node ../../scripts/build-js.mjs
//
// Какие файлы у какого пакета — в RUNTIMES ниже; сверка обходит тот же
// список и зовёт ту же функцию minifyRuntime, что и сборка.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { minify } from 'terser';

import { terserOptions } from './terser-options.mjs';

// [каталог пакета, файл рантайма] — один и тот же путь в src/ и в dist/.
export const RUNTIMES = [
  ['core', 'griffincss.js'],
  ['core', 'griffincss-theme.js'],
  ['ui', 'griffincss-ui.js'],
  ['utils', 'griffincss-utils.js'],
];

/**
 * Минификация одного рантайма в памяти: pkg — путь к каталогу пакета.
 * Возвращает { code, map } — ровно то, что ложится в dist.
 *
 * Исходник передаётся под именем src/<файл>: так его называл terser-CLI,
 * и это имя уезжает в sources карты.
 */
export async function minifyRuntime(pkg, file) {
  const source = `src/${file}`;

  return minify({ [source]: readFileSync(join(pkg, source), 'utf8') }, terserOptions(file));
}

async function main() {
  const pkg = process.cwd();
  const files = RUNTIMES.filter(([dir]) => dir === basename(pkg)).map(([, file]) => file);

  if (files.length === 0) {
    console.error(`build-js: в каталоге ${basename(pkg)} рантаймов нет — запускается из packages/core, packages/ui или packages/utils`);
    process.exit(1);
  }

  mkdirSync(join(pkg, 'dist'), { recursive: true });

  for (const file of files) {
    const result = await minifyRuntime(pkg, file);

    writeFileSync(join(pkg, 'dist', file), result.code);
    writeFileSync(join(pkg, 'dist', `${file}.map`), result.map);
  }
}

// Пустой вывод при успехе — как у остальной сборки.
if (process.argv[1] && process.argv[1].endsWith('build-js.mjs')) {
  await main();
}
