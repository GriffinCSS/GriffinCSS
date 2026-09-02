/*
 * GriffinJS — счётчик символов: остаток к maxlength.
 *
 *   <textarea class="gr-textarea" id="about" maxlength="200" data-gr-counter></textarea>
 *
 * Без скрипта ограничение действует само: maxlength — атрибут платформы,
 * и лишнего она не примет. Скрипт добавляет только цифру — сколько ещё
 * можно ввести. Пишет её в <output> сразу после поля (или в узел,
 * названный в out: #id), связывает с полем через aria-describedby
 * и объявляет скринридеру через aria-live.
 *
 *   data-gr-counter="format: {left} из {max}; near: 0.2; out: #about-left"
 *
 * format — шаблон подписи: {left} — остаток, {length} — введено, {max} —
 * предел; near — доля предела, ниже которой остаток «на исходе»:
 * состояние near на подписи, при нуле — full. Красит по ним CSS.
 */
(function (G) {
  'use strict';

  var DEFAULTS = { out: '', format: '{left}', near: 0.1 };

  var seq = 0;

  function fill(format, n) {
    return String(format).replace(/\{(left|length|max)\}/g, function (m, key) { return n[key]; });
  }

  G.defineWidget('counter', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var max = parseInt(el.getAttribute('maxlength'), 10);
    var attrs = G.recorder();
    var events = G.listeners();

    if (!(max > 0)) throw new Error('у поля нет maxlength — считать не к чему');

    var out = o.out ? document.querySelector(o.out) : null;
    var created = false;

    if (!out) {
      out = document.createElement('output');
      out.setAttribute('class', 'gr-counter');
      el.parentNode.insertBefore(out, el.nextSibling);
      created = true;
    }

    if (!out.getAttribute('id')) attrs.set(out, 'id', 'gr-counter-' + (++seq));

    var described = el.getAttribute('aria-describedby') || '';

    if ((' ' + described + ' ').indexOf(' ' + out.getAttribute('id') + ' ') === -1) {
      attrs.set(el, 'aria-describedby', (described ? described + ' ' : '') + out.getAttribute('id'));
    }

    attrs.set(out, 'aria-live', 'polite');

    function update() {
      var length = String(el.value || '').length;
      var left = Math.max(0, max - length);

      out.textContent = fill(o.format, { left: left, length: length, max: max });
      attrs.set(out, 'data-gr-state', left === 0 ? 'full' : left <= max * o.near ? 'near' : 'ok');
    }

    events.add(el, 'input', update);

    update();

    return {
      el: el,
      out: out,
      update: update,
      destroy: function () {
        events.removeAll();
        attrs.restore();

        if (created) out.remove();
        else out.textContent = '';
      }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
