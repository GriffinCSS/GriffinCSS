'use strict';

// Сборка сайта для Pages проверяется сама: её работа — перенести дерево
// и переписать пути к сборкам, и обе половины ломаются молча. Забытая
// замена даёт страницу без стилей, забытый файл — четырёхсотую на CSS;
// и то и другое видит читатель, а не сборка.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let build;

test.before(async () => {
  ({ build } = await import('../build-pages.mjs'));
});

// Временное дерево из описания {путь: содержимое}. Каталоги создаются сами.
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-pages-'));

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  return dir;
}

// Минимально правдоподобное дерево: страница, её стиль, одна сборка.
const PAGE = [
  '<!DOCTYPE html>',
  '<link rel="stylesheet" href="style.css">',
  '<link rel="stylesheet" href="../packages/core/dist/griffincss-core.css">',
  '<script src="../packages/core/dist/griffincss.js"></script>',
  '<a href="typography.html">Типографика</a>',
  '',
].join('\n');

function fixture(extra = {}) {
  return tree({
    'docs/index.html': PAGE,
    'docs/typography.html': PAGE,
    'docs/style.css': '.hero{display:grid}',
    'docs/nav.js': 'window.nav = 1;',
    'packages/core/dist/griffincss-core.css': '.gr-grid{display:grid}',
    'packages/core/dist/griffincss.js': '/*! griffincss */',
    ...extra,
  });
}

const out = (root) => path.join(root, '_site');
const read = (root, rel) => fs.readFileSync(path.join(out(root), rel), 'utf8');

test('страницы документации ложатся в корень сайта', () => {
  const root = fixture();
  build(root, out(root));

  assert.ok(fs.existsSync(path.join(out(root), 'index.html')));
  assert.ok(fs.existsSync(path.join(out(root), 'typography.html')));
  assert.ok(fs.existsSync(path.join(out(root), 'style.css')));
  assert.ok(fs.existsSync(path.join(out(root), 'nav.js')));
});

test('сборки пакетов сохраняют свои пути под корнем', () => {
  const root = fixture();
  build(root, out(root));

  assert.equal(read(root, 'packages/core/dist/griffincss-core.css'), '.gr-grid{display:grid}');
});

test('выход наверх переписан на путь от корня', () => {
  const root = fixture();
  build(root, out(root));

  const html = read(root, 'index.html');

  assert.ok(html.includes('href="packages/core/dist/griffincss-core.css"'), html);
  assert.ok(!html.includes('../packages/'), html);
});

test('ссылки между страницами не тронуты', () => {
  const root = fixture();
  build(root, out(root));

  assert.ok(read(root, 'index.html').includes('href="typography.html"'));
});

test('заметки по дизайну наружу не едут', () => {
  const root = fixture({ 'docs/design/style-presets.md': '# Заметка' });
  build(root, out(root));

  assert.ok(!fs.existsSync(path.join(out(root), 'design')));
});

test('карты кода наружу не едут', () => {
  const root = fixture({ 'packages/core/dist/griffincss.js.map': '{}' });
  build(root, out(root));

  assert.ok(!fs.existsSync(path.join(out(root), 'packages/core/dist/griffincss.js.map')));
});

test('прошлая сборка не остаётся в выходном каталоге', () => {
  const root = fixture();
  fs.mkdirSync(out(root), { recursive: true });
  fs.writeFileSync(path.join(out(root), 'stale.html'), 'старое');

  build(root, out(root));

  assert.ok(!fs.existsSync(path.join(out(root), 'stale.html')));
});

test('дерево без index.html не собирается', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'docs/index.html'));

  assert.throws(() => build(root, out(root)), /index\.html/);
});

test('ссылка на несуществующую сборку останавливает выпуск', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'packages/core/dist/griffincss-core.css'));

  assert.throws(() => build(root, out(root)), /griffincss-core\.css/);
});

test('строка ../ в артефакте dist — не выход наверх: модули GriffinJS несут require в обёртке', () => {
  const root = fixture({
    'packages/ui/dist/griffinjs-slider.js': "!function(G){}(window.GriffinJS||require('../core/griffinjs-core.js'));",
  });

  assert.doesNotThrow(() => build(root, out(root)));
});

test('оставшийся выход наверх останавливает выпуск', () => {
  const root = fixture();

  // Замена работает и в стилях, поэтому подпорченный путь берём такой,
  // какой она не чинит: на два уровня вверх мимо packages.
  fs.writeFileSync(path.join(root, 'docs/style.css'), 'body{background:url(../../logo.png)}');

  assert.throws(() => build(root, out(root)), /выход наверх/);
});
