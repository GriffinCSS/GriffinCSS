'use strict';

// Формат числа выбран один на весь проект: 10,5 КБ — запятая, КБ = 1024 Б,
// округление до 0,1. Проверяется он здесь, потому что ошибка в округлении
// не видна ни глазом, ни по зелёной сборке: цифра просто станет другой.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..', '..');

let sizes;

test.before(async () => {
  sizes = await import('../sizes.mjs');
});

test('замер переводится в КБ с запятой и одним знаком', () => {
  assert.equal(sizes.kb(10802), '10,5 КБ');
  assert.equal(sizes.kb(3428), '3,3 КБ');
  assert.equal(sizes.kb(0), '0,0 КБ');
});

test('граница округления проходит между 1075 и 1076 Б', () => {
  // 1075 Б = 1,0498 КБ, 1076 Б = 1,0508 КБ — соседние байты по разные
  // стороны от половины десятой доли.
  assert.equal(sizes.kb(1075), '1,0 КБ');
  assert.equal(sizes.kb(1076), '1,1 КБ');
});

test('число без единиц — тот же формат', () => {
  assert.equal(sizes.num(10802), '10,5');
  assert.equal(sizes.num(3428), '3,3');
});

test('вес артефакта — это gzip его файла, а не отдельный счёт', () => {
  const file = path.join(root, 'packages/core/dist/griffincss-core.css');
  const expected = zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;

  assert.equal(sizes.bytes('core'), expected);
});

test('сырой вес — длина файла', () => {
  const file = path.join(root, 'packages/utils/dist/griffincss-utils.css');

  assert.equal(sizes.bytes('utils-raw'), fs.statSync(file).size);
});

test('составной артефакт складывается из объявленных частей', () => {
  const parts = ['js-core', 'js-theme', 'js-ui', 'js-utils'];
  const sum = parts.reduce((total, id) => total + sizes.bytes(id), 0);

  assert.equal(sizes.bytes('js-all'), sum);
});

test('каждый объявленный артефакт считается', () => {
  for (const id of Object.keys(sizes.ARTIFACTS)) {
    assert.ok(sizes.bytes(id) > 0, `артефакт ${id} не посчитан`);
  }
});

test('незнакомый идентификатор — ошибка, а не тихий ноль', () => {
  assert.throws(() => sizes.bytes('нет-такого'), /нет-такого/);
});
