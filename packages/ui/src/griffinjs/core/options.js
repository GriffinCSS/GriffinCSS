/*
 * GriffinJS — разбор параметров из атрибутов.
 *
 * Синтаксис — как у UIkit, удобный в twig-шаблонах CMS:
 *   data-gr-slider="autoplay: 4000; loop; effect: fade"
 * Ключ без значения — true; числа — числами; true/false — булевы;
 * остальное — строкой. Значение, начинающееся с «{», — JSON целиком.
 */
(function (G) {
  'use strict';

  function coerce(value) {
    if (value === '') return true;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

    return value;
  }

  // Имя параметра приводится к camelCase: `per-view: 3` → perView.
  function camel(key) {
    return key.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
  }

  function parse(text) {
    var out = {};

    if (typeof text !== 'string') return out;

    text = text.trim();

    if (!text) return out;

    if (text.charAt(0) === '{') {
      try {
        return JSON.parse(text);
      } catch (e) {
        G.warn('параметры не разобраны как JSON: ' + text);
        return out;
      }
    }

    var pairs = text.split(';');

    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].trim();
      if (!pair) continue;

      var colon = pair.indexOf(':');
      var key = colon === -1 ? pair : pair.slice(0, colon);
      var value = colon === -1 ? '' : pair.slice(colon + 1);

      out[camel(key.trim())] = coerce(value.trim());
    }

    return out;
  }

  // Параметры виджета с элемента: data-gr-<виджет>, поверх умолчаний.
  function read(el, name, defaults) {
    var out = {};
    var key;

    for (key in defaults || {}) {
      if (Object.prototype.hasOwnProperty.call(defaults, key)) out[key] = defaults[key];
    }

    var parsed = parse(el && el.getAttribute ? el.getAttribute('data-gr-' + name) : null);

    for (key in parsed) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) out[key] = parsed[key];
    }

    return out;
  }

  G.options = { parse: parse, read: read };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
