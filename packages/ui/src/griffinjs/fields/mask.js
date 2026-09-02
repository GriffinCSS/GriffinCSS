/*
 * GriffinJS — маска текстового поля.
 *
 *   <input class="gr-input" type="tel" inputmode="numeric"
 *          pattern="\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}"
 *          data-gr-mask="+7 (000) 000-00-00">
 *
 * Формат — строка токенов, не регулярное выражение: из строки получаются
 * и подсказка в пустом поле, и позиция каретки, из regex — ни то, ни другое.
 *   0 — цифра;  a — буква;  A — буква, приводится к верхнему регистру;
 *   * — буква или цифра;  ? — всё после него необязательно;
 *   \ — следующий знак буквально (\0 — литерал «0»); остальное — литералы.
 * Литералы ленивые: «) » появляется вместе со следующей цифрой, а не раньше,
 * иначе Backspace упирался бы в них на каждой границе группы.
 *
 * Параметры, если они нужны, идут парами:
 *   data-gr-mask="format: 00:00; hint: false"
 * hint — подсказка пустого поля из того же формата (когда своей нет);
 * fill — знак свободного слота в ней, «_» по умолчанию.
 *
 * База без скрипта: pattern и inputmode на элементе — платформа проверяет
 * сама, скрипт лишь помогает вводить и ни pattern, ни проверку не трогает.
 * Из маски он берёт только два удобства: подсказку и inputmode="numeric"
 * для маски из одних цифр — и то, если автор не задал своих.
 *
 * Каретка. Правки перехватываются в beforeinput: новое значение считается
 * здесь, пишется целиком, и каретка встаёт за только что введённый знак —
 * Backspace и Delete перешагивают литералы и снимают именно знак. На всём,
 * чего маска не понимает — композиция IME и экранной клавиатуры Android,
 * автозаполнение, автозамена, отмена, — она ОТСТУПАЕТ, а не гадает:
 * браузер делает своё, а маска потом приводит значение к формату по input
 * или compositionend. Это единственный случай, когда каретка уходит в конец.
 *
 * Маска пишет value контрола — первый такой виджет в слое. Расширение
 * инварианта 7 объявлено в docs/griffinjs-architecture.html («Инварианты»)
 * и в правилах правки слоя. После каждой своей записи она шлёт input
 * (а по уходу фокуса — change), поэтому фреймворк узнаёт о значении
 * так же, как о набранном руками.
 */
(function (G) {
  'use strict';

  var DEFAULTS = { format: '', hint: true, fill: '_' };

  // Что принимает слот. Буква — любая по Юникоду: маска номерного знака
  // на кириллице не хуже латинской.
  var SLOTS = { 0: /\d/, a: /\p{L}/u, A: /\p{L}/u, '*': /[\p{L}\d]/u };

  // Формат → токены: {lit} для литерала, {slot, optional} для знака.
  function parse(format) {
    var tokens = [];
    var optional = false;

    for (var i = 0; i < format.length; i++) {
      var ch = format.charAt(i);

      if (ch === '\\') { tokens.push({ lit: format.charAt(++i) }); continue; }
      if (ch === '?') { optional = true; continue; }

      if (SLOTS[ch]) tokens.push({ slot: ch, optional: optional });
      else tokens.push({ lit: ch });
    }

    return tokens;
  }

  // Подсказка пустого поля: литералы как есть, слоты — знаком заполнителя.
  function hint(tokens, fill) {
    var out = '';

    for (var i = 0; i < tokens.length; i++) out += tokens[i].lit !== undefined ? tokens[i].lit : (fill || '_');

    return out;
  }

  // Прогон текста по маске. Токены и текст идут рядом: литерал съедает
  // такой же знак текста (вставленный номер с литералами проходит как есть)
  // и пропускается иначе; слот берёт подходящий знак и отбрасывает чужой.
  // Возвращает {value, raw, slots, complete}: value — с ленивыми литералами,
  // raw — принятые знаки, slots — их позиции в value (по ним каретка),
  // complete — все обязательные слоты заполнены.
  function run(tokens, text) {
    var value = '';
    var raw = '';
    var pending = '';
    var slots = [];
    var t = 0;

    for (var i = 0; t < tokens.length && i < text.length;) {
      var token = tokens[t];
      var ch = text.charAt(i);

      if (token.lit !== undefined) {
        if (ch === token.lit) i++;
        pending += token.lit;
        t++;
        continue;
      }

      if (SLOTS[token.slot].test(ch)) {
        if (token.slot === 'A') ch = ch.toUpperCase();
        value += pending + ch;
        pending = '';
        slots.push(value.length - 1);
        raw += ch;
        t++;
      }

      i++;
    }

    var complete = true;

    for (; t < tokens.length; t++) {
      if (tokens[t].slot && !tokens[t].optional) { complete = false; break; }
    }

    return { value: value, raw: raw, slots: slots, complete: complete };
  }

  // Каретка за k-м принятым знаком; перед первым — после литералов начала.
  function caret(result, k) {
    if (k > 0) return result.slots[k - 1] + 1;

    return result.slots.length ? result.slots[0] : 0;
  }

  function digitsOnly(tokens) {
    var any = false;

    for (var i = 0; i < tokens.length; i++) {
      if (!tokens[i].slot) continue;
      if (tokens[i].slot !== '0') return false;
      any = true;
    }

    return any;
  }

  function fire(el, type) {
    try {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    } catch (e) { /* окружение без Event */ }
  }

  G.defineWidget('mask', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();

    // Формат — ключ format или сам атрибут целиком: «00:00» без ключа
    // разобрался бы как пара «00: 00», поэтому без ключа берётся строка как есть.
    var format = o.format ? String(o.format) : (el.getAttribute('data-gr-mask') || '').trim();

    if (!format) throw new Error('у маски нет формата');

    var tokens;
    var last = null;          // последнее записанное значение
    var focused = null;       // значение на момент фокуса — для change
    var ownHint = o.hint && !el.getAttribute('placeholder');
    var ownMode = !el.getAttribute('inputmode');

    // Запись: значение по формату, состояние, каретка за k-м знаком
    // (без k каретка не трогается — при записи вне фокуса ей всё равно).
    function write(text, k) {
      var result = run(tokens, text);

      if (el.value !== result.value) el.value = result.value;
      last = result.value;

      attrs.set(el, 'data-gr-state', !result.raw ? 'empty' : result.complete ? 'complete' : 'partial');

      if (k !== undefined && typeof el.setSelectionRange === 'function') {
        var at = caret(result, k);

        el.setSelectionRange(at, at);
      }

      return result;
    }

    function use(next) {
      var raw = tokens ? run(tokens, el.value).raw : el.value;

      format = String(next);
      tokens = parse(format);

      if (ownHint) attrs.set(el, 'placeholder', hint(tokens, o.fill));
      if (ownMode) attrs.set(el, 'inputmode', digitsOnly(tokens) ? 'numeric' : null);

      write(raw);
    }

    // Позиция знака, который снимает Backspace (последний перед каретой)
    // и Delete (первый от каретки); литералы между ними перешагиваются.
    function before(at) {
      var slots = run(tokens, el.value).slots;

      for (var i = slots.length - 1; i >= 0; i--) if (slots[i] < at) return slots[i];

      return at;
    }

    function after(at) {
      var slots = run(tokens, el.value).slots;

      for (var i = 0; i < slots.length; i++) if (slots[i] >= at) return slots[i] + 1;

      return at;
    }

    function onBeforeInput(event) {
      var type = event.inputType || '';

      // Композиция — браузеру: вмешательство ломает IME на первом же слоге.
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
        // Автозамена, автозаполнение, отмена, перенос строки — не наша правка.
        return;
      }

      event.preventDefault();

      var text = el.value;
      var head = text.slice(0, start) + insert;
      var was = el.value;

      write(head + text.slice(end), run(tokens, head).raw.length);

      if (el.value !== was) fire(el, 'input');
    }

    // Всё, что прошло мимо beforeinput: автозаполнение, композиция,
    // отмена. Значение приводится к формату, каретка уходит в конец —
    // единственный случай, и он честнее догадки.
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

    // Отменённый beforeinput не оставляет браузеру повода для change:
    // правку он не видел. Событие шлётся здесь по тому же правилу —
    // значение по уходу фокуса отличается от значения на входе.
    function onBlur() {
      if (focused !== null && el.value !== focused) fire(el, 'change');
      focused = null;
    }

    events.add(el, 'beforeinput', onBeforeInput);
    events.add(el, 'input', onInput);
    events.add(el, 'compositionend', onCompositionEnd);
    events.add(el, 'focus', onFocus);
    events.add(el, 'blur', onBlur);

    use(format);

    return {
      el: el,
      use: use,
      set: function (text) {
        var was = el.value;

        write(text);
        if (el.value !== was) fire(el, 'input');
      },
      raw: function () { return run(tokens, el.value).raw; },
      complete: function () { return run(tokens, el.value).complete; },
      size: function () {
        var n = 0;

        for (var i = 0; i < tokens.length; i++) if (tokens[i].slot) n++;

        return n;
      },
      format: function () { return format; },
      destroy: function () {
        events.removeAll();
        attrs.restore();
      }
    };
  });

  G.mask = { parse: parse, run: run, hint: hint };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
