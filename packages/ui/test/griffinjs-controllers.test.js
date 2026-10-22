'use strict';

// Контроллеры семейства выпадающего поверх компонентов ui: дропдаун
// (роли меню, клавиатура, Esc и щелчок мимо для <details>, позиция
// popover-панели, наведение) и подсказка в верхнем слое (popover
// по наведению с задержкой и по фокусу, позиция у якоря).

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, wide } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'core/anchor.js', 'widgets/dropdown.js', 'widgets/tooltip.js'];

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function menu(labels) {
  const items = labels.map((text) => {
    const node = text === '-' ? el('hr', { class: 'gr-menu-sep' }) : el('button', { class: 'gr-menu-item', type: 'button' });
    node.textContent = text === '-' ? '' : text;
    return el('li', {}, [node]);
  });
  return el('ul', { class: 'gr-menu' }, items);
}

// <details class="gr-dropdown" data-gr-dropdown>
function detailsDropdown(doc, attrs = {}, labels = ['Переименовать', 'Дублировать', '-', 'Удалить']) {
  const summary = el('summary', { class: 'gr-btn' });
  const list = menu(labels);
  const panel = el('div', { class: 'gr-dropdown-panel' }, [list]);
  const root = mount(doc, el('details', Object.assign({ class: 'gr-dropdown', 'data-gr-dropdown': '' }, attrs), [summary, panel]));
  const items = list.querySelectorAll('button');
  return { root, summary, panel, list, items };
}

// <div class="gr-dropdown" data-gr-dropdown><button popovertarget><div popover>
function popoverDropdown(doc, attrs = {}) {
  const button = el('button', { class: 'gr-btn', type: 'button', popovertarget: 'pp' });
  const list = menu(['PDF', 'CSV']);
  const panel = el('div', { class: 'gr-dropdown-panel', id: 'pp', popover: '' }, [list]);
  const root = mount(doc, el('div', Object.assign({ class: 'gr-dropdown', 'data-gr-dropdown': '' }, attrs), [button, panel]));
  button.at(100, 100, 80, 32);
  panel.at(0, 0, 200, 120);
  return { root, button, panel, list, items: list.querySelectorAll('button') };
}

test('дропдаун на <details>: роли меню, aria-expanded, Esc и щелчок мимо закрывают', () => {
  const { G, doc } = setup(PARTS);
  const d = detailsDropdown(doc);

  G.start();

  const w = G.instance(d.root, 'dropdown');

  assert.ok(w);
  assert.equal(d.root.getAttribute('data-gr-state'), 'ready');
  assert.equal(d.summary.getAttribute('aria-haspopup'), 'menu');
  assert.equal(d.summary.getAttribute('aria-expanded'), 'false');
  assert.equal(d.summary.getAttribute('aria-controls'), d.panel.getAttribute('id'));
  assert.equal(d.list.getAttribute('role'), 'menu');
  assert.equal(d.items[0].getAttribute('role'), 'menuitem');
  assert.equal(d.list.querySelector('hr').getAttribute('role'), 'separator');
  assert.equal(d.list.querySelector('li').getAttribute('role'), 'none');

  d.root.open = true;
  assert.equal(d.summary.getAttribute('aria-expanded'), 'true');
  assert.equal(d.root.getAttribute('data-gr-state'), 'open');

  d.items[1].focus();
  d.items[1].dispatchEvent(event('keydown', d.items[1], { key: 'Escape' }));
  assert.equal(d.root.open, false, 'Esc не закрыл');
  assert.equal(doc.activeElement, d.summary, 'фокус не вернулся на кнопку');
  assert.equal(d.root.getAttribute('data-gr-state'), 'ready');

  d.root.open = true;
  const outside = mount(doc, el('p'));
  doc.fire('pointerdown', event('pointerdown', outside));
  assert.equal(d.root.open, false, 'щелчок мимо не закрыл');

  w.destroy();
  assert.equal(d.summary.hasAttribute('aria-haspopup'), false);
  assert.equal(d.list.hasAttribute('role'), false);
  assert.equal(d.items[0].hasAttribute('role'), false);
  assert.equal(d.root.hasAttribute('data-gr-state'), false);
});

// Во фреймворке состав меню зависит от состояния: пункт «Сделать общим»
// сменяется пунктом «Отвязать». Клавиатура берёт пункты при каждом
// открытии — роли берутся там же: закрытая панель скрыта, и читалке
// пункты нужны открытыми (Этап 77).
test('дропдаун: пункт, вставленный после подъёма, получает роль при открытии; destroy() её снимает', () => {
  const { G, doc } = setup(PARTS);
  const d = detailsDropdown(doc);

  G.start();

  const w = G.instance(d.root, 'dropdown');
  const added = el('button', { class: 'gr-menu-item', type: 'button' });
  const li = el('li', {}, [added]);

  added.textContent = 'Отвязать';
  d.list.appendChild(li);
  d.root.open = true;

  assert.equal(added.getAttribute('role'), 'menuitem', 'новый пункт объявляется кнопкой');
  assert.equal(li.getAttribute('role'), 'none', 'новый <li> — элемент списка внутри menu');

  w.destroy();

  assert.equal(added.hasAttribute('role'), false, 'роль нового пункта осталась после destroy()');
  assert.equal(li.hasAttribute('role'), false);
});

test('дропдаун: пункт, удалённый из меню, при следующем открытии запись отпускает', () => {
  const { G, doc } = setup(PARTS);
  const d = detailsDropdown(doc, {}, ['Сделать общим']);

  G.start();

  const w = G.instance(d.root, 'dropdown');
  const old = d.items[0];

  d.root.open = true;
  d.root.open = false;

  const fresh = el('button', { class: 'gr-menu-item', type: 'button' });

  fresh.textContent = 'Отвязать';
  old.parentNode.remove();
  d.list.appendChild(el('li', {}, [fresh]));
  d.root.open = true;

  // Запись ролей перед раздачей снимает прежние — и с убранного узла:
  // держать его до destroy() ей незачем.
  assert.equal(old.hasAttribute('role'), false, 'удалённый пункт держится записью');
  assert.equal(fresh.getAttribute('role'), 'menuitem');

  w.destroy();

  assert.equal(fresh.hasAttribute('role'), false, 'роль нового пункта осталась после destroy()');
});

test('дропдаун: пункт, вынутый на время открытия и возвращённый тем же узлом, destroy() чистит', () => {
  // Ревью CHU, п. 31: кэш узлов фреймворка, перенос через вынимание.
  const { G, doc } = setup(PARTS);
  const d = detailsDropdown(doc, {}, ['Сделать общим', 'Удалить']);

  G.start();

  const w = G.instance(d.root, 'dropdown');
  const button = d.items[0];
  const li = button.parentNode;

  d.root.open = true;
  d.root.open = false;
  li.remove();
  d.root.open = true;
  d.root.open = false;
  d.list.appendChild(li);
  d.root.open = true;
  d.root.open = false;
  w.destroy();

  assert.equal(button.hasAttribute('role'), false, 'у вернувшегося пункта осталась роль');
  assert.equal(li.hasAttribute('role'), false, 'у вернувшегося <li> осталась роль');
});

test('дропдаун: панель без списка — роль menu у самой панели, destroy() её снимает', () => {
  const { G, doc } = setup(PARTS);
  const summary = el('summary', { class: 'gr-btn' });
  const item = el('button', { class: 'gr-menu-item', type: 'button' });
  const panel = el('div', { class: 'gr-dropdown-panel' }, [item]);
  const root = mount(doc, el('details', { class: 'gr-dropdown', 'data-gr-dropdown': '' }, [summary, panel]));

  G.start();

  assert.equal(panel.getAttribute('role'), 'menu');
  assert.equal(item.getAttribute('role'), 'menuitem');

  G.instance(root, 'dropdown').destroy();

  assert.equal(panel.hasAttribute('role'), false, 'роль панели осталась после destroy()');
  assert.equal(item.hasAttribute('role'), false);
});

test('дропдаун: роль, которую фреймворк поставил пункту после подъёма, открытие и destroy() не трогают', () => {
  // Ревью CHU, п. 33: раздача при каждом открытии сперва возвращала
  // запись к исходному и стирала menuitemradio фреймворка.
  const { G, doc } = setup(PARTS);
  const d = detailsDropdown(doc, {}, ['Светлая', 'Тёмная']);

  G.start();

  const w = G.instance(d.root, 'dropdown');

  d.root.open = true;
  d.root.open = false;
  d.items[0].setAttribute('role', 'menuitemradio');
  d.root.open = true;

  assert.equal(d.items[0].getAttribute('role'), 'menuitemradio', 'открытие перезаписало роль фреймворка');
  assert.equal(d.items[1].getAttribute('role'), 'menuitem');

  w.destroy();

  assert.equal(d.items[0].getAttribute('role'), 'menuitemradio', 'destroy() снял роль фреймворка');
  assert.equal(d.items[1].hasAttribute('role'), false);
});

test('дропдаун: клавиатура — ↓ открывает и ведёт в меню, ↑↓ Home End по пунктам, набор по первой букве', () => {
  const { G, doc } = setup(PARTS);
  const d = detailsDropdown(doc);

  G.start();

  d.summary.focus();
  const down = event('keydown', d.summary, { key: 'ArrowDown' });
  d.summary.dispatchEvent(down);
  assert.equal(d.root.open, true);
  assert.equal(down.defaultPrevented, true);
  assert.equal(doc.activeElement, d.items[0]);

  d.items[0].dispatchEvent(event('keydown', d.items[0], { key: 'ArrowDown' }));
  assert.equal(doc.activeElement, d.items[1]);
  d.items[1].dispatchEvent(event('keydown', d.items[1], { key: 'ArrowDown' }));
  assert.equal(doc.activeElement, d.items[2], 'разделитель не пропущен');
  d.items[2].dispatchEvent(event('keydown', d.items[2], { key: 'ArrowDown' }));
  assert.equal(doc.activeElement, d.items[0], 'по кругу');
  d.items[0].dispatchEvent(event('keydown', d.items[0], { key: 'End' }));
  assert.equal(doc.activeElement, d.items[2]);
  d.items[2].dispatchEvent(event('keydown', d.items[2], { key: 'Home' }));
  assert.equal(doc.activeElement, d.items[0]);

  d.items[0].dispatchEvent(event('keydown', d.items[0], { key: 'у' }));
  assert.equal(doc.activeElement, d.items[2], 'набор по первой букве');

  G.destroy();
});

test('дропдаун на popover: позиция под кнопкой при открытии, Esc прячет', () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const d = popoverDropdown(doc, { 'data-gr-dropdown': 'gap: 4' });

  G.start();

  assert.equal(d.button.getAttribute('aria-expanded'), 'false');

  d.panel.showPopover();
  assert.equal(d.button.getAttribute('aria-expanded'), 'true');
  assert.equal(d.root.getAttribute('data-gr-state'), 'open');
  assert.equal(d.panel.style.getPropertyValue('top'), '136px');
  assert.equal(d.panel.style.getPropertyValue('left'), '100px');

  d.items[0].dispatchEvent(event('keydown', d.items[0], { key: 'Escape' }));
  assert.equal(d.panel.popoverOpen, false);
  assert.equal(d.button.getAttribute('aria-expanded'), 'false');
  // Координаты остаются: панель уходит переходом и не должна прыгать.
  assert.equal(d.panel.style.getPropertyValue('top'), '136px');

  G.instance(d.root, 'dropdown').destroy();
  assert.equal(d.panel.style.getPropertyValue('top'), '', 'координаты не сняты при destroy');

  restore();
  G.destroy();
});

test('дропдаун: наведение с задержкой (мышь), касание — нет; role: none — без ролей', async () => {
  const { G, doc } = setup(PARTS);
  const d = detailsDropdown(doc, { 'data-gr-dropdown': 'hover; delay: 10; hide: 10; role: none' });

  G.start();

  assert.equal(d.list.hasAttribute('role'), false);
  assert.equal(d.summary.hasAttribute('aria-haspopup'), false);

  d.summary.dispatchEvent(event('pointerover', d.summary, { pointerType: 'touch' }));
  await tick(20);
  assert.equal(d.root.open, false);

  d.summary.dispatchEvent(event('pointerover', d.summary, { pointerType: 'mouse' }));
  await tick(20);
  assert.equal(d.root.open, true);

  const outside = mount(doc, el('p'));
  d.panel.dispatchEvent(event('pointerout', d.panel, { pointerType: 'mouse', relatedTarget: outside }));
  await tick(20);
  assert.equal(d.root.open, false);

  G.destroy();
});

// <span class="gr-tooltip-anchor" data-gr-tooltip>
function tooltip(doc, attrs = {}, withPopover = false) {
  const button = el('button', { class: 'gr-btn', type: 'button', 'aria-describedby': 'tip' });
  const tip = el('span', Object.assign({ class: 'gr-tooltip', id: 'tip', role: 'tooltip' }, withPopover ? { popover: 'manual' } : {}));
  const root = mount(doc, el('span', Object.assign({ class: 'gr-tooltip-anchor', 'data-gr-tooltip': '' }, attrs), [button, tip]));
  button.at(300, 300, 80, 32);
  tip.at(0, 0, 120, 24);
  return { root, button, tip };
}

test('подсказка: popover добавляется, показ по наведению с задержкой и по фокусу, позиция над якорем', async () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const t = tooltip(doc, { 'data-gr-tooltip': 'delay: 10; gap: 6' });

  G.start();

  assert.equal(t.tip.getAttribute('popover'), 'manual');
  assert.equal(t.root.getAttribute('data-gr-state'), 'ready');

  t.button.dispatchEvent(event('pointerover', t.button, { pointerType: 'mouse' }));
  assert.equal(!!t.tip.popoverOpen, false, 'показалась без задержки');
  await tick(20);
  assert.equal(t.tip.popoverOpen, true);
  assert.equal(t.root.getAttribute('data-gr-state'), 'open');
  assert.equal(t.tip.style.getPropertyValue('top'), '270px', '300 − 6 − 24');
  assert.equal(t.tip.style.getPropertyValue('left'), '280px', 'по центру кнопки');

  const outside = mount(doc, el('p'));
  t.button.dispatchEvent(event('pointerout', t.button, { pointerType: 'mouse', relatedTarget: outside }));
  assert.equal(t.tip.popoverOpen, false);
  assert.equal(t.root.getAttribute('data-gr-state'), 'ready');

  t.button.dispatchEvent(event('focusin', t.button));
  assert.equal(t.tip.popoverOpen, true, 'фокус показывает сразу');

  doc.fire('keydown', event('keydown', t.button, { key: 'Escape' }));
  assert.equal(t.tip.popoverOpen, false, 'Esc не спрятал');

  t.button.dispatchEvent(event('focusin', t.button));
  t.button.dispatchEvent(event('focusout', t.button, { relatedTarget: outside }));
  assert.equal(t.tip.popoverOpen, false);

  G.destroy();
  assert.equal(t.tip.hasAttribute('popover'), false, 'popover не снят');
  assert.equal(t.root.hasAttribute('data-gr-state'), false);
  assert.equal(t.tip.style.getPropertyValue('top'), '');
  restore();
});

test('подсказка: side: bottom кладёт под якорь; свой popover в разметке остаётся', async () => {
  const { G, doc } = setup(PARTS);
  const restore = wide(doc);
  const t = tooltip(doc, { 'data-gr-tooltip': 'side: bottom; delay: 0; gap: 6' }, true);

  G.start();

  t.button.dispatchEvent(event('focusin', t.button));
  assert.equal(t.tip.style.getPropertyValue('top'), '338px', '300 + 32 + 6');

  G.destroy();
  assert.equal(t.tip.getAttribute('popover'), 'manual', 'атрибут из разметки снят');
  restore();
});
