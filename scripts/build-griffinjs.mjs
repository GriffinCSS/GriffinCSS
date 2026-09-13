#!/usr/bin/env node
// Griffincss — сборка слоя GriffinJS (Этап 21).
//
// Исходники слоя — самодостаточные IIFE в ES2020 без модулей, в
// packages/ui/src/griffinjs/. Бандлера нет намеренно: файлы склеиваются
// в порядке списка ниже, как build-theme-js.js в OcapiCMS, и уходят
// в terser с теми же флагами, что у остальных рантаймов (Этап 19) —
// флаги читаются из terser-options.mjs, их же читает сверка происхождения
// dist (check-origin.mjs, Этап 41).
//
// На выходе, всё в packages/ui/dist/:
//   griffinjs.js          — слой целиком: ядро + движки + виджеты;
//   griffinjs-core.js     — только ядро (для сборки «ядро + нужные модули»);
//   griffinjs-anchor.js   — позиционирование у якоря: общая часть dropdown
//                           и tooltip, вне ядра ради его бюджета;
//   griffinjs-<модуль>.js — каждый движок и виджет отдельно;
//   griffinjs.css         — стили слоя из packages/ui/scss/griffinjs/.
//
// Второй бандл (Этап 38) — расширенные поля форм:
//   griffinjs-fields.js   — все поля одним файлом, БЕЗ ядра: ядро пишет
//                           window.GriffinJS без проверки, и второе ядро
//                           на странице затёрло бы первое. Подключается
//                           после griffinjs.js или griffinjs-core.js;
//   griffinjs-<поле>.js   — каждое поле отдельно;
//   griffinjs-countries.js — таблица стран для поля телефона: данные
//                           отдельно от механизма, подключаются по желанию;
//   griffinjs-fields.css  — стили полей из packages/ui/scss/griffinjs/fields/.
// В griffinjs.js поля не входят ни одним байтом: за них платит только тот,
// кто их подключил.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { minify } from 'terser';

import { terserOptions } from './terser-options.mjs';

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
// Поля форм — второй бандл (Этап 38). Порядок значим: маска — фундамент,
// на ней стоят телефон, дата и одноразовый код, поэтому она идёт первой.
export const FIELDS = [
  'fields/mask.js',
  'fields/phone.js',
  'fields/datetime.js',
  'fields/file.js',
  'fields/rating.js',
  'fields/otp.js',
  'fields/counter.js',
  'fields/validate.js',
];
// Таблица стран — данные, а не виджет: ISO2, код, маска. В бандл полей
// не входит и лежит своим файлом со своим потолком: набор со своим темпом
// обновления библиотека не сопровождает вместе с кодом.
export const COUNTRIES = 'fields/countries.js';

const read = (rel) => readFileSync(join(src, rel), 'utf8');

// Имя модуля — имя файла без расширения: engines/scroll.js → griffinjs-scroll.js.
const moduleName = (rel) => basename(rel, '.js');

// Что собирается: [имя файла в dist без расширения, части в порядке склейки].
// Список один — его же обходит сверка происхождения dist.
export function bundles() {
  const list = [
    ['griffinjs', [...CORE, ...ENGINES, ...SHARED, ...WIDGETS]],
    ['griffinjs-core', CORE],
    // Поля — тем же способом, что виджеты, но в свой файл: полный griffinjs.js
    // их не содержит, и его вес от этого списка не зависит.
    ['griffinjs-fields', FIELDS],
    ['griffinjs-countries', [COUNTRIES]],
  ];

  for (const rel of [...ENGINES, ...SHARED, ...WIDGETS, ...FIELDS]) list.push([`griffinjs-${moduleName(rel)}`, [rel]]);

  return list;
}

/** Минификация одного файла слоя в памяти: { code, map } — то, что ложится в dist. */
export async function minifyBundle(parts, out) {
  const file = `${out}.js`;

  return minify(parts.map(read).join('\n'), terserOptions(file, { filename: file }));
}

async function pack(parts, out) {
  const result = await minifyBundle(parts, out);

  writeFileSync(join(dist, `${out}.js`), result.code);
  writeFileSync(join(dist, `${out}.js.map`), result.map);

  return Buffer.byteLength(result.code);
}

async function main() {
  mkdirSync(dist, { recursive: true });

  const sizes = [];

  for (const [name, parts] of bundles()) sizes.push([name, await pack(parts, name)]);

  // Стили — тем же sass и с теми же флагами, что у griffincss-ui.css.
  // Стили полей — отдельным файлом по той же причине, что и скрипт.
  for (const [entry, out] of [['griffinjs.scss', 'griffinjs.css'], ['fields/fields.scss', 'griffinjs-fields.css']]) {
    execFileSync('npx', [
      'sass', join(scss, entry), join(dist, out),
      '--load-path=' + join(root, 'node_modules'), '--style=compressed', '--no-source-map',
    ], { cwd: root, stdio: 'inherit' });
  }

  // Пустой вывод при успехе — как у остальной сборки. Размеры печатает
  // check-dist, здесь они нужны только при явном запросе.
  if (process.argv.includes('--verbose')) {
    for (const [name, bytes] of sizes) console.log(`build-griffinjs: ${name}.js ${bytes} Б`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-griffinjs.mjs')) {
  await main();
}
