'use strict';

// Поведение опционального рантайма компонентов на мок-DOM.
// Проверяется одно умение — закрытие <dialog> щелчком по подложке, —
// и все случаи, когда закрывать НЕЛЬЗЯ: их больше, чем случаев «можно»,
// и именно они превращают удобство в потерю введённых данных.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { MockDialog, setupDom, click } = require('./helpers/dom');

const PKG = require('../package.json');
const SRC = readFileSync(path.join(__dirname, '..', 'src', 'griffincss-ui.js'), 'utf8');

// Окно 400×300 в середине экрана 1000×800.
function modal(attrs) {
  return new MockDialog(attrs).at(300, 250, 400, 300);
}

test('версия рантайма компонентов совпадает с версией пакета', () => {
  const { ui } = setupDom();

  assert.equal(ui.version, PKG.version);
  assert.ok(SRC.includes('v' + PKG.version), 'версия в шапке файла тоже обновлена');
});

test('щелчок по подложке закрывает окно с атрибутом', () => {
  const { doc } = setupDom();
  const dialog = modal({ 'data-gr-overlay-close': '' });

  dialog.showModal();
  click(doc, dialog, 80, 80);

  assert.equal(dialog.open, false, 'окно осталось открытым');
  assert.equal(dialog.returnValue, 'overlay', 'причина закрытия не попала в returnValue');
});

test('окно без атрибута щелчком по подложке не закрывается', () => {
  // Поведение включается на самом окне, а не глобально: у окна с формой,
  // где случайный щелчок мимо потерял бы введённое, атрибута просто нет.
  const { doc } = setupDom();
  const dialog = modal();

  dialog.showModal();
  click(doc, dialog, 80, 80);

  assert.equal(dialog.open, true, 'окно закрылось без атрибута');
  assert.equal(dialog.closeCalls, 0);
});

test('щелчок по самому окну ничего не закрывает', () => {
  // Щелчок по подложке приходит на сам <dialog> — цели у неё нет.
  // Отличить одно от другого можно только по координатам.
  const { doc } = setupDom();
  const dialog = modal({ 'data-gr-overlay-close': '' });

  dialog.showModal();
  click(doc, dialog, 500, 400);

  assert.equal(dialog.open, true, 'щелчок внутри окна закрыл его');
});

test('выделение текста, начатое в окне, окно не закрывает', () => {
  // Указатель нажали на тексте внутри окна и отпустили за его краем:
  // click приходит на <dialog> с координатами подложки, но щелчком
  // по подложке это не является.
  const { doc } = setupDom();
  const dialog = modal({ 'data-gr-overlay-close': '' });
  const text = modal();

  dialog.showModal();
  click(doc, dialog, 80, 80, text);

  assert.equal(dialog.open, true, 'окно закрылось на выделении текста');
});

test('щелчок по чужому элементу поверх подложки не трогает окно', () => {
  const { doc } = setupDom();
  const dialog = modal({ 'data-gr-overlay-close': '' });
  const button = modal();

  dialog.showModal();
  click(doc, button, 80, 80);

  assert.equal(dialog.open, true);
});

test('нажатие Enter на кнопке внутри окна не считается щелчком по подложке', () => {
  // Клавиатурный click приходит с координатами 0,0 — формально «вне окна».
  const { doc } = setupDom();
  const dialog = modal({ 'data-gr-overlay-close': '' });

  dialog.showModal();
  click(doc, dialog, 0, 0);

  assert.equal(dialog.open, true, 'окно закрылось от клавиатурного щелчка');
});

test('неотрисованное окно не закрывается', () => {
  // Нулевой прямоугольник — печать, скрытая вкладка, окно без раскладки:
  // координаты сравнивать не с чем, и «вне окна» оказалось бы всё подряд.
  const { doc } = setupDom();
  const dialog = new MockDialog({ 'data-gr-overlay-close': '' });

  dialog.showModal();
  click(doc, dialog, 80, 80);

  assert.equal(dialog.open, true);
});

test('destroy() снимает обработчики, start() ставит их один раз', () => {
  const { doc, ui } = setupDom();

  assert.equal(doc.count('click', false), 1);
  assert.equal(doc.count('pointerdown', true), 1);

  ui.start();
  assert.equal(doc.count('click', false), 1, 'повторный start() удвоил подписку');

  ui.destroy();
  assert.equal(doc.count('click', false), 0);
  assert.equal(doc.count('pointerdown', true), 0);

  const dialog = modal({ 'data-gr-overlay-close': '' });
  dialog.showModal();
  click(doc, dialog, 80, 80);

  assert.equal(dialog.open, true, 'после destroy() окно всё ещё закрывается');
});

test('автостарт откладывается до готовности документа', () => {
  const { doc, ui } = setupDom();

  ui.destroy();
  doc.readyState = 'loading';
  ui._autoStart();

  assert.equal(doc.count('click', false), 0, 'подписка встала до готовности документа');

  doc.fire('DOMContentLoaded', {});
  assert.equal(doc.count('click', false), 1, 'подписка не встала по DOMContentLoaded');
});

test('автостарт отключается атрибутом на теге script', () => {
  const { doc, ui } = setupDom();

  ui.destroy();
  doc.currentScript = { getAttribute: (name) => (name === 'data-auto' ? 'false' : null) };
  ui._autoStart();

  assert.equal(doc.count('click', false), 0, 'data-auto="false" не остановил автостарт');
});

// --- Волна 8c: закрытие крестиком -------------------------------------------

const { el, mount } = require('./helpers/dom');

// Ожидание для тех проверок, где смысл именно во времени: таймер тоста
// и запас на переход ухода.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Перехват предупреждений: рантайм говорит в console.warn там, где
// разметка выглядит рабочей, но сообщение до человека не дойдёт.
function captureWarnings(run) {
  const said = [];
  const original = console.warn;

  console.warn = (message) => said.push(String(message));

  try {
    run();
  } finally {
    console.warn = original;
  }

  return said;
}

test('крестик убирает сообщение из документа, а не прячет его', () => {
  // Скрытое классом сообщение осталось бы в порядке обхода и в озвучке:
  // человек с клавиатуры дошёл бы до текста, которого на экране уже нет.
  const { doc } = setupDom();
  const close = el('button', { 'data-gr-dismiss': '' });
  const alert = mount(doc, el('div', { class: 'gr-alert' }, [close]));

  click(doc, close, 10, 10);

  assert.equal(alert.parentNode, null, 'сообщение осталось в документе');
});

test('крестик закрывает названную цель, если стоит снаружи', () => {
  const { doc } = setupDom();
  const banner = mount(doc, el('div', { class: 'gr-alert', id: 'banner' }));
  const close = mount(doc, el('button', { 'data-gr-dismiss': '#banner' }));

  click(doc, close, 10, 10);

  assert.equal(banner.parentNode, null, 'названная цель не закрылась');
  assert.equal(close.parentNode, doc.body, 'снесло сам крестик');
});

test('крестик без цели ничего не сносит и говорит об этом', () => {
  const { doc } = setupDom();
  const close = mount(doc, el('button', { 'data-gr-dismiss': '' }));

  const said = captureWarnings(() => click(doc, close, 10, 10));

  assert.equal(close.parentNode, doc.body, 'крестик снёс сам себя');
  assert.equal(said.length, 1, `ожидалось одно предупреждение, получено ${said.length}`);
});

// --- Волна 8c: тосты ---------------------------------------------------------

test('тост едет в живую область, объявленную в разметке', () => {
  // Программа чтения с экрана замечает вставку только в область,
  // существовавшую до неё, поэтому регион из разметки предпочтительнее
  // созданного на лету.
  const { doc, ui } = setupDom();
  const region = mount(doc, el('div', {
    class: 'gr-toast-region gr-toast-region-bottom-end',
    'aria-live': 'polite',
    role: 'status',
  }));

  const node = ui.toast('Черновик сохранён', { timeout: 0 });

  assert.equal(node.parentNode, region, 'тост попал не в готовый регион');
  assert.equal(doc.querySelectorAll('.gr-toast-region').length, 1, 'создан лишний регион');
  assert.ok(node.classList.contains('gr-toast'), 'у тоста нет собственного класса');
});

test('ошибке достаётся своя область — та, что перебивает чтение', () => {
  // aria-live="polite" дочитает текущее и только потом сообщит. Потеря
  // данных ждать не может, поэтому у danger регион отдельный.
  const { doc, ui } = setupDom();

  ui.toast('Не удалось сохранить', { status: 'danger', title: 'Ошибка', timeout: 0 });
  ui.toast('Черновик сохранён', { status: 'success', title: 'Готово', timeout: 0 });

  const regions = doc.querySelectorAll('.gr-toast-region');

  assert.equal(regions.length, 2, 'вежливая и срочная области не разделены');

  const urgent = regions.filter((r) => r.getAttribute('aria-live') === 'assertive');

  assert.equal(urgent.length, 1, 'нет срочной области');
  assert.equal(urgent[0].getAttribute('role'), 'alert', 'у срочной области роль не alert');
});

test('статус без слова предупреждает: цвет один статуса не сообщает', () => {
  const { ui } = setupDom();

  const said = captureWarnings(() => ui.toast('Сохранено', { status: 'success', timeout: 0 }));

  assert.equal(said.length, 1, 'тост со статусом и без title прошёл молча');

  const quiet = captureWarnings(() => ui.toast('Сохранено', {
    status: 'success',
    title: 'Готово',
    timeout: 0,
  }));

  assert.equal(quiet.length, 0, 'предупреждение выдано и при заданном title');
});

test('тост уходит по таймеру — сперва движением, потом из документа', async () => {
  const { ui } = setupDom();
  const node = ui.toast('Скопировано', { timeout: 40 });
  const region = node.parentNode;

  await wait(70);

  assert.ok(node.classList.contains('gr-toast-leaving'), 'тост не начал уходить');
  assert.equal(node.parentNode, region, 'тост убран раньше конца движения');

  await wait(300);

  assert.equal(node.parentNode, null, 'тост остался в документе');
});

test('тост без таймера ждёт крестика', async () => {
  // timeout: 0 — то, что нельзя пропустить: ошибка отправки формы
  // или предложение отменить необратимое действие.
  const { doc, ui } = setupDom();
  const node = ui.toast('Заказ отменён', { timeout: 0 });

  await wait(60);

  assert.ok(node.parentNode, 'тост без таймера всё равно исчез');

  const close = node.querySelector('[data-gr-dismiss]');

  assert.ok(close, 'у тоста нет крестика');

  click(doc, close, 10, 10);
  await wait(320);

  assert.equal(node.parentNode, null, 'крестик не убрал тост');
});

test('таймер стоит, пока на тосте указатель', async () => {
  // Сообщение, исчезающее ровно тогда, когда его начали читать
  // или потянулись к ссылке внутри, — не удобство, а ловушка.
  const { doc, ui } = setupDom();
  const node = ui.toast('Файл загружен', { timeout: 50 });
  const inner = node.querySelector('.gr-toast-body');

  doc.fire('pointerover', { target: inner });
  await wait(90);

  assert.ok(!node.classList.contains('gr-toast-leaving'), 'таймер не встал под указателем');

  // Переход между частями одного тоста уходом не считается.
  doc.fire('pointerout', { target: inner, relatedTarget: node });
  await wait(60);

  assert.ok(!node.classList.contains('gr-toast-leaving'), 'переход внутри тоста запустил таймер');

  doc.fire('pointerout', { target: inner, relatedTarget: doc.body });
  await wait(90);

  assert.ok(node.classList.contains('gr-toast-leaving'), 'таймер не пошёл после ухода указателя');
});

// --- Волна 8c: вкладки -------------------------------------------------------

// Ряд вкладок-ссылок с панелями — та самая разметка, которая работает
// и без скрипта.
function tabsMarkup(doc, options = {}) {
  const tabs = ['Первая', 'Вторая', 'Третья'].map((text, i) => {
    const attrs = { class: 'gr-tab', href: `#p${i + 1}` };

    if (i === 0) attrs['aria-current'] = 'true';
    if (options.disabled === i) attrs['aria-disabled'] = 'true';

    const link = el('a', attrs);

    link.textContent = text;

    return el('li', {}, [link]);
  });

  const panels = [1, 2, 3].map((n) => el('section', { class: 'gr-tab-panel', id: `p${n}` }));
  const group = el('div', { class: 'gr-tabs', 'data-gr-tabs': '' }, [
    el('ul', { class: 'gr-tablist' }, tabs),
    ...panels,
  ]);

  mount(doc, group);

  return { group, tabs: group.querySelectorAll('.gr-tab'), panels };
}

test('скрипт добавляет роли и прячет неактивные панели атрибутом', () => {
  const { doc, ui } = setupDom();
  const { group, tabs, panels } = tabsMarkup(doc);

  ui.tabs();

  assert.equal(group.querySelector('.gr-tablist').getAttribute('role'), 'tablist');
  assert.equal(tabs[0].getAttribute('role'), 'tab');
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true', 'aria-current не стал выбором');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'false');

  // aria-current снят: иначе вкладка объявлялась бы и текущей страницей,
  // и выбранной вкладкой сразу.
  assert.equal(tabs[0].hasAttribute('aria-current'), false, 'aria-current остался на вкладке');

  // Roving tabindex: Tab выводит из ряда, а не идёт по всем его пунктам.
  assert.equal(tabs[0].getAttribute('tabindex'), '0');
  assert.equal(tabs[1].getAttribute('tabindex'), '-1');

  assert.equal(panels[0].hasAttribute('hidden'), false, 'активная панель спрятана');
  assert.equal(panels[1].hasAttribute('hidden'), true, 'неактивная панель видна');
  assert.equal(panels[0].getAttribute('role'), 'tabpanel');
  assert.equal(panels[0].getAttribute('aria-labelledby'), tabs[0].getAttribute('id'));
  assert.equal(panels[0].getAttribute('tabindex'), '0', 'панель не принимает фокус');
});

test('стрелки листают ряд по кругу и уводят фокус за собой', () => {
  const { doc, ui } = setupDom();
  const { tabs, panels } = tabsMarkup(doc);

  ui.tabs();

  const key = (target, name) => {
    let prevented = 0;

    doc.fire('keydown', { target, key: name, preventDefault: () => { prevented += 1; } });

    return prevented;
  };

  assert.equal(key(tabs[0], 'ArrowRight'), 1, 'стрелка не перехвачена');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true', 'вторая вкладка не выбрана');
  assert.equal(tabs[1].focusCalls, 1, 'фокус не ушёл на выбранную вкладку');
  assert.equal(panels[1].hasAttribute('hidden'), false, 'панель второй вкладки не открылась');
  assert.equal(panels[0].hasAttribute('hidden'), true, 'панель первой вкладки осталась открытой');

  key(tabs[1], 'End');
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true', 'End не привёл к последней');

  // Ряд замкнут: с последней вкладки стрелка вправо возвращает к первой.
  key(tabs[2], 'ArrowRight');
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true', 'ряд не замкнут');

  key(tabs[0], 'Home');
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true', 'Home сдвинул выбор');
});

test('отключённая вкладка пропускается, а не выбирается', () => {
  const { doc, ui } = setupDom();
  const { tabs } = tabsMarkup(doc, { disabled: 1 });

  ui.tabs();
  doc.fire('keydown', { target: tabs[0], key: 'ArrowRight', preventDefault: () => {} });

  assert.equal(tabs[1].getAttribute('aria-selected'), 'false', 'выбрана отключённая вкладка');
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true', 'стрелка не перешагнула отключённую');
});

test('щелчок по вкладке-ссылке переключает панель, а не уводит к якорю', () => {
  // Прыжок по якорю сдвинул бы ряд вкладок за верхний край экрана —
  // человек нажал на заголовок и потерял его из виду.
  const { doc, ui } = setupDom();
  const { tabs, panels } = tabsMarkup(doc);

  ui.tabs();

  let prevented = 0;

  doc.fire('pointerdown', { target: tabs[2], clientX: 10, clientY: 10 });
  doc.fire('click', {
    target: tabs[2],
    clientX: 10,
    clientY: 10,
    preventDefault: () => { prevented += 1; },
  });

  assert.equal(prevented, 1, 'переход по якорю не отменён');
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true', 'вкладка не выбрана щелчком');
  assert.equal(panels[2].hasAttribute('hidden'), false, 'панель не открылась');

  // Фокус щелчком не переносится: он и так уже там, где щёлкнули.
  assert.equal(tabs[2].focusCalls, 0, 'щелчок дополнительно двигает фокус');
});

// --- Этап 18: события компонентов --------------------------------------------

test('переключение вкладки шлёт griffincss:tabchange с индексом', () => {
  const { doc, ui } = setupDom();
  const { tabs } = tabsMarkup(doc);

  ui.tabs();

  const events = [];

  doc.addEventListener('griffincss:tabchange', (e) => events.push(e.detail.index));

  doc.fire('pointerdown', { target: tabs[1], clientX: 10, clientY: 10 });
  doc.fire('click', { target: tabs[1], clientX: 10, clientY: 10, preventDefault: () => {} });

  assert.deepEqual(events, [1], 'одно событие с индексом новой вкладки');
});

test('инициализация вкладок griffincss:tabchange не шлёт', () => {
  const { doc, ui } = setupDom();

  tabsMarkup(doc);

  const events = [];

  doc.addEventListener('griffincss:tabchange', () => events.push(1));

  ui.tabs();

  assert.equal(events.length, 0, 'выбор при инициализации — не действие пользователя');
});

test('показ тоста шлёт griffincss:toast со статусом', () => {
  const { doc, ui } = setupDom();
  const events = [];

  doc.addEventListener('griffincss:toast', (e) => events.push(e.detail.status));

  ui.toast('Готово', { status: 'success', title: 'Ок', timeout: 0 });

  assert.deepEqual(events, ['success']);
});
