#!/usr/bin/env node
// Griffincss — цифры весов в документации сверяются с собранным деревом.
//
// До Этапа 27 вес в README и на страницах доксайта был текстом, который
// автор правил по памяти: check-dist сверял версию в 22 местах и ни одного
// размера. Расхождение накопилось трижды подряд.
//
// Приём тот же, что у sync-breakpoints и sync-griffinjs: значение живёт
// между маркерами, скрипт без ключа сверяет и падает на расхождении,
// с --fix переписывает. Идёт ПОСЛЕ сборки: вес считается по dist.
//
//   <!--gr:size:ui-->10,5 КБ<!--/gr:size:ui-->     — вес с единицами
//   <!--gr:size:ui:n-->10,5<!--/gr:size:ui:n-->    — только число
//
// Имена артефактов объявлены в scripts/sizes.mjs — там же, откуда берёт
// вес check-dist. Второй счёт разошёлся бы с первым.
//
// Список артефактов на каждой странице задан в SITES и проверяется:
// пропавший маркер — падение, а не тихий пропуск. Иначе достаточно было бы
// переписать абзац вместе с комментарием, чтобы цифра снова замерла.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { bytes, kb, num } from './sizes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SITES = [
  {
    file: 'README.md',
    ids: [
      'core', 'js-pkg-core', 'ui', 'js-ui', 'griffinjs', 'griffinjs-fields-set', 'utils', 'js-utils',
      'css-all', 'css-ui-stack', 'js-all',
    ],
  },
  { file: 'docs/index.html', ids: ['js-all'] },
  { file: 'docs/runtime.html', ids: ['js-core-raw', 'js-core', 'js-all', 'bundle', 'js-pkg-core'] },
  {
    file: 'docs/griffinjs-architecture.html',
    ids: [
      'griffinjs-core',
      'griffinjs-track:n', 'griffinjs-motion:n', 'griffinjs-gesture:n', 'griffinjs-media:n', 'griffinjs-anchor:n',
      'griffinjs-loader:n',
      'griffinjs-scroll:n', 'griffinjs-fade:n',
      'griffinjs-slider:n', 'griffinjs-gallery:n', 'griffinjs-lightbox:n', 'griffinjs-parallax:n',
      'griffinjs-megamenu:n', 'griffinjs-dropdown:n', 'griffinjs-tooltip:n',
      'griffinjs-dialog:n', 'griffinjs-combobox:n', 'griffinjs-range:n', 'griffinjs-sortable:n',
      'griffinjs', 'griffinjs-core:n', 'griffinjs-slider-set:n',
      'griffinjs-mask:n', 'griffinjs-phone:n', 'griffinjs-datetime:n', 'griffinjs-file:n', 'griffinjs-number:n',
      'griffinjs-rating:n', 'griffinjs-otp:n', 'griffinjs-counter:n', 'griffinjs-validate:n',
      'griffinjs-fields', 'griffinjs-fields-set:n', 'griffinjs-countries:n',
    ],
  },
  { file: 'docs/ui-forms.html', ids: ['griffinjs-range-set', 'griffinjs-fields-set'] },
  {
    file: 'docs/griffinjs-fields.html',
    ids: ['griffinjs-fields-set', 'griffinjs-fields', 'griffinjs-fields-css', 'griffinjs-countries'],
  },
  { file: 'docs/ui-tables.html', ids: ['griffinjs-sortable-set'] },
  { file: 'docs/ui-overlays.html', ids: ['js-ui'] },
  { file: 'docs/ui-disclosure.html', ids: ['core'] },
];

const fix = process.argv.includes('--fix');

// Допуск сверки, байты. Один и тот же dist жмётся разными zlib по-разному:
// официальный Node 22/24 (zlib 1.3.1, как на CI) и Homebrew-Node на macOS
// (системный zlib 1.2.12) разошлись на полях на 37 Б (Этап 41), и одного
// байта на границе округления хватает, чтобы цифра в тексте сменилась.
// Эталон в доках — с официального Node; сверка без ключа на другом zlib
// проходит, если записанное число могло получиться из замера в пределах
// допуска. Допуск меньше шага записи (0,1 КБ = 102 Б): настоящий рост
// он не прячет, а потолки check-dist допуска не получают вовсе.
// --fix допуска не знает и пишет точный замер (Этап 42b).
export const TOLERANCE = 50;

// Ключ маркера — имя артефакта; суффикс :n просит число без единиц
// (в таблице, где единица уже стоит в заголовке столбца).
const format = (key, weight) => (key.endsWith(':n') ? num(weight) : kb(weight));
const artifact = (key) => (key.endsWith(':n') ? key.slice(0, -2) : key);
const parse = (text) => parseFloat(text.replace(',', '.'));

// Записанное значение принимается, если его дал бы замер в пределах
// допуска: kb() монотонна, поэтому достаточно двух краёв.
const within = (key, actual, weight) => parse(actual) >= parse(format(key, weight - TOLERANCE))
  && parse(actual) <= parse(format(key, weight + TOLERANCE));

/**
 * Сверяет и переписывает значения между маркерами.
 * Возвращает текст с подставленным замером и список расхождений.
 * measure — замер артефакта в байтах; подменяется в тестах.
 */
export function sync(text, keys, measure = bytes) {
  const problems = [];
  let out = text;

  for (const key of keys) {
    const open = `<!--gr:size:${key}-->`;
    const close = `<!--/gr:size:${key}-->`;
    const weight = measure(artifact(key));
    const expected = format(key, weight);

    let done = '';
    let rest = out;
    let found = 0;

    for (;;) {
      const start = rest.indexOf(open);

      if (start === -1) break;

      const end = rest.indexOf(close, start + open.length);

      if (end === -1) {
        problems.push(`${key}: открывающий маркер без закрывающего`);
        break;
      }

      const actual = rest.slice(start + open.length, end);

      if (!within(key, actual, weight)) problems.push(`${key}: в тексте «${actual}», замер даёт «${expected}»`);

      done += rest.slice(0, start + open.length) + expected;
      rest = rest.slice(end);
      found += 1;
    }

    if (found === 0) problems.push(`${key}: маркер ${open} … ${close} не найден`);

    out = done + rest;
  }

  return { text: out, problems };
}

// --- запуск -----------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('sync-sizes.mjs')) {
  let broken = 0;

  for (const site of SITES) {
    const path = join(root, site.file);
    const before = readFileSync(path, 'utf8');
    const { text, problems } = sync(before, site.ids);

    if (problems.length === 0) continue;

    if (fix) {
      if (text !== before) writeFileSync(path, text);
      console.log(`sync-sizes: обновлён ${site.file}`);
    }

    for (const problem of problems) {
      // Пропавший маркер не чинится подстановкой: место, куда писать,
      // знал только автор страницы.
      if (fix && !problem.includes('маркер')) continue;

      console.error(`sync-sizes: ${site.file} — ${problem}`);
      broken += 1;
    }
  }

  if (broken > 0) {
    if (!fix) console.error('sync-sizes: запустите `npm run sync-sizes -- --fix`');
    process.exit(1);
  }
}
