/*
 * GriffinJS — ввод оценки поверх модуля .gr-rating.
 *
 *   <fieldset class="gr-rating-input" data-gr-rating>
 *     <legend class="gr-label">Оценка</legend>
 *     <span class="gr-rating" role="img" aria-label="Без оценки"></span>
 *     <label><input type="radio" name="score" value="1"> 1 из 5</label>
 *     …
 *     <label><input type="radio" name="score" value="5"> 5 из 5</label>
 *   </fieldset>
 *
 * Модуль .gr-rating сам объявил ввод оценки работой слоя: CSS рисует
 * ряд по числу в --gr-rating, а откуда число — не его дело. Здесь оно
 * берётся из выбранной радиокнопки — ровно та «числовая величина, из
 * которой CSS рисует картинку», которую инвариант 2 разрешает писать.
 * Слово к числу — aria-label на ряду знаков: подпись выбранной
 * радиокнопки («4 из 5»); без выбора остаётся подпись автора.
 *
 * База без скрипта — пять радиокнопок в <fieldset>: выбор, клавиатура
 * и участие в форме платформенные. Скрипт добавляет число и наведение:
 * указатель мыши показывает оценку под собой, уход возвращает выбранную.
 * Только мышь — по pointerType события: палец не наводит, он выбирает.
 * Со скриптом CSS слоя кладёт подписи поверх ряда знаков (состояние ready).
 */
(function (G) {
  'use strict';

  var PROP = '--gr-rating';

  function labelOf(radio) {
    var label = (radio.labels && radio.labels[0]) || G.closest(radio, 'label');

    return label ? String(label.textContent || '').trim() : String(radio.value);
  }

  G.defineWidget('rating', function (el) {
    var display = el.querySelector('.gr-rating');
    var radios = el.querySelectorAll('input[type="radio"]');

    if (!display || !radios.length) throw new Error('нужны .gr-rating и <input type="radio"> внутри');

    var attrs = G.recorder();
    var events = G.listeners();
    var original = display.getAttribute('aria-label');

    function checked() {
      for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i];

      return null;
    }

    function show(value) {
      display.style.setProperty(PROP, String(value));
    }

    function sync(notify) {
      var radio = checked();

      show(radio ? radio.value : 0);
      attrs.set(display, 'aria-label', radio ? labelOf(radio) : original);

      if (notify) G.emit('griffin:change', el, { value: radio ? Number(radio.value) : 0 });
    }

    function onOver(event) {
      if (event.pointerType !== 'mouse') return;

      var label = G.closest(event.target, 'label');
      var radio = label ? label.querySelector('input[type="radio"]') : null;

      if (radio) show(radio.value);
    }

    function onLeave() {
      var radio = checked();

      show(radio ? radio.value : 0);
    }

    events.add(el, 'change', function () { sync(true); });
    events.add(el, 'pointerover', onOver);
    events.add(el, 'pointerleave', onLeave);

    attrs.set(el, 'data-gr-state', 'ready');
    sync(false);

    return {
      el: el,
      display: display,
      value: function () {
        var radio = checked();

        return radio ? Number(radio.value) : 0;
      },
      set: function (value) {
        for (var i = 0; i < radios.length; i++) radios[i].checked = String(radios[i].value) === String(value);
        sync(true);
      },
      destroy: function () {
        events.removeAll();
        display.style.removeProperty(PROP);
        attrs.restore();
      }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
