#!/usr/bin/env node
// Griffincss — единственный счёт весов собранных артефактов.
//
// До Этапа 27 вес считали в двух местах: check-dist по dist, документация —
// по памяти автора. Второй счёт разошёлся с первым трижды подряд, и иначе
// быть не могло: сверялась версия в 22 местах и ни один размер. Здесь счёт
// один, им пользуются и check-dist, и sync-sizes.
//
// Формат числа выбран один на весь проект: 10,5 КБ — запятая как в русском
// тексте, КБ = 1024 Б, округление до 0,1. Байты остаются в сообщениях
// о превышении бюджета: потолок сверяется точно, текст — округлённо.
//
// Ноль зависимостей.

import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

import { ENGINES, SHARED, WIDGETS } from './build-griffinjs.mjs';
import { BUNDLE } from './build-bundle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CORE_CSS = 'packages/core/dist/griffincss-core.css';
const RESET_CSS = 'packages/core/dist/griffincss-reset.css';
const UI_CSS = 'packages/ui/dist/griffincss-ui.css';
const UTILS_CSS = 'packages/utils/dist/griffincss-utils.css';
const GRIFFINJS_CSS = 'packages/ui/dist/griffinjs.css';

const JS_CORE = 'packages/core/dist/griffincss.js';
const JS_THEME = 'packages/core/dist/griffincss-theme.js';
const JS_UI = 'packages/ui/dist/griffincss-ui.js';
const JS_UTILS = 'packages/utils/dist/griffincss-utils.js';

const GRIFFINJS = 'packages/ui/dist/griffinjs.js';
const layerFile = (module) => `packages/ui/dist/griffinjs-${module}.js`;

// Модули слоя виджетов: список берётся у сборки, а не переписывается сюда.
// Ядро склеено из нескольких исходников в один файл и потому названо прямо.
const LAYER_MODULES = ['core', ...[...SHARED, ...ENGINES, ...WIDGETS].map((rel) => basename(rel, '.js'))];

// Минимальный набор для слайдера: меряется как ОДИН файл — так же, как
// полный griffinjs.js. Сумма независимых gzip платила бы за пять словарей
// вместо одного и измеряла бы нарезку, а не код.
const SLIDER_SET = ['core', 'motion', 'track', 'scroll', 'slider'].map(layerFile);
// Набор ползунка: самый дешёвый из наборов — ядро и один виджет.
const RANGE_SET = ['core', 'range'].map(layerFile);
// Набор сортируемой таблицы: тоже ядро и один виджет — зависимостей у неё нет.
const SORTABLE_SET = ['core', 'sortable'].map(layerFile);

// Описание артефакта — ровно один из трёх способов посчитать:
//   gzip — gzip склейки перечисленных файлов (один файл — обычный случай);
//   raw  — длина файла как есть;
//   sum  — сумма весов других артефактов (независимые файлы, каждый со своим
//          словарём: так их и отдают читателю страницы).
export const ARTIFACTS = {
  // CSS, gzip
  core: { gzip: [CORE_CSS] },
  reset: { gzip: [RESET_CSS] },
  ui: { gzip: [UI_CSS] },
  utils: { gzip: [UTILS_CSS] },
  'griffinjs-css': { gzip: [GRIFFINJS_CSS] },

  // Стек CSS: файлы отдаются по отдельности, каждый со своим словарём,
  // поэтому и складываются веса, а не содержимое. Нужны README и разделу
  // о сравнении: цифра, которую называет текст, обязана приходить
  // из замера, как и все остальные.
  'css-ui-stack': { sum: ['reset', 'core', 'ui'] },
  'css-all': { sum: ['reset', 'core', 'ui', 'utils'] },

  // CSS, как есть
  'core-raw': { raw: CORE_CSS },
  'reset-raw': { raw: RESET_CSS },
  'ui-raw': { raw: UI_CSS },
  'utils-raw': { raw: UTILS_CSS },

  // Рантаймы, gzip
  'js-core': { gzip: [JS_CORE] },
  'js-theme': { gzip: [JS_THEME] },
  'js-ui': { gzip: [JS_UI] },
  'js-utils': { gzip: [JS_UTILS] },
  'js-core-raw': { raw: JS_CORE },
  // Пакет core отдаёт два рантайма: парсер раскладок и переключатель темы.
  'js-pkg-core': { sum: ['js-core', 'js-theme'] },
  'js-all': { sum: ['js-core', 'js-theme', 'js-ui', 'js-utils'] },
  bundle: { gzip: [BUNDLE] },

  // Слой виджетов
  griffinjs: { gzip: [GRIFFINJS] },
  'griffinjs-slider-set': { gzip: SLIDER_SET },
  'griffinjs-range-set': { gzip: RANGE_SET },
  'griffinjs-sortable-set': { gzip: SORTABLE_SET },
  ...Object.fromEntries(LAYER_MODULES.map((module) => [`griffinjs-${module}`, { gzip: [layerFile(module)] }])),
};

export const gzipOf = (file) => gzipSync(readFileSync(join(root, file)), { level: 9 }).length;
export const rawOf = (file) => statSync(join(root, file)).size;

const cache = new Map();

/** Вес артефакта в байтах. Считается по требованию и запоминается. */
export function bytes(id) {
  if (cache.has(id)) return cache.get(id);

  const artifact = ARTIFACTS[id];

  if (!artifact) throw new Error(`sizes: неизвестный артефакт «${id}»`);

  const weight = artifact.raw
    ? rawOf(artifact.raw)
    : artifact.sum
      ? artifact.sum.reduce((total, part) => total + bytes(part), 0)
      : gzipSync(Buffer.concat(artifact.gzip.map((file) => readFileSync(join(root, file)))), { level: 9 }).length;

  cache.set(id, weight);

  return weight;
}

/** 10 802 → «10,5». */
export const num = (weight) => (weight / 1024).toFixed(1).replace('.', ',');

/** 10 802 → «10,5 КБ». */
export const kb = (weight) => `${num(weight)} КБ`;
