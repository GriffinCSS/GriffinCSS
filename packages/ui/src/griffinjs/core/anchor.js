/*
 * GriffinJS — позиционирование у якоря.
 *
 * Панель в верхнем слое (popover) позиционируется относительно окна,
 * а не обёртки, и привязать её к кнопке средствами CSS может только
 * anchor positioning. Он зависимостью слоя не является: положение
 * считается здесь — getBoundingClientRect → top/left — и одинаково
 * во всех движках, развилки @supports нет.
 *
 * Файл лежит в core/, но в griffinjs-core.js не входит: нужен только
 * семейству выпадающего (dropdown, tooltip), а бюджет ядра занят.
 * При модульной сборке griffinjs-anchor.js подключается перед ними.
 *
 *   G.anchor.place(panel, button, { side: 'bottom', align: 'start', gap: 4 })
 *
 * side — bottom | top | start | end (логические: start/end зависят от
 * направления письма); align — start | center | end вдоль стороны.
 * Если с заданной стороны места нет, а с противоположной есть —
 * сторона переворачивается. Панель всегда прижимается внутрь окна.
 */
(function (G) {
  'use strict';

  var PROPS = ['top', 'left', 'right', 'bottom'];

  function viewport() {
    var root = document.documentElement;

    return {
      w: root.clientWidth || (typeof innerWidth === 'number' ? innerWidth : 0),
      h: root.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 0)
    };
  }

  function rtl(el) {
    try {
      return getComputedStyle(el).direction === 'rtl' || document.documentElement.getAttribute('dir') === 'rtl';
    } catch (e) {
      return document.documentElement.getAttribute('dir') === 'rtl';
    }
  }

  // Логическая сторона → физическая: start в LTR — слева.
  function physical(side, isRtl) {
    if (side === 'start') return isRtl ? 'right' : 'left';
    if (side === 'end') return isRtl ? 'left' : 'right';

    return side;
  }

  function logical(side, isRtl) {
    if (side === 'left') return isRtl ? 'end' : 'start';
    if (side === 'right') return isRtl ? 'start' : 'end';

    return side;
  }

  var OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  function room(side, a, box, vp) {
    if (side === 'bottom') return vp.h - a.bottom;
    if (side === 'top') return a.top;
    if (side === 'right') return vp.w - a.right;

    return a.left;
  }

  function place(el, anchor, opts) {
    opts = opts || {};

    var gap = opts.gap || 0;
    var margin = opts.margin || 0;
    var align = opts.align || 'start';
    var isRtl = rtl(anchor);
    var side = physical(opts.side || 'bottom', isRtl);
    var a = anchor.getBoundingClientRect();
    var box = el.getBoundingClientRect();
    var vp = viewport();
    var vertical = side === 'top' || side === 'bottom';
    var need = (vertical ? box.height : box.width) + gap;

    // Переворот: с этой стороны не помещается, с противоположной — да.
    if (room(side, a, box, vp) < need && room(OPPOSITE[side], a, box, vp) >= need) side = OPPOSITE[side];

    var top;
    var left;

    if (vertical) {
      top = side === 'bottom' ? a.bottom + gap : a.top - gap - box.height;

      var startAligned = isRtl ? align === 'end' : align === 'start';

      if (align === 'center') left = a.left + (a.width - box.width) / 2;
      else if (startAligned) left = a.left;
      else left = a.right - box.width;
    } else {
      left = side === 'right' ? a.right + gap : a.left - gap - box.width;
      top = a.top + (a.height - box.height) / 2;
    }

    // Внутрь окна: панель, вылезшая за край, недоступна целиком.
    if (vp.w) left = Math.min(Math.max(left, margin), Math.max(margin, vp.w - margin - box.width));
    if (vp.h) top = Math.min(Math.max(top, margin), Math.max(margin, vp.h - margin - box.height));

    el.style.setProperty('top', Math.round(top) + 'px');
    el.style.setProperty('left', Math.round(left) + 'px');
    el.style.setProperty('right', 'auto');
    el.style.setProperty('bottom', 'auto');

    return { side: logical(side, isRtl), top: top, left: left };
  }

  function clear(el) {
    if (!el || !el.style) return;

    for (var i = 0; i < PROPS.length; i++) el.style.removeProperty(PROPS[i]);
  }

  G.anchor = { place: place, clear: clear };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
