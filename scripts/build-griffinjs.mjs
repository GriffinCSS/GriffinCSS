#!/usr/bin/env node
// Griffincss — сборка слоя GriffinJS (Этап 21).
//
// Исходники слоя — самодостаточные IIFE в ES2020 без модулей, в
// packages/ui/src/griffinjs/. Бандлера нет намеренно: файлы склеиваются
// в порядке списка ниже, как build-theme-js.js в OcapiCMS, и уходят
// в terser с теми же флагами, что у остальных рантаймов (Этап 19).
//
// На выходе, всё в packages/ui/dist/:
//   griffinjs.js          — слой целиком: ядро + движки + виджеты;
//   griffinjs-core.js     — только ядро (для сборки «ядро + нужные модули»);
//   griffinjs-anchor.js   — позиционирование у якоря: общая часть dropdown
//                           и tooltip, вне ядра ради его бюджета;
//   griffinjs-<модуль>.js — каждый движок и виджет отдельно;
//   griffinjs.css         — стили слоя из packages/ui/scss/griffinjs/.
//
// Скрипт живёт только в Dev до фазы 21h: в список разрешённого
// release-public.mjs он не входит, а команда build:griffinjs снимается
// из package.json пакета ui при сборке публичного дерева.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { minify } from 'terser';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/ui/src/griffinjs');
const scss = join(root, 'packages/ui/scss/griffinjs');
const dist = join(root, 'packages/ui/dist');

// Порядок склейки. Ядро всегда первое: модули регистрируются
// в window.GriffinJS и без него упадут на первой строке.
export const CORE = [
  'core/griffinjs-core.js',
  'core/options.js',
  'core/registry.js',
  'core/scanner.js',
];
export const ENGINES = ['engines/scroll.js', 'engines/fade.js'];
// Общие части вне ядра (Этап 22): подключаются перед виджетами, которым
// нужны, а нужны они меньшинству — track трём виджетам из одиннадцати,
// motion двум, gesture одному движку, media одному виджету. В ядре
// остаётся то, без чего не обходится ни один виджет. Порядок — от лёгкого
// к тяжёлому; загрузка их не требует, все обращения лежат внутри фабрик.
export const SHARED = ['core/anchor.js', 'core/media.js', 'core/motion.js', 'core/gesture.js', 'core/track.js'];
export const WIDGETS = [
  'widgets/slider.js', 'widgets/gallery.js', 'widgets/lightbox.js', 'widgets/parallax.js',
  'widgets/megamenu.js', 'widgets/dropdown.js', 'widgets/tooltip.js',
  'widgets/dialog.js', 'widgets/combobox.js', 'widgets/range.js', 'widgets/sortable.js',
];

const PREAMBLE = '/*! GriffinJS | MIT | https://gitverse.ru/BarneyScott/GriffinCSS */';

const read = (rel) => readFileSync(join(src, rel), 'utf8');

async function pack(parts, out) {
  const code = parts.map(read).join('\n');
  const file = `${out}.js`;
  const result = await minify(code, {
    ecma: 2020,
    compress: { passes: 3, ecma: 2020, unsafe_arrows: true },
    mangle: true,
    format: { comments: false, preamble: PREAMBLE },
    sourceMap: { url: `${file}.map`, filename: file },
  });

  writeFileSync(join(dist, file), result.code);
  writeFileSync(join(dist, `${file}.map`), result.map);

  return Buffer.byteLength(result.code);
}

// Имя модуля — имя файла без расширения: engines/scroll.js → griffinjs-scroll.js.
const moduleName = (rel) => basename(rel, '.js');

async function main() {
  mkdirSync(dist, { recursive: true });

  const sizes = [];

  sizes.push(['griffinjs', await pack([...CORE, ...ENGINES, ...SHARED, ...WIDGETS], 'griffinjs')]);
  sizes.push(['griffinjs-core', await pack(CORE, 'griffinjs-core')]);

  for (const rel of [...ENGINES, ...SHARED, ...WIDGETS]) {
    const name = `griffinjs-${moduleName(rel)}`;

    sizes.push([name, await pack([rel], name)]);
  }

  // Стили — тем же sass и с теми же флагами, что у griffincss-ui.css.
  execFileSync('npx', [
    'sass', join(scss, 'griffinjs.scss'), join(dist, 'griffinjs.css'),
    '--load-path=' + join(root, 'node_modules'), '--style=compressed', '--no-source-map',
  ], { cwd: root, stdio: 'inherit' });

  // Пустой вывод при успехе — как у остальной сборки. Размеры печатает
  // check-dist, здесь они нужны только при явном запросе.
  if (process.argv.includes('--verbose')) {
    for (const [name, bytes] of sizes) console.log(`build-griffinjs: ${name}.js ${bytes} Б`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-griffinjs.mjs')) {
  await main();
}
