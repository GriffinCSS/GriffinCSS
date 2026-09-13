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

// Допуск сверки (Этап 42b): один dist жмётся разными zlib по-разному —
// официальный Node (zlib 1.3.1, как на CI) и Homebrew-Node (системный
// zlib 1.2.12) разошлись на 37 Б. Сверка без ключа не должна ронять
// участника на другом zlib, если записанное число могло получиться
// из замера в пределах допуска; --fix пишет точный замер всегда.

test('сверка терпит расхождение в пределах допуска, --fix пишет точно', () => {
  // 10 220 Б → «10,0 КБ»; граница округления к «10,1» — 10 291 Б.
  const measured = 10220;
  const near = () => measured;
  const wrap = (text) => `<!--gr:size:ui-->${text}<!--/gr:size:ui-->`;

  assert.ok(sync.TOLERANCE >= 37 && sync.TOLERANCE < 102, 'допуск не покрывает zlib или прячет шаг записи 0,1 КБ');

  // 30 Б в сторону — та же цифра, зелено.
  assert.deepEqual(sync.sync(wrap(sizes.kb(measured + 30)), ['ui'], near).problems, []);
  // 80 Б в сторону — цифра «10,1 КБ», которую замер в допуске дать не мог.
  const far = sync.sync(wrap(sizes.kb(measured + 80)), ['ui'], near);

  assert.equal(far.problems.length, 1);
  assert.match(far.problems[0], /10,1 КБ/);
  // Текст на выходе — точный замер и в зелёном случае, и в красном.
  assert.equal(far.text, wrap('10,0 КБ'));
  assert.equal(sync.sync(wrap(sizes.kb(measured + 30)), ['ui'], near).text, wrap('10,0 КБ'));
});

test('допуск действует и для варианта :n', () => {
  const near = () => 10220;
  const ok = sync.sync('<!--gr:size:ui:n-->10,0<!--/gr:size:ui:n-->', ['ui:n'], () => 10300);

  assert.deepEqual(ok.problems, [], 'замер 10 300 даёт «10,1», но 10 250 в допуске дал бы «10,0»');
  assert.equal(sync.sync('<!--gr:size:ui:n-->10,2<!--/gr:size:ui:n-->', ['ui:n'], near).problems.length, 1);
});
