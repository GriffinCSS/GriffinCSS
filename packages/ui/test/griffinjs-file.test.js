'use strict';

// Файловое поле GriffinJS на мок-DOM: список выбранного, удаление одного
// файла переписывает input.files через DataTransfer, повторный выбор
// добавляет, если так объявлено, размер — в единицах локали через Intl.
// Мультивыбор — платформенный (multiple), без скрипта поле остаётся рабочим.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/file.js'];

// Файл и DataTransfer — то, чем пользуется виджет: имя, размер, список.
const file = (name, size) => ({ name, size, lastModified: 1, type: '' });

class DataTransfer {
  constructor() { this.files = []; this.items = { add: (f) => this.files.push(f) }; }
}

function field(doc, attrs) {
  const input = el('input', Object.assign({ class: 'gr-file', type: 'file', id: 'docs', multiple: '', 'data-gr-file': '' }, attrs));
  const wrap = mount(doc, el('div', { class: 'gr-field' }, [input]));

  input.files = [];

  return { wrap, input };
}

function choose(input, files) {
  input.files = files;
  input.dispatchEvent(event('change', input));
}

const names = (list) => list.querySelectorAll('li').map((li) => li.querySelector('.gr-file-name').textContent);

test.before(() => { global.DataTransfer = DataTransfer; });
test.after(() => { delete global.DataTransfer; });

test('размер файла — в единицах локали через Intl, без своих строк', () => {
  const { G } = setup(PARTS);

  assert.equal(G.file.size(512, 'ru'), '512 Б');
  assert.equal(G.file.size(2048, 'ru'), '2 кБ');
  assert.equal(G.file.size(1536, 'en'), '1.5 kB');
  assert.equal(G.file.size(5 * 1024 * 1024, 'en'), '5 MB');
  assert.equal(G.file.size(3 * 1024 * 1024 * 1024, 'ru'), '3 ГБ');
});

test('выбор показывает список, удаление одного файла переписывает input.files', () => {
  const { G, doc } = setup(PARTS);

  doc.documentElement.setAttribute('lang', 'ru');

  const { wrap, input } = field(doc);
  const seen = [];

  input.addEventListener('griffin:change', (e) => seen.push(e.detail.files.map((f) => f.name)));
  G.start();

  const list = wrap.children[1];

  assert.ok(list && list.tagName === 'UL', 'список не создан после поля');
  assert.equal(list.className, 'gr-file-list');
  assert.equal(list.getAttribute('aria-live'), 'polite');
  assert.equal(list.children.length, 0);

  choose(input, [file('отчёт.pdf', 2048), file('фото.jpg', 3 * 1024 * 1024)]);

  assert.deepEqual(names(list), ['отчёт.pdf', 'фото.jpg']);
  assert.equal(list.querySelectorAll('.gr-file-size')[0].textContent, '2 кБ');

  const remove = list.querySelectorAll('.gr-file-remove');

  assert.equal(remove.length, 2);
  assert.equal(remove[0].getAttribute('type'), 'button');
  assert.equal(remove[0].getAttribute('aria-label'), 'Убрать отчёт.pdf');

  // Удаление первого: input.files собран заново через DataTransfer.
  remove[0].dispatchEvent(event('click', remove[0]));

  assert.deepEqual(input.files.map((f) => f.name), ['фото.jpg']);
  assert.deepEqual(names(list), ['фото.jpg']);
  assert.deepEqual(seen, [['отчёт.pdf', 'фото.jpg'], ['фото.jpg']]);

  G.destroy();

  assert.equal(wrap.children.length, 1, 'destroy не убрал список');
});

test('повторный выбор заменяет список; с append — добавляет без повторов', () => {
  const { G, doc } = setup(PARTS);
  const { wrap, input } = field(doc);
  const { wrap: wrap2, input: appending } = field(doc, { id: 'more', 'data-gr-file': 'append' });

  G.start();

  choose(input, [file('a.txt', 10)]);
  choose(input, [file('b.txt', 10)]);
  assert.deepEqual(names(wrap.children[1]), ['b.txt'], 'без append выбор заменяется, как у платформы');

  choose(appending, [file('a.txt', 10)]);
  choose(appending, [file('b.txt', 10), file('a.txt', 10)]);
  assert.deepEqual(names(wrap2.children[1]), ['a.txt', 'b.txt']);
  assert.deepEqual(appending.files.map((f) => f.name), ['a.txt', 'b.txt'], 'input.files не собран из накопленного');

  G.destroy();
});

test('свой контейнер списка и своя подпись кнопки; список от автора на месте после destroy', () => {
  const { G, doc } = setup(PARTS);
  const list = el('ul', { id: 'chosen' });
  const input = el('input', { type: 'file', 'data-gr-file': 'list: #chosen; remove: Удалить {name}' });

  input.files = [];
  mount(doc, el('div', {}, [input, list]));

  G.start();
  choose(input, [file('x.zip', 1)]);

  assert.equal(list.children.length, 1);
  assert.equal(list.querySelector('.gr-file-remove').getAttribute('aria-label'), 'Удалить x.zip');

  G.destroy();

  assert.equal(list.parentNode !== null, true, 'чужой список удалён');
  assert.equal(list.children.length, 0, 'destroy не очистил чужой список');
});

test('зона перетаскивания: файлы, брошенные на обёртку, ложатся в поле; над зоной — состояние over', () => {
  const { G, doc } = setup(PARTS);
  const input = el('input', { class: 'gr-file', type: 'file', multiple: '', 'data-gr-file': 'drop; append' });
  const zone = mount(doc, el('label', { class: 'gr-file-drop' }, [input]));

  input.files = [];
  G.start();

  const over = event('dragover', zone);

  zone.dispatchEvent(over);
  assert.equal(over.defaultPrevented, true, 'без preventDefault браузер откроет файл вместо сброса');
  assert.equal(zone.getAttribute('data-gr-state'), 'over');

  zone.dispatchEvent(event('dragleave', zone));
  assert.equal(zone.getAttribute('data-gr-state'), null);

  const drop = event('drop', zone, { dataTransfer: { files: [file('a.txt', 10)] } });

  zone.dispatchEvent(drop);
  assert.equal(drop.defaultPrevented, true);
  assert.deepEqual(input.files.map((f) => f.name), ['a.txt']);
  assert.equal(zone.getAttribute('data-gr-state'), null);

  // Второй сброс с append — добавляет.
  zone.dispatchEvent(event('drop', zone, { dataTransfer: { files: [file('b.txt', 10)] } }));
  assert.deepEqual(input.files.map((f) => f.name), ['a.txt', 'b.txt']);
  assert.deepEqual(names(zone.querySelector('.gr-file-list')), ['a.txt', 'b.txt']);

  G.destroy();

  assert.equal(zone.getAttribute('data-gr-state'), null);
});

test('без DataTransfer виджет не поднимается и говорит почему', () => {
  const saved = global.DataTransfer;

  delete global.DataTransfer;

  try {
    const { G, doc } = setup(PARTS);
    const { input } = field(doc);
    const said = [];
    const before = console.warn;

    console.warn = (m) => said.push(String(m));

    try {
      G.start();
    } finally {
      console.warn = before;
    }

    assert.equal(G.instance(input, 'file'), null);
    assert.match(said[0], /DataTransfer/);
    G.destroy();
  } finally {
    global.DataTransfer = saved;
  }
});
