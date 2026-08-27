#!/usr/bin/env node
// Griffincss — сборка бандла griffincss-all.js.
//
// Бандл — конкатенация четырёх УЖЕ собранных рантаймов, а не пересборка:
// каждый файл — самодостаточный IIFE со слиянием в window.Griffincss,
// и порядок подключения не значим. Смысл склейки — один gzip-словарь
// на четверых вместо четырёх независимых: −15 % веса на проводе.
//
// Бандл — браузерный артефакт. Под Node его загружать нельзя: победил бы
// последний module.exports, и три рантайма из четырёх потерялись бы молча.
// Тесты гоняют четыре исходника, как и раньше.
//
// Строки `//# sourceMappingURL=…` вырезаются: в склейке они указывали бы
// на чужие карты. Преамбулы отдельных файлов остаются — это атрибуция.
//
// Свежесть бандла сторожит check-dist: он собирает ожидаемое содержимое
// этой же функцией и сравнивает байт-в-байт.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const BUNDLE = 'packages/core/dist/griffincss-all.js';

export const BUNDLE_PARTS = [
  'packages/core/dist/griffincss.js',
  'packages/core/dist/griffincss-theme.js',
  'packages/ui/dist/griffincss-ui.js',
  'packages/utils/dist/griffincss-utils.js',
];

const BANNER = '/*! Griffincss All | MIT | https://gitverse.ru/BarneyScott/GriffinCSS | '
  + 'griffincss.js + griffincss-theme.js + griffincss-ui.js + griffincss-utils.js */\n';

// Ожидаемое содержимое бандла из текущих dist-файлов.
export function bundleContent(base = root) {
  const parts = BUNDLE_PARTS.map((file) =>
    readFileSync(join(base, file), 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('//# sourceMappingURL='))
      .join('\n')
      .trimEnd(),
  );

  return BANNER + parts.join('\n') + '\n';
}

function main() {
  const content = bundleContent();

  writeFileSync(join(root, BUNDLE), content);
  console.log(`build-bundle: ${BUNDLE} собран из ${BUNDLE_PARTS.length} рантаймов, ${Buffer.byteLength(content)} Б`);
}

if (process.argv[1] && process.argv[1].endsWith('build-bundle.mjs')) {
  main();
}
