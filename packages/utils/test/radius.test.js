'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const sass = require('sass');

const SCSS_DIR = path.join(__dirname, '..', 'scss');

// Пакет — надстройка над griffincss-core: токены и брейкпоинты берутся оттуда
// по пакетному пути, поэтому компилятору нужен node_modules монорепозитория.
const MODULES_DIR = path.join(__dirname, '..', '..', '..', 'node_modules');

function compile(source) {
  const { css } = sass.compileString(source, {
    loadPaths: [SCSS_DIR, MODULES_DIR],
    style: 'compressed',
  });
  return css.replace(/\s+/g, '');
}

// 2h: зазор задаётся переменной, padding выводится из неё —
// автоопределение --gr-p из computed-стилей больше не нужно.
test('padding контейнера выводится из --gr-p', () => {
  const css = compile("@use 'border-radius';");

  assert.ok(css.includes('.gr-radius{padding:var(--gr-p);border-radius:var(--gr-r);--gr-r-down:var(--gr-r);--gr-r-gap:var(--gr-p)}'), css.slice(0, 200));
});

test('каскад скруглений в сборке не зависит от JS', () => {
  const css = compile("@use 'griffincss-utils';");

  assert.ok(css.includes('padding:var(--gr-p)'), 'зазор — переменная, а не результат замера в рантайме');
});

// 9a: --gr-r не должен наследоваться, иначе вложенный .gr-radius без
// собственного значения копирует радиус предка один в один.
test('--gr-r и --gr-p зарегистрированы как ненаследуемые', () => {
  const css = compile("@use 'griffincss-utils';");

  assert.ok(css.includes('@property--gr-r{syntax:"<length-percentage>";inherits:false;initial-value:0px}'), css.slice(0, 400));
  assert.ok(css.includes('@property--gr-p{syntax:"<length-percentage>";inherits:false;initial-value:0px}'), css.slice(0, 400));
});

test('контейнер публикует радиус и зазор детям отдельными переменными', () => {
  const css = compile("@use 'border-radius';");

  assert.ok(css.includes('--gr-r-down:var(--gr-r)'), css.slice(0, 300));
  assert.ok(css.includes('--gr-r-gap:var(--gr-p)'), css.slice(0, 300));
});

test('дочерний радиус считается от публикаций, а не от собственных переменных', () => {
  const css = compile("@use 'border-radius';");

  assert.ok(
    css.includes('.gr-radius>:not(.gr-radius){border-radius:max(0px,var(--gr-r-down,0px)-var(--gr-r-gap,0px))}'),
    css.slice(0, 400),
  );
});
