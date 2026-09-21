/*
 * GriffinJS — догрузка бандла полей по потребности (Этап 48c).
 *
 *   <script defer src="griffinjs.js"
 *           data-fields="griffinjs-fields.js"
 *           data-countries="griffinjs-countries.js"></script>
 *
 *   GriffinJS.config.fields = { src: 'griffinjs-fields.js', countries: 'griffinjs-countries.js' };
 *
 * Витрине поля нужны на трёх страницах из трёхсот, а тег бандла стоит
 * в шаблоне шапки для всех. Вместо тега — путь: встретив data-gr-<поле>
 * без зарегистрированного виджета, слой вставляет <script> сам — один раз
 * на документ, с nonce со своего тега (под строгим CSP без него файл
 * отброшен молча), таблица стран вторым тегом в том же порядке, — и после
 * загрузки ВСЕХ файлов поднимает поля по документу и шлёт
 * griffinjs:fields-loaded. Ошибка загрузки — предупреждение, поля остаются
 * базой без скрипта, второй попытки нет. Без config — предупреждение раз
 * на имя поля: раньше такое поле молчало.
 *
 * Единственное, что здесь известно поимённо, — не виджет, а файл поставки:
 * девять имён второго бандла, те же, что в списке FIELDS сборки
 * (scripts/build-griffinjs.mjs; тест сверяет). Ядро о них не знает:
 * модуль подписывается на init(root) и лежит вне ядра, в SHARED, —
 * за него не платит набор из двух файлов ради одной подсказки.
 *
 * Пути и nonce читаются у своего тега в момент выполнения — позже
 * document.currentScript уже null. Атрибуты, а не только свойство, —
 * ради тега с defer: инлайновый скрипт перед ним глобала ещё не видит.
 */
(function (G) {
  'use strict';

  var FIELDS = ['mask', 'phone', 'datetime', 'number', 'file', 'rating', 'otp', 'counter', 'validate'];

  var config = G.config;
  var nonce = '';
  var loading = null;   // null — не запрашивали; pending | done | failed
  var warned = {};      // поле → без config уже сказано

  try {
    var script = document.currentScript;

    if (script) {
      nonce = script.nonce || '';

      var src = script.getAttribute('data-fields');

      if (src) config.fields = { src: src, countries: script.getAttribute('data-countries') || '' };
    }
  } catch (e) { /* currentScript недоступен */ }

  // Поля в корне, чьих виджетов нет: с config — запрос бандла, без него —
  // предупреждение. Узлы не трогаются: база без скрипта — рабочее состояние.
  function check(root) {
    for (var i = 0; i < FIELDS.length; i++) {
      var name = FIELDS[i];
      var selector = '[data-gr-' + name + ']';

      if (G.widgets[name] || warned[name]) continue;
      if (!(root.matches && root.matches(selector)) && !(root.querySelector && root.querySelector(selector))) continue;

      if (config.fields && config.fields.src) return request();

      warned[name] = true;
      G.warn('поле «' + name + '» не собрано: подключите griffinjs-fields.js или задайте GriffinJS.config.fields');
    }
  }

  // Поля поднимаются после ВСЕХ файлов: телефон читает таблицу стран
  // при монтировании, и она обязана лечь раньше. Что успело
  // зарегистрироваться при ошибке, всё равно поднимается.
  function request() {
    if (loading) return;

    loading = 'pending';

    var files = [config.fields.src];
    var ok = true;
    var left;

    if (config.fields.countries) files.push(config.fields.countries);

    left = files.length;

    function settle(event) {
      if (event.type === 'error') {
        ok = false;
        G.warn('бандл полей не загружен: ' + event.target.src + ' — поля остались базой без скрипта');
      }

      if (--left) return;

      loading = ok ? 'done' : 'failed';
      G.init(document);

      if (ok) G.emit('griffinjs:fields-loaded', document, { files: files });
    }

    for (var i = 0; i < files.length; i++) insert(files[i], settle);
  }

  // async = false: вставленный скриптом тег по умолчанию async, а порядок
  // «поля, затем страны» нужен. nonce — свойством: атрибут после разбора
  // браузер прячет.
  function insert(src, settle) {
    var tag = document.createElement('script');

    tag.src = src;
    tag.async = false;
    if (nonce) tag.nonce = nonce;

    tag.addEventListener('load', settle);
    tag.addEventListener('error', settle);

    (document.head || document.documentElement).appendChild(tag);
  }

  G.loader = {
    _fields: function () { return FIELDS.slice(); },
    _nonce: function (value) { if (value !== undefined) nonce = value; return nonce; }
  };

  G.use({ init: check });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
