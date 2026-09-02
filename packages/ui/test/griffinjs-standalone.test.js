'use strict';

// Сборка «ядро + нужное»: слой берут не только целиком, и лишние части
// в ядре стоят денег каждому. Отсюда три проверки, и все три — про одно:
// модуль обязан честно объявлять, что он берёт из G.
//
//   1. Объявленное совпадает с используемым — ловит и забытую
//      зависимость, и лишнюю, оставшуюся после правки.
//   2. Виджет поднимается на объявленном наборе и только на нём.
//   3. Набор без одной части предупреждает вслух. Это главное: виджет
//      со страховкой (`if (G.anchor)`) в полном бандле работает прекрасно
//      и молча ломается у того, кто собрал набор руками.
//
// Тест написан ДО разнесения ядра (Этап 22b) и обязан проходить и до,
// и после: набор здесь всегда собирается из файлов, а не из dist.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, el, mount, event, track: buildTrack, SRC } = require('./helpers/griffinjs-dom');

// Обращение к чужому модулю: G.track, G.anchor, G.widgets.slider.
// Имя из G, совпавшее с именем файла слоя, — и есть зависимость;
// критерий один на все виды, поэтому новая часть попадает под проверку
// сама, без правки этого списка.
const USE = /\bG\.(?:widgets\.|engines\.)?([A-Za-z_$][\w$]*)/g;

// Имя модуля — имя файла без расширения, как в сборщике.
const FILES = {};

// Поля второго бандла (Этап 38) проверяются той же машинерией: у них тот же
// договор с ядром, а набор «ядро + поля» — такая же сборка руками.
for (const dir of ['core', 'engines', 'widgets', 'fields']) {
  for (const file of fs.readdirSync(path.join(SRC, dir)).sort()) {
    if (!file.endsWith('.js') || file === 'griffinjs-core.js') continue;

    FILES[file.replace(/\.js$/, '')] = `${dir}/${file}`;
  }
}

const ALL = Object.values(FILES);
const BASE = ['core/options.js', 'core/registry.js'];

// Объявления читаются у самого рантайма, а не регулярным выражением:
// сверять код с кодом же бессмысленно — сверяем код с тем, что ядро
// в итоге знает о модуле.
const DEPS = (() => {
  const { G } = setup(ALL);
  const out = {};

  for (const name of Object.keys(FILES)) out[name] = G.needs(name);

  return out;
})();

const source = (name) => fs.readFileSync(path.join(SRC, FILES[name]), 'utf8');

// Дорожка живёт движком прокрутки: он не часть G, а запись в реестре
// движков, и в needs ему места нет — но без него виджет не поднимется.
const ENGINE = new Set(['track', 'slider', 'gallery', 'lightbox']);

// Набор под модуль: ядро + объявленное (с транзитивными) + сам модуль.
function partsFor(name, skip) {
  const seen = new Set();

  (function collect(current) {
    if (seen.has(current)) return;

    seen.add(current);

    for (const dep of DEPS[current] || []) collect(dep);
  })(name);

  seen.delete(name);
  seen.delete(skip);

  const parts = BASE.slice();

  for (const dep of seen) parts.push(FILES[dep]);
  if (ENGINE.has(name)) parts.push('engines/scroll.js');
  parts.push(FILES[name]);

  return parts;
}

// Файловое поле переписывает input.files через DataTransfer — в Node его нет.
global.DataTransfer = class { constructor() { this.files = []; this.items = { add: (f) => this.files.push(f) }; } };

// Параллакс — единственный, кто читает окно: без window его фабрика падает,
// а другим виджетам поддельное окно ни к чему (media ждёт matchMedia).
const NEEDS_WINDOW = new Set(['parallax']);

function withWindow(name, fn) {
  if (!NEEDS_WINDOW.has(name)) return fn();

  global.window = { innerHeight: 800, addEventListener: () => {}, removeEventListener: () => {} };

  try {
    return fn();
  } finally {
    delete global.window;
  }
}

function warnings(fn) {
  const said = [];
  const original = console.warn;

  console.warn = (message) => said.push(String(message));

  try {
    fn();
  } finally {
    console.warn = original;
  }

  return said;
}

// Минимальная разметка каждого виджета: подъём проверяется как факт,
// поведение — в griffinjs-widgets, -controllers, -megamenu, -dialog,
// -combobox. Возвращает узел; проверка по умолчанию — экземпляр на нём.
const MARKUP = {
  track: (doc) => buildTrack(doc, 3, 100, { class: 'gr-track', 'data-gr-track': '' }).node,

  slider: (doc) => {
    const { node: trackEl } = buildTrack(doc, 3, 100, { class: 'gr-track' });

    trackEl.remove();

    return mount(doc, el('div', { class: 'gr-slider', 'data-gr-slider': '' }, [
      trackEl, el('button', { 'data-gr-prev': '' }), el('button', { 'data-gr-next': '' }), el('div', { 'data-gr-dots': '' }),
    ]));
  },

  gallery: (doc) => {
    const { node: trackEl } = buildTrack(doc, 3, 100, { class: 'gr-track' });

    trackEl.remove();

    const thumbs = [el('button'), el('button'), el('button')];
    const thumbsEl = el('div', { class: 'gr-track gr-gallery-thumbs' }, thumbs);
    const root = mount(doc, el('div', { 'data-gr-gallery': '' }, [trackEl, thumbsEl]));

    thumbsEl.at(0, 0, 100, 40);
    thumbs.forEach((thumb, i) => thumb.at(i * 100, 0, 100, 40));

    return root;
  },

  parallax: (doc) => mount(doc, el('section', { 'data-gr-parallax': '' })).at(0, 300, 100, 200),

  megamenu: (doc) => {
    const summary = el('summary', { class: 'gr-nav-link' });
    const panel = el('div', { class: 'gr-megamenu-panel' }, [el('div', {}, [el('a', { href: '/a' })])]);
    const item = el('details', { class: 'gr-megamenu-item' }, [summary, panel]);
    const nav = el('ul', { class: 'gr-nav gr-nav-collapse gr-megamenu' }, [el('li', {}, [item])]);

    return mount(doc, el('nav', { class: 'gr-navbar', 'data-gr-megamenu': '' }, [nav]));
  },

  dropdown: (doc) => {
    const summary = el('summary', { class: 'gr-btn' });
    const list = el('ul', { class: 'gr-menu' }, [el('li', {}, [el('button', { class: 'gr-menu-item', type: 'button' })])]);
    const panel = el('div', { class: 'gr-dropdown-panel' }, [list]);

    return mount(doc, el('details', { class: 'gr-dropdown', 'data-gr-dropdown': '' }, [summary, panel]));
  },

  tooltip: (doc) => {
    const button = el('button', { class: 'gr-btn', type: 'button', 'aria-describedby': 'tip' });
    const tip = el('span', { class: 'gr-tooltip', id: 'tip', role: 'tooltip' });
    const root = mount(doc, el('span', { class: 'gr-tooltip-anchor', 'data-gr-tooltip': '' }, [button, tip]));

    button.at(300, 300, 80, 32);
    tip.at(0, 0, 120, 24);

    return root;
  },

  dialog: (doc) => mount(doc, el('dialog', { class: 'gr-modal', id: 'm', 'data-gr-dialog': '' })),

  combobox: (doc) => {
    const input = el('input', { type: 'search', name: 'q' });
    const root = mount(doc, el('div', { class: 'gr-combobox', 'data-gr-combobox': 'src: /s?q={q}' }, [input]));

    input.value = '';

    return root;
  },

  // Лайтбокс — не виджет на элементе, а контроллер: окно строится
  // по щелчку, и проверяется оно же.
  lightbox: (doc) => mount(doc, el('div', {}, [
    el('a', { href: 'a.jpg', 'data-gr-lightbox': 'g' }, [el('img', { alt: 'А' })]),
    el('a', { href: 'b.jpg', 'data-gr-lightbox': 'g' }),
  ])),

  // --- Поля второго бандла (Этап 38) -----------------------------------------

  counter: (doc) => {
    const control = el('textarea', { maxlength: '10', 'data-gr-counter': '' });

    mount(doc, el('div', {}, [control]));

    return control;
  },

  mask: (doc) => mount(doc, el('input', { type: 'tel', 'data-gr-mask': '000-000' })),

  datetime: (doc) => {
    const control = el('input', { type: 'date', 'data-gr-datetime': '' });

    mount(doc, el('div', {}, [control]));

    return control;
  },

  file: (doc) => {
    const control = el('input', { type: 'file', multiple: '', 'data-gr-file': '' });

    control.files = [];
    mount(doc, el('div', {}, [control]));

    return control;
  },

  otp: (doc) => mount(doc, el('div', { 'data-gr-otp': '' }, [
    el('input', { maxlength: '1' }), el('input', { maxlength: '1' }),
  ])),

  validate: (doc) => mount(doc, el('form', { 'data-gr-validate': '' }, [el('input', { required: '' })])),

  rating: (doc) => mount(doc, el('fieldset', { 'data-gr-rating': '' }, [
    el('span', { class: 'gr-rating' }),
    el('label', {}, [el('input', { type: 'radio', name: 'r', value: '1' })]),
    el('label', {}, [el('input', { type: 'radio', name: 'r', value: '2' })]),
  ])),

  phone: (doc) => mount(doc, el('div', { class: 'gr-input-group', 'data-gr-phone': '' }, [
    el('select', {}, [el('option', { value: '+7', 'data-gr-iso': 'RU', 'data-gr-format': '(000) 000-00-00' })]),
    el('input', { type: 'tel' }),
  ])),

  // Таблица стран — не виджет: на старте кладёт состав в G.phone.table,
  // и пустой список кодов заполняется из неё.
  countries: (doc) => mount(doc, el('div', { class: 'gr-input-group', 'data-gr-phone': '' }, [
    el('select'), el('input', { type: 'tel' }),
  ])),
};

const CHECK = {
  lightbox: (G, doc, node) => {
    doc.fire('click', event('click', node.children[0]));

    assert.ok(G.lightbox._dialog(), 'лайтбокс не построил окно');
  },

  countries: (G, doc, node) => {
    assert.ok(node.querySelector('select').options.length > 50, 'таблица не заполнила список кодов');
  },
};

test('объявленные зависимости совпадают с фактическими', () => {
  const known = new Set(Object.keys(FILES));

  for (const name of Object.keys(FILES)) {
    const used = new Set();

    for (const match of source(name).matchAll(USE)) {
      // G.track = track в самом track.js — определение, а не потребление.
      if (match[1] !== name && known.has(match[1])) used.add(match[1]);
    }

    assert.deepEqual(
      [...used].sort(), [...DEPS[name]].sort(),
      `${name}: needs разошёлся с кодом — объявлено [${DEPS[name]}], в коде [${[...used]}]`,
    );
  }
});

test('каждый виджет поднимается на объявленном наборе', () => {
  for (const name of Object.keys(MARKUP)) {
    const { G, doc } = setup(partsFor(name));

    withWindow(name, () => {
      const node = MARKUP[name](doc);
      const said = warnings(() => G.start());

      assert.deepEqual(said, [], `${name}: набор из needs дал предупреждение — ${said[0]}`);

      if (CHECK[name]) CHECK[name](G, doc, node);
      else assert.ok(G.instance(node, name), `${name} не поднялся на своём наборе`);

      G.destroy();
    });
  }
});

test('набор без объявленной части предупреждает вслух', () => {
  const checked = [];

  for (const name of Object.keys(FILES)) {
    for (const dep of DEPS[name]) {
      const { G, doc } = setup(partsFor(name, dep));

      withWindow(name, () => {
        if (MARKUP[name]) MARKUP[name](doc);

        const said = warnings(() => G.start());
        const expected = `griffinjs-${dep}.js`;

        assert.ok(
          said.some((line) => line.includes(name) && line.includes(expected)),
          `${name} без ${dep}: предупреждения нет — сказано ${JSON.stringify(said)}`,
        );

        checked.push(`${name}←${dep}`);

        G.destroy();
      });
    }
  }

  // Пустой прогон означал бы, что зависимости не объявлены вовсе.
  assert.ok(checked.length >= 9, `проверено слишком мало наборов: ${checked.join(', ')}`);
});
