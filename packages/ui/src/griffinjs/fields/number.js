/*
 * GriffinJS — сумма с разрядами (Этап 43b).
 *
 *   <input class="gr-input" type="text" inputmode="decimal" name="amount"
 *          min="0" max="1000000" data-gr-number="decimals: 2">
 *
 * На экране — текст с разделителями разрядов по локали документа
 * («1 250 000,50» при lang="ru", «1,250,000.50» при lang="en"), число
 * в точечной записи («1250000.50») — в скрытом спутнике с прежним именем:
 * тот же приём, что у даты. type="number" разрядов не показывает,
 * inputmode не форматирует, а маска знает только фиксированные слоты —
 * поэтому это отдельное поле, а не режим маски.
 *
 * Разбор принимает любую запись: разделитель дроби — последний из «,»
 * и «.», если это знак дроби локали или чужой знак не с тремя цифрами
 * за ним («1.250.000» в ru — разряды, «1250.50» — дробь); знак разрядов
 * локали дробью не бывает («1,250,000» и «1,25» в en), кроме записи,
 * где разряды уже разделены пробелами («1 250 000,50»). Всё остальное,
 * кроме цифр и минуса в начале, отбрасывается; минус принимается, только
 * если min не задан или отрицателен. Лишние цифры дроби отбрасываются,
 * не округляются: сумма — то, что набрано, а не то, что посчитано.
 *
 * Каретка — счётом принятых знаков слева от неё, как в маске: правки
 * перехватываются в beforeinput, значение пишется целиком, Backspace
 * и Delete перешагивают разделители разрядов. На композиции, автозаполнении
 * и отмене виджет отступает и приводит значение к формату по input —
 * единственный случай, когда каретка уходит в конец.
 *
 * Границы min/max с поля переезжают в спутник: там, где платформа умеет,
 * сообщение о выходе за них берётся у неё, иначе — из параметра range.
 * Красным (aria-invalid) — только по уходу фокуса, светлеет, как только
 * значение вернулось в границы. Пустое поле — required платформы.
 * Дробь дополняется нулями до decimals по уходу фокуса и при записи
 * из API; спутник несёт число как есть. destroy() возвращает имя
 * и число в поле и снимает всё своё.
 *
 * Валюта и единица — не здесь: .gr-input-addon рядом. База без скрипта —
 * обычное текстовое поле: сервер получит то, что набрано, разбор на
 * сервере обязателен в любом случае.
 *
 * Виджет пишет value и валидность контрола — расширение инварианта 7,
 * объявленное в docs/griffinjs-architecture.html («Инварианты»).
 */
(function (G) {
  'use strict';

  var DEFAULTS = { decimals: 0, range: 'Значение вне допустимых границ' };

  function lang() {
    return (document.documentElement && document.documentElement.getAttribute('lang'))
      || (typeof navigator !== 'undefined' && navigator.language) || 'en';
  }

  var known = {};

  // Знаки локали: разряды и дробь — из Intl; цифры всегда латинские,
  // иначе разбор не узнал бы собственный вывод. Считается раз на локаль.
  function marks(locale) {
    if (known[locale]) return known[locale];

    var group = '';
    var decimal = '.';
    var nf;

    try {
      nf = new Intl.NumberFormat(locale, { numberingSystem: 'latn' });
    } catch (e) {
      nf = new Intl.NumberFormat('en');
    }

    var parts = nf.formatToParts(12345.6);

    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'group') group = parts[i].value;
      if (parts[i].type === 'decimal') decimal = parts[i].value;
    }

    return (known[locale] = { group: group, decimal: decimal, nf: nf });
  }

  // Текст → {neg, int, frac, point, value}: value — число в точечной
  // записи или пустая строка; point — знак дроби набран (дробь может быть
  // ещё пустой). Ведущие нули снимаются.
  function parse(text, locale, decimals, signed) {
    var m = marks(locale);
    var s = String(text || '');
    var neg = signed && /^\s*[-\u2212]/.test(s);
    var at = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    var point = false;

    if (at !== -1) {
      var ch = s.charAt(at);
      var after = s.slice(at + 1).replace(/\D/g, '').length;

      // Знак разрядов локали — дробь, только если разряды в тексте уже
      // разделены пробелами: «1 250 000,50» из русского буфера в en.
      point = ch === m.decimal || (after !== 3 && (ch !== m.group || /\d[\s\u00a0\u202f]\d/.test(s)));
    }

    var head = point ? s.slice(0, at) : s;
    var int = head.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    var frac = point ? s.slice(at + 1).replace(/\D/g, '').slice(0, decimals) : '';

    if (!decimals) point = false;
    if (!int && frac) int = '0';

    return {
      neg: neg, int: int, frac: frac, point: point,
      value: int ? (neg ? '-' : '') + int + (frac ? '.' + frac : '') : ''
    };
  }

  // Разбор → текст на экране: разряды — у Intl, дробь — как набрана
  // (pad — дополнена нулями до decimals).
  function format(p, locale, decimals, pad) {
    var m = marks(locale);
    var out = p.neg ? '-' : '';

    if (p.int) out += m.nf.format(Number(p.int));

    var frac = p.frac;

    if (pad && p.int && decimals) while (frac.length < decimals) frac += '0';
    if (frac || (p.point && !pad)) out += m.decimal + frac;

    return out;
  }

  function fire(el, type) {
    try {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    } catch (e) { /* окружение без Event */ }
  }

  G.defineWidget('number', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();
    var locale = lang();
    var decimals = o.decimals > 0 ? o.decimals : 0;
    var signed = !(parseFloat(el.getAttribute('min')) >= 0);
    var significant = new RegExp('[\\d\\-\\u2212' + marks(locale).decimal.replace(/[.\\]/g, '\\$&') + ']');
    var companion = null;
    var last = null;      // последнее записанное значение на экране
    var told = null;      // последнее число, о котором сказано событием
    var focused = null;   // значение на момент фокуса — для change
    var bad = false;      // вне границ

    // Позиция каретки за k-м принятым знаком.
    function caret(text, k) {
      for (var i = 0; i < text.length && k > 0; i++) if (significant.test(text.charAt(i))) k--;

      return i;
    }

    function size(text) {
      var p = parse(text, locale, decimals, signed);

      return (p.neg ? 1 : 0) + p.int.length + (p.point ? 1 : 0) + p.frac.length;
    }

    function check() {
      var value = companion.value;
      var message = '';

      if (value) {
        if (companion.validity) {
          if (!companion.validity.valid) message = companion.validationMessage || o.range;
        } else {
          var min = parseFloat(el.getAttribute('min'));
          var max = parseFloat(el.getAttribute('max'));
          var n = parseFloat(value);

          if (n < min || n > max) message = o.range;
        }
      }

      bad = !!message;
      if (typeof el.setCustomValidity === 'function') el.setCustomValidity(message);
      if (!bad) attrs.set(el, 'aria-invalid', null);

      // О первом значении — с разметки — не сообщается: его никто не менял.
      if (value !== told) {
        var first = told === null;

        told = value;
        if (!first) G.emit('griffin:change', el, { value: value });
      }
    }

    // Запись: текст на экране, число в спутнике, каретка за k-м знаком
    // (без k каретка не трогается — при записи вне фокуса ей всё равно).
    function write(text, k, pad) {
      var p = parse(text, locale, decimals, signed);
      var next = format(p, locale, decimals, pad);

      if (el.value !== next) el.value = next;
      last = next;
      companion.value = p.value;
      check();

      if (k !== undefined && typeof el.setSelectionRange === 'function') {
        var at = caret(next, k);

        el.setSelectionRange(at, at);
      }
    }

    // Позиция знака, который снимает Backspace (последний перед кареткой)
    // и Delete (первый от каретки); разделители между ними перешагиваются.
    function before(at) {
      while (at > 0 && !significant.test(el.value.charAt(at - 1))) at--;

      return at > 0 ? at - 1 : 0;
    }

    function after(at) {
      var text = el.value;

      while (at < text.length && !significant.test(text.charAt(at))) at++;

      return at < text.length ? at + 1 : at;
    }

    function onBeforeInput(event) {
      var type = event.inputType || '';

      if (event.isComposing || type.indexOf('Composition') !== -1) return;

      var start = el.selectionStart;
      var end = el.selectionEnd;

      if (typeof start !== 'number' || typeof end !== 'number') return;

      var insert = '';

      if (type === 'insertText' || type === 'insertFromPaste' || type === 'insertFromDrop') {
        insert = event.data || (event.dataTransfer ? event.dataTransfer.getData('text') : '') || '';
      } else if (type === 'deleteContentBackward') {
        if (start === end) start = before(start);
      } else if (type === 'deleteContentForward' || type === 'deleteByCut') {
        if (start === end) end = after(end);
      } else {
        return;
      }

      event.preventDefault();

      var text = el.value;
      var head = text.slice(0, start) + insert;
      var was = el.value;

      write(head + text.slice(end), size(head));

      if (el.value !== was) fire(el, 'input');
    }

    function onInput(event) {
      if (event.isComposing) return;
      if (el.value !== last) write(el.value);
    }

    function onCompositionEnd() {
      write(el.value);
    }

    function onFocus() {
      focused = el.value;
    }

    function onBlur() {
      write(el.value, undefined, true);

      if (bad) attrs.set(el, 'aria-invalid', 'true');
      if (focused !== null && el.value !== focused) fire(el, 'change');
      focused = null;
    }

    // Спутник: число под прежним именем и границы — платформа проверяет их сама.
    companion = document.createElement('input');
    companion.setAttribute('type', 'number');
    companion.setAttribute('hidden', '');
    companion.setAttribute('step', el.getAttribute('step') || 'any');

    for (var i = 0, copy = ['name', 'min', 'max']; i < copy.length; i++) {
      var v = el.getAttribute(copy[i]);

      if (v !== null) companion.setAttribute(copy[i], v);
    }

    el.parentNode.insertBefore(companion, el.nextSibling);
    attrs.set(el, 'name', null);
    if (!el.getAttribute('inputmode')) attrs.set(el, 'inputmode', 'decimal');

    events.add(el, 'beforeinput', onBeforeInput);
    events.add(el, 'input', onInput);
    events.add(el, 'compositionend', onCompositionEnd);
    events.add(el, 'focus', onFocus);
    events.add(el, 'blur', onBlur);

    write(el.value, undefined, true);

    return {
      el: el,
      value: function () { return companion.value; },
      set: function (value) {
        var was = el.value;

        write(String(value), undefined, true);
        if (el.value !== was) fire(el, 'input');
      },
      destroy: function () {
        events.removeAll();

        var value = companion.value;

        companion.remove();
        attrs.restore();
        el.value = value;

        if (typeof el.setCustomValidity === 'function') el.setCustomValidity('');
      }
    };
  });

  G.number = { parse: parse, format: format, marks: marks };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
