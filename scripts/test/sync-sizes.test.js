'use strict';

// Цифра веса в документации — артефакт сборки, а не текст. Проверяется
// здесь то, ради чего заведён механизм: подменённый вес роняет проверку,
// пропавший маркер тоже, а --fix возвращает дерево в зелёное состояние.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

let sync;
let sizes;

test.before(async () => {
  sync = await import('../sync-sizes.mjs');
  sizes = await import('../sizes.mjs');
});

const readSite = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('в дереве все цифры совпадают с замером', () => {
  for (const site of sync.SITES) {
    assert.deepEqual(sync.sync(readSite(site.file), site.ids).problems, [], site.file);
  }
});

test('подменённый вес находится, и --fix возвращает файл', () => {
  const site = sync.SITES.find((entry) => entry.file === 'README.md');
  const original = readSite(site.file);
  const spoiled = original.replace(
    /(<!--gr:size:ui-->)[^<]*(<!--\/gr:size:ui-->)/,
    '$1' + '1,0 КБ' + '$2',
  );

  assert.notEqual(spoiled, original, 'подмена не удалась — маркера ui в README нет');

  const result = sync.sync(spoiled, site.ids);

  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /ui/);
  assert.equal(result.text, original);
});

test('пропавший маркер — падение, а не тихий пропуск', () => {
  const site = sync.SITES.find((entry) => entry.file === 'README.md');
  const without = readSite(site.file).replaceAll(/<!--\/?gr:size:ui-->/g, '');
  const result = sync.sync(without, site.ids);

  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /маркер/);
});

test('между маркерами стоит формат проекта', () => {
  const readme = readSite('README.md');
  const found = readme.match(/<!--gr:size:ui-->([^<]*)<!--\/gr:size:ui-->/);

  assert.equal(found[1], sizes.kb(sizes.bytes('ui')));
});

test('вариант :n даёт число без единиц', () => {
  const result = sync.sync('<!--gr:size:core:n-->0,0<!--/gr:size:core:n-->', ['core:n']);

  assert.equal(result.text, `<!--gr:size:core:n-->${sizes.num(sizes.bytes('core'))}<!--/gr:size:core:n-->`);
});
