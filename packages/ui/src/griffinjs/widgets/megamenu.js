/*
 * GriffinJS — мегаменю: панели во всю ширину полосы под пунктами шапки.
 *
 *   <nav class="gr-navbar gr-megamenu" data-gr-megamenu="delay: 120; hide: 250">
 *     <a class="gr-navbar-brand" href="/">Сайт</a>
 *     <details class="gr-nav-toggle"><summary aria-label="Меню">☰</summary></details>
 *     <ul class="gr-nav gr-nav-collapse">
 *       <li><details class="gr-megamenu-item" data-gr-src="/menu/catalog.html">
 *         <summary class="gr-nav-link">Каталог</summary>
 *         <div class="gr-megamenu-panel">…</div>
 *       </details></li>
 *       <li><a class="gr-nav-link" href="/sale">Акции</a></li>
 *     </ul>
 *   </nav>
 *
 * База без JS — <details> в пунктах: щелчок по заголовку раскрывает
 * панель, положение панели (dropbar на широком экране, аккордеон
 * в свёрнутой навигации на узком) — целиком CSS. Скрипт добавляет то,
 * чего платформа не даёт:
 *
 *   * единственную открытую панель на полосу;
 *   * наведение с задержкой намерения и безопасный треугольник —
 *     только для pointerType mouse/pen и только на широком экране:
 *     касание открывает панель тапом по заголовку, как без скрипта;
 *   * клавиатуру по WAI-ARIA disclosure navigation: ←→ Home End по верхнему
 *     ряду, ↓ открывает панель и ведёт в неё, ↑↓ внутри панели, Esc
 *     закрывает и возвращает фокус на заголовок;
 *   * закрытие щелчком мимо полосы и уходом фокуса;
 *   * ajax-панели: data-gr-src на пункте грузится при первом открытии,
 *     состояния loading → ready | error пишутся на пункт.
 *
 * Пункт — <details>, не вложенный в другой <details> полосы, с панелью
 * после <summary>. Переключатель шапки (.gr-nav-toggle) панели не имеет
 * и пунктом не считается.
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    hover: true,     // открывать по наведению (на широком экране)
    delay: 120,      // мс задержки намерения перед открытием
    hide: 250,       // мс после ухода указателя до закрытия
    bp: 'md'         // брейкпоинт широкого режима: --gr-bp-<bp>
  };

  var TOP = 'a[href], button, summary';
  var FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';

  var seq = 0;

  function isSummary(node) {
    return !!node && node.tagName === 'SUMMARY';
  }

  function isDetails(node) {
    return !!node && node.tagName === 'DETAILS';
  }

  function isPointer(event) {
    return !event.pointerType || event.pointerType === 'mouse' || event.pointerType === 'pen';
  }

  function contains(root, node) {
    var n = node;

    while (n) {
      if (n === root) return true;
      n = n.parentNode;
    }

    return false;
  }

  function focusable(node) {
    if (!node) return false;
    if (node.hasAttribute('disabled') || node.getAttribute('tabindex') === '-1') return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;

    return true;
  }

  // Фокус с проверкой: элемент, скрытый CSS (переключатель шапки на широком
  // экране), фокус не примет, и обход должен идти дальше.
  function focusTo(node) {
    if (!node || typeof node.focus !== 'function') return false;

    node.focus();

    return document.activeElement === node;
  }

  G.defineWidget('megamenu', { needs: ['media'] }, function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();
    var setAttr = attrs.set;
    var listen = events.add;

    var items = [];        // [{el, summary, panel, loaded}]
    var wide = false;
    var openTimer = null;
    var closeTimer = null;
    var pending = null;    // пункт, ожидающий открытия по наведению
    var prev = null;       // предыдущая точка указателя — для треугольника
    var unmedia = null;

    // --- Пункты ---------------------------------------------------------------

    function itemOf(node) {
      var n = node;

      while (n && n !== el) {
        for (var i = 0; i < items.length; i++) if (items[i].el === n) return items[i];
        n = n.parentNode;
      }

      return null;
    }

    function current() {
      for (var i = 0; i < items.length; i++) if (items[i].el.open) return items[i];

      return null;
    }

    // <details> полосы, не вложенный в другой <details>, с панелью
    // после заголовка.
    function collect() {
      var all = el.querySelectorAll('details');

      for (var i = 0; i < all.length; i++) {
        var d = all[i];
        var nested = false;
        var n = d.parentNode;

        while (n && n !== el) {
          if (isDetails(n)) { nested = true; break; }
          n = n.parentNode;
        }

        if (nested) continue;

        var summary = null;
        var panel = null;

        for (var j = 0; j < d.children.length; j++) {
          if (!summary && isSummary(d.children[j])) summary = d.children[j];
          else if (summary && !panel) panel = d.children[j];
        }

        if (summary && panel) items.push({ el: d, summary: summary, panel: panel, loaded: false });
      }
    }

    function setup(item) {
      if (!item.panel.getAttribute('id')) setAttr(item.panel, 'id', 'gr-megamenu-' + (++seq));

      setAttr(item.summary, 'aria-controls', item.panel.getAttribute('id'));
      setAttr(item.summary, 'aria-expanded', item.el.open ? 'true' : 'false');

      listen(item.el, 'toggle', function () { sync(item); });
    }

    function sync(item) {
      var isOpen = !!item.el.open;

      setAttr(item.summary, 'aria-expanded', isOpen ? 'true' : 'false');

      if (!isOpen) return;

      for (var i = 0; i < items.length; i++) {
        if (items[i] !== item && items[i].el.open) items[i].el.open = false;
      }

      load(item);
    }

    function open(item) {
      cancelTimers();
      if (item && !item.el.open) item.el.open = true;
    }

    function close(item) {
      if (item && item.el.open) item.el.open = false;
    }

    function closeAll() {
      cancelTimers();
      for (var i = 0; i < items.length; i++) close(items[i]);
    }

    // --- Ajax-панели ----------------------------------------------------------

    function load(item) {
      var src = item.el.getAttribute('data-gr-src');

      if (!src || item.loaded) return;

      item.loaded = true;

      if (typeof fetch !== 'function') {
        G.warn('мегаменю: fetch недоступен, панель ' + src + ' не загружена');
        setAttr(item.el, 'data-gr-state', 'error');
        return;
      }

      setAttr(item.el, 'data-gr-state', 'loading');

      fetch(src).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);

        return response.text();
      }).then(function (html) {
        item.panel.innerHTML = html;
        setAttr(item.el, 'data-gr-state', 'ready');
      }, function (error) {
        G.warn('мегаменю: панель ' + src + ' не загружена: ' + (error && error.message));
        setAttr(item.el, 'data-gr-state', 'error');
      });
    }

    // --- Наведение ------------------------------------------------------------

    function cancelTimers() {
      if (openTimer) clearTimeout(openTimer);
      if (closeTimer) clearTimeout(closeTimer);
      openTimer = closeTimer = null;
      pending = null;
    }

    function scheduleOpen(item) {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;

      if (pending === item) return;
      if (openTimer) clearTimeout(openTimer);

      pending = item;
      openTimer = setTimeout(function () {
        openTimer = null;
        pending = null;
        open(item);
      }, o.delay);
    }

    function scheduleClose() {
      if (openTimer) clearTimeout(openTimer);
      openTimer = null;
      pending = null;

      if (closeTimer) return;

      closeTimer = setTimeout(function () {
        closeTimer = null;
        closeAll();
      }, o.hide);
    }

    // Безопасный треугольник: указатель идёт от заголовка к открытой панели
    // через соседний пункт. Пока он движется внутрь треугольника «прошлая
    // точка — верхние углы панели», переключение откладывается.
    function towardsPanel(now, item) {
      if (!prev || !item || typeof item.panel.getBoundingClientRect !== 'function') return false;

      var r = item.panel.getBoundingClientRect();

      if (!r.width || now.y <= prev.y || now.y >= r.top) return false;

      var ax = r.left - prev.x, ay = r.top - prev.y;
      var bx = r.right - prev.x, by = r.top - prev.y;
      var qx = now.x - prev.x, qy = now.y - prev.y;

      return (ax * qy - ay * qx) * (bx * qy - by * qx) <= 0;
    }

    function onPointerOver(event) {
      if (!wide || !o.hover || !isPointer(event)) return;

      var item = itemOf(event.target);
      var active = current();

      if (!item) return;

      if (item === active || item === pending) {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = null;
        return;
      }

      scheduleOpen(item);
    }

    function onPointerOut(event) {
      if (!wide || !o.hover || !isPointer(event)) return;

      var to = event.relatedTarget;

      if (to && contains(el, to) && itemOf(to)) return;

      scheduleClose();
    }

    function onPointerMove(event) {
      if (!wide || !o.hover || !isPointer(event)) return;

      var now = { x: event.clientX, y: event.clientY };

      if (pending && towardsPanel(now, current())) {
        var item = pending;

        pending = null;
        scheduleOpen(item);
      }

      prev = now;
    }

    // --- Клавиатура -----------------------------------------------------------

    // Контейнер ряда — ближайший общий предок пунктов (.gr-nav): бренд
    // и переключатель шапки в кольцо стрелок не входят.
    function rowRoot() {
      if (!items.length) return el;

      var n = items[0].el.parentNode;

      while (n && n !== el) {
        var all = true;

        for (var i = 0; i < items.length; i++) if (!contains(n, items[i].el)) { all = false; break; }
        if (all) return n;

        n = n.parentNode;
      }

      return el;
    }

    // Верхний ряд: ссылки и кнопки ряда вне панелей плюс заголовки пунктов.
    function topLevel() {
      var out = [];
      var all = rowRoot().querySelectorAll(TOP);

      for (var i = 0; i < all.length; i++) {
        var node = all[i];
        var d = null;
        var n = node.parentNode;

        while (n && n !== el) {
          if (isDetails(n)) { d = n; break; }
          n = n.parentNode;
        }

        if (d) {
          if (!isSummary(node) || node.parentNode !== d || !itemOf(d)) continue;
        }

        if (focusable(node)) out.push(node);
      }

      return out;
    }

    function panelFocusables(item) {
      var out = [];
      var all = item.panel.querySelectorAll(FOCUSABLE);

      for (var i = 0; i < all.length; i++) if (focusable(all[i])) out.push(all[i]);

      return out;
    }

    // Следующий из списка по кругу, пропуская тех, кто фокус не принял.
    function moveIn(list, from, delta) {
      // from === null — с края: Home идёт с начала, End — с конца.
      var at = from === null ? (delta > 0 ? -1 : list.length) : list.indexOf(from);

      if (at === -1 && from !== null) return false;

      for (var i = 0; i < list.length; i++) {
        at = (at + delta + list.length) % list.length;
        if (focusTo(list[at])) return true;
      }

      return false;
    }

    function onKeyDown(event) {
      var key = event.key;
      var target = event.target;
      var item = itemOf(target);
      var inPanel = item && !isSummary(target);

      if (key === 'Escape') {
        var active = item && item.el.open ? item : current();

        if (!active) return;

        close(active);
        focusTo(active.summary);
        event.preventDefault();
        return;
      }

      if (inPanel) {
        if (!wide) return;

        var inside = panelFocusables(item);

        if (key === 'ArrowDown') moveIn(inside, target, 1);
        else if (key === 'ArrowUp') moveIn(inside, target, -1);
        else return;

        event.preventDefault();
        return;
      }

      if (!wide) return;

      var row = topLevel();

      if (row.indexOf(target) === -1) return;

      if (key === 'ArrowRight') moveIn(row, target, 1);
      else if (key === 'ArrowLeft') moveIn(row, target, -1);
      else if (key === 'Home') moveIn(row, null, 1);
      else if (key === 'End') moveIn(row, null, -1);
      else if (key === 'ArrowDown' && item) {
        open(item);
        focusTo(panelFocusables(item)[0]);
      } else return;

      event.preventDefault();
    }

    // --- Уход -----------------------------------------------------------------

    function onPointerDown(event) {
      if (!contains(el, event.target)) closeAll();
    }

    function onFocusOut(event) {
      if (!wide) return;

      var to = event.relatedTarget;

      if (to && contains(el, to)) return;

      closeAll();
    }

    function onMedia(matches) {
      wide = matches;
      cancelTimers();
    }

    function destroy() {
      cancelTimers();
      if (unmedia) unmedia();
      events.removeAll();
      attrs.restore();
    }

    // --- Подъём ---------------------------------------------------------------

    collect();

    for (var i = 0; i < items.length; i++) setup(items[i]);

    unmedia = G.media.on(o.bp, onMedia);

    listen(el, 'pointerover', onPointerOver);
    listen(el, 'pointerout', onPointerOut);
    listen(el, 'pointermove', onPointerMove);
    listen(el, 'keydown', onKeyDown);
    listen(el, 'focusout', onFocusOut);
    listen(document, 'pointerdown', onPointerDown, true);

    setAttr(el, 'data-gr-state', 'ready');

    return {
      el: el,
      items: items,
      open: open,
      close: close,
      closeAll: closeAll,
      current: current,
      destroy: destroy
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
