/*
 * GriffinJS — реестр делегирования событий.
 *
 * Перенос образца из griffincss-ui.js: виджет объявляет
 * {событие, селектор, обработчик}, диспетчер — один на тип события,
 * слушатель — на документе. Обработчик получает (event, node), где node
 * найден closest по селектору, и возвращает true, когда событие обработано
 * и очередь дальше не идёт. Порядок регистрации значим.
 */
(function (G) {
  'use strict';

  var registry = {};   // тип события → [{selector, handler}]
  var listening = false;

  function closest(node, selector) {
    if (!node) return null;
    if (typeof node.closest === 'function') return node.closest(selector);

    var current = node;

    while (current) {
      if (typeof current.matches === 'function' && current.matches(selector)) return current;
      current = current.parentNode;
    }

    return null;
  }

  function dispatch(event) {
    var entries = registry[event.type] || [];

    for (var i = 0; i < entries.length; i++) {
      var node = closest(event.target, entries[i].selector);

      if (node && entries[i].handler(event, node) === true) return;
    }
  }

  function on(type, selector, handler) {
    if (!registry[type]) {
      registry[type] = [];
      if (listening) document.addEventListener(type, dispatch);
    }

    registry[type].push({ selector: selector, handler: handler });

    return G;
  }

  function off(type, selector, handler) {
    var entries = registry[type] || [];

    for (var i = entries.length - 1; i >= 0; i--) {
      if (entries[i].selector === selector && (!handler || entries[i].handler === handler)) entries.splice(i, 1);
    }

    return G;
  }

  function listen(method) {
    for (var type in registry) {
      if (Object.prototype.hasOwnProperty.call(registry, type)) document[method](type, dispatch);
    }
  }

  // Событие слоя — CustomEvent с узла со всплытием; без dispatchEvent
  // у узла (мок-DOM) — с документа.
  function emit(name, node, detail) {
    try {
      var target = node && typeof node.dispatchEvent === 'function' ? node : document;

      target.dispatchEvent(new CustomEvent(name, { detail: detail, bubbles: true }));
    } catch (e) { /* окружение без CustomEvent */ }
  }

  G.on = on;
  G.off = off;
  G.emit = emit;
  G.closest = closest;

  G.use({
    start: function () { listening = true; listen('addEventListener'); },
    destroy: function () { listening = false; listen('removeEventListener'); }
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
