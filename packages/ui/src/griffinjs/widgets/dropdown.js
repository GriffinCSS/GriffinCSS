/*
 * GriffinJS — контроллер дропдауна поверх .gr-dropdown из пакета ui.
 *
 *   <details class="gr-dropdown" data-gr-dropdown>            — на <details>
 *   <div class="gr-dropdown" data-gr-dropdown>                — на popover
 *     <button popovertarget="m">…</button><div id="m" popover>…</div>
 *   <div class="gr-dropdown gr-dropdown-hover" data-gr-dropdown="hover">
 *
 * Разметка и стили компонента не меняются: первый ребёнок обёртки —
 * кнопка (summary или button), следующий за ним — панель. Скрипт
 * добавляет то, чего платформа не даёт:
 *
 *   * роли меню (role: menu — по умолчанию; none — панель с формой):
 *     menu / menuitem / separator, aria-haspopup, aria-expanded,
 *     aria-controls — состояние сообщается разметкой честно;
 *   * клавиатуру по WAI-ARIA menu button: ↓ открывает и ведёт в меню,
 *     ↑↓ Home End по пунктам, набор по первой букве, Esc закрывает
 *     и возвращает фокус;
 *   * <details> получает закрытие по Esc и щелчку мимо; уход фокуса
 *     из обёртки закрывает любой вариант;
 *   * позицию popover-панели у кнопки: считается здесь, а не CSS anchor
 *     positioning, — одинаково во всех движках (нужен griffinjs-anchor.js);
 *   * наведение с задержкой намерения (hover) — только для pointerType
 *     mouse/pen: касание открывает щелчком, как без скрипта.
 *
 * Открытое состояние — data-gr-state="open" на обёртке: у варианта
 * по наведению (.gr-dropdown-hover) панель по нему показывает CSS слоя.
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    role: 'menu',      // menu | none
    hover: false,
    delay: 100,
    hide: 300,
    side: 'bottom',    // для popover-панели: bottom | top | start | end
    align: 'start',    // start | center | end
    gap: 4
  };

  var ITEMS = 'a[href], button, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

  var seq = 0;

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
    return !!node && !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true';
  }

  function focusTo(node) {
    if (!node || typeof node.focus !== 'function') return false;

    node.focus();

    return document.activeElement === node;
  }

  G.defineWidget('dropdown', { needs: ['anchor'] }, function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();
    var setAttr = attrs.set;
    var listen = events.add;

    var trigger = el.firstElementChild;
    var panel = trigger && trigger.nextElementSibling;

    if (!trigger || !panel) throw new Error('у дропдауна нет кнопки и панели');

    var kind = el.tagName === 'DETAILS' ? 'details' : panel.hasAttribute('popover') ? 'popover' : 'css';
    var opened = false;        // для popover и css: <details> знает сам
    var viaKeyboard = false;   // открыто с клавиатуры — фокус уходит в меню
    var timer = null;

    // --- Состояние ------------------------------------------------------------

    function isOpen() {
      return kind === 'details' ? !!el.open : opened;
    }

    function items() {
      var out = [];
      var all = panel.querySelectorAll(ITEMS);

      for (var i = 0; i < all.length; i++) if (focusable(all[i])) out.push(all[i]);

      return out;
    }

    // Координаты popover-панели. При закрытии НЕ снимаются: панель уходит
    // переходом (display allow-discrete) и всё это время обязана стоять
    // на месте, а не прыгать в статическое положение. Снимает их destroy.
    function place() {
      if (kind === 'popover' && G.anchor) G.anchor.place(panel, trigger, { side: o.side, align: o.align, gap: o.gap });
    }

    function sync(now) {
      if (kind !== 'details') opened = now;

      setAttr(trigger, 'aria-expanded', now ? 'true' : 'false');
      setAttr(el, 'data-gr-state', now ? 'open' : 'ready');

      if (now) place();

      if (now && viaKeyboard) focusTo(items()[0]);
      viaKeyboard = false;
    }

    // beforetoggle приходит синхронно, до показа: панель ещё без размера,
    // но для «снизу, по началу строки» размер и не нужен, а без этой
    // предварительной позиции она на один кадр вспыхивала бы в статическом
    // положении. Окончательная позиция — в toggle, уже с размером.
    function onBeforeToggle(event) {
      if (event.newState === 'open') place();
    }

    // Панель в верхнем слое к прокрутке не привязана: при прокрутке любого
    // контейнера и смене размера окна она догоняет кнопку.
    function onReflow() {
      if (kind === 'popover' && isOpen()) place();
    }

    function open() {
      cancelTimer();
      if (isOpen()) return;

      if (kind === 'details') el.open = true;
      else if (kind === 'popover') {
        try { panel.showPopover(); } catch (e) { sync(true); }
      } else sync(true);
    }

    function close() {
      cancelTimer();
      if (!isOpen()) return;

      if (kind === 'details') el.open = false;
      else if (kind === 'popover') {
        try { panel.hidePopover(); } catch (e) { sync(false); }
      } else sync(false);
    }

    function toggle() { if (isOpen()) close(); else open(); }

    // --- Роли -----------------------------------------------------------------

    function roles() {
      if (o.role !== 'menu') return;

      var list = panel.querySelector('ul, ol') || panel;

      setAttr(trigger, 'aria-haspopup', 'menu');
      setAttr(list, 'role', 'menu');

      var lis = list.querySelectorAll('li');
      for (var i = 0; i < lis.length; i++) setAttr(lis[i], 'role', 'none');

      var seps = list.querySelectorAll('hr');
      for (var j = 0; j < seps.length; j++) setAttr(seps[j], 'role', 'separator');

      var all = list.querySelectorAll('a[href], button');
      for (var k = 0; k < all.length; k++) {
        if (all[k].getAttribute('role')) continue;
        setAttr(all[k], 'role', all[k].hasAttribute('aria-checked') ? 'menuitemcheckbox' : 'menuitem');
      }
    }

    // --- Клавиатура -----------------------------------------------------------

    function moveIn(list, from, delta) {
      var at = from === null ? (delta > 0 ? -1 : list.length) : list.indexOf(from);

      if (at === -1 && from !== null) return false;

      for (var i = 0; i < list.length; i++) {
        at = (at + delta + list.length) % list.length;
        if (focusTo(list[at])) return true;
      }

      return false;
    }

    // Набор по первой букве: следующий после текущего пункт, чей текст
    // начинается с нажатой буквы, по кругу.
    function typeahead(list, from, char) {
      var start = list.indexOf(from);

      for (var i = 1; i <= list.length; i++) {
        var node = list[(start + i) % list.length];
        var text = (node.textContent || '').trim().toLowerCase();

        if (text.charAt(0) === char.toLowerCase() && focusTo(node)) return true;
      }

      return false;
    }

    function onKeyDown(event) {
      var key = event.key;
      var target = event.target;

      if (key === 'Escape') {
        if (!isOpen()) return;

        close();
        focusTo(trigger);
        event.preventDefault();
        return;
      }

      if (target === trigger) {
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          viaKeyboard = true;
          if (isOpen()) focusTo(key === 'ArrowDown' ? items()[0] : items()[items().length - 1]);
          else open();
          event.preventDefault();
        } else if (key === 'Enter' || key === ' ') {
          // Платформа сама переключит <details> или popover; фокус уйдёт в меню.
          viaKeyboard = !isOpen();
        }

        return;
      }

      if (!contains(panel, target) || !isOpen()) return;

      var list = items();

      if (key === 'ArrowDown') moveIn(list, target, 1);
      else if (key === 'ArrowUp') moveIn(list, target, -1);
      else if (key === 'Home') moveIn(list, null, 1);
      else if (key === 'End') moveIn(list, null, -1);
      else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && key !== ' ') typeahead(list, target, key);
      else return;

      event.preventDefault();
    }

    // --- Указатель и фокус ----------------------------------------------------

    function cancelTimer() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function onPointerOver(event) {
      if (!o.hover || !isPointer(event)) return;

      cancelTimer();

      if (!isOpen()) timer = setTimeout(function () { timer = null; open(); }, o.delay);
    }

    function onPointerOut(event) {
      if (!o.hover || !isPointer(event)) return;
      if (event.relatedTarget && contains(el, event.relatedTarget)) return;

      cancelTimer();
      timer = setTimeout(function () { timer = null; close(); }, o.hide);
    }

    function onPointerDown(event) {
      if (!contains(el, event.target)) close();
    }

    function onFocusOut(event) {
      if (event.relatedTarget && contains(el, event.relatedTarget)) return;

      close();
    }

    function destroy() {
      cancelTimer();
      events.removeAll();
      if (kind === 'popover' && G.anchor) G.anchor.clear(panel);
      attrs.restore();
    }

    // --- Подъём ---------------------------------------------------------------

    if (!panel.getAttribute('id')) setAttr(panel, 'id', 'gr-dropdown-' + (++seq));
    setAttr(trigger, 'aria-controls', panel.getAttribute('id'));

    roles();

    if (kind === 'details') listen(el, 'toggle', function () { sync(!!el.open); });
    else if (kind === 'popover') {
      listen(panel, 'beforetoggle', onBeforeToggle);
      listen(panel, 'toggle', function (event) { sync(event.newState === 'open'); });
      listen(document, 'scroll', onReflow, true);
      if (typeof window !== 'undefined') listen(window, 'resize', onReflow);
    }
    else listen(trigger, 'click', function () { toggle(); });

    listen(el, 'keydown', onKeyDown);
    listen(el, 'pointerover', onPointerOver);
    listen(el, 'pointerout', onPointerOut);
    listen(el, 'focusout', onFocusOut);
    listen(document, 'pointerdown', onPointerDown, true);

    sync(isOpen());

    return {
      el: el,
      trigger: trigger,
      panel: panel,
      kind: kind,
      open: open,
      close: close,
      toggle: toggle,
      isOpen: isOpen,
      destroy: destroy
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
