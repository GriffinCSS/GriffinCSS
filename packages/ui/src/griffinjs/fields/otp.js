/*
 * GriffinJS — одноразовый код: маска, разложенная по ячейкам.
 *
 *   <div class="gr-otp" role="group" aria-label="Код из СМС" data-gr-otp>
 *     <input class="gr-input gr-otp-cell" type="text" inputmode="numeric"
 *            maxlength="1" name="code[]" autocomplete="one-time-code" aria-label="Знак 1">
 *     … ещё пять таких же
 *   </div>
 *
 * База без скрипта — ряд ячеек maxlength="1": заполняются вручную,
 * каждая уходит в форму своим значением. Скрипт добавляет то, что
 * платформа сама не делает: набранный знак переводит фокус в следующую
 * ячейку, Backspace на пустой возвращает в предыдущую и чистит её, стрелки
 * ходят по ряду, а код из буфера или из автозаполнения — целиком в одну
 * ячейку — раскладывается по всем, начиная с неё. Когда все ячейки
 * заполнены, уходит событие griffin:complete со значением.
 *
 * autocomplete="one-time-code" на первой ячейке продолжает работать:
 * подсказку над клавиатурой показывает платформа, а вписанный ею код
 * виджет раскладывает так же, как вставленный.
 *
 * Цифровые ячейки (inputmode="numeric") принимают только цифры.
 */
(function (G) {
  'use strict';

  // Текст из буфера или автозаполнения → знаки по ячейкам. Пробелы, дефисы
  // и слова вокруг кода («Код: 4321») отбрасываются; лишнее — тоже.
  function split(text, count, digits) {
    var clean = String(text || '').replace(digits ? /\D/g : /[\s-]/g, '');

    return clean.slice(0, count).split('');
  }

  G.defineWidget('otp', function (el) {
    var cells = el.querySelectorAll('input');

    if (!cells.length) throw new Error('внутри нет ни одной ячейки <input>');

    var attrs = G.recorder();
    var events = G.listeners();
    var digits = (cells[0].getAttribute('inputmode') || '').indexOf('numeric') !== -1;
    var complete = false;

    function indexOf(cell) {
      for (var i = 0; i < cells.length; i++) if (cells[i] === cell) return i;

      return -1;
    }

    function value() {
      var out = '';

      for (var i = 0; i < cells.length; i++) out += cells[i].value || '';

      return out;
    }

    function focus(i) {
      var cell = cells[Math.max(0, Math.min(cells.length - 1, i))];

      if (typeof cell.focus === 'function') cell.focus();
      if (typeof cell.select === 'function') cell.select();
    }

    function sync() {
      var filled = 0;

      for (var i = 0; i < cells.length; i++) if (cells[i].value) filled++;

      attrs.set(el, 'data-gr-state', !filled ? 'empty' : filled === cells.length ? 'complete' : 'partial');

      var done = filled === cells.length;

      if (done && !complete) G.emit('griffin:complete', el, { value: value() });

      complete = done;
    }

    // Знаки ложатся по ячейкам, начиная с from; фокус — в следующую
    // за последней заполненной.
    function place(from, chars) {
      for (var i = 0; i < chars.length && from + i < cells.length; i++) cells[from + i].value = chars[i];

      focus(from + chars.length);
      sync();
    }

    // Несколько знаков одной правкой — автозаполнение или вставка мимо
    // paste: maxlength="1" срезал бы их до первого ещё до input, поэтому
    // перехват здесь, и раскладка по ячейкам — своя.
    function onBeforeInput(event) {
      var at = indexOf(event.target);
      var data = event.data || '';

      if (at === -1 || data.length < 2) return;

      var chars = split(data, cells.length - at, digits);

      if (!chars.length) return;

      event.preventDefault();
      place(at, chars);
    }

    function onInput(event) {
      var cell = event.target;
      var at = indexOf(cell);

      if (at === -1) return;

      var chars = split(cell.value, cells.length - at, digits);

      if (chars.length > 1) {
        // Целый код в одну ячейку мимо beforeinput.
        place(at, chars);
        return;
      }

      cell.value = chars[0] || '';

      if (chars.length) focus(at + 1);

      sync();
    }

    function onKeyDown(event) {
      var cell = event.target;
      var at = indexOf(cell);

      if (at === -1) return;

      // Знак поверх занятой ячейки: maxlength не пустил бы его, а WebKit
      // ещё и не заменяет выделенное — кладётся своими руками.
      if (cell.value && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        place(at, split(event.key, 1, digits));
        return;
      }

      if (event.key === 'Backspace' && !cell.value && at > 0) {
        cells[at - 1].value = '';
        focus(at - 1);
        sync();
        event.preventDefault();
      } else if (event.key === 'ArrowLeft' && at > 0) {
        focus(at - 1);
        event.preventDefault();
      } else if (event.key === 'ArrowRight' && at < cells.length - 1) {
        focus(at + 1);
        event.preventDefault();
      }
    }

    function onPaste(event) {
      var at = indexOf(event.target);
      var text = event.clipboardData ? event.clipboardData.getData('text') : '';
      var chars = at === -1 ? [] : split(text, cells.length - at, digits);

      if (!chars.length) return;

      event.preventDefault();
      place(at, chars);
    }

    // Фокус в ячейке выделяет её знак: набранный ложится вместо него,
    // а не упирается в maxlength. И по щелчку тоже: WebKit после фокуса
    // ставит каретку в точку щелчка и снимает выделение.
    function onFocus(event) {
      if (indexOf(event.target) !== -1 && typeof event.target.select === 'function') event.target.select();
    }

    events.add(el, 'beforeinput', onBeforeInput);
    events.add(el, 'input', onInput);
    events.add(el, 'keydown', onKeyDown);
    events.add(el, 'paste', onPaste);
    events.add(el, 'focusin', onFocus);
    events.add(el, 'click', onFocus);

    sync();

    return {
      el: el,
      cells: cells,
      value: value,
      set: function (text) { place(0, split(text, cells.length, digits)); },
      clear: function () {
        for (var i = 0; i < cells.length; i++) cells[i].value = '';
        focus(0);
        sync();
      },
      destroy: function () {
        events.removeAll();
        attrs.restore();
      }
    };
  });

  G.otp = { split: split };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
