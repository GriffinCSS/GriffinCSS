/*
 * GriffinJS — слайдер: дорожка + кнопки + точки + автоплей с паузой.
 *
 *   <div class="gr-slider" data-gr-slider="autoplay: 4000; loop">
 *     <div class="gr-track">…слайды…</div>
 *     <button class="gr-btn gr-btn-icon gr-slider-prev" data-gr-prev aria-label="Назад">‹</button>
 *     <button class="gr-btn gr-btn-icon gr-slider-next" data-gr-next aria-label="Вперёд">›</button>
 *     <div class="gr-slider-dots" data-gr-dots></div>
 *   </div>
 *
 * База без JS — сама дорожка на scroll-snap; органы управления CSS прячет,
 * пока на корне нет data-gr-state. Автоплей по WCAG 2.2.2 обязан иметь
 * паузу: если кнопки [data-gr-pause] в разметке нет, она создаётся;
 * наведение и фокус тоже останавливают ход, а prefers-reduced-motion
 * отключает автоплей вовсе. Живая область дорожки — polite, при автоплее —
 * off: читать вслух каждый слайд каждые четыре секунды нельзя.
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    autoplay: 0,          // мс между слайдами; 0 — выключено
    loop: false,
    rewind: false,        // с края — на другой край, без клонов
    step: 1,              // шаг кнопок и точек: число или 'page' (на число видимых)
    pauseOnHover: true,
    dots: true,
    engine: 'scroll',
    dotLabel: 'Страница {i}',
    pauseLabel: 'Пауза'
  };

  function reducedMotion() {
    try {
      return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  G.defineWidget('slider', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);

    var trackEl = el.querySelector('.gr-track') || el.firstElementChild;

    if (!trackEl) throw new Error('у слайдера нет дорожки');

    var track = G.track(trackEl, { loop: o.loop, rewind: o.rewind, step: o.step, engine: o.engine, index: o.index || 0 });
    var attrs = G.recorder();
    var events = G.listeners();
    var setAttr = attrs.set;
    var listen = events.add;
    var created = [];
    var dots = [];
    var prevBtn = el.querySelector('[data-gr-prev]');
    var nextBtn = el.querySelector('[data-gr-next]');
    var dotsEl = el.querySelector('[data-gr-dots]');
    var pauseBtn = el.querySelector('[data-gr-pause]');
    var timer = null;
    var userPaused = false;   // нажата кнопка паузы: наведение больше не возобновляет
    var held = 0;             // сколько причин держат паузу (наведение, фокус, скрытая вкладка)

    function button(className, label) {
      var node = document.createElement('button');

      node.setAttribute('type', 'button');
      node.setAttribute('class', className);
      node.setAttribute('aria-label', label);
      created.push(node);

      return node;
    }

    // --- Состояние органов управления -----------------------------------------

    function update() {
      var page = track.pageOf(track.index);
      var i = track.physical(track.index);

      for (var d = 0; d < dots.length; d++) setAttr(dots[d], 'aria-current', d === page ? 'true' : null);

      // Без цикла и без rewind у края кнопка недоступна. Берётся у дорожки:
      // loop без поддержки движка она сама превращает в rewind.
      if (!track.loop && !track.rewind) {
        if (prevBtn) setAttr(prevBtn, 'aria-disabled', i <= 0 ? 'true' : null);
        if (nextBtn) setAttr(nextBtn, 'aria-disabled', i >= track.last ? 'true' : null);
      }
    }

    // Точка на СТРАНИЦУ, а не на слайд: при нескольких слайдах в ряд точка
    // на каждый вела бы туда, куда дорожка не доедет. Перестраиваются
    // при смене геометрии (брейкпоинт, добавленный слайд).
    function buildDots() {
      if (!dotsEl || !o.dots) return;

      for (var d = 0; d < dots.length; d++) {
        dots[d].remove();
        created.splice(created.indexOf(dots[d]), 1);
      }
      dots = [];

      for (var i = 0; i < track.pages; i++) {
        var dot = button('gr-slider-dot', o.dotLabel.replace('{i}', i + 1));

        dot.setAttribute('data-gr-page', String(i));
        dotsEl.appendChild(dot);
        dots.push(dot);
      }
    }

    function onDotClick(event) {
      var node = G.closest(event.target, '.gr-slider-dot');

      if (!node || !dotsEl) return;

      var page = Number(node.getAttribute('data-gr-page'));

      if (!isNaN(page)) { track.goToPage(page); restartTimer(); }
    }

    function onLayout() {
      buildDots();
      update();
    }

    // --- Автоплей --------------------------------------------------------------

    // Автоплей всегда идёт по кругу: у последней страницы — на первую.
    function advance() {
      if (!track.next()) track.goTo(0);
    }

    function playing() { return !!timer && timer.running(); }

    function play() {
      if (!timer || userPaused || held > 0) return api;

      timer.start();
      setAttr(el, 'data-gr-state', 'playing');

      return api;
    }

    function pause() {
      if (!timer) return api;

      timer.pause();
      setAttr(el, 'data-gr-state', 'paused');

      return api;
    }

    function restartTimer() {
      if (timer && playing()) timer.restart();
    }

    function hold() { held += 1; pause(); }
    function release() { held = Math.max(0, held - 1); play(); }

    function toggle() {
      userPaused = !userPaused;

      if (pauseBtn) setAttr(pauseBtn, 'aria-pressed', userPaused ? 'true' : 'false');

      if (userPaused) pause();
      else play();
    }

    function onVisibility() {
      if (document.hidden) hold();
      else release();
    }

    function setupAutoplay() {
      if (!o.autoplay || reducedMotion() || track.count < 2) return;

      if (!pauseBtn) {
        pauseBtn = button('gr-slider-pause', o.pauseLabel);
        pauseBtn.setAttribute('data-gr-pause', '');
        pauseBtn.textContent = '❚❚';
        el.appendChild(pauseBtn);
      }

      setAttr(pauseBtn, 'aria-pressed', 'false');

      timer = G.motion.time({ duration: o.autoplay, loop: true, el: pauseBtn, onEnd: advance });

      listen(pauseBtn, 'click', toggle);

      if (o.pauseOnHover) {
        listen(el, 'pointerenter', hold);
        listen(el, 'pointerleave', release);
      }

      listen(el, 'focusin', hold);
      listen(el, 'focusout', release);
      listen(document, 'visibilitychange', onVisibility);

      play();
    }

    // --- Публичное -------------------------------------------------------------

    function goTo(i, options) { return track.goTo(i, options); }
    function next() { restartTimer(); return track.next(); }
    function prev() { restartTimer(); return track.prev(); }

    function onChange() { update(); }

    function destroy() {
      if (timer) timer.stop();
      timer = null;

      events.removeAll();

      for (var j = 0; j < created.length; j++) created[j].remove();
      created = [];
      dots = [];

      track.destroy();
      attrs.restore();
    }

    var api = {
      el: el,
      track: track,
      goTo: goTo,
      next: next,
      prev: prev,
      play: play,
      pause: pause,
      playing: playing,
      destroy: destroy
    };

    // --- Подъём ----------------------------------------------------------------

    if (!el.getAttribute('role')) setAttr(el, 'role', 'region');
    setAttr(el, 'aria-roledescription', 'carousel');
    setAttr(trackEl, 'aria-live', o.autoplay ? 'off' : 'polite');
    setAttr(el, 'data-gr-state', 'ready');

    buildDots();

    if (prevBtn) listen(prevBtn, 'click', function () { prev(); });
    if (nextBtn) listen(nextBtn, 'click', function () { next(); });
    if (dotsEl) listen(dotsEl, 'click', onDotClick);

    listen(trackEl, G.track.CHANGE, onChange);
    listen(trackEl, G.track.LAYOUT, onLayout);

    update();
    setupAutoplay();

    return api;
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
