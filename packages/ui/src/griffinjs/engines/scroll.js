/*
 * GriffinJS — движок «scroll»: дорожка на scroll-snap.
 *
 * Свайп, инерция, колесо, RTL, «тянуть мышью» — от браузера. Движок
 * только переводит команду goTo в scrollTo, а прокрутку — в позицию
 * для дорожки. Это единственное место слоя, где состояние выводится
 * из scrollLeft.
 *
 * Цикл — клонами краёв: перед первым слайдом ставятся копии последних
 * perView, после последнего — копии первых. Дорожка доезжает до клона
 * плавно, а на остановке мгновенно перескакивает на настоящий слайд;
 * перескок невидим, потому что scroll-behavior в CSS — auto. Клоны
 * помечены data-gr-clone, aria-hidden и inert: для дерева доступности
 * и для состояния дорожки их не существует.
 *
 * Шесть требований для iOS Safari (из спецификации, не «по жалобам»):
 *   1. scrollend — только при 'onscrollend' in window; иначе дебаунс scroll.
 *   2. Плавность — только из JS (scrollTo({behavior})); в CSS дорожки
 *      scroll-behavior: auto, иначе перескок цикла с края на край анимируется.
 *   3. scrollTo во время инерционного жеста игнорируется: команды
 *      ставятся в очередь до конца жеста.
 *   4. overscroll-behavior-x: contain — в CSS дорожки (griffinjs.css).
 *   5. Мутация содержимого сбивает снап: дорожка зовёт layout() после неё.
 *   6. Неактивные слайды — inert: делает дорожка по visible().
 */
(function (G) {
  'use strict';

  var SETTLE_DELAY = 120;   // дебаунс scroll без scrollend, мс
  var CLONE = 'data-gr-clone';

  G.defineEngine('scroll', function (track, el, o) {
    var loop = !!(o && o.loop);
    var offsets = [];       // по ДЕТЯМ дорожки, включая клоны
    var widths = [];
    var head = 0;           // клонов перед первым настоящим слайдом
    var clones = [];
    var frame = null;
    var settleTimer = null;
    var busy = false;       // палец на экране или инерция после него
    var queued = null;      // {physical, instant} — команда, отложенная до конца жеста
    var events = G.listeners();
    var listen = events.add;
    var hasScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

    function count() { return track.count; }

    // Индекс ребёнка дорожки для настоящего слайда p.
    function childOf(p) { return head + p; }

    // --- Клоны -----------------------------------------------------------------

    function makeClone(slide) {
      var node = slide.cloneNode(true);

      node.setAttribute(CLONE, '');
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('inert', '');
      node.removeAttribute('aria-current');
      node.removeAttribute('id');

      return node;
    }

    function dropClones() {
      for (var i = 0; i < clones.length; i++) clones[i].remove();
      clones = [];
      head = 0;
    }

    // Клонов по краю — столько, сколько видно разом: меньше — на краю
    // мелькнёт пустота, больше — лишняя разметка.
    function buildClones(perView) {
      var slides = track.slides;
      var n = slides.length;

      dropClones();

      if (!loop || n < 2) return;

      var k = Math.min(perView, n);

      for (var i = n - k; i < n; i++) {
        var before = makeClone(slides[i]);

        el.insertBefore(before, slides[0]);
        clones.push(before);
      }

      for (var j = 0; j < k; j++) {
        var after = makeClone(slides[j]);

        el.appendChild(after);
        clones.push(after);
      }

      head = k;
    }

    // --- Замер -----------------------------------------------------------------

    function measure() {
      var children = el.children;
      var base = el.scrollLeft;
      var left = el.getBoundingClientRect().left;

      offsets = [];
      widths = [];

      for (var i = 0; i < children.length; i++) {
        var rect = children[i].getBoundingClientRect();

        offsets.push(base + rect.left - left);
        widths.push(rect.width);
      }
    }

    // Сколько настоящих слайдов целиком помещается в окне дорожки.
    // Слайд без ширины (дорожка скрыта) не считается: иначе «поместились» бы
    // все, и крайний индекс стал бы нулём.
    function perView() {
      var n = 0;
      var width = el.clientWidth;
      var first = childOf(0);

      for (var i = first; i < offsets.length; i++) {
        var span = Math.abs(offsets[i] - offsets[first]) + widths[i];

        if (widths[i] > 0 && span <= width + 1) n += 1;
        else break;
      }

      return Math.max(1, n);
    }

    // Целевой scrollLeft каждого ребёнка через прямоугольники: работает
    // и в RTL, где scrollLeft отрицателен, и при любом offsetParent.
    // Клоны перестраиваются, когда меняется число видимых или слайдов.
    function layout() {
      measure();

      var want = loop ? Math.min(perView(), count()) : 0;

      if (want !== head || (loop && clones.length !== want * 2)) {
        buildClones(want);
        measure();
      }
    }

    // Дробная позиция в НАСТОЯЩИХ индексах: между какими двумя детьми
    // стоит scrollLeft, минус клоны впереди. На клонах — за пределами 0…n−1.
    function position() {
      var x = el.scrollLeft;
      var n = offsets.length;

      if (n < 2) return 0;

      for (var i = 0; i < n - 1; i++) {
        var a = offsets[i];
        var b = offsets[i + 1];
        var lo = Math.min(a, b);
        var hi = Math.max(a, b);

        if (x >= lo && x <= hi && hi !== lo) return i + (x - a) / (b - a) - head;
      }

      var first = Math.abs(x - offsets[0]);
      var last = Math.abs(x - offsets[n - 1]);

      return (first <= last ? 0 : n - 1) - head;
    }

    function visible() {
      var viewLeft = el.scrollLeft;
      var viewRight = viewLeft + el.clientWidth;
      var n = count();
      var out = [];

      for (var i = 0; i < offsets.length; i++) {
        var lo = Math.min(offsets[i], offsets[i] + widths[i]);
        var hi = Math.max(offsets[i], offsets[i] + widths[i]);
        var overlap = Math.min(hi, viewRight) - Math.max(lo, viewLeft);

        // Слайд считается видимым от половины: «выглядывающий» край соседа —
        // ещё не слайд, в который должен попадать читатель экрана.
        if (widths[i] > 0 && overlap >= widths[i] / 2) {
          var p = i - head;

          if (loop && n) p = ((p % n) + n) % n;
          if (p >= 0 && p < n && out.indexOf(p) === -1) out.push(p);
        }
      }

      return out.length ? out : [track.physical(Math.round(position()))];
    }

    // --- Движение --------------------------------------------------------------

    function scrollTo(child, instant) {
      var left = offsets[child];

      if (typeof left !== 'number') return;

      if (typeof el.scrollTo === 'function') el.scrollTo({ left: left, behavior: instant ? 'auto' : 'smooth' });
      else el.scrollLeft = left;
    }

    // В цикле у слайда до трёх копий; едем к ближайшей от текущего
    // положения — так «вперёд» с последнего идёт на клон первого, а не назад
    // через всю дорожку.
    function nearestChild(p) {
      if (!loop) return childOf(p);

      var here = position() + head;
      var n = count();
      var best = childOf(p);
      var candidates = [childOf(p) - n, childOf(p), childOf(p) + n];

      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];

        if (c < 0 || c >= offsets.length) continue;
        if (Math.abs(c - here) < Math.abs(best - here)) best = c;
      }

      return best;
    }

    function goTo(physical, instant) {
      if (busy) {
        queued = { physical: physical, instant: instant };
        return;
      }

      scrollTo(nearestChild(physical), instant);
    }

    function settle() {
      settleTimer = null;
      busy = false;

      var pos = Math.round(position());
      var n = count();

      // Остановились на клоне — мгновенно на настоящий слайд.
      if (loop && n && (pos < 0 || pos >= n)) {
        pos = ((pos % n) + n) % n;
        scrollTo(childOf(pos), true);
      }

      track._settle(pos);

      if (queued) {
        var command = queued;

        queued = null;
        scrollTo(nearestChild(command.physical), command.instant);
      }
    }

    function onScroll() {
      if (frame === null) {
        var run = function () { frame = null; track._report(position()); };

        if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(run);
        else run();
      }

      if (!hasScrollEnd) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, SETTLE_DELAY);
      }
    }

    function onScrollEnd() {
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      settle();
    }

    // Палец на экране: команды кнопок и автоплея — в очередь.
    function onTouchStart() { busy = true; }

    listen(el, 'scroll', onScroll, { passive: true });
    if (hasScrollEnd) listen(el, 'scrollend', onScrollEnd);
    listen(el, 'touchstart', onTouchStart, { passive: true });

    return {
      loop: loop,
      goTo: goTo,
      layout: layout,
      visible: visible,
      perView: perView,
      position: position,
      destroy: function () {
        events.removeAll();
        dropClones();

        if (settleTimer) clearTimeout(settleTimer);
        if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      },
      _offsets: function () { return offsets.slice(); },
      _clones: function () { return clones.slice(); }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
