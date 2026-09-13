#!/usr/bin/env node
// Griffincss — сверка происхождения dist/*.js (Этап 41).
//
// Правило проекта «dist/*.js — артефакт src/, руками не трогаем» до этого
// этапа ничем не проверялось: check-dist смотрит вес и шапку, а не
// происхождение. Здесь каждый рантайм пакетов и каждый файл слоя
// минифицируется из src в памяти ТЕМИ ЖЕ функциями, что у сборки
// (build-js.mjs, build-griffinjs.mjs; флаги — terser-options.mjs),
// и сравнивается с dist побайтово. Расхождение — красный выход с именем
// файла и подсказкой npm run build: это проверка, а не сборка, и молча
// пересобирать она не должна.
//
// Ловит забытую пересборку и правку dist руками. Не ловит и не должна
// ловить чужую версию terser: сверка идёт тем же terser из lock, что
// и сборка, — версия зафиксирована точно, и обновление минификатора —
// сознательный коммит с пересборкой.
//
// Живёт отдельно от check-dist, а не внутри: минификация всего дерева
// стоит около двух секунд, check-dist запускается трижды за npm test
// и остаётся без зависимостей.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { RUNTIMES, minifyRuntime } from './build-js.mjs';
import { bundles, minifyBundle } from './build-griffinjs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const problems = [];
let checked = 0;

function compare(file, expected, source) {
  let actual;

  try {
    actual = readFileSync(join(root, file), 'utf8');
  } catch {
    problems.push(`${file}: не собран — npm run build`);
    return;
  }

  if (actual !== expected) {
    problems.push(`${file}: не совпадает с минификацией ${source} — dist правится только сборкой: npm run build`);
  }

  checked += 1;
}

// Рантаймы пакетов: список и функция — те же, что у build:js.
for (const [pkg, file] of RUNTIMES) {
  const { code } = await minifyRuntime(join(root, 'packages', pkg), file);

  compare(`packages/${pkg}/dist/${file}`, code, `packages/${pkg}/src/${file}`);
}

// Слой GriffinJS: полный файл, ядро, поля, таблица стран и каждый модуль —
// список и функция те же, что у build-griffinjs.
for (const [name, parts] of bundles()) {
  const { code } = await minifyBundle(parts, name);
  const source = parts.length === 1 ? `packages/ui/src/griffinjs/${parts[0]}` : `${parts.length} файлов packages/ui/src/griffinjs/`;

  compare(`packages/ui/dist/${name}.js`, code, source);
}

if (problems.length > 0) {
  console.error('check-origin: dist разошёлся с src\n');
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  console.error(`\ncheck-origin: расхождений — ${problems.length}`);
  process.exit(1);
}

console.log(`check-origin: dist собран из src — сверено файлов: ${checked}`);
