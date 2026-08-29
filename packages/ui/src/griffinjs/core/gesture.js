/*
 * GriffinJS — жест: свайп и тяга по pointer-событиям.
 *
 * pointerdown → pointermove → pointerup/pointercancel. Порог — чтобы
 * дрожание пальца не считалось жестом; ось — чтобы горизонтальная тяга
 * не спорила с вертикальной прокруткой страницы; скорость — чтобы короткий
 * резкий свайп листал, не дотянув до половины.
 *
 * Поведение выбирается по pointerType КАЖДОГО события, а не по типу
 * устройства: iPad с мышью и Surface с пером — гибриды, и «тач-устройство»
 * как класс не существует. Scroll-движку жест не нужен — свайп там делает
 * браузер; примитив пишется ради fade (21d) и следования за пальцем.
 *
 * Пользователь примитива получает прогресс в единицах ширины элемента:
 * dx / width — ровно то, что нужно, чтобы перевести тягу в --gr-progress.
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    axis: 'x',          // 'x' | 'y'
    threshold: 8,       // px до признания жеста
    velocity: 0.4,      // px/мс — скорость, при которой свайп засчитывается без порога расстояния
    distance: 0.35,     // доля размера элемента, после которой свайп засчитывается
    pointers: null,     // ['touch', 'pen'] — какие pointerType слушать; null — все
    onStart: null,      // (state)
    onMove: null,       // (state) — state.progress: dx/размер, знак по направлению
    onEnd: null,        // (state) — state.swipe: -1 | 0 | 1
    onCancel: null
  };

  function gesture(el, opts) {
    var o = G.merge(DEFAULTS, opts);

    var horizontal = o.axis !== 'y';
    var state = null;      // текущий жест
    var samples = [];      // последние точки для скорости

    function size() {
      var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      var value = rect ? (horizontal ? rect.width : rect.height) : 0;

      return value || 1;
    }

    function accepts(event) {
      if (!o.pointers) return true;

      return o.pointers.indexOf(event.pointerType) !== -1;
    }

    function now(event) {
      return typeof event.timeStamp === 'number' ? event.timeStamp : Date.now();
    }

    function onDown(event) {
      if (state || !accepts(event)) return;
      if (typeof event.button === 'number' && event.button !== 0) return;

      state = {
        id: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        dx: 0,
        dy: 0,
        progress: 0,
        active: false,   // порог пройден, ось — наша
        locked: false,   // ось чужая: жест отдан браузеру
        swipe: 0
      };
      samples = [[now(event), horizontal ? event.clientX : event.clientY]];

      if (el.setPointerCapture) {
        try { el.setPointerCapture(event.pointerId); } catch (e) { /* уже отпущен */ }
      }
    }

    function onMove(event) {
      if (!state || event.pointerId !== state.id || state.locked) return;

      state.dx = event.clientX - state.startX;
      state.dy = event.clientY - state.startY;

      var main = horizontal ? state.dx : state.dy;
      var cross = horizontal ? state.dy : state.dx;

      if (!state.active) {
        if (Math.abs(main) < o.threshold && Math.abs(cross) < o.threshold) return;

        // Ось решается один раз, в момент прохождения порога.
        if (Math.abs(cross) > Math.abs(main)) {
          state.locked = true;
          return;
        }

        state.active = true;
        if (o.onStart) o.onStart(state);
      }

      samples.push([now(event), horizontal ? event.clientX : event.clientY]);
      if (samples.length > 5) samples.shift();

      state.progress = main / size();

      if (event.cancelable && event.preventDefault) event.preventDefault();
      if (o.onMove) o.onMove(state);
    }

    function speed() {
      if (samples.length < 2) return 0;

      var first = samples[0];
      var last = samples[samples.length - 1];
      var dt = last[0] - first[0];

      return dt > 0 ? (last[1] - first[1]) / dt : 0;
    }

    function onUp(event) {
      if (!state || event.pointerId !== state.id) return;

      var done = state;
      var main = horizontal ? done.dx : done.dy;
      var v = speed();

      state = null;

      if (!done.active) {
        if (done.locked && o.onCancel) o.onCancel(done);
        return;
      }

      var far = Math.abs(main) / size() >= o.distance;
      var fast = Math.abs(v) >= o.velocity && (v > 0) === (main > 0);

      done.swipe = far || fast ? (main > 0 ? 1 : -1) : 0;
      done.velocity = v;

      if (o.onEnd) o.onEnd(done);
    }

    function onCancel(event) {
      if (!state || event.pointerId !== state.id) return;

      var done = state;
      state = null;

      if (o.onCancel) o.onCancel(done);
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);

    return {
      destroy: function () {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onCancel);
        state = null;
      },
      _state: function () { return state; }
    };
  }

  G.gesture = gesture;
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
