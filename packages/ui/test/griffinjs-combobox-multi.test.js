'use strict';

// Мультивыбор в комбобоксе (Этап 38g): флаг у существующего виджета,
// а не новый виджет. База без скрипта — <select multiple> внутри обёртки;
// со скриптом выбранное показывается тегами, удаление тега снимает выбор,
// значение уходит в тот же <select multiple>.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'widgets/combobox.js'];

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const GOODS = [{ value: 'acer', label: 'Acer Aspire' }, { value: 'asus', label: 'Asus Zenbook' }, { value: 'apple', label: 'Apple Watch' }];

function box(doc) {
  const acer = el('option', { value: 'acer', selected: '' });
  const asus = el('option', { value: 'asus' });

  acer.textContent = 'Acer Aspire';
  asus.textContent = 'Asus Zenbook';

  const select = el('select', { name: 'tags[]', multiple: '' }, [acer, asus]);
  const input = el('input', { class: 'gr-input', type: 'search' });
  const root = mount(doc, el('div', { class: 'gr-combobox' }, [select, input]));

  input.value = '';

  return { root, select, input, acer, asus };
}

const source = (q) => Promise.resolve(GOODS.filter((g) => g.label.toLowerCase().indexOf(q.toLowerCase()) !== -1));
const chosen = (select) => select.options.filter((o) => o.selected).map((o) => o.value);
const tagsOf = (root) => root.querySelectorAll('.gr-combobox-tag').map((t) => t.querySelector('span').textContent);

function type(input, text) {
  input.value = text;
  input.dispatchEvent(event('input', input));
}

test('multiple: теги из выбранных позиций <select>, выбор добавляет тег и позицию, поле очищается', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc);
  const changes = [];

  b.select.addEventListener('change', () => changes.push(chosen(b.select)));
  G.mount(b.root, 'combobox', { multiple: true, min: 1, delay: 0, source });
  G.start();

  const w = G.instance(b.root, 'combobox');
  const tags = b.root.querySelector('.gr-combobox-tags');

  assert.ok(tags, 'список тегов не создан');
  assert.equal(b.root.children[1], tags, 'теги стоят не перед полем');
  assert.equal(tags.getAttribute('role'), 'list');
  assert.deepEqual(tagsOf(b.root), ['Acer Aspire'], 'выбранная на сервере позиция не показана тегом');

  const remove = tags.querySelector('.gr-combobox-tag-remove');

  assert.equal(remove.getAttribute('type'), 'button');
  assert.equal(remove.getAttribute('aria-label'), 'Убрать Acer Aspire');

  // Выбор позиции, которая есть в <select>: включается она, поле пустеет.
  type(b.input, 'zen');
  await tick(5);
  w.select(0);

  assert.deepEqual(chosen(b.select), ['acer', 'asus']);
  assert.deepEqual(tagsOf(b.root), ['Acer Aspire', 'Asus Zenbook']);
  assert.equal(b.input.value, '', 'поле не очищено после выбора');
  assert.equal(b.root.getAttribute('data-gr-state'), 'ready', 'список не закрыт');
  assert.deepEqual(changes, [['acer', 'asus']], 'select не сообщил о смене значения');

  // Позиции нет в <select> — она добавляется и включается.
  type(b.input, 'watch');
  await tick(5);
  w.select(0);

  assert.deepEqual(chosen(b.select), ['acer', 'asus', 'apple']);
  assert.equal(b.select.options[2].textContent, 'Apple Watch');
  assert.deepEqual(tagsOf(b.root), ['Acer Aspire', 'Asus Zenbook', 'Apple Watch']);

  // Повторный выбор той же позиции второго тега не даёт.
  type(b.input, 'watch');
  await tick(5);
  w.select(0);
  assert.equal(tagsOf(b.root).length, 3);

  G.destroy();

  assert.equal(b.root.querySelector('.gr-combobox-tags'), null, 'destroy не убрал теги');
  assert.deepEqual(chosen(b.select), ['acer', 'asus', 'apple'], 'destroy отнял выбранное у формы');
});

test('multiple: удаление тега снимает выбор, Backspace в пустом поле снимает последний', async () => {
  const { G, doc } = setup(PARTS);
  const b = box(doc);

  G.mount(b.root, 'combobox', { multiple: true, min: 1, delay: 0, source });
  G.start();

  const w = G.instance(b.root, 'combobox');

  type(b.input, 'watch');
  await tick(5);
  w.select(0);
  assert.deepEqual(chosen(b.select), ['acer', 'apple']);

  // Тег серверной позиции: позиция остаётся, выбор снят.
  const remove = b.root.querySelector('.gr-combobox-tag-remove');

  remove.dispatchEvent(event('click', remove));
  assert.deepEqual(chosen(b.select), ['apple']);
  assert.equal(b.select.options.length, 3, 'серверная позиция удалена вместе с тегом');
  assert.equal(doc.activeElement, b.input, 'фокус не вернулся в поле');

  // Backspace в пустом поле — последний тег; добавленная позиция уходит целиком.
  const back = event('keydown', b.input, { key: 'Backspace' });

  b.input.dispatchEvent(back);
  assert.equal(back.defaultPrevented, true);
  assert.deepEqual(chosen(b.select), []);
  assert.equal(b.select.options.length, 2, 'добавленная скриптом позиция осталась после снятия');
  assert.deepEqual(tagsOf(b.root), []);

  // В непустом поле Backspace — обычное удаление знака.
  b.input.value = 'x';

  const own = event('keydown', b.input, { key: 'Backspace' });

  b.input.dispatchEvent(own);
  assert.equal(own.defaultPrevented, false);

  G.destroy();
});

test('multiple без <select multiple> внутри не поднимается', () => {
  const { G, doc } = setup(PARTS);
  const input = el('input', { type: 'search' });
  const root = mount(doc, el('div', { class: 'gr-combobox', 'data-gr-combobox': 'multiple; src: /s?q={q}' }, [input]));
  const said = [];
  const before = console.warn;

  console.warn = (m) => said.push(String(m));

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(root, 'combobox'), null);
  assert.match(said[0], /select/);

  G.destroy();
});
