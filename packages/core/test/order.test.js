'use strict';

// Порядок во флексе и сетке: .gr-order-first / -last / -none с оконными
// суффиксами. «На телефоне картинка сверху у всех рядов, на десктопе сбоку
// попеременно» порядком разметки не собрать — нужен order у одного ребёнка;
// у темы griffin два правила того же рода (поиск в шапке и левая колонка
// уходят в конец ниже порога). Работает и во флексе, и в сетке.

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileScss, normalizeCss, topLevelBlocks, layersBody } = require('./helpers/css');

const CORE = layersBody(compileScss("@use 'griffincss-core';"), ['griffincss.core']);

const norm = (text) => text.replace(/\s+/g, ' ').trim();

// Тела всех верхнеуровневых блоков с заданной прелюдией: @media одного
// порога встречается в файле не один раз.
function bodies(prelude) {
  return topLevelBlocks(CORE).filter((b) => norm(b.prelude) === norm(prelude)).map((b) => b.body).join('\n');
}

function ruleIn(css, selector) {
  const found = topLevelBlocks(css).find((b) => norm(b.prelude) === selector);

  return found ? normalizeCss(found.body).replace(/;$/, '') : '';
}

test('.gr-order-first / -last / -none — первым, последним и порядком разметки', () => {
  assert.equal(ruleIn(CORE, '.gr-order-first'), 'order:-9999');
  assert.equal(ruleIn(CORE, '.gr-order-last'), 'order:9999');
  assert.equal(ruleIn(CORE, '.gr-order-none'), 'order:0');
});

test('оконные варианты повторяют базовые от своего порога', () => {
  for (const [bp, value] of Object.entries({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px' })) {
    const media = bodies(`@media (width >= ${value})`);

    assert.equal(ruleIn(media, `.gr-order-first-${bp}`), 'order:-9999', `.gr-order-first-${bp}`);
    assert.equal(ruleIn(media, `.gr-order-last-${bp}`), 'order:9999', `.gr-order-last-${bp}`);
    assert.equal(ruleIn(media, `.gr-order-none-${bp}`), 'order:0', `.gr-order-none-${bp}`);
  }
});

test('базовый порядок стоит раньше оконного: .gr-order-last .gr-order-none-lg возвращает место с порога', () => {
  const at = (selector) => CORE.indexOf(`${selector} {`);

  assert.ok(at('.gr-order-last') !== -1 && at('.gr-order-none-lg') !== -1, 'правил нет');
  assert.ok(at('.gr-order-last') < at('.gr-order-none-lg'), 'оконный вариант раньше базового — проиграет ему');
});

test('контейнерных вариантов порядка нет: их не просили', () => {
  const container = bodies('@container (width >= 768px)');

  for (const selector of ['.gr-order-first-cmd', '.gr-order-last-cmd', '.gr-order-none-cmd']) {
    assert.equal(ruleIn(container, selector), '', `${selector} появился без решения`);
  }
});
