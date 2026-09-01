/*
 * GriffinJS — движок «fade»: слайды стопкой, переход прозрачностью.
 *
 * Разметка та же, что у scroll, плюс класс .gr-track-fade: CSS кладёт
 * слайды в одну ячейку сетки и связывает opacity с --gr-progress.
 * Движок ничего не двигает — он публикует позицию, а дорожка раздаёт
 * прогресс слайдам; переход делает CSS-transition. Цикл бесплатен:
 * индекс по модулю, клонов нет.
 *
 * Жест — через примитив gesture: пока палец на экране, прогресс следует
 * за ним (дорожка получает дробную позицию, CSS на время тяги без
 * transition — по data-gr-state="dragging"), на отпускании — свайп
 * или возврат.
 *
 *   <div class="gr-track gr-track-fade" data-gr-track="engine: fade; loop">
 *
 * База без JS: CSS показывает первый слайд, остальные скрыты.
 */
(function (G) {
  'use strict';

  G.defineEngine('fade', { needs: ['gesture'] }, function (track, el) {
    var attrs = G.recorder();
    var gesture = null;

    function current() { return track.physical(track.index); }

    // Позиция сообщается сразу: CSS-transition на opacity сделает переход.
    function goTo(physical) {
      track._report(physical);
      track._settle(physical);
    }

    function onStart() {
      attrs.set(el, 'data-gr-state', 'dragging');
    }

    // Тяга: прогресс в долях ширины со знаком. Влево (progress < 0) —
    // проявляется следующий, вправо — предыдущий; по модулю в цикле.
    function onMove(state) {
      var n = track.count;
      var pos = current() - state.progress;

      if (!track.loop) pos = Math.max(0, Math.min(n - 1, pos));

      track._report(pos);
    }

    function onEnd(state) {
      attrs.set(el, 'data-gr-state', 'ready');

      if (state.swipe < 0 && track.next()) return;
      if (state.swipe > 0 && track.prev()) return;

      track._report(current());
    }

    function onCancel() {
      attrs.set(el, 'data-gr-state', 'ready');
      track._report(current());
    }

    if (typeof G.gesture === 'function') {
      gesture = G.gesture(el, { onStart: onStart, onMove: onMove, onEnd: onEnd, onCancel: onCancel });
    }

    attrs.set(el, 'data-gr-state', 'ready');

    return {
      loop: true,
      goTo: goTo,
      layout: function () {},
      visible: function () { return [current()]; },
      perView: function () { return 1; },
      destroy: function () {
        if (gesture) gesture.destroy();
        attrs.restore();
      }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
