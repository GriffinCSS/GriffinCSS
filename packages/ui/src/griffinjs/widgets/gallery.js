/*
 * GriffinJS — галерея: слайдер + полоса превью.
 *
 *   <div class="gr-gallery" data-gr-gallery>
 *     <div class="gr-track">…большие кадры…</div>
 *     <div class="gr-track gr-gallery-thumbs">
 *       <button type="button"><img …></button> …
 *     </div>
 *   </div>
 *
 * База без JS — две дорожки, каждая листается сама. Скрипт делает из первой
 * слайдер (кнопки и точки — если есть в разметке), а превью связывает
 * с ним: щелчок ведёт большую дорожку, активное превью получает aria-current
 * и подъезжает в видимую часть полосы. Полоса превью — не второй track:
 * ей не нужны ни снап по кадру, ни inert, ни свой индекс.
 */
(function (G) {
  'use strict';

  // Подвоз узла в видимую часть полосы — только по горизонтали и только
  // у самой полосы. scrollIntoView здесь не годится: он прокручивает и все
  // предки, включая страницу, — документация с галереей в конце открывалась
  // перемотанной к ней.
  function reveal(container, node) {
    if (typeof container.getBoundingClientRect !== 'function' || typeof node.getBoundingClientRect !== 'function') return;

    var c = container.getBoundingClientRect();
    var n = node.getBoundingClientRect();
    var left = container.scrollLeft || 0;
    var target = left;

    if (n.left < c.left) target = left - (c.left - n.left);
    else if (n.right > c.right) target = left + (n.right - c.right);

    if (target === left) return;

    if (typeof container.scrollTo === 'function') container.scrollTo({ left: target, behavior: 'smooth' });
    else container.scrollLeft = target;
  }

  G.defineWidget('gallery', { needs: ['track', 'slider'] }, function (el, opts) {
    var thumbsEl = el.querySelector('.gr-gallery-thumbs');
    var slider = G.widgets.slider(el, opts, G);
    var track = slider.track;
    var thumbs = [];
    var attrs = G.recorder();
    var events = G.listeners();
    var setAttr = attrs.set;
    var listen = events.add;

    function update() {
      var current = track.physical(track.index);

      for (var i = 0; i < thumbs.length; i++) {
        var active = i === current;

        setAttr(thumbs[i], 'aria-current', active ? 'true' : null);

        if (active) reveal(thumbsEl, thumbs[i]);
      }
    }

    function onThumbClick(event) {
      for (var i = 0; i < thumbs.length; i++) {
        if (thumbs[i] === event.target || (typeof thumbs[i].contains === 'function' && thumbs[i].contains(event.target))) {
          slider.goTo(i);
          return;
        }
      }
    }

    if (thumbsEl) {
      var children = thumbsEl.children;

      for (var i = 0; i < children.length; i++) {
        thumbs.push(children[i]);
        setAttr(children[i], 'aria-label', children[i].getAttribute('aria-label') || ('Слайд ' + (i + 1)));
      }

      listen(thumbsEl, 'click', onThumbClick);
      listen(track.el, G.track.CHANGE, update);
      update();
    }

    return {
      el: el,
      slider: slider,
      track: track,
      goTo: slider.goTo,
      next: slider.next,
      prev: slider.prev,
      destroy: function () {
        events.removeAll();
        slider.destroy();
        attrs.restore();
      }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
