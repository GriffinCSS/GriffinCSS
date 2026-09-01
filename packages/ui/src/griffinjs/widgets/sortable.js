/*
 * GriffinJS — сортируемая таблица: перестановка строк по признаку,
 * объявленному в разметке.
 *
 *   <table class="gr-table" data-gr-sortable>
 *     <thead>
 *       <tr>
 *         <th scope="col" aria-sort="none">Город</th>
 *         <th scope="col" aria-sort="none">Сумма</th>
 *         <th scope="col">Действия</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr><td>Пермь</td><td data-gr-sort-value="24800">24 800 ₽</td><td>…</td></tr>
 *     </tbody>
 *   </table>
 *
 * Сортируются столбцы, у заголовка которых есть aria-sort, и только они:
 * у колонки действий сортировать нечего. Атрибут — единственное место,
 * где живёт состояние: его читают человек (через программу чтения),
 * указатель направления в CSS и сам виджет. Ни класса, ни своего
 * атрибута данных при нём нет, потому что второй источник правды
 * расходится с первым на третьем нажатии.
 *
 * Отсюда же бесплатно получается серверная сортировка: таблица, пришедшая
 * с aria-sort="ascending", уже отсортирована — виджет строки не трогает,
 * а первое нажатие даёт разворот, а не повтор.
 *
 * Значение берётся из data-gr-sort-value, иначе — из текста ячейки.
 * Числа и ISO-даты сравниваются числами, остальное — Intl.Collator
 * с локалью из lang документа: в русском «Ёлка» стоит между «Апельсином»
 * и «Яблоком», а по кодам символов она обгоняет обоих. Сортировка
 * стабильная (Array.prototype.sort по спецификации с ES2019): равные
 * строки сохраняют порядок, иначе повторное нажатие перемешивало бы их
 * и таблица выглядела бы сломанной.
 *
 * Чего виджет НЕ делает: пагинации, фильтрации, серверной сортировки,
 * выбора строк, изменения ширины колонок и запоминания порядка. Каждый
 * пункт выглядит на полчаса работы — и каждый превращает перестановку
 * строк в приложение. Своего события он не шлёт по той же причине:
 * обработчику здесь нечего делать, кроме перечисленного.
 *
 * База без JS: обычная таблица. Заголовок не получает ни tabindex,
 * ни курсора — предлагать нажатие, которое ничего не сделает, нельзя;
 * указатель рисуется только у названного направления. Разметку виджет
 * не переписывает — как и все контроллеры слоя, он ставит атрибуты
 * и снимает их в destroy().
 */
(function (G) {
  'use strict';

  // Круг состояний. Третье нажатие возвращает порядок, в котором таблица
  // пришла: отменить сортировку иначе нечем, кроме перезагрузки страницы.
  var NEXT = { none: 'ascending', ascending: 'descending', descending: 'none' };

  var ISO = /^\d{4}-\d{2}-\d{2}/;

  // Число из ячейки: ISO-дата — временем, остальное — как понимает Number().
  // Всё прочее даёт NaN и уводит столбец в буквы. Десятичная запятая сюда
  // намеренно не входит: «1,234» — это тысяча двести тридцать четыре
  // в английском форматировании и одна целая в русском, и угадывать,
  // какое из двух имел в виду автор, значит отвечать неверно молча.
  // Форматированное число приходит через data-gr-sort-value.
  function toNumber(text) {
    return ISO.test(text) ? Date.parse(text) : Number(text);
  }

  // Строки тела: только TR, потому что children отдаёт и текстовые узлы
  // мок-DOM, и подписи, которые автор мог положить рядом.
  function rowsOf(body) {
    var out = [];

    for (var i = 0; i < body.children.length; i++) {
      if (body.children[i].tagName === 'TR') out.push(body.children[i]);
    }

    return out;
  }

  G.defineWidget('sortable', function (el) {
    var head = el.querySelector('thead');
    var heads = head ? head.querySelectorAll('th[aria-sort]') : [];

    // Тело ищется каждый раз заново: страница могла заменить <tbody>
    // целиком, дозагрузив данные, и запомненная ссылка сортировала бы
    // узел, которого в документе больше нет, — молча и с честным
    // на вид aria-sort.
    function bodyOf() {
      return el.querySelector('tbody');
    }

    if (!bodyOf() || !heads.length) throw new Error('нужны tbody и заголовки с aria-sort');

    var attrs = G.recorder();
    var events = G.listeners();
    var collator;

    try {
      collator = new Intl.Collator(document.documentElement.getAttribute('lang') || undefined, { numeric: true });
    } catch (e) {
      // Непригодный тег локали — частый гость там, где lang приходит
      // из серверной локали («ru_RU»). Это не повод терять сортировку
      // целиком: сравниваем по умолчанию движка.
      collator = new Intl.Collator(undefined, { numeric: true });
    }

    // Порядок, в котором таблица пришла: к нему возвращает третье нажатие.
    var initial = rowsOf(bodyOf());

    // Столбец, порядок которого навёл сам виджет. Пока его нет, объявленная
    // в разметке сортировка принадлежит серверу.
    var sorted = null;

    for (var i = 0; i < heads.length; i++) {
      // Кнопку в заголовке виджет не заводит: разметку компонента слой
      // не переписывает. Если её поставил автор — по образцу WAI-ARIA, —
      // второе место фокуса в той же ячейке не нужно: Tab останавливался
      // бы на одном заголовке дважды. Ссылка таким исключением НЕ считается:
      // сноска в заголовке — не орган сортировки, и отнимать из-за неё
      // клавиатуру у всего столбца нельзя.
      if (!heads[i].querySelector('button')) attrs.set(heads[i], 'tabindex', '0');
    }

    // Курсор и запрет выделения CSS даёт только под скриптом, и признак
    // этого — состояние на таблице.
    attrs.set(el, 'data-gr-state', 'ready');

    function place(rows) {
      var body = bodyOf();

      for (var i = 0; i < rows.length; i++) body.appendChild(rows[i]);
    }

    // Возврат к исходному порядку. Строки, вставленные после подъёма
    // (страница дозагрузила данные), в снимке не значатся — они уходят
    // в конец, но не теряются: снимок здесь не список выживших.
    function restore() {
      var live = rowsOf(bodyOf());
      var out = [];
      var i;

      for (i = 0; i < initial.length; i++) {
        if (live.indexOf(initial[i]) !== -1) out.push(initial[i]);
      }

      for (i = 0; i < live.length; i++) {
        if (out.indexOf(live[i]) === -1) out.push(live[i]);
      }

      place(out);
    }

    function keyOf(row, at) {
      var cell = row.children[at];

      if (!cell) return '';

      var value = cell.getAttribute('data-gr-sort-value');

      return String(value === null ? cell.textContent : value).trim();
    }

    function sort(th, dir) {
      var i;

      // Отсортированным объявлен один столбец: два aria-sort сразу —
      // это обещание сортировки по двум ключам, которой здесь нет.
      for (i = 0; i < heads.length; i++) {
        attrs.set(heads[i], 'aria-sort', heads[i] === th ? dir : 'none');
      }

      sorted = dir === 'none' ? null : th;

      if (dir === 'none') return restore();

      var at = [].indexOf.call(th.parentNode.children, th);
      var rows = rowsOf(bodyOf());
      var numeric = true;
      var keys = [];

      // Тип столбца решается один раз и по всем ячейкам: сравнение
      // «числа с числом, буквы с буквами» на каждой паре не давало бы
      // порядка вовсе — сортировать по нему нечего.
      for (i = 0; i < rows.length; i++) {
        keys.push(keyOf(rows[i], at));

        if (keys[i] !== '' && isNaN(toNumber(keys[i]))) numeric = false;
      }

      var pairs = rows.map(function (row, at2) {
        return { row: row, key: keys[at2], num: numeric ? toNumber(keys[at2]) : 0 };
      });
      var sign = dir === 'descending' ? -1 : 1;

      pairs.sort(function (a, b) {
        // Пустая ячейка не значит «меньше всех»: наверху списка она
        // заслоняла бы данные, ради которых столбец и сортируют.
        // Поэтому пустые уходят в конец в обе стороны.
        if (a.key === '') return b.key === '' ? 0 : 1;
        if (b.key === '') return -1;

        return sign * (numeric ? a.num - b.num : collator.compare(a.key, b.key));
      });

      place(pairs.map(function (pair) { return pair.row; }));
    }

    // Заголовок, которому принадлежит событие: щелчок мог прийти
    // из ссылки или кнопки внутри ячейки.
    function headOf(node) {
      var th = G.closest(node, 'th');

      return th && [].indexOf.call(heads, th) !== -1 ? th : null;
    }

    function onClick(event) {
      var th = headOf(event.target);

      if (!th) return;

      var now = th.getAttribute('aria-sort');

      // Круг из трёх состояний замыкается только там, где порядок навёл сам
      // виджет. У столбца, объявленного сервером, «снять сортировку» вернуло
      // бы ТОТ ЖЕ порядок: нажатие выглядело бы сломанным, а aria-sort
      // сообщал бы «не отсортирована» об отсортированной таблице. Поэтому
      // первое нажатие по такому столбцу — всегда разворот.
      sort(th, sorted === th ? NEXT[now] || 'ascending' : (now === 'ascending' ? 'descending' : 'ascending'));
    }

    function onKey(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      // Только сам заголовок: если в ячейке кнопка автора, нажатие
      // превратит в щелчок платформа, и сортировка сработала бы дважды.
      if (headOf(event.target) !== event.target) return;

      // Иначе пробел прокрутит страницу под уже уехавшей таблицей.
      event.preventDefault();
      onClick(event);
    }

    events.add(el, 'click', onClick);
    events.add(el, 'keydown', onKey);

    return {
      el: el,
      sort: sort,
      destroy: function () {
        events.removeAll();
        attrs.restore();
        restore();
      }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
