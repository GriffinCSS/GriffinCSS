/*
 * GriffinJS — контроллер окон поверх <dialog>: модалка и выдвижная панель.
 *
 *   <button data-gr-open="#cart">Корзина</button>
 *   <dialog class="gr-drawer gr-drawer-end" id="cart" data-gr-dialog="hash">…</dialog>
 *
 * Верхний слой, ловушка фокуса, Esc, inert под окном и возврат фокуса —
 * от <dialog>; закрытие щелчком по подложке — data-gr-overlay-close
 * из рантайма компонентов. Контроллер добавляет то, чего нет ни у того,
 * ни у другого:
 *
 *   * data-gr-open="#id" на любой кнопке — открытие без onclick;
 *   * стек: окна, открытые одно поверх другого, известны слою
 *     (GriffinJS.dialog.top(), stack(), closeAll());
 *   * блокировка прокрутки под окном: data-gr-state="locked" на <html>
 *     (CSS прячет переполнение), а на сенсорном экране — touchmove вне
 *     прокручиваемого содержимого окна отменяется: iOS Safari двигает
 *     страницу под модальным окном и с inert;
 *   * остановка медиа при закрытии: <video>/<audio> на паузу, <iframe>
 *     разгружается и возвращается при следующем открытии;
 *   * ajax-содержимое: data-gr-src грузится один раз в [data-gr-content]
 *     (или в само окно), состояния loading → open | error;
 *   * hash: открытие пишет #id в историю, «Назад» закрывает окно,
 *     а страница, открытая с #id, показывает окно сразу;
 *   * рост окна (Этап 48d) — data-gr-dialog="grow": ResizeObserver
 *     на окне, и смена высоты больше 24 px идёт анимацией от прежней
 *     к новой (element.animate по block-size — не спорит с transition
 *     компонента). Для окна, чьё содержимое приходит ajax'ом: плашка
 *     в 10rem не прыгает к форме, а вырастает до неё. Только по атрибуту:
 *     наблюдатель на каждом окне — цена, которую не все просили. Открытие
 *     и закрытие не трогаются, prefers-reduced-motion — без анимации.
 *
 * Разметка и стили .gr-modal / .gr-drawer не меняются. Окно поднимается
 * по data-gr-dialog или при первом открытии через data-gr-open — атрибут
 * на самом окне нужен только ради параметров.
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    hash: false,
    media: true,
    lock: true,
    grow: false
  };

  // Порог роста: ниже — ввод в textarea с автовысотой, а не приход содержимого.
  var GROW_STEP = 24;

  function reducedMotion() {
    try {
      return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  // Темп окна, мс: --gr-modal-transition темы, иначе --gr-transition;
  // «0.2s ease» → 200, пусто или 0s → 0.
  function duration(node) {
    var value = '';

    try {
      var styles = getComputedStyle(node);

      value = styles.getPropertyValue('--gr-modal-transition') || styles.getPropertyValue('--gr-transition');
    } catch (e) { /* без CSSOM */ }

    var m = /(\d*\.?\d+)(m?s)/.exec(value);

    return m ? parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : 0;
  }

  var OPEN_ATTR = 'data-gr-open';

  var stack = [];              // открытые окна, последнее — верхнее
  var lock = G.recorder();     // состояние на <html>
  var lockEvents = G.listeners();
  var lockedBy = 0;

  function idOf(value) {
    return (value || '').replace(/^#/, '');
  }

  // Прокручиваемый предок внутри окна: жест в теле окна с прокруткой —
  // законный, всё остальное двигало бы страницу.
  function scrollable(node, root) {
    var n = node;

    while (n && n !== root) {
      try {
        var cs = getComputedStyle(n);

        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return true;
      } catch (e) { /* без CSSOM */ }

      n = n.parentNode;
    }

    return false;
  }

  function onTouchMove(event) {
    var top = stack[stack.length - 1];

    if (!top) return;
    if (scrollable(event.target, top.el)) return;

    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  function relock() {
    var want = 0;

    for (var i = 0; i < stack.length; i++) if (stack[i].o.lock) want += 1;

    if (want && !lockedBy) {
      lock.set(document.documentElement, 'data-gr-state', 'locked');
      lockEvents.add(document, 'touchmove', onTouchMove, { passive: false });
    } else if (!want && lockedBy) {
      lock.restore();
      lockEvents.removeAll();
    }

    lockedBy = want;
  }

  // --- Виджет ---------------------------------------------------------------

  G.defineWidget('dialog', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();
    var setAttr = attrs.set;
    var listen = events.add;

    var loaded = false;
    var frames = [];           // [{el, src}] — разгруженные iframe
    var byHistory = false;     // закрыто кнопкой «Назад»: back() не зовём
    var record = { el: el, o: o };
    var grow = null;           // ResizeObserver — только по grow
    var known = 0;             // высота окна по последнему наблюдению
    var growing = null;        // идущая анимация высоты

    function id() { return el.getAttribute('id') || ''; }

    function isOpen() { return el.hasAttribute('open'); }

    // --- Медиа --------------------------------------------------------------

    function stopMedia() {
      if (!o.media) return;

      var media = el.querySelectorAll('video, audio');
      var iframes = el.querySelectorAll('iframe');

      for (var i = 0; i < media.length; i++) {
        if (typeof media[i].pause === 'function') media[i].pause();
      }

      for (var j = 0; j < iframes.length; j++) {
        var src = iframes[j].getAttribute('src');

        if (src && src !== 'about:blank') {
          frames.push({ el: iframes[j], src: src });
          iframes[j].setAttribute('src', 'about:blank');
        }
      }
    }

    function restoreMedia() {
      for (var i = 0; i < frames.length; i++) frames[i].el.setAttribute('src', frames[i].src);
      frames = [];
    }

    // --- Ajax ---------------------------------------------------------------

    function load() {
      var src = el.getAttribute('data-gr-src');

      if (!src || loaded) return;

      loaded = true;

      if (typeof fetch !== 'function') {
        G.warn('окно: fetch недоступен, ' + src + ' не загружен');
        setAttr(el, 'data-gr-state', 'error');
        return;
      }

      var target = el.querySelector('[data-gr-content]') || el;

      setAttr(el, 'data-gr-state', 'loading');

      fetch(src).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);

        return response.text();
      }).then(function (html) {
        target.innerHTML = html;
        setAttr(el, 'data-gr-state', isOpen() ? 'open' : 'ready');
      }, function (error) {
        G.warn('окно: ' + src + ' не загружен: ' + (error && error.message));
        setAttr(el, 'data-gr-state', 'error');
      });
    }

    // --- Рост окна ----------------------------------------------------------

    // Открытие и закрытие (0 ↔ высота) — не рост; мелочь до порога — тоже.
    // Анимация меняет размер самого окна, поэтому на её время окно снято
    // с наблюдения: начатая здесь при живом наблюдении, она давала на window
    // «ResizeObserver loop completed with undelivered notifications».
    // Промежуточные высоты — её же, слушать их незачем. Вернувшись,
    // наблюдение первым сообщает текущую высоту: если за время анимации
    // пришло ещё содержимое, окно дорастёт следующей.
    function onResize() {
      var next = el.getBoundingClientRect().height;
      var prev = known;

      known = next;

      if (!prev || !next || !isOpen() || Math.abs(next - prev) <= GROW_STEP) return;

      var ms = reducedMotion() ? 0 : duration(el);

      if (!ms || typeof el.animate !== 'function') return;

      grow.unobserve(el);
      growing = el.animate([{ blockSize: prev + 'px' }, { blockSize: next + 'px' }], { duration: ms, easing: 'ease' });
      growing.onfinish = growing.oncancel = settle;
    }

    // После destroy() наблюдателя нет: отмена приходит позже и не вернёт его.
    function settle() {
      growing = null;
      if (grow) grow.observe(el);
    }

    // --- Hash ---------------------------------------------------------------

    function hashIs() {
      return typeof location !== 'undefined' && location.hash === '#' + id();
    }

    function pushHash() {
      if (!o.hash || !id() || typeof history === 'undefined' || hashIs()) return;

      try { history.pushState(null, '', '#' + id()); } catch (e) { /* file:// и прочее */ }
    }

    function popHash() {
      if (!o.hash || byHistory || typeof history === 'undefined' || !hashIs()) return;

      try { history.back(); } catch (e) { /* без истории */ }
    }

    // --- Открытие и закрытие ------------------------------------------------

    function open() {
      if (isOpen()) return api;

      restoreMedia();

      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');

      stack.push(record);
      relock();
      setAttr(el, 'data-gr-state', 'open');
      load();
      pushHash();
      G.emit('griffin:open', el, { dialog: el });

      return api;
    }

    function close() {
      if (!isOpen()) return api;

      if (typeof el.close === 'function') el.close();
      else { el.removeAttribute('open'); onClose(); }

      return api;
    }

    // Событие close приходит и от Esc, и от <form method="dialog">,
    // и от close() — здесь единая точка.
    function onClose() {
      var at = stack.indexOf(record);
      if (at !== -1) stack.splice(at, 1);

      relock();
      stopMedia();
      popHash();
      byHistory = false;

      if (el.getAttribute('data-gr-state') !== 'loading') setAttr(el, 'data-gr-state', 'ready');

      G.emit('griffin:close', el, { dialog: el });
    }

    // «Назад» в браузере: hash ушёл — окно закрывается, историю не трогаем.
    function onPopState() {
      if (!o.hash || !isOpen() || hashIs()) return;

      byHistory = true;
      close();
    }

    function destroy() {
      var at = stack.indexOf(record);
      if (at !== -1) stack.splice(at, 1);

      if (grow) { grow.disconnect(); grow = null; }
      if (growing) growing.cancel();
      relock();
      restoreMedia();
      events.removeAll();
      attrs.restore();
    }

    var api = {
      el: el,
      open: open,
      close: close,
      isOpen: isOpen,
      onPopState: onPopState,
      destroy: destroy
    };

    listen(el, 'close', onClose);
    setAttr(el, 'data-gr-state', isOpen() ? 'open' : 'ready');

    if (o.grow && typeof ResizeObserver === 'function') {
      grow = new ResizeObserver(onResize);
      grow.observe(el);
    }

    if (isOpen()) { stack.push(record); relock(); }

    // Страница открыта с #id — окно показывается сразу.
    if (o.hash && hashIs() && !isOpen()) open();

    return api;
  });

  // --- Глобальное -----------------------------------------------------------

  function instanceOf(target) {
    var node = typeof target === 'string' ? document.getElementById(idOf(target)) : target;

    if (!node) return null;

    return G.instance(node, 'dialog') || G.mount(node, 'dialog');
  }

  function open(target) {
    var w = instanceOf(target);

    if (!w) { G.warn('окно не найдено: ' + target); return null; }

    return w.open();
  }

  function close(target) {
    var w = instanceOf(target);

    return w ? w.close() : null;
  }

  function top() { return stack.length ? stack[stack.length - 1].el : null; }

  function list() {
    var out = [];
    for (var i = 0; i < stack.length; i++) out.push(stack[i].el);
    return out;
  }

  function closeAll() {
    while (stack.length) {
      var w = G.instance(stack[stack.length - 1].el, 'dialog');

      if (w) w.close(); else stack.pop();
    }

    relock();
  }

  function onPopState() {
    var mounted = G._mounted();

    for (var i = 0; i < mounted.length; i++) {
      if (mounted[i].name === 'dialog' && mounted[i].instance) mounted[i].instance.onPopState();
    }
  }

  function onOpenClick(event, node) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return false;

    if (event.preventDefault) event.preventDefault();
    open(node.getAttribute(OPEN_ATTR));

    return true;
  }

  G.dialog = { open: open, close: close, closeAll: closeAll, top: top, stack: list, _popstate: onPopState };

  G.on('click', '[' + OPEN_ATTR + ']', onOpenClick);

  G.use({
    start: function () {
      if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState);
    },
    destroy: function () {
      if (typeof window !== 'undefined') window.removeEventListener('popstate', onPopState);
      stack = [];
      lockedBy = 0;
      lock.restore();
      lockEvents.removeAll();
    }
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
