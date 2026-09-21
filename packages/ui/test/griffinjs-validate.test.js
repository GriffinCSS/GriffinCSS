'use strict';

// Сводка ошибок формы GriffinJS на мок-DOM: после отправки — список
// непройденных полей ссылками с сообщением платформы, фокус на первой,
// повторная отправка обновляет список, поле, ставшее верным, теряет
// aria-invalid. База без скрипта — пузырь браузера: novalidate ставит
// сам виджет и снимает в destroy.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'fields/validate.js'];

// Поле с состоянием платформенной проверки: в моке её нет, задаём руками.
function control(attrs, valid, message) {
  const node = el('input', Object.assign({ class: 'gr-input', type: 'text' }, attrs));

  node.validity = { valid };
  node.validationMessage = valid ? '' : message;

  return node;
}

function form(doc, attrs) {
  const name = control({ id: 'name', name: 'name', required: '' }, false, 'Заполните это поле.');
  const mail = control({ id: 'mail', name: 'mail', type: 'email' }, false, 'Введите адрес электронной почты.');
  const city = control({ name: 'city' }, true, '');
  const submit = el('button', { type: 'submit' });
  const node = mount(doc, el('form', Object.assign({ 'data-gr-validate': '' }, attrs), [
    el('label', { for: 'name' }), el('div', { class: 'gr-field' }, [name]),
    el('label', { for: 'mail' }), mail,
    city, submit,
  ]));

  node.querySelector('label[for="name"]').textContent = 'Имя';
  node.querySelector('label[for="mail"]').textContent = 'Почта';

  return { node, name, mail, city, submit };
}

const submit = (node) => {
  const e = event('submit', node);

  node.dispatchEvent(e);

  return e;
};

test('отправка с ошибками: список полей ссылками, сообщение платформы, фокус на первой, aria-invalid', () => {
  const { G, doc } = setup(PARTS);
  const { node, name, mail, city } = form(doc);

  G.start();

  assert.ok(G.instance(node, 'validate'), 'виджет не поднялся');
  assert.equal(node.hasAttribute('novalidate'), true, 'пузырь браузера будет спорить со сводкой');

  const box = node.children[0];

  assert.equal(box.className, 'gr-validate', 'сводка не создана первым узлом формы');
  assert.equal(box.getAttribute('role'), 'alert');
  assert.equal(box.hasAttribute('hidden'), true, 'пустая сводка видна');

  const e = submit(node);

  assert.equal(e.defaultPrevented, true, 'форма с ошибками ушла на сервер');
  assert.equal(box.hasAttribute('hidden'), false);

  const links = box.querySelectorAll('a');

  assert.equal(links.length, 2);
  assert.equal(links[0].getAttribute('href'), '#name');
  assert.equal(links[0].textContent, 'Имя: Заполните это поле.');
  assert.equal(links[1].textContent, 'Почта: Введите адрес электронной почты.');
  assert.equal(doc.activeElement, links[0], 'фокус не на первой ссылке');

  assert.equal(name.getAttribute('aria-invalid'), 'true');
  assert.equal(mail.getAttribute('aria-invalid'), 'true');
  assert.equal(city.getAttribute('aria-invalid'), null);

  // Ссылка ведёт к полю фокусом, а не только якорем.
  const click = event('click', links[1]);

  links[1].dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(doc.activeElement, mail);

  // Поле исправлено — aria-invalid уходит сразу, список ждёт отправки.
  mail.validity = { valid: true };
  mail.validationMessage = '';
  mail.dispatchEvent(event('input', mail));
  assert.equal(mail.getAttribute('aria-invalid'), null);
  assert.equal(box.querySelectorAll('a').length, 2);

  submit(node);
  assert.equal(box.querySelectorAll('a').length, 1);
  assert.equal(box.querySelector('a').textContent, 'Имя: Заполните это поле.');

  // Всё верно — форма уходит, сводка прячется.
  name.validity = { valid: true };
  name.validationMessage = '';

  const ok = submit(node);

  assert.equal(ok.defaultPrevented, false);
  assert.equal(box.hasAttribute('hidden'), true);
  assert.equal(name.getAttribute('aria-invalid'), null);

  G.destroy();

  assert.equal(node.hasAttribute('novalidate'), false, 'destroy не вернул проверку браузеру');
  assert.equal(node.children[0].className, '', 'destroy не убрал сводку');
});

test('своя сводка и заголовок; поле без id получает его на время жизни виджета', () => {
  const { G, doc } = setup(PARTS);
  const box = el('div', { id: 'errors', class: 'gr-alert' });
  const field = control({ name: 'phone', 'aria-label': 'Телефон' }, false, 'Не подходит под формат.');
  const node = mount(doc, el('form', { 'data-gr-validate': 'summary: #errors; title: Исправьте:' }, [box, field]));

  G.start();
  submit(node);

  assert.equal(box.querySelector('.gr-validate-title').textContent, 'Исправьте:');

  const link = box.querySelector('a');

  assert.equal(link.textContent, 'Телефон: Не подходит под формат.', 'имя поля — из aria-label, когда подписи нет');
  assert.match(field.getAttribute('id'), /^gr-validate-/);
  assert.equal(link.getAttribute('href'), '#' + field.getAttribute('id'));

  G.destroy();

  assert.equal(field.getAttribute('id'), null, 'выданный id остался');
  assert.equal(box.parentNode, node, 'чужая сводка удалена');
  assert.equal(box.children.length, 0, 'чужая сводка не очищена');
});

test('не форма — виджет не поднимается', () => {
  const { G, doc } = setup(PARTS);
  const div = mount(doc, el('div', { 'data-gr-validate': '' }));
  const said = [];
  const before = console.warn;

  console.warn = (m) => said.push(String(m));

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(div, 'validate'), null);
  assert.match(said[0], /form/);

  G.destroy();
});

test('состояние ошибки встаёт на обёртку .gr-field вместе с aria-invalid и уходит с ней', () => {
  // Этап 45b: CSS красит контролы поля по .gr-field[data-gr-state="error"],
  // aria-invalid на контроле остаётся источником для программы чтения
  // с экрана — виджет ставит оба. Контрол без обёртки получает только
  // aria-invalid; обёртка с двумя контролами держит состояние, пока
  // хотя бы один из них не пройден.
  const { G, doc } = setup(PARTS);
  const { node, name, mail } = form(doc);
  const field = node.querySelector('.gr-field');
  const pair = el('div', { class: 'gr-field' }, [
    control({ name: 'a' }, false, 'Ошибка.'),
    control({ name: 'b' }, false, 'Ошибка.'),
  ]);

  node.appendChild(pair);
  G.start();
  submit(node);

  assert.equal(field.getAttribute('data-gr-state'), 'error', 'обёртка непройденного поля без состояния');
  assert.equal(name.getAttribute('aria-invalid'), 'true', 'aria-invalid на контроле снят');
  assert.equal(mail.getAttribute('aria-invalid'), 'true');
  assert.equal(pair.getAttribute('data-gr-state'), 'error');

  // Первый из пары исправлен — второй ещё нет: состояние остаётся.
  const [a, b] = pair.children;

  a.validity = { valid: true };
  a.dispatchEvent(event('input', a));
  assert.equal(a.getAttribute('aria-invalid'), null);
  assert.equal(pair.getAttribute('data-gr-state'), 'error', 'состояние снято, пока второй контрол не пройден');

  b.validity = { valid: true };
  b.dispatchEvent(event('input', b));
  assert.equal(pair.getAttribute('data-gr-state'), null, 'состояние осталось после исправления обоих');

  // Поле исправлено — обёртка теряет состояние вместе с aria-invalid.
  name.validity = { valid: true };
  name.dispatchEvent(event('input', name));
  assert.equal(name.getAttribute('aria-invalid'), null);
  assert.equal(field.getAttribute('data-gr-state'), null, 'состояние на обёртке пережило исправление поля');

  // Повторная отправка: снова обе метки, destroy снимает обе.
  name.validity = { valid: false };
  submit(node);
  assert.equal(field.getAttribute('data-gr-state'), 'error');

  G.destroy();

  assert.equal(field.getAttribute('data-gr-state'), null, 'destroy не снял состояние с обёртки');
  assert.equal(name.getAttribute('aria-invalid'), null);
});
