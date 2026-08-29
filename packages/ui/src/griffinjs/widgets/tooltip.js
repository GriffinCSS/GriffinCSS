/*
 * GriffinJS — контроллер подсказки в верхнем слое поверх .gr-tooltip-anchor.
 *
 *   <span class="gr-tooltip-anchor" data-gr-tooltip="side: bottom">
 *     <button class="gr-btn" aria-describedby="t1">В таблице</button>
 *     <span class="gr-tooltip" id="t1" role="tooltip">Не обрежется</span>
 *   </span>
 *
 * Обычной подсказке скрипт не нужен: :hover и :focus-within в ui
 * показывают её сами. Он нужен подсказке внутри блока с overflow: hidden
 * или прокруткой — её обрезает край предка, и спасает только верхний
 * слой. Контроллер переводит подсказку в popover="manual" (если атрибута
 * нет в разметке — снимет при destroy), показывает её по наведению
 * с задержкой (pointerType mouse/pen) и по фокусу сразу, прячет по уходу
 * указателя, потере фокуса и Esc, а положение у якоря считает сам
 * (нужен griffinjs-anchor.js) — CSS anchor positioning не зависимость.
 *
 * База без JS — та же разметка без popover: подсказка в обёртке,
 * которую показывает CSS.
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    delay: 150,
    side: 'top',       // top | bottom | start | end
    align: 'center',
    gap: 6
  };

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

  G.defineWidget('tooltip', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();
    var setAttr = attrs.set;
    var listen = events.add;

    var target = el.firstElementChild;
    var tip = el.querySelector('[role="tooltip"]') || el.lastElementChild;

    if (!target || !tip || tip === target) throw new Error('у подсказки нет якоря и текста');

    var shown = false;
    var timer = null;

    function cancelTimer() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function show() {
      cancelTimer();
      if (shown) return;

      shown = true;

      try { tip.showPopover(); } catch (e) { /* уже показана или не popover */ }

      setAttr(el, 'data-gr-state', 'open');

      if (G.anchor) G.anchor.place(tip, target, { side: o.side, align: o.align, gap: o.gap });
    }

    function hide() {
      cancelTimer();
      if (!shown) return;

      shown = false;

      try { tip.hidePopover(); } catch (e) { /* уже скрыта */ }

      if (G.anchor) G.anchor.clear(tip);

      setAttr(el, 'data-gr-state', 'ready');
    }

    // Показанная подсказка догоняет якорь при прокрутке и смене размера окна.
    function onReflow() {
      if (shown && G.anchor) G.anchor.place(tip, target, { side: o.side, align: o.align, gap: o.gap });
    }

    function schedule() {
      cancelTimer();

      if (shown) return;
      if (o.delay > 0) timer = setTimeout(function () { timer = null; show(); }, o.delay);
      else show();
    }

    function onPointerOver(event) {
      if (isPointer(event)) schedule();
    }

    function onPointerOut(event) {
      if (!isPointer(event)) return;
      if (event.relatedTarget && contains(el, event.relatedTarget)) return;

      hide();
    }

    function onFocusOut(event) {
      if (event.relatedTarget && contains(el, event.relatedTarget)) return;

      hide();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape' && shown) hide();
    }

    // Спрятана снаружи (другим скриптом) — состояние догоняет.
    function onToggle(event) {
      if (event.newState === 'closed' && shown) hide();
    }

    function destroy() {
      hide();
      events.removeAll();
      attrs.restore();
    }

    // --- Подъём ---------------------------------------------------------------

    if (!tip.hasAttribute('popover')) setAttr(tip, 'popover', 'manual');

    listen(el, 'pointerover', onPointerOver);
    listen(el, 'pointerout', onPointerOut);
    listen(el, 'focusin', function () { show(); });
    listen(el, 'focusout', onFocusOut);
    listen(tip, 'toggle', onToggle);
    listen(document, 'keydown', onKeyDown, true);
    listen(document, 'scroll', onReflow, true);
    if (typeof window !== 'undefined') listen(window, 'resize', onReflow);

    setAttr(el, 'data-gr-state', 'ready');

    return {
      el: el,
      tip: tip,
      show: show,
      hide: hide,
      destroy: destroy
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
