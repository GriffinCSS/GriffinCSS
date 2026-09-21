'use strict';

// Семь каскадных слоёв (Этап 46) — по собранным артефактам всех пакетов.
//
// Токены — :root, носители темы и режима, якоря — лежат в одном слое
// griffincss.tokens, первом после ресета. Каждый пакет по-прежнему несёт
// свою копию (самодостаточность), но копии одинаковы и стоят в одном
// слое: побеждает последняя по источнику, а она равна первой. Поэтому
// подслой темы потребителя, объявленный сразу после tokens, перебивает
// токены при любой специфичности — фидбек темы griffin, п. 10: до этого
// :root { --gr-font-sans } из подслоя app между core и ui проигрывал
// той же строке из ui и utils. [hidden] — в последнем слое griffincss.hidden,
// после style: display компонента из ui ему больше не старше (п. 11).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { topLevelBlocks } = require('./helpers/css');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ORDER = '@layer griffincss.reset, griffincss.tokens, griffincss.core, griffincss.ui, griffincss.utils, griffincss.style, griffincss.hidden;';

const BUILDS = {
  reset: 'packages/core/dist/griffincss-reset.css',
  core: 'packages/core/dist/griffincss-core.css',
  ui: 'packages/ui/dist/griffincss-ui.css',
  'ui-scoped': 'packages/ui/dist/griffincss-ui-scoped.css',
  utils: 'packages/utils/dist/griffincss-utils.css',
  'utils-scoped': 'packages/utils/dist/griffincss-utils-scoped.css',
  styles: 'packages/core/dist/griffincss-styles.css',
  'style-airy': 'packages/core/dist/griffincss-style-airy.css',
  'style-strict': 'packages/core/dist/griffincss-style-strict.css',
  'style-compact': 'packages/core/dist/griffincss-style-compact.css',
  griffinjs: 'packages/ui/dist/griffinjs.css',
  'griffinjs-fields': 'packages/ui/dist/griffinjs-fields.css',
};

// Сборки, которые несут полный блок токенов.
const WITH_TOKENS = ['core', 'ui', 'ui-scoped', 'utils', 'utils-scoped'];

// Верхнеуровневые блоки файла без объявления порядка: оно кончается
// первой точкой с запятой и иначе приклеилось бы к преамбуле первого блока.
const blocks = (css) => topLevelBlocks(css.slice(css.indexOf(';') + 1));

// Тело слоя по имени из верхнеуровневых блоков сжатого файла.
function layer(css, name) {
  const found = blocks(css).find((b) => b.prelude.replace(/\s+/g, ' ').trim() === `@layer ${name}`);

  return found ? found.body : '';
}

// Преамбулы носителей токенов: :root, тема, режим.
const CARRIER = /(^|,)\s*(:root|\[data-gr-theme|\[data-gr-a11y)/;

test('каждая сборка объявляет все семь слоёв первой строкой', () => {
  for (const [name, file] of Object.entries(BUILDS)) {
    assert.ok(read(file).startsWith(ORDER), `${name}: порядок слоёв не тот или не первой строкой`);
  }
});

test('токены каждого пакета лежат в слое griffincss.tokens, а не в своём', () => {
  for (const name of WITH_TOKENS) {
    const css = read(BUILDS[name]);
    const tokens = layer(css, 'griffincss.tokens');

    assert.ok(tokens, `${name}: нет слоя griffincss.tokens`);
    assert.ok(tokens.includes(':root{'), `${name}: :root не в слое токенов`);
    assert.ok(tokens.includes('[data-gr-theme=dark]{'), `${name}: тёмная тема не в слое токенов`);
    assert.ok(tokens.includes('[data-gr-a11y=low-vision]'), `${name}: режим не в слое токенов`);
    assert.ok(tokens.includes('--gr-font-sans:'), `${name}: базовые токены не в слое токенов`);

    // В остальных слоях файла — ни одного объявления --gr-* на носителе.
    for (const block of blocks(css)) {
      if (!block.prelude.startsWith('@layer ') || block.prelude === '@layer griffincss.tokens') continue;

      for (const rule of topLevelBlocks(block.body)) {
        const carriers = rule.prelude.split(',').some((s) => CARRIER.test(',' + s.trim()));

        if (carriers && /--gr-[\w-]+\s*:/.test(rule.body)) {
          assert.fail(`${name}: токен на носителе вне слоя tokens (${block.prelude}): ${rule.prelude.slice(0, 60)}`);
        }
      }
    }
  }
});

test('копии блока токенов в пяти сборках совпадают побайтово — побеждает последняя, и она равна первой', () => {
  const bodies = WITH_TOKENS.map((name) => [name, layer(read(BUILDS[name]), 'griffincss.tokens')]);
  const [, reference] = bodies[0];

  for (const [name, body] of bodies) {
    assert.equal(body, reference, `${name}: блок токенов отличается от core — копии в одном слое перебивали бы друг друга`);
  }
});

test('ось оформления: якоря тем — в tokens, стили — в style', () => {
  for (const name of ['styles', 'style-airy', 'style-strict', 'style-compact']) {
    const css = read(BUILDS[name]);
    const tokens = layer(css, 'griffincss.tokens');
    const style = layer(css, 'griffincss.style');

    assert.ok(tokens.includes(':root,[data-gr-theme=light]{'), `${name}: якоря светлой темы не в tokens`);
    assert.ok(tokens.includes('[data-gr-theme=dark]{'), `${name}: якоря тёмной темы не в tokens`);
    assert.ok(!tokens.includes('[data-gr-style'), `${name}: блок оси попал в tokens — он обязан бить тему из style`);
    assert.ok(style.includes('[data-gr-style]{'), `${name}: общая часть оси не в style`);
    assert.ok(!style.includes(':root{') && !/:root,\[data-gr-theme=light\]\{/.test(style), `${name}: якоря остались в style — подслой темы их не перебьёт`);
  }
});

test('ресет токенов не несёт, а слой tokens у него не объявлен блоком', () => {
  const css = read(BUILDS.reset);

  assert.equal(layer(css, 'griffincss.tokens'), '', 'в ресете появился блок токенов');
  assert.ok(layer(css, 'griffincss.reset'), 'слой ресета пуст');
});
