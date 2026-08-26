#!/usr/bin/env node
// Griffincss — сверка таблицы правил утилит с SCSS-картами.
// Единственный источник значений — сами карты: шкалы радиусов и отступов
// живут в SCSS, а рантайм утилит обязан разбирать классы ровно в те же
// значения, что попали в собранный CSS. Двух источников быть не должно.
// Запуск с --fix переписывает блок между маркерами gr:rule-table.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RADIUS = 'packages/utils/scss/_border-radius.scss';
const SPACING = 'packages/utils/scss/_spacing.scss';
const RUNTIME = 'packages/utils/src/griffincss-utils.js';

const OPEN = '/* gr:rule-table */';
const CLOSE = '/* /gr:rule-table */';

const fix = process.argv.includes('--fix');

function die(message) {
  console.error(`sync-rule-table: ${message}`);
  process.exit(1);
}

const read = (file) => readFileSync(join(root, file), 'utf8');

// Комментарии выкусываются целиком: в них попадаются примеры объявлений,
// и без этого скрипт прочитал бы значение из примера, а не из карты.
const source = (file) => read(file).replace(/^\s*\/\/.*$/gm, '');

// `$gr-radius-base: 0.25rem;` → { base: 0.25, unit: 'rem' }
function readLength(scss, name, file) {
  const match = scss.match(new RegExp(`^\\$${name}:\\s*(-?[\\d.]+)([a-z%]*)`, 'm'));

  if (!match) die(`переменная $${name} не найдена в ${file}`);

  const base = Number(match[1]);

  if (!Number.isFinite(base)) die(`$${name} в ${file} — не число: ${match[1]}`);
  if (!match[2]) die(`$${name} в ${file} без единицы: ${match[1]}`);

  return { base, unit: match[2] };
}

function readNumber(scss, name, file) {
  const match = scss.match(new RegExp(`^\\$${name}:\\s*(-?\\d+)`, 'm'));

  if (!match) die(`переменная $${name} не найдена в ${file}`);

  return Number(match[1]);
}

// `$gr-spacing-steps: (0, 1, 2, …)` → [0, 1, 2, …]
function readSteps(scss, name, file) {
  const match = scss.match(new RegExp(`^\\$${name}:\\s*\\(([^)]*)\\)`, 'm'));

  if (!match) die(`карта $${name} не найдена в ${file}`);

  const steps = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);

  if (steps.length === 0) die(`карта $${name} в ${file} пуста`);
  if (steps.some((step) => !Number.isFinite(step))) die(`карта $${name} в ${file} содержит не число`);

  return steps;
}

// Литеральная ступень вне шкалы: `.gr-radius-full { --gr-r: 9999px; … }`
function readLiteral(scss, selector, prop, file) {
  const match = scss.match(new RegExp(`\\.${selector}\\s*\\{[^}]*${prop}:\\s*([^;\\n]+)`));

  if (!match) die(`правило .${selector} с ${prop} не найдено в ${file}`);

  return match[1].trim();
}

const radiusScss = source(RADIUS);
const spacingScss = source(SPACING);

const radius = readLength(radiusScss, 'gr-radius-base', RADIUS);
const radiusMax = readNumber(radiusScss, 'gr-radius-max', RADIUS);
const spacing = readLength(spacingScss, 'gr-spacing-base', SPACING);
const spacingSteps = readSteps(spacingScss, 'gr-spacing-steps', SPACING);

if (radiusMax < 0) die(`$gr-radius-max в ${RADIUS} отрицателен: ${radiusMax}`);

const radiusSteps = [];
for (let i = 0; i <= radiusMax; i++) radiusSteps.push(i);

const rules = [
  [
    'gr-radius-',
    {
      base: radius.base,
      unit: radius.unit,
      steps: radiusSteps,
      literal: { full: readLiteral(radiusScss, 'gr-radius-full', '--gr-r', RADIUS) },
    },
  ],
  ['gr-p-', { base: spacing.base, unit: spacing.unit, steps: spacingSteps }],
];

// От длинного префикса к короткому: разбор идёт по первому совпадению,
// и короткий префикс не должен перехватывать класс длинного.
rules.sort(([a], [b]) => b.length - a.length);

const line = ([prefix, rule]) => {
  const parts = [
    `base: ${rule.base}`,
    `unit: '${rule.unit}'`,
    `steps: [${rule.steps.join(',')}]`,
  ];

  if (rule.literal) {
    const literal = Object.keys(rule.literal)
      .map((name) => `${name}: '${rule.literal[name]}'`)
      .join(', ');

    parts.push(`literal: { ${literal} }`);
  }

  return `    '${prefix}': { ${parts.join(', ')} }`;
};

const expected = rules.map(line).join(',\n');

const runtime = read(RUNTIME);
const start = runtime.indexOf(OPEN);
const end = runtime.indexOf(CLOSE);

if (start === -1 || end === -1) die(`в ${RUNTIME} нет маркеров ${OPEN} … ${CLOSE}`);

const actual = runtime.slice(start + OPEN.length, end).replace(/^\n|\n\s*$/g, '');

if (actual === expected) process.exit(0);

if (fix) {
  const patched = runtime.slice(0, start + OPEN.length) + '\n' + expected + '\n    ' + runtime.slice(end);
  writeFileSync(join(root, RUNTIME), patched);
  console.log(`sync-rule-table: обновлён ${RUNTIME}`);
  process.exit(0);
}

console.error(`sync-rule-table: таблица правил в ${RUNTIME} разошлась с картами SCSS`);
console.error('  ожидается:\n' + expected);
console.error('  в файле:\n' + actual);
console.error('sync-rule-table: запустите `npm run sync-rule-table -- --fix`');
process.exit(1);
