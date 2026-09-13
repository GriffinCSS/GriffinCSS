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
 *
 * Третье — связка с числовыми полями (Этап 42a):
 *
 *   <div class="gr-range-pair" data-gr-range="fields: #price-min, #price-max">
 *
 * Селекторов столько же, сколько ползунков. Движение ручки пишет число
 * в своё поле (после наведения порядка); ввод в поле двигает ручку
 * с зажимом по min/max, а порядок наводится только на change — «1»
 * по пути к «1000» иначе толкнул бы вторую ручку. Форму отправляют поля:
 * name — у них, у ползунков его нет, иначе в GET уехали бы четыре
 * параметра. Правда — в полях: страница вернулась с ними, а атрибуты
 * value ползунков остались начальными, поэтому на монтаже ручки встают
 * по полям; пустое поле — ручка на своём краю. Само поле от монтажа
 * не заполняется: «фильтр не задан» остаётся пустым.
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

  function edge(input, name, fallback) {
    return num(input.getAttribute(name), fallback);
  }

  G.defineWidget('range', function (el, opts) {
    var single = el.tagName === 'INPUT';
    var inputs = single ? [el] : [].slice.call(el.querySelectorAll('input[type="range"]'));
    var listeners = G.listeners();
    var fields = [];

    if (!inputs.length) throw new Error('внутри нет ни одного <input type="range">');

    function doneOf(input) {
      var min = edge(input, 'min', 0);
      var span = edge(input, 'max', 100) - min;

      return round(span > 0 ? (valueOf(input) - min) / span : 0);
    }

    // Число из поля — в ползунок: пустое поле ставит ручку на свой край
    // (нижняя граница не задана — от min, верхняя — до max), число зажимается.
    function pull(i) {
      var input = inputs[i];
      var min = edge(input, 'min', 0);
      var max = edge(input, 'max', 100);
      var value = fields[i].value;

      input.value = value === '' ? (i ? max : min) : Math.max(min, Math.min(max, num(value, min)));
    }

    // Значения ручек — в поля, кроме того, откуда пришёл ввод: оно уже
    // содержит то, что человек написал, и переписывать его под рукой нельзя.
    function push(except) {
      for (var i = 0; i < fields.length; i++) if (fields[i] !== except) fields[i].value = valueOf(inputs[i]);
    }

    function typed(event) {
      var field = event.target;
      var i = fields.indexOf(field);

      pull(i);

      // Пока число не дописано, ручки могут стоять наоборот: отрезок между
      // ними на это время вырождается в точку, и это лучше толчка второй ручки.
      if (event.type === 'change') {
        order(inputs[i]);
        push(field);
      }

      paint();
      emit();
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

    function paint() {
      if (inputs.length > 1) {
        el.style.setProperty(FROM, doneOf(inputs[0]));
        el.style.setProperty(TO, doneOf(inputs[1]));
      } else {
        inputs[0].style.setProperty(PROP, doneOf(inputs[0]));
      }
    }

    function update(event) {
      order(event && event.target);
      paint();

      // Событие — после наведения порядка, и только на живое движение ручки.
      // Подпись рядом с парой иначе показала бы значения ДО толчка: свой
      // обработчик на ползунке отработает раньше нашего, стоящего на обёртке.
      if (event) {
        push();
        emit();
      }
    }

    function emit() {
      var values = [];

      for (var i = 0; i < inputs.length; i++) values.push(valueOf(inputs[i]));

      G.emit('griffin:change', el, { values: values, from: values[0], to: values[values.length - 1] });
    }

    // Один слушатель на обёртку: события ползунков всплывают до неё,
    // и второй ручке отдельная подписка не нужна.
    listeners.add(el, 'input', update);

    if (opts && opts.fields) {
      var selectors = String(opts.fields).split(',');

      for (var f = 0; f < inputs.length; f++) {
        var field = document.querySelector(selectors[f] || '#');

        if (!field) throw new Error('поле «' + selectors[f] + '» не найдено');

        fields.push(field);
        pull(f);
        listeners.add(field, 'input', typed);
        listeners.add(field, 'change', typed);
      }
    }

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
