/*
 * GriffinJS — motion: прогресс 0…1 как общая валюта слоя.
 *
 * Источник прогресса — дорожка (scrollLeft/размер, считает движок),
 * окно просмотра (положение блока на экране), время (автоплей) или жест
 * (палец). Потребитель — слайд, параллакс блока, индикатор автоплея,
 * масштаб соседей — источника не знает: он читает var(--gr-progress)
 * в CSS. JS публикует только это свойство; transform и opacity
 * из JS не пишутся никогда — иначе эффект станет нестилизуемым.
 */
(function (G) {
  'use strict';

  var PROP = '--gr-progress';

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  // Публикация. Значение округляется до тысячных: строка в style
  // сравнивается браузером побайтно, и «0.3333333» на каждый кадр —
  // лишние инвалидации.
  function set(el, value) {
    if (!el || !el.style) return;

    el.style.setProperty(PROP, String(Math.round(clamp(value, 0, 1) * 1000) / 1000));
  }

  function clear(el) {
    if (el && el.style) el.style.removeProperty(PROP);
  }

  // --- Время ------------------------------------------------------------------

  // Тикер: прогресс 0…1 за duration мс, pause/resume, stop. Часы и
  // планировщик подменяются (тесты); по умолчанию — rAF, а без него
  // setTimeout. Автоплей слайдера строится на нём же: onEnd — «следующий
  // слайд», индикатор — --gr-progress на кнопке паузы.
  function time(opts) {
    var duration = opts.duration || 1000;
    var loop = !!opts.loop;
    var now = opts.now || (typeof performance !== 'undefined' && performance.now ? function () { return performance.now(); } : Date.now);
    var schedule = opts.schedule || (typeof requestAnimationFrame === 'function'
      ? function (fn) { return requestAnimationFrame(fn); }
      : function (fn) { return setTimeout(fn, 16); });
    var cancel = opts.cancel || (typeof cancelAnimationFrame === 'function'
      ? function (id) { cancelAnimationFrame(id); }
      : function (id) { clearTimeout(id); });

    var startedAt = 0;
    var elapsed = 0;       // накоплено до паузы
    var handle = null;
    var running = false;

    function publish(progress) {
      if (opts.el) set(opts.el, progress);
      if (opts.onProgress) opts.onProgress(progress);
    }

    function tick() {
      handle = null;

      if (!running) return;

      var total = elapsed + (now() - startedAt);
      var progress = total / duration;

      if (progress >= 1) {
        publish(1);

        if (opts.onEnd) opts.onEnd();

        if (loop && running) {
          elapsed = 0;
          startedAt = now();
          publish(0);
          handle = schedule(tick);
        } else {
          running = false;
        }

        return;
      }

      publish(progress);
      handle = schedule(tick);
    }

    function start() {
      if (running) return api;

      running = true;
      startedAt = now();
      handle = schedule(tick);

      return api;
    }

    function pause() {
      if (!running) return api;

      running = false;
      elapsed += now() - startedAt;

      if (handle !== null) { cancel(handle); handle = null; }

      return api;
    }

    function stop() {
      pause();
      elapsed = 0;
      publish(0);

      return api;
    }

    function restart() {
      stop();
      return start();
    }

    var api = {
      start: start,
      pause: pause,
      resume: start,
      stop: stop,
      restart: restart,
      running: function () { return running; }
    };

    return api;
  }

  // --- Окно просмотра ---------------------------------------------------------

  // Прогресс блока на экране: 0 — верхний край только вошёл снизу,
  // 1 — нижний край ушёл вверх. Чистая функция, чтобы формулу можно было
  // проверить без браузера; параллакс (21d) читает её через --gr-progress.
  function viewportProgress(rect, viewportHeight) {
    var span = viewportHeight + rect.height;

    if (span <= 0) return 0;

    return clamp((viewportHeight - rect.top) / span, 0, 1);
  }

  // Наблюдение: IntersectionObserver включает и выключает подписку
  // на scroll/resize, rAF сводит поток событий к одному пересчёту на кадр.
  function viewport(el, opts) {
    opts = opts || {};

    var active = false;
    var frame = null;
    var io = null;

    function measure() {
      frame = null;

      var height = typeof window !== 'undefined' ? window.innerHeight : 0;
      var progress = viewportProgress(el.getBoundingClientRect(), height);

      set(el, progress);
      if (opts.onProgress) opts.onProgress(progress);
    }

    function request() {
      if (frame === null && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(measure);
      else if (frame === null) measure();
    }

    function listen(on) {
      if (on === active) return;

      active = on;

      var method = on ? 'addEventListener' : 'removeEventListener';

      // scroll — на документе в фазе перехвата: так ловится прокрутка любого
      // контейнера, а не только окна (блок внутри прокручиваемой колонки).
      document[method]('scroll', request, { capture: true, passive: true });
      window[method]('resize', request);

      if (on) request();
    }

    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(function (entries) {
        listen(entries[entries.length - 1].isIntersecting);
      });
      io.observe(el);
    } else {
      listen(true);
    }

    return {
      update: request,
      destroy: function () {
        listen(false);
        if (io) io.disconnect();
        if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        clear(el);
      }
    };
  }

  G.motion = {
    PROP: PROP,
    set: set,
    clear: clear,
    clamp: clamp,
    time: time,
    viewport: viewport,
    viewportProgress: viewportProgress
  };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
