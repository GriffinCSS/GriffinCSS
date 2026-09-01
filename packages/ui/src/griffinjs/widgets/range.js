/*
 * GriffinJS — ползунок: закраска пройденного пути и пара «от — до».
 *
 *   <input class="gr-range" type="range" data-gr-range>
 *
 *   <div class="gr-range-pair" data-gr-range>
 *     <input class="gr-range" type="range" min="0" max="20000" value="4000" aria-label="Цена от">
 *     <input class="gr-range" type="range" min="0" max="20000" value="12000" aria-label="Цена до">
 *   </div>
 *
 * Скрипт пишет доли пройденного пути, 0…1, и больше ничего. Одиночному
 * ползунку — --gr-progress на него самого; паре — --gr-range-from
 * и --gr-range-to на обёртку, потому что отрезок между ручками рисует
 * она одна и обе границы нужны ей сразу. Красит по этим числам CSS модуля
 * .gr-range: у WebKit псевдоэлемента заполненной части нет вовсе,
 * а градиенту нужно число, которого в CSS взять неоткуда. Одиночному
 * ползунку в Firefox след рисует платформа, и там он есть без скрипта.
 *
 * Без скрипта ползунок остаётся полноценным: значение, шаг, клавиатура
 * и участие в форме — платформенные, теряется только цветной след.
 *
 * Второе дело скрипта в паре — порядок значений: тот, кого потянули
 * за чужую границу, толкает вторую ручку перед собой. Пересечься им
 * нельзя — отрезок между ручками вывернулся бы наизнанку.
 */
(function (G) {
  'use strict';

  var PROP = '--gr-progress';
  var FROM = '--gr-range-from';
  var TO = '--gr-range-to';

  // Доля попадает в CSS строкой, и десяток лишних цифр в ней — десяток
  // лишних байт на каждое движение ручки.
  function round(done) {
    return Math.round(Math.max(0, Math.min(1, done)) * 1e4) / 1e4;
  }

  function num(source, fallback) {
    var value = parseFloat(source);

    return isNaN(value) ? fallback : value;
  }

  // input.value — живое значение; атрибут value хранит только начальное,
  // и после первого движения ручки они расходятся.
  function valueOf(input) {
    var current = input.value === undefined || input.value === '' ? input.getAttribute('value') : input.value;

    return num(current, num(input.getAttribute('min'), 0));
  }

  G.defineWidget('range', function (el) {
    var single = el.tagName === 'INPUT';
    var inputs = single ? [el] : [].slice.call(el.querySelectorAll('input[type="range"]'));
    var listeners = G.listeners();

    if (!inputs.length) throw new Error('внутри нет ни одного <input type="range">');

    function doneOf(input) {
      var min = num(input.getAttribute('min'), 0);
      var span = num(input.getAttribute('max'), 100) - min;

      return round(span > 0 ? (valueOf(input) - min) / span : 0);
    }

    // Порядок значений в паре. Толкает именно вторую ручку, а не возвращает
    // первую: человек ведёт ту, за которую взялся, и остановка под пальцем
    // читалась бы как поломка.
    function order(moved) {
      if (inputs.length < 2) return;

      var from = inputs[0];
      var to = inputs[1];

      if (valueOf(from) <= valueOf(to)) return;

      if (moved === to) from.value = to.value;
      else to.value = from.value;
    }

    function update(event) {
      order(event && event.target);

      if (inputs.length > 1) {
        el.style.setProperty(FROM, doneOf(inputs[0]));
        el.style.setProperty(TO, doneOf(inputs[1]));
      } else {
        inputs[0].style.setProperty(PROP, doneOf(inputs[0]));
      }

      // Событие — после наведения порядка, и только на живое движение ручки.
      // Подпись рядом с парой иначе показала бы значения ДО толчка: свой
      // обработчик на ползунке отработает раньше нашего, стоящего на обёртке.
      if (event) emit();
    }

    function emit() {
      var values = [];

      for (var i = 0; i < inputs.length; i++) values.push(valueOf(inputs[i]));

      G.emit('griffin:change', el, { values: values, from: values[0], to: values[values.length - 1] });
    }

    // Один слушатель на обёртку: события ползунков всплывают до неё,
    // и второй ручке отдельная подписка не нужна.
    listeners.add(el, 'input', update);

    update();

    return {
      el: el,
      inputs: inputs,
      update: update,
      destroy: function () {
        listeners.removeAll();
        el.style.removeProperty(FROM);
        el.style.removeProperty(TO);

        for (var i = 0; i < inputs.length; i++) inputs[i].style.removeProperty(PROP);
      }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
