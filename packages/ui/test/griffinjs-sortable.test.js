'use strict';

// Сортируемая таблица GriffinJS на мок-DOM: перестановка строк, круг
// состояний в aria-sort и сравнение по типу значения.
//
// Проверяется именно то, ради чего виджет заведён: состояние живёт
// в aria-sort и больше нигде, сортировка стабильна, числа сравниваются
// числами, а буквы — Intl.Collator с локалью документа.

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event } = require('./helpers/griffinjs-dom');

const PARTS = ['core/options.js', 'core/registry.js', 'widgets/sortable.js'];

// Ячейка: текст для человека, необязательное значение для сортировки.
function cell(tag, text, attrs = {}) {
  const node = el(tag, attrs);

  node.textContent = text;

  return node;
}

// Таблица: heads — [текст] или [[текст, значение aria-sort]], body — строки
// ячеек, каждая ячейка — строка или [текст, data-gr-sort-value].
function table(doc, heads, body, attrs = {}) {
  const ths = heads.map((head) => {
    const [text, sort] = Array.isArray(head) ? head : [head, 'none'];

    return cell('th', text, sort === null ? { scope: 'col' } : { scope: 'col', 'aria-sort': sort });
  });

  const rows = body.map((cells) => el('tr', {}, cells.map((value) => (
    Array.isArray(value)
      ? cell('td', value[0], { 'data-gr-sort-value': value[1] })
      : cell('td', value)
  ))));

  return mount(doc, el('table', Object.assign({ class: 'gr-table', 'data-gr-sortable': '' }, attrs), [
    el('thead', {}, [el('tr', {}, ths)]),
    el('tbody', {}, rows),
  ]));
}

const headOf = (node, i = 0) => node.querySelector('thead').children[0].children[i];
const column = (node, i = 0) => node.querySelector('tbody').children.map((row) => row.children[i].textContent);
const click = (th) => th.dispatchEvent(event('click', th));

test('щелчок по заголовку переставляет строки, aria-sort идёт по кругу', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город'], [['Пермь'], ['Азов'], ['Ростов']]);
  const th = headOf(node);

  G.start();

  assert.ok(G.instance(node, 'sortable'), 'виджет не поднялся');
  assert.equal(th.getAttribute('aria-sort'), 'none');
  assert.deepEqual(column(node), ['Пермь', 'Азов', 'Ростов'], 'строки переставлены до нажатия');

  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'ascending');
  assert.deepEqual(column(node), ['Азов', 'Пермь', 'Ростов']);

  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'descending');
  assert.deepEqual(column(node), ['Ростов', 'Пермь', 'Азов']);

  // Третье нажатие замыкает круг и возвращает порядок, в котором таблица
  // пришла: иначе отменить сортировку нечем, кроме перезагрузки страницы.
  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'none');
  assert.deepEqual(column(node), ['Пермь', 'Азов', 'Ростов']);

  G.destroy();
});

test('числа сравниваются числами, равные строки сохраняют порядок', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Заказ', 'Сумма'], [
    ['A', '9'], ['B', '10'], ['C', '9'], ['D', '100'],
  ]);
  const th = headOf(node, 1);

  G.start();
  click(th);

  // Строкой «10» меньше «9»: столбец, сравненный как текст, дал бы
  // 10, 100, 9, 9 — и таблица чисел стала бы бесполезной.
  assert.deepEqual(column(node, 1), ['9', '9', '10', '100']);

  // Стабильность: у двух девяток свой порядок был A, C — он и остался.
  assert.deepEqual(column(node, 0), ['A', 'C', 'B', 'D']);

  click(th);
  assert.deepEqual(column(node, 1), ['100', '10', '9', '9']);
  assert.deepEqual(column(node, 0), ['D', 'B', 'A', 'C'], 'при развороте равные строки перемешались');

  G.destroy();
});

test('значение берётся из data-gr-sort-value, а текст остаётся человеку', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Позиция', 'Сумма'], [
    [['Кресло «Дюна»'], ['24 800 ₽', '24800']],
    [['Торшер «Свет»'], ['999 ₽', '999']],
    [['Полка «Норд»'], ['113 200 ₽', '113200']],
  ]);

  G.start();
  click(headOf(node, 1));

  // Данные подобраны так, что порядок по значению и порядок по тексту
  // РАСХОДЯТСЯ: коллатор с numeric:true сравнил бы первые числовые куски
  // 113, 24, 999 и дал «113 200, 24 800, 999». Совпадай эти порядки —
  // тест проходил бы и на виджете, который атрибута не читает вовсе.
  assert.deepEqual(column(node, 1), ['999 ₽', '24 800 ₽', '113 200 ₽']);

  G.destroy();
});

test('столбец из чисел и слов сравнивается как слова — тип решается по всем ячейкам', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Остаток'], [['10'], ['под заказ'], ['9']]);

  G.start();
  click(headOf(node));

  // Сравнение «числа с числом, буквы с буквами» на каждой паре не даёт
  // порядка вовсе, поэтому тип столбца решается один раз. Коллатор
  // с numeric:true при этом ставит 9 перед 10, а не после.
  assert.deepEqual(column(node), ['9', '10', 'под заказ']);

  G.destroy();
});

test('сортируемый столбец найден по своему месту, а не по первому попавшемуся', () => {
  const { G, doc } = setup(PARTS);
  // Несортируемый столбец стоит ПЕРВЫМ: ошибка в счёте позиций тут же даст
  // сортировку не того столбца.
  const node = table(doc, [['Действия', null], 'Сумма'], [
    ['✎', '10'], ['✎', '9'], ['✎', '100'],
  ]);

  G.start();
  click(headOf(node, 1));

  assert.deepEqual(column(node, 1), ['9', '10', '100']);

  G.destroy();
});

test('буквы сравниваются с локалью документа, а не кодами символов', () => {
  const { G, doc } = setup(PARTS);

  doc.documentElement.setAttribute('lang', 'ru');

  const node = table(doc, ['Товар'], [['Яблоко'], ['Ёлка'], ['Апельсин']]);

  G.start();
  click(headOf(node));

  // Ё в Юникоде стоит ПЕРЕД А (U+0401 против U+0410): сравнение кодами
  // подняло бы «Ёлку» на первое место. Русский алфавит ставит её седьмой.
  assert.deepEqual(column(node), ['Апельсин', 'Ёлка', 'Яблоко']);

  G.destroy();
});

test('ISO-дата сортируется датой, а не строкой', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Выпуск'], [['2026-08-30'], ['2026-12-01'], ['2026-08-05']]);

  G.start();
  click(headOf(node));

  assert.deepEqual(column(node), ['2026-08-05', '2026-08-30', '2026-12-01']);

  G.destroy();
});

test('пустые ячейки уходят в конец в обе стороны', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Склад'], [['12'], [''], ['3'], ['']]);

  G.start();

  const th = headOf(node);

  click(th);
  assert.deepEqual(column(node), ['3', '12', '', '']);

  // Пустая ячейка не значит «меньше всех»: наверху списка она заслоняла бы
  // данные, ради которых столбец и сортируют.
  click(th);
  assert.deepEqual(column(node), ['12', '3', '', '']);

  G.destroy();
});

test('сортируется один столбец: соседний возвращается в «нет»', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город', 'Индекс'], [['Пермь', '3'], ['Азов', '1'], ['Ростов', '2']]);
  const city = headOf(node, 0);
  const index = headOf(node, 1);

  G.start();

  click(city);
  assert.equal(city.getAttribute('aria-sort'), 'ascending');

  click(index);
  assert.equal(index.getAttribute('aria-sort'), 'ascending');
  assert.equal(city.getAttribute('aria-sort'), 'none', 'два столбца объявлены отсортированными сразу');
  assert.deepEqual(column(node, 1), ['1', '2', '3']);

  G.destroy();
});

test('заголовок без aria-sort не сортирует ничего', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город', ['Действия', null]], [['Пермь', '✎'], ['Азов', '✎']]);
  const actions = headOf(node, 1);

  G.start();

  click(actions);

  assert.equal(actions.hasAttribute('aria-sort'), false, 'виджет объявил сортируемым столбец действий');
  assert.equal(actions.hasAttribute('tabindex'), false);
  assert.deepEqual(column(node), ['Пермь', 'Азов']);

  G.destroy();
});

test('клавиатура: заголовок получает tabindex, Enter и пробел сортируют', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город'], [['Пермь'], ['Азов'], ['Ростов']]);
  const th = headOf(node);

  G.start();

  assert.equal(th.getAttribute('tabindex'), '0', 'до заголовка не добраться с клавиатуры');

  // Признак «скрипт поднялся»: на нём в CSS держатся курсор и подсказка
  // «столбец сортируется».
  assert.equal(node.getAttribute('data-gr-state'), 'ready');

  const enter = event('keydown', th, { key: 'Enter' });

  th.dispatchEvent(enter);
  assert.equal(th.getAttribute('aria-sort'), 'ascending');
  assert.equal(enter.defaultPrevented, true, 'нажатие не перехвачено — пробел прокрутит страницу');

  th.dispatchEvent(event('keydown', th, { key: ' ' }));
  assert.equal(th.getAttribute('aria-sort'), 'descending');

  // Прочие клавиши виджету не принадлежат.
  th.dispatchEvent(event('keydown', th, { key: 'a' }));
  assert.equal(th.getAttribute('aria-sort'), 'descending');

  G.destroy();
});

test('своя кнопка в заголовке остаётся единственной точкой входа', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город'], [['Пермь'], ['Азов']]);
  const th = headOf(node);
  const button = el('button', { type: 'button' });

  button.textContent = 'Город';
  th.textContent = '';
  th.appendChild(button);

  G.start();

  // Автор поставил кнопку по APG — второго места фокуса в той же ячейке
  // быть не должно: Tab останавливался бы дважды на одном заголовке.
  assert.equal(th.hasAttribute('tabindex'), false, 'виджет добавил tabindex поверх авторской кнопки');

  button.dispatchEvent(event('click', button));
  assert.equal(th.getAttribute('aria-sort'), 'ascending', 'щелчок по кнопке не всплыл до таблицы');

  // Нажатие на кнопке платформа сама превращает в щелчок, поэтому свой
  // обработчик клавиш обязан промолчать — иначе сортировка сработает дважды
  // и вернётся на место.
  th.dispatchEvent(event('keydown', button, { key: 'Enter' }));
  assert.equal(th.getAttribute('aria-sort'), 'ascending', 'нажатие на кнопке отсортировало второй раз');

  G.destroy();
});

test('ссылка-сноска в заголовке не отнимает у столбца клавиатуру', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Сумма'], [['2'], ['1']]);
  const th = headOf(node);

  th.appendChild(el('a', { href: '#прим-1' }));

  G.start();

  // Исключение сделано для кнопки — органа сортировки. Сноска им не является,
  // и отнимать из-за неё клавиатуру у всего столбца нельзя.
  assert.equal(th.getAttribute('tabindex'), '0');

  G.destroy();
});

test('таблица, отсортированная сервером, продолжается с объявленного места', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, [['Город', 'ascending']], [['Азов'], ['Пермь'], ['Ростов']]);
  const th = headOf(node);

  G.start();

  // Сервер уже отсортировал и сказал об этом в разметке: строки трогать
  // не за чем, а первое нажатие обязано дать разворот, а не повтор.
  assert.deepEqual(column(node), ['Азов', 'Пермь', 'Ростов']);

  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'descending');
  assert.deepEqual(column(node), ['Ростов', 'Пермь', 'Азов']);

  G.destroy();
});

test('объявленная сервером сортировка по убыванию разворачивается первым нажатием', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, [['Сумма', 'descending']], [['300'], ['200'], ['100']]);
  const th = headOf(node);

  G.start();

  // «Снять сортировку» здесь вернуло бы ТОТ ЖЕ порядок: нажатие выглядело бы
  // сломанным, а aria-sort сообщал бы «не отсортирована» об отсортированной
  // таблице. Круг из трёх состояний замыкается только там, где порядок
  // навёл сам виджет.
  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'ascending');
  assert.deepEqual(column(node), ['100', '200', '300']);

  // Дальше — обычный круг: виджет теперь хозяин порядка.
  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'descending');
  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'none');
  assert.deepEqual(column(node), ['300', '200', '100']);

  G.destroy();
});

test('непригодный тег локали не отнимает сортировку целиком', () => {
  const { G, doc } = setup(PARTS);

  // «ru_RU» приходит из серверной локали и валидным тегом BCP 47 не является:
  // Intl.Collator на нём бросает исключение. Виджет обязан сравнивать
  // по умолчанию движка, а не отваливаться вместе с сортировкой.
  doc.documentElement.setAttribute('lang', 'ru_RU');

  const node = table(doc, ['Город'], [['Пермь'], ['Азов'], ['Ростов']]);
  const warnings = [];
  const before = console.warn;

  console.warn = (message) => warnings.push(message);

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.ok(G.instance(node, 'sortable'), `виджет не поднялся: ${warnings.join(' | ')}`);

  click(headOf(node));
  assert.deepEqual(column(node), ['Азов', 'Пермь', 'Ростов']);

  G.destroy();
});

test('заменённое целиком тело таблицы сортируется, а не молча пропускается', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город'], [['Пермь'], ['Азов']]);
  const th = headOf(node);

  G.start();

  // Страница дозагрузила данные и заменила <tbody> целиком. Запомненная
  // ссылка сортировала бы узел, которого в документе больше нет, — при
  // честном на вид aria-sort.
  node.querySelector('tbody').remove();

  const fresh = el('tbody', {}, [
    el('tr', {}, [cell('td', 'Яровое')]),
    el('tr', {}, [cell('td', 'Азов')]),
  ]);

  node.appendChild(fresh);

  click(th);
  assert.equal(th.getAttribute('aria-sort'), 'ascending');
  assert.deepEqual(column(node), ['Азов', 'Яровое']);

  G.destroy();
});

test('строка, добавленная после подъёма, не теряется при возврате в «нет»', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город'], [['Пермь'], ['Азов']]);
  const th = headOf(node);
  const body = node.querySelector('tbody');

  G.start();

  const extra = el('tr', {}, [cell('td', 'Тверь')]);

  body.appendChild(extra);

  click(th);
  assert.deepEqual(column(node), ['Азов', 'Пермь', 'Тверь']);

  click(th);
  click(th);

  // Снимок исходного порядка сделан до вставки: строки из него встают
  // на свои места, а незнакомая уходит в конец — но не исчезает.
  assert.deepEqual(column(node), ['Пермь', 'Азов', 'Тверь']);

  G.destroy();
});

test('destroy возвращает и порядок строк, и разметку заголовков', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, ['Город'], [['Пермь'], ['Азов'], ['Ростов']]);
  const th = headOf(node);

  G.start();
  click(th);

  assert.deepEqual(column(node), ['Азов', 'Пермь', 'Ростов']);

  G.destroy();

  // Всё, что рантайм поставил, снимается: иначе таблица остаётся
  // отсортированной, а aria-sort говорит «не отсортирована».
  assert.equal(th.getAttribute('aria-sort'), 'none');
  assert.equal(th.hasAttribute('tabindex'), false);
  assert.equal(node.hasAttribute('data-gr-state'), false);
  assert.deepEqual(column(node), ['Пермь', 'Азов', 'Ростов']);
});

test('таблица без сортируемых заголовков не поднимает виджет молча', () => {
  const { G, doc } = setup(PARTS);
  const node = table(doc, [['Город', null]], [['Пермь']]);
  const warnings = [];
  const before = console.warn;

  console.warn = (message) => warnings.push(message);

  try {
    G.start();
  } finally {
    console.warn = before;
  }

  assert.equal(G.instance(node, 'sortable'), null, 'виджет поднялся на таблице без aria-sort');
  assert.equal(warnings.length, 1, `предупреждений — ${warnings.length}`);
  assert.match(warnings[0], /sortable/);

  G.destroy();
});
