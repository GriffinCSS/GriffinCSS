'use strict';

// Инварианты grid-хелперов по скомпилированному CSS ядра.

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileScss, topLevelBlocks, layerBody } = require('./helpers/css');

const CORE = layerBody(compileScss("@use 'griffincss-core';"), 'griffincss.core');

const norm = (text) => text.replace(/\s+/g, ' ').trim();

function blockBody(selector) {
  const found = topLevelBlocks(CORE).find((b) => norm(b.prelude) === selector);
  return found ? norm(found.body) : '';
}

test('.gr-subgrid наследует колонки родителя и остаётся grid-контейнером', () => {
  const rule = blockBody('.gr-subgrid');

  assert.match(rule, /display:\s*grid/);
  assert.match(rule, /grid-template-columns:\s*subgrid/);
});

test('.gr-subgrid-rows делает то же самое по второй оси', () => {
  const rule = blockBody('.gr-subgrid-rows');

  assert.match(rule, /display:\s*grid/);
  assert.match(rule, /grid-template-rows:\s*subgrid/);
});

test('оси subgrid независимы: ни один класс не задаёт обе сразу', () => {
  assert.ok(!/grid-template-rows/.test(blockBody('.gr-subgrid')), '.gr-subgrid трогает ряды');
  assert.ok(
    !/grid-template-columns/.test(blockBody('.gr-subgrid-rows')),
    '.gr-subgrid-rows трогает колонки',
  );
});

test('subgrid не заводит собственного отступа — он приходит от родителя', () => {
  for (const selector of ['.gr-subgrid', '.gr-subgrid-rows']) {
    assert.ok(!/(^|;)\s*gap:/.test(blockBody(selector)), `${selector} объявляет свой gap`);
  }
});

test('минимальная ширина дорожки — ручка --gr-grid-min с запасным значением', () => {
  for (const cls of ['.gr-grid-auto-fit', '.gr-grid-auto-fill']) {
    const rule = blockBody(cls);

    assert.match(
      rule,
      /minmax\(\s*var\(--gr-grid-min,\s*250px\)\s*,\s*1fr\s*\)/,
      `${cls}: ширина дорожки обязана приходить из переменной, а не из хардкода`,
    );
  }
});

test('auto-fit и auto-fill различаются только режимом повтора', () => {
  const fit = blockBody('.gr-grid-auto-fit');
  const fill = blockBody('.gr-grid-auto-fill');

  assert.match(fit, /repeat\(\s*auto-fit/);
  assert.match(fill, /repeat\(\s*auto-fill/);
  assert.equal(
    fit.replace('auto-fit', 'auto-X'),
    fill.replace('auto-fill', 'auto-X'),
    'кроме режима повтора правила обязаны совпадать',
  );
});
