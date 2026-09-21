'use strict';

// Пресет отсечения компонентов (Этап 48a): `purge --preset ui` добавляет
// в safelist классы, которые ставят скрипты пакета ui — рантайм компонентов
// и слой виджетов. В разметке этих классов нет (тост, список комбобокса,
// лайтбокс, панель календаря собираются в рантайме), и отсечение
// их не увидит. Список в purge.mjs руками не ведётся: этот тест собирает
// его из src/ и роняет npm test при расхождении — пресет, отставший
// от кода на один виджет, стоит пропавшего стиля в проде.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'purge.mjs');
const UI_SRC = path.join(ROOT, 'packages', 'ui', 'src');
const UI_CSS = path.join(ROOT, 'packages', 'ui', 'dist', 'griffincss-ui.css');
const LAYER_CSS = path.join(ROOT, 'packages', 'ui', 'dist', 'griffinjs.css');

const load = () => import(pathToFileURL(SCRIPT).href);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry);

    if (fs.statSync(file).isDirectory()) walk(file, out);
    else if (file.endsWith('.js')) out.push(file);
  }

  return out;
}

// Строковые литералы кода — без комментариев: в шапках модулей лежат
// образцы разметки с классами, которые ставит автор страницы, а не скрипт.
// Регулярных выражений с кавычкой внутри в исходниках нет; появится —
// список изменится, и тест скажет об этом вслух, а не промолчит.
function literals(code) {
  const out = [];
  let i = 0;

  while (i < code.length) {
    const c = code[i];

    if (c === '/' && code[i + 1] === '*') {
      i = (code.indexOf('*/', i + 2) + 2) || code.length;
      continue;
    }

    if (c === '/' && code[i + 1] === '/') {
      const eol = code.indexOf('\n', i);

      i = eol === -1 ? code.length : eol;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;

      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') j++;
        j++;
      }

      out.push({ text: code.slice(i + 1, j), before: code.slice(Math.max(0, i - 24), i) });
      i = j + 1;
      continue;
    }

    i++;
  }

  return out;
}

// Что скрипт СТАВИТ: литерал с именами классов, не селектор (`.gr-tab`,
// `[data-gr-…]`, `a, b`), не событие (`griffin:open`) и не идентификатор
// (`setAttribute('id', 'gr-tab-' + n)`, `var id = 'gr-…'`). Хвост
// с дефисом — префикс, собираемый в рантайме: `gr-toast-` → `gr-toast-*`.
function classesSetByScripts() {
  const files = [path.join(UI_SRC, 'griffincss-ui.js'), ...walk(path.join(UI_SRC, 'griffinjs'))];
  const found = new Set();

  for (const file of files) {
    for (const { text, before } of literals(fs.readFileSync(file, 'utf8'))) {
      if (/^[.[#]|[,>:]/.test(text)) continue;
      if (/(['"]id['"]\s*,\s*|\bid\s*=\s*)$/.test(before)) continue;

      for (const token of text.split(/\s+/)) {
        if (/^gr-[a-z0-9-]*$/.test(token)) found.add(token.endsWith('-') ? `${token}*` : token);
      }
    }
  }

  return [...found].sort();
}

test('пресет ui равен списку классов, которые ставят скрипты пакета ui', async () => {
  const { PRESETS } = await load();
  const expected = classesSetByScripts();

  // Страховка самого сборщика: пустой список прошёл бы deepEqual с пустым
  // пресетом, а значил бы сломанный разбор литералов.
  assert.ok(expected.includes('gr-toast') && expected.includes('gr-combobox-list'),
    'разбор src/ не нашёл классов тоста и комбобокса: ' + expected.join(' '));

  assert.deepEqual(PRESETS.ui, expected,
    'пресет ui в scripts/purge.mjs разошёлся с src/ — перепишите список так:\n'
      + JSON.stringify(expected, null, 2));
});

// Пресет один на оба файла пакета: тост и кнопка его крестика лежат
// в griffincss-ui.css, список комбобокса и лайтбокс — в griffinjs.css.
for (const [css, classes] of [
  [UI_CSS, ['gr-toast', 'gr-toast-region', 'gr-btn-icon', 'gr-modal']],
  [LAYER_CSS, ['gr-combobox-list', 'gr-combobox-tag', 'gr-lightbox', 'gr-slider-dot']],
]) {
  test(`--preset ui сохраняет в ${path.basename(css)} правила, чьих классов в разметке нет`, () => {
    const page = path.join(__dirname, '..', 'dist', 'purge-preset-page.html');
    const out = path.join(__dirname, '..', 'dist', 'purge-preset-output.css');
    const bare = path.join(__dirname, '..', 'dist', 'purge-preset-bare.css');

    try {
      fs.writeFileSync(page, '<button class="gr-btn gr-btn-primary">Купить</button>');

      const withPreset = spawnSync(process.execPath, [SCRIPT, '--css', css, '--preset', 'ui', '--out', out, page], { encoding: 'utf8' });
      assert.equal(withPreset.status, 0, 'скрипт завершился с ошибкой: ' + withPreset.stderr);
      assert.match(withPreset.stderr, /пресет ui/, 'отчёт не называет пресет: ' + withPreset.stderr);

      const kept = fs.readFileSync(out, 'utf8');

      for (const cls of classes) {
        assert.match(kept, new RegExp(`\\.${cls}[{,\\s:.>[]`), `класс из пресета отсечён: .${cls}`);
      }

      // Отрицательный контроль: без пресета те же правила уходят.
      const without = spawnSync(process.execPath, [SCRIPT, '--css', css, '--out', bare, page], { encoding: 'utf8' });
      assert.equal(without.status, 0, without.stderr);

      const dropped = fs.readFileSync(bare, 'utf8');

      for (const cls of classes) {
        assert.ok(!dropped.includes(`.${cls}`), `без пресета .${cls} остался — тест ничего не доказывает`);
      }

      assert.ok(dropped.length < kept.length, 'пресет не добавил ни байта');
    } finally {
      for (const file of [page, out, bare]) fs.rmSync(file, { force: true });
    }
  });
}

test('неизвестный пресет — ошибка, а не молчание', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--css', UI_CSS, '--preset', 'nope', 'docs/index.html'], { cwd: ROOT, encoding: 'utf8' });

  assert.equal(run.status, 1);
  assert.match(run.stderr, /неизвестный пресет nope/);
  assert.match(run.stderr, /\bui\b/, 'ошибка не перечисляет доступные пресеты: ' + run.stderr);
});
