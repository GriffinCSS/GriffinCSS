/*
 * GriffinJS — сканер DOM.
 *
 * Свой экземпляр по образцу ядра Griffincss: слой не зависит
 * от griffincss.js и не может взять его _scanner. Наблюдает за документом
 * после старта: появившиеся узлы получают свои виджеты, удалённые —
 * теряют их (destroy у экземпляра). Без MutationObserver — молчаливый
 * no-op: виджеты поднимаются только на старте и по GriffinJS.init(root).
 */
(function (G) {
  'use strict';

  var observer = null;
  var timer = null;
  var pending = [];

  function flush() {
    timer = null;

    var roots = pending;
    pending = [];

    G._prune();

    for (var i = 0; i < roots.length; i++) G.init(roots[i]);
  }

  function onMutations(mutations) {
    var dirty = false;

    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;

      for (var j = 0; j < added.length; j++) {
        // Только элементы: текстовым узлам виджеты не полагаются.
        if (added[j].nodeType === 1) { pending.push(added[j]); dirty = true; }
      }

      if (mutations[i].removedNodes.length) dirty = true;
    }

    if (!dirty || timer) return;

    // Одна порция на тик: поток вставок из шаблонизатора не должен
    // поднимать виджеты по одному на каждую мутацию.
    timer = setTimeout(flush, 0);
  }

  function start() {
    if (observer || typeof MutationObserver === 'undefined') return;

    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    pending = [];

    if (!observer) return;

    observer.disconnect();
    observer = null;
  }

  G.scanner = { start: start, stop: stop, _flush: flush };

  G.use({ start: start, destroy: stop });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
