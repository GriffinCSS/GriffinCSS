/*
 * GriffinJS — брейкпоинты.
 *
 * Единственный источник — токены --gr-bp-* подключённого CSS: слой
 * не дублирует карту брейкпоинтов, иначе появился бы третий источник
 * правды рядом с _breakpoints.scss и рантаймом ядра. Без CSS ни один
 * брейкпоинт не известен, и matches() отвечает false: виджеты в таком
 * случае остаются в своём базовом (узком) режиме.
 *
 * Запросы — в range-синтаксисе, как весь CSS библиотеки.
 */
(function (G) {
  'use strict';

  var cache = null;

  function value(name) {
    if (cache && Object.prototype.hasOwnProperty.call(cache, name)) return cache[name];

    if (!cache) cache = {};

    var found = null;

    try {
      var styles = getComputedStyle(document.documentElement);
      found = styles.getPropertyValue('--gr-bp-' + name).trim() || null;
    } catch (e) { /* без DOM/CSSOM */ }

    cache[name] = found;

    return found;
  }

  function query(name) {
    var px = value(name);

    return px ? '(width >= ' + px + ')' : null;
  }

  function matches(name) {
    var q = query(name);

    if (!q || typeof matchMedia !== 'function') return false;

    return matchMedia(q).matches;
  }

  // Подписка на переход через брейкпоинт. Возвращает функцию отписки;
  // вызывает fn(matches) сразу, чтобы у виджета был начальный режим.
  function on(name, fn) {
    var q = query(name);

    if (!q || typeof matchMedia !== 'function') {
      fn(false);
      return function () {};
    }

    var list = matchMedia(q);
    var handler = function (e) { fn(e.matches); };

    fn(list.matches);

    if (typeof list.addEventListener === 'function') list.addEventListener('change', handler);
    else list.addListener(handler);

    return function () {
      if (typeof list.removeEventListener === 'function') list.removeEventListener('change', handler);
      else list.removeListener(handler);
    };
  }

  // Сброс кеша: значения --gr-bp-* могли поменяться между destroy() и start().
  function reset() { cache = null; }

  G.media = { value: value, query: query, matches: matches, on: on, reset: reset };

  G.use({ start: reset });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
