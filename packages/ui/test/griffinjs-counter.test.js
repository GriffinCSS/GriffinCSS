'use strict';

// Счётчик символов GriffinJS на мок-DOM: остаток к maxlength в подписи,
// связь с полем через aria-describedby, состояния near/full и снятие всего
// в destroy. Само ограничение — платформенное и здесь не проверяется:
// без скрипта maxlength действует ровно так же.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/counter.js'];

function field(doc, attrs, out) {
  const control = el('textarea', Object.assign({ class: 'gr-textarea', id: 'about', maxlength: '20', 'data-gr-counter': '' }, attrs));
  const wrap = mount(doc, el('div', { class: 'gr-field' }, out ? [control, out] : [control]));

  return { wrap, control };
}

const type = (control, text) => {
  control.value = text;
  control.dispatchEvent(event('input', control));
};

test('подпись создаётся после поля и показывает остаток', () => {
  const { G, doc } = setup(PARTS);
  const { wrap, control } = field(doc);

  G.start();

  const out = wrap.children[1];

  assert.ok(out && out.tagName === 'OUTPUT', 'подпись не создана сразу после поля');
  assert.equal(out.className, 'gr-counter');
  assert.equal(out.textContent, '20');
  assert.equal(out.getAttribute('aria-live'), 'polite');
  assert.equal(out.getAttribute('data-gr-state'), 'ok');

  // Поле описано подписью: скринридер прочтёт остаток при фокусе.
  assert.equal(control.getAttribute('aria-describedby'), out.getAttribute('id'));

  type(control, 'Привет');
  assert.equal(out.textContent, '14');

  G.destroy();

  assert.equal(wrap.children.length, 1, 'destroy не убрал созданную подпись');
  assert.equal(control.getAttribute('aria-describedby'), null, 'destroy не снял aria-describedby');
});

test('состояния: near у порога, full на пределе', () => {
  const { G, doc } = setup(PARTS);
  const { wrap, control } = field(doc, { 'data-gr-counter': 'near: 0.25' });

  G.start();

  const out = wrap.children[1];

  type(control, 'абвгдежзийклмно');           // 15 из 20 — остаток 5 = 25 %
  assert.equal(out.getAttribute('data-gr-state'), 'near');

  type(control, 'абвгдежзийклмнопрст');       // 19 — остаток 1
  assert.equal(out.getAttribute('data-gr-state'), 'near');

  type(control, 'абвгдежзийклмнопрсту');      // 20 — предел
  assert.equal(out.textContent, '0');
  assert.equal(out.getAttribute('data-gr-state'), 'full');

  // Значение длиннее предела (вставка скриптом) не даёт отрицательного остатка.
  type(control, 'абвгдежзийклмнопрстуфх');
  assert.equal(out.textContent, '0');

  G.destroy();
});

test('своя подпись и шаблон: out и format, aria-describedby дописывается', () => {
  const { G, doc } = setup(PARTS);
  const out = el('span', { class: 'gr-hint', id: 'about-left' });
  const { wrap, control } = field(doc, {
    'data-gr-counter': 'out: #about-left; format: {length} из {max}',
    'aria-describedby': 'about-hint',
  }, out);

  G.start();

  assert.equal(wrap.children.length, 2, 'создана лишняя подпись при заданном out');
  assert.equal(out.textContent, '0 из 20');
  assert.equal(control.getAttribute('aria-describedby'), 'about-hint about-left');

  type(control, 'абв');
  assert.equal(out.textContent, '3 из 20');

  G.destroy();

  // Чужой узел остаётся на месте, но текст и состояние с него снимаются.
  assert.equal(wrap.children.length, 2);
  assert.equal(out.textContent, '');
  assert.equal(out.getAttribute('aria-live'), null);
  assert.equal(control.getAttribute('aria-describedby'), 'about-hint');
});

test('поле без maxlength виджет не поднимает и говорит об этом', () => {
  const { G, doc } = setup(PARTS);
  const { control } = field(doc, { maxlength: null });
  const warnings = [];
  const before = console.warn;

  control.removeAttribute('maxlength');
  console.warn = (message) => warnings.push(message);

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(control, 'counter'), null);
  assert.equal(warnings.length, 1, `предупреждений — ${warnings.length}`);
  assert.match(warnings[0], /maxlength/);

  G.destroy();
});
