'use strict';

// Сверка классов документации со сборкой. Пример «Лента без скрипта» жил
// на трёх классах, которых в собранном CSS нет, — скопированная из него
// разметка молча теряла размеры и скругление, и заметил это читатель,
// а не сборка. Сторож находит класс образца, которого нет ни в одном
// packages/*/dist/*.css, и называет файл и строки.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-docs-classes.mjs');
const load = () => import(pathToFileURL(SCRIPT).href);

const CSS = '@layer griffincss.ui{.gr-flex{display:flex}.gr-w-1\\/2{width:50%}@media (width>=768px){.gr-grid-2-md{display:grid}}}';

test('класс, которого нет в сборке, находится вместе со строками', async () => {
  const { builtClasses, unknownClasses } = await load();
  const html = '<p>текст</p>\n<a class="gr-flex gr-w-24" href="#">\n  <span class="gr-w-24">…</span>\n</a>';

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), [{ cls: 'gr-w-24', lines: [2, 3] }]);
});

test('экранированный образец в <pre> проверяется наравне с разметкой', async () => {
  const { builtClasses, unknownClasses } = await load();
  const html = '<pre><code>&lt;div class="gr-flex gr-nope"&gt;…&lt;/div&gt;</code></pre>';

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), [{ cls: 'gr-nope', lines: [1] }]);
});

test('className образца React и многострочный атрибут — со строкой самого класса', async () => {
  const { builtClasses, unknownClasses } = await load();
  const html = [
    '&lt;div className="gr-gap-4"&gt;',
    '&lt;a class="gr-flex',
    '   gr-radius-pill"&gt;',
  ].join('\n');

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), [
    { cls: 'gr-gap-4', lines: [1] },
    { cls: 'gr-radius-pill', lines: [3] },
  ]);
});

test('classList в обработчике — тоже класс страницы', async () => {
  const { builtClasses, unknownClasses } = await load();
  const html = '<button onclick="this.classList.toggle(\'gr-flex\'); h.classList.remove(\'gr-hidden-x\', \'gr-grid-2-md\')">';

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), [{ cls: 'gr-hidden-x', lines: [1] }]);
});

test('дробь из экранированного селектора и класс под @media — не ложная тревога', async () => {
  const { builtClasses, unknownClasses } = await load();
  const html = '<div class="gr-w-1/2 gr-grid-2-md"></div>';

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), []);
});

test('произвольное значение рантайма и заготовка шаблона — не классы сборки', async () => {
  const { builtClasses, unknownClasses } = await load();
  const html = '<div class="gr-w-[48px] gr-p-[calc(1rem + 2px)] gr-grid-{{ n }} gr-text-${tone}"></div>\n<p class="gr-flex …"></p>';

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), []);
});

test('семейства рантайма и маркер скрипта не жалуются, и у каждого исключения есть причина', async () => {
  const { builtClasses, unknownClasses, EXEMPT } = await load();
  const html = '<div class="gr-l-page"><div class="gr-area-hdr"></div></div><nav class="gr-theme-keep"></nav>';

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), []);

  for (const rule of EXEMPT) assert.ok(rule.why && rule.why.length > 20, `у исключения ${rule.pattern} нет причины`);
});

test('посторонние классы страницы доков не трогаются: проверяется только gr-*', async () => {
  const { builtClasses, unknownClasses } = await load();
  const html = '<div class="demo-block frame frame-1 badge-accent"></div>';

  assert.deepEqual(unknownClasses(html, builtClasses(CSS)), []);
});

// Командная строка: корень дерева — аргументом, чтобы сторожа можно было
// проверить на своём маленьком дереве, а не только на настоящих доках.
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-docs-classes-'));

  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }

  return dir;
}

test('команда падает и называет класс, файл и число вхождений', () => {
  const dir = tree({
    'packages/core/dist/griffincss-core.css': CSS,
    'docs/a.html': '<div class="gr-flex gr-w-24"></div>\n<div class="gr-w-24"></div>',
    'docs/b.html': '<div class="gr-flex"></div>',
  });
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });

  fs.rmSync(dir, { recursive: true, force: true });

  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /gr-w-24 → docs\/a\.html × 2 \(строки 1, 2\)/);
  assert.doesNotMatch(run.stderr, /b\.html/);
});

test('на чистом дереве команда молча проходит', () => {
  const dir = tree({
    'packages/ui/dist/griffincss-ui.css': CSS,
    'docs/a.html': '<div class="gr-flex gr-w-1/2"></div>',
  });
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });

  fs.rmSync(dir, { recursive: true, force: true });

  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /неизвестных нет/);
});
