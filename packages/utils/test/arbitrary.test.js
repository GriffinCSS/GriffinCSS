'use strict';

// Произвольные значения: .gr-mt-[13px] — то, чего статический файл
// выразить не может в принципе. Содержимое скобок приходит из разметки,
// поэтому проверяется не только правильный разбор, но и отказ:
// невалидное даёт предупреждение и пропуск, а не сломанный CSS.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setupDom, el, generatedCSS, loadUtilsRuntime } = require('../../core/test/helpers/dom');

const DIST = path.join(__dirname, '..', 'dist');
const utilsCss = fs.readFileSync(path.join(DIST, 'griffincss-utils.css'), 'utf8');
const coreCss = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'dist', 'griffincss-core.css'), 'utf8');

// Ставит документ, поднимает ядро (эмиттер и <style> живут в нём)
// и прогоняет разбор произвольных значений.
function setup(body) {
  const { doc, griffin } = setupDom(body);
  const utils = loadUtilsRuntime();

  griffin.init();
  utils.arbitrary(doc);

  return { doc, utils, css: generatedCSS(doc) };
}

// Тот же прогон с перехваченным console.warn.
function setupQuiet(body) {
  const warnings = [];
  const original = console.warn;

  console.warn = (message) => warnings.push(message);

  try {
    return Object.assign(setup(body), { warnings });
  } finally {
    console.warn = original;
  }
}

test('произвольный отступ даёт правило с экранированным селектором', () => {
  const { css } = setup(el('body', {}, [el('div', { class: 'gr-mt-[13px]' })]));

  assert.ok(css.includes('.gr-mt-\\[13px\\]{margin-top:13px}'), 'правила нет: ' + css);
});

test('правило уезжает в слой утилит, а не наружу', () => {
  const { css } = setup(el('body', {}, [el('div', { class: 'gr-mt-[13px]' })]));
  const layer = css.indexOf('@layer griffincss.utils {');

  assert.ok(layer !== -1, 'слоя утилит в выводе нет: ' + css);
  assert.ok(css.indexOf('.gr-mt-\\[13px\\]') > layer, 'правило вне слоя утилит: ' + css);
});

test('спецсимволы в значении экранируются в селекторе', () => {
  const { css } = setup(el('body', {}, [el('div', { class: 'gr-w-[50%]' })]));

  assert.ok(css.includes('.gr-w-\\[50\\%\\]{width:50%}'), 'экранирование процента: ' + css);
});

test('два элемента с одним значением дают одно правило', () => {
  const body = el('body', {}, [el('div', { class: 'gr-mt-[13px]' }), el('div', { class: 'gr-mt-[13px]' })]);
  const { css } = setup(body);
  const count = css.split('.gr-mt-\\[13px\\]').length - 1;

  assert.equal(count, 1, 'правило продублировано: ' + css);
});

test('повторный проход правило не дублирует', () => {
  const body = el('body', {}, [el('div', { class: 'gr-mt-[13px]' })]);
  const { doc, utils } = setup(body);

  utils.arbitrary(doc);

  const count = generatedCSS(doc).split('.gr-mt-\\[13px\\]').length - 1;

  assert.equal(count, 1, 'второй проход добавил копию правила');
});

test('фигурная скобка в значении — предупреждение и пропуск', () => {
  const { css, warnings } = setupQuiet(el('body', {}, [el('div', { class: 'gr-mt-[13px}red:blue]' })]));

  assert.ok(!css.includes('gr-mt-'), 'сломанное правило попало в CSS: ' + css);
  assert.equal(warnings.length, 1, 'ожидалось ровно одно предупреждение: ' + warnings.join(' | '));
  assert.match(warnings[0], /^Griffincss: /);
});

test('комментарий в значении — предупреждение и пропуск', () => {
  const { css, warnings } = setupQuiet(el('body', {}, [el('div', { class: 'gr-mt-[1px/*x*/]' })]));

  assert.ok(!css.includes('gr-mt-'), 'значение с комментарием прошло: ' + css);
  assert.equal(warnings.length, 1, warnings.join(' | '));
});

test('точка с запятой в значении — предупреждение и пропуск', () => {
  const { css, warnings } = setupQuiet(el('body', {}, [el('div', { class: 'gr-mt-[1px;color:red]' })]));

  assert.ok(!css.includes('gr-mt-'), 'вторая декларация пролезла: ' + css);
  assert.equal(warnings.length, 1, warnings.join(' | '));
});

test('пустые скобки — предупреждение и пропуск', () => {
  const { css, warnings } = setupQuiet(el('body', {}, [el('div', { class: 'gr-mt-[]' })]));

  assert.ok(!css.includes('gr-mt-'), 'пустое значение прошло: ' + css);
  assert.equal(warnings.length, 1, warnings.join(' | '));
});

test('слишком длинное значение — предупреждение и пропуск', () => {
  // Пробела в имени класса быть не может — длинное значение набирается
  // без него, иначе разметка распалась бы на несколько классов.
  const long = 'calc(' + '1px+'.repeat(20) + '1px)';
  const { css, warnings } = setupQuiet(el('body', {}, [el('div', { class: 'gr-mt-[' + long + ']' })]));

  assert.ok(!css.includes('gr-mt-'), 'значение без ограничения длины прошло: ' + css);
  assert.equal(warnings.length, 1, warnings.join(' | '));
});

test('неизвестное имя перед скобкой — предупреждение и пропуск', () => {
  const { css, warnings } = setupQuiet(el('body', {}, [el('div', { class: 'gr-zzz-[13px]' })]));

  assert.ok(!css.includes('gr-zzz'), 'правило для неизвестного свойства: ' + css);
  assert.equal(warnings.length, 1, warnings.join(' | '));
});

test('произвольное значение читается и как значение класса', () => {
  const utils = loadUtilsRuntime();

  assert.equal(utils.classValue('gr-p-[13px]'), '13px');
  assert.equal(utils.classValue('gr-radius-[2vw]'), '2vw');
  assert.equal(utils.classValue('gr-p-4'), '1rem', 'шкала перестала разбираться');
});

test('каскад скруглений видит произвольные радиус и зазор', () => {
  const inner = el('div', { class: 'gr-radius' });
  const outer = el('div', { class: 'gr-radius gr-radius-[2rem] gr-p-[8px]' }, [inner]);
  const { doc, utils } = setup(el('body', {}, [outer]));

  utils.radiusCascade(doc);

  assert.ok(
    generatedCSS(doc).includes('--gr-r:max(0px,calc(2rem - 8px))'),
    'выражение из произвольных значений: ' + generatedCSS(doc).slice(0, 400),
  );
});

test('составное свойство подставляет значение во все объявления', () => {
  const { css } = setup(el('body', {}, [el('div', { class: 'gr-py-[13px]' })]));

  assert.ok(
    css.includes('.gr-py-\\[13px\\]{padding-top:13px;padding-bottom:13px}'),
    'обе стороны оси: ' + css,
  );
});

test('каждое свойство таблицы объявляет то же, что статический класс', () => {
  const prefixes = Object.keys(loadUtilsRuntime()._props);

  assert.ok(prefixes.length > 0, 'таблица свойств пуста');

  for (const prefix of prefixes) {
    const cls = prefix + '[13px]';
    const { css } = setup(el('body', {}, [el('div', { class: cls })]));
    const generated = new RegExp('\\.' + prefix.replace(/-/g, '\\-') + '\\\\\\[13px\\\\\\]\\{([^}]*)\\}').exec(css);

    assert.ok(generated, `${prefix}: правило не сгенерировано`);

    // Статический класс того же префикса — эталон: произвольное значение
    // обязано объявлять ровно те же свойства, иначе `.gr-p-4` и
    // `.gr-p-[13px]` вели бы себя по-разному.
    const rule = new RegExp('\\.' + prefix.replace(/-/g, '\\-') + '[\\w-]+\\{([^}]*)\\}');
    const stat = rule.exec(utilsCss) || rule.exec(coreCss);

    assert.ok(stat, `${prefix}: в собранном CSS нет ни одного статического класса`);

    const names = (body) => body.split(';').map((part) => part.slice(0, part.indexOf(':')).trim());

    assert.deepEqual(names(generated[1]), names(stat[1]), `${prefix}: набор объявлений разошёлся`);
  }
});

test('добавленный после разбора элемент получает правило', async () => {
  const { doc, utils } = setup(el('body', {}, []));
  const added = el('div', { class: 'gr-mt-[13px]' });

  doc.body.appendChild(added);
  utils.arbitrary(doc.body);

  assert.ok(generatedCSS(doc).includes('.gr-mt-\\[13px\\]{'), 'новый элемент остался без правила');
});
