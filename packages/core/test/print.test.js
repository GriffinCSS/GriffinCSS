'use strict';

// Печать. Блок ресета опционален вместе с самим ресетом, а гашение теней
// живёт в теме и потому едет во все артефакты: слои griffincss.ui
// и griffincss.utils старше griffincss.core, и переопределение, приехавшее
// только с ядром, проиграло бы базовому :root из надстройки.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const RESET = read('packages/core/dist/griffincss-reset.css');
const CORE = read('packages/core/dist/griffincss-core.css');
const UI = read('packages/ui/dist/griffincss-ui.css');
const UTILS = read('packages/utils/dist/griffincss-utils.css');
const UTILS_SCOPED = read('packages/utils/dist/griffincss-utils-scoped.css');

// Тело @media print — со сбалансированными скобками, начиная с указанного
// вхождения: в утилитах блоков печати два (тема и анимации).
function printBlock(css, from) {
  const open = css.indexOf('@media print', from || 0);

  if (open === -1) return '';

  let depth = 0;

  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(css.indexOf('{', open) + 1, i);
    }
  }

  throw new Error('Griffincss test: незакрытый @media print');
}

test('ресет разворачивает страницу в чёрное по белому', () => {
  const block = printBlock(RESET);

  assert.match(block, /body\{[^}]*background:#fff/);
  assert.match(block, /body\{[^}]*color:#000/);
});

test('ресет раскрывает <details>: свёрнутый текст на бумаге не вернуть', () => {
  assert.match(printBlock(RESET), /details::details-content\{content-visibility:visible\}/);
});

test('ресет не рвёт заголовок от текста и блок посередине', () => {
  const block = printBlock(RESET);

  assert.match(block, /h1,h2,h3,h4,h5,h6\{break-after:avoid\}/);
  assert.match(block, /break-inside:avoid/);
  assert.match(block, /orphans:3/);
});

test('печать не полагается на !important', () => {
  for (const css of [RESET, CORE, UI, UTILS]) {
    assert.ok(!printBlock(css).includes('!important'), 'в блоке печати найден !important');
  }
});

test('тени гасятся множителем темы и во всех артефактах сразу', () => {
  for (const [name, css] of [['core', CORE], ['ui', UI], ['utils', UTILS], ['utils-scoped', UTILS_SCOPED]]) {
    assert.match(
      css,
      /@media print\{[^}]*\{--gr-shadow-strength:\s*0\}/,
      `${name}: гашение теней на печати отсутствует`,
    );
  }
});

test('перечень носителей темы в блоке печати покрывает системную тёмную', () => {
  // :root:not([data-gr-theme]) в блоке prefers-color-scheme имеет
  // специфичность (0,2,0). Без пары к нему тёмная системная тема вернула бы
  // себе --gr-shadow-strength на печати, и тени уехали бы на бумагу.
  const match = CORE.match(/@media print\{([^{]*)\{--gr-shadow-strength:\s*0\}/);

  assert.ok(match, 'блок печати с гашением теней не найден');
  assert.match(match[1], /:root:not\(\[data-gr-theme\]\)/);
});

test('вращение и переходы на печати остановлены', () => {
  const first = UTILS.indexOf('@media print');
  const second = UTILS.indexOf('@media print', first + 1);
  const blocks = printBlock(UTILS, first) + printBlock(UTILS, second);

  assert.match(blocks, /\.gr-animate-spin\{animation:none\}/);
  assert.match(blocks, /transition:none/);
});
