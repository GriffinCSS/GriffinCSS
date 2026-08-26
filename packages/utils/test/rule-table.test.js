'use strict';

// Таблица правил в рантайме и собранный CSS обязаны давать одно и то же
// значение для каждого класса. Разойдись они — рантайм начнёт выдавать
// правила, противоречащие статическому файлу.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtime = require('../src/griffincss-utils.js');

// Sass в сжатом режиме сохраняет пробел в значении кастомного свойства
// (--gr-p: 1rem): значение записывается как есть. Сверять объявления
// удобнее по варианту без пробела.
const css = fs
  .readFileSync(path.join(__dirname, '..', 'dist', 'griffincss-utils.css'), 'utf8')
  .replace(/--([\w-]+):\s+/g, '--$1:');

test('таблица правил не пуста', () => {
  assert.ok(Object.keys(runtime._rules).length > 0, 'sync-rule-table не отработал');
});

test('каждый класс шкалы радиусов совпадает с собранным CSS', () => {
  for (let i = 0; i <= 16; i++) {
    const value = runtime.classValue('gr-radius-' + i);

    assert.ok(value !== null, `gr-radius-${i} не разобран таблицей`);
    assert.ok(
      css.includes(`.gr-radius-${i}{--gr-r:${value};border-radius:${value}}`),
      `gr-radius-${i}: таблица говорит ${value}, в CSS этого нет`,
    );
  }
});

test('каждый класс равномерного отступа совпадает с собранным CSS', () => {
  for (const step of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16]) {
    const value = runtime.classValue('gr-p-' + step);

    assert.ok(value !== null, `gr-p-${step} не разобран таблицей`);
    assert.ok(
      css.includes(`.gr-p-${step}{--gr-p:${value};padding:var(--gr-p)}`),
      `gr-p-${step}: таблица говорит ${value}, в CSS этого нет`,
    );
  }
});

test('gr-radius-full берётся из литералов', () => {
  assert.equal(runtime.classValue('gr-radius-full'), '9999px');
});

test('убранные ступени таблица не разбирает', () => {
  for (const step of [9, 11, 13, 14, 15]) {
    assert.equal(runtime.classValue('gr-p-' + step), null, `ступень ${step} убрана из шкалы`);
  }
});

test('чужой класс не разбирается', () => {
  assert.equal(runtime.classValue('gr-flex'), null);
  assert.equal(runtime.classValue('btn-primary'), null);
});
