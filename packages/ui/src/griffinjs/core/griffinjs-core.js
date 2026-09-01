/*!
 * GriffinJS — Core v0.22.1
 * Опциональный слой виджетов с состоянием поверх Griffincss: слайдер,
 * галерея, лайтбокс, параллакс, мегаменю. Подключается одной строкой
 * и одним файлом; страница без него — законное и рабочее состояние.
 *
 * Ядро не знает ни одного виджета. Оно держит реестры движков и виджетов,
 * куда модули РЕГИСТРИРУЮТСЯ, а не патчат его, монтирует виджеты
 * на элементы с data-gr-<виджет> и ведёт их жизненный цикл: start()
 * поднимает всё, destroy() снимает всё до последнего атрибута.
 *
 * В griffinjs-core.js склеивается только то, без чего не обходится ни один
 * виджет: options, registry, scanner. Остальное из core/ — anchor, media,
 * motion, gesture, track — общие части ВНЕ ядра (Этап 22): ими пользуется
 * меньшинство, и каждая уезжает своим файлом griffinjs-<часть>.js. Что
 * модуль из этого берёт, он объявляет сам — вторым аргументом defineWidget
 * или needs(); start() сверяет объявленное со сборкой.
 *
 * От рантаймов ядра/ui/utils слой не зависит: у него свой глобал
 * window.GriffinJS, а не window.Griffincss — там слияние рантаймов
 * CSS-части, и порядок тегов не значим; слою с состоянием чужой
 * глобал ни к чему.
 */
(function (factory) {
  'use strict';

  var api = factory();

  // Node (тесты) — модуль; браузер — глобальный объект и автостарт.
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.GriffinJS = api;
    api._autoStart();
  }
})(function () {
  'use strict';

  var VERSION = '0.22.1';

  // Реестры. Модуль зовёт defineEngine/defineWidget; ядро — единственное
  // место, которое знает, как их применить.
  var engines = {};
  var widgets = {};

  // Зависимости модулей: имя → части, которые модуль берёт из G и которых
  // может не оказаться в сборке «ядро + нужное». Объявляет их сам модуль —
  // вторым аргументом defineWidget/defineEngine или needs() напрямую,
  // если модуль ничего не регистрирует (лайтбокс).
  var deps = {};

  // Участники жизненного цикла: {start, destroy} от registry, scanner и
  // прочих частей, которым нужно подписаться на документ и отписаться.
  var lifecycle = [];

  // Смонтированные виджеты: [{el, name, instance}]. Массив, а не WeakMap,
  // потому что destroy() обязан обойти всех, а сканер — найти отвалившихся.
  var mounted = [];

  var started = false;

  // Объявление и чтение зависимостей: needs('slider', ['track', 'motion'])
  // записывает, needs('slider') возвращает.
  function needs(name, list) {
    if (list) deps[name] = list;

    return deps[name] || [];
  }

  function define(registry, kind, name, opts, factory) {
    // Второй аргумент необязателен: define<X>(name, factory) — прежняя форма.
    if (typeof opts === 'function') { factory = opts; opts = null; }

    if (typeof name !== 'string' || !name) {
      throw new Error('GriffinJS: ' + kind + ' без имени');
    }
    if (typeof factory !== 'function') {
      throw new Error('GriffinJS: ' + kind + ' «' + name + '» — не функция');
    }
    if (registry[name]) {
      throw new Error('GriffinJS: ' + kind + ' «' + name + '» уже зарегистрирован');
    }

    if (opts && opts.needs) needs(name, opts.needs);

    registry[name] = factory;

    return factory;
  }

  function defineEngine(name, opts, factory) {
    return define(engines, 'движок', name, opts, factory);
  }

  function defineWidget(name, opts, factory) {
    return define(widgets, 'виджет', name, opts, factory);
  }

  // Проверка сборки на старте: модуль подключён, а часть, которую он берёт
  // из G, — нет. Предупреждение, а не отказ: модуль со страховкой
  // (`if (G.anchor)`) продолжит работать урезанно. Молчать об этом нельзя —
  // иначе отказ проявится у читателя страницы, а не при сборке.
  function checkNeeds() {
    var names = Object.keys(deps);

    for (var i = 0; i < names.length; i++) {
      var list = deps[names[i]];

      for (var j = 0; j < list.length; j++) {
        var dep = list[j];

        // Зависимостью бывает и часть G (track, anchor), и целый модуль:
        // галерея строится поверх слайдера.
        if (!api[dep] && !widgets[dep] && !engines[dep]) {
          warn('«' + names[i] + '» не работает без griffinjs-' + dep + '.js');
        }
      }
    }
  }

  function use(part) {
    lifecycle.push(part);

    if (started && typeof part.start === 'function') part.start(api);

    return api;
  }

  function warn(message) {
    if (typeof console !== 'undefined' && console.warn) console.warn('GriffinJS: ' + message);
  }

  // --- Общие помощники виджетов -----------------------------------------------

  // Учёт атрибутов, которые рантайм ставит на элементы: restore() возвращает
  // исходные значения до последнего. Один помощник на все виджеты — иначе
  // у каждого своя копия и свой шанс забыть что-то снять.
  function recorder() {
    var touched = [];

    return {
      set: function (node, name, value) {
        var current = node.getAttribute(name);

        if (current === value) return;

        var known = false;

        for (var i = 0; i < touched.length; i++) {
          if (touched[i].el === node && touched[i].attr === name) { known = true; break; }
        }

        if (!known) touched.push({ el: node, attr: name, before: current });

        if (value === null) node.removeAttribute(name);
        else node.setAttribute(name, value);
      },
      restore: function () {
        for (var i = touched.length - 1; i >= 0; i--) {
          var t = touched[i];

          if (t.before === null) t.el.removeAttribute(t.attr);
          else t.el.setAttribute(t.attr, t.before);
        }

        touched = [];
      }
    };
  }

  // Слушатели с отпиской одним вызовом.
  function listeners() {
    var list = [];

    return {
      add: function (target, type, fn, options) {
        target.addEventListener(type, fn, options);
        list.push([target, type, fn, options]);
      },
      removeAll: function () {
        for (var i = 0; i < list.length; i++) list[i][0].removeEventListener(list[i][1], list[i][2], list[i][3]);
        list = [];
      }
    };
  }

  // Параметры поверх умолчаний.
  function merge(defaults, opts) {
    var out = {};
    var key;

    for (key in defaults) if (Object.prototype.hasOwnProperty.call(defaults, key)) out[key] = defaults[key];
    for (key in opts || {}) if (Object.prototype.hasOwnProperty.call(opts, key)) out[key] = opts[key];

    return out;
  }

  // --- Монтирование -----------------------------------------------------------

  function recordOf(el, name) {
    for (var i = 0; i < mounted.length; i++) {
      if (mounted[i].el === el && mounted[i].name === name) return mounted[i];
    }

    return null;
  }

  function instance(el, name) {
    var record = recordOf(el, name);

    return record ? record.instance : null;
  }

  // Виджет на элементе. Параметры — из аргумента или из data-gr-<виджет>
  // (разбор — в options.js). Повторный вызов возвращает уже живой экземпляр:
  // два слайдера на одной дорожке — ошибка автора, а не два состояния.
  function mount(el, name, opts) {
    if (!el || !widgets[name]) {
      warn('виджет «' + name + '» не зарегистрирован');
      return null;
    }

    var existing = recordOf(el, name);
    if (existing) return existing.instance;

    if (opts === undefined) opts = api.options ? api.options.read(el, name) : {};

    var record = { el: el, name: name, instance: null };
    mounted.push(record);

    try {
      record.instance = widgets[name](el, opts, api) || {};
    } catch (e) {
      mounted.splice(mounted.indexOf(record), 1);
      warn('виджет «' + name + '» не поднялся: ' + (e && e.message));
      return null;
    }

    return record.instance;
  }

  function unmount(el, name) {
    for (var i = mounted.length - 1; i >= 0; i--) {
      var record = mounted[i];

      if (record.el !== el) continue;
      if (name && record.name !== name) continue;

      mounted.splice(i, 1);

      if (record.instance && typeof record.instance.destroy === 'function') record.instance.destroy();
    }
  }

  // Подъём всех виджетов внутри корня (и на самом корне): по атрибуту
  // data-gr-<виджет> для каждого зарегистрированного имени.
  function init(root) {
    root = root || document;

    for (var name in widgets) {
      if (!Object.prototype.hasOwnProperty.call(widgets, name)) continue;

      var selector = '[data-gr-' + name + ']';
      var nodes = [];

      if (typeof root.matches === 'function' && root.matches(selector)) nodes.push(root);

      var found = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      for (var i = 0; i < found.length; i++) nodes.push(found[i]);

      for (var j = 0; j < nodes.length; j++) mount(nodes[j], name);
    }

    return api;
  }

  // Снятие виджетов с элементов, которых в документе больше нет.
  // Зовёт сканер после удаления узлов.
  function prune() {
    for (var i = mounted.length - 1; i >= 0; i--) {
      var el = mounted[i].el;
      var gone = typeof el.isConnected === 'boolean' ? !el.isConnected : !inDocument(el);

      if (gone) unmount(el, mounted[i].name);
    }
  }

  function inDocument(el) {
    var node = el;

    while (node) {
      if (node === document || node === document.documentElement) return true;
      node = node.parentNode;
    }

    return false;
  }

  // --- Жизненный цикл ---------------------------------------------------------

  function start() {
    if (started) return api;

    started = true;

    checkNeeds();

    for (var i = 0; i < lifecycle.length; i++) {
      if (typeof lifecycle[i].start === 'function') lifecycle[i].start(api);
    }

    init(document);

    return api;
  }

  function destroy() {
    if (!started) return api;

    started = false;

    while (mounted.length) unmount(mounted[mounted.length - 1].el);

    for (var i = lifecycle.length - 1; i >= 0; i--) {
      if (typeof lifecycle[i].destroy === 'function') lifecycle[i].destroy(api);
    }

    return api;
  }

  // Автостарт: только в браузере и только если его не отключили атрибутом
  // data-auto="false" на теге <script>.
  function autoStart() {
    try {
      var script = document.currentScript;
      if (script && script.getAttribute('data-auto') === 'false') return;
    } catch (e) { /* currentScript недоступен */ }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { start(); });
      return;
    }

    start();
  }

  var api = {
    version: VERSION,
    engines: engines,
    widgets: widgets,
    defineEngine: defineEngine,
    defineWidget: defineWidget,
    needs: needs,
    use: use,
    mount: mount,
    unmount: unmount,
    instance: instance,
    init: init,
    start: start,
    destroy: destroy,
    warn: warn,
    recorder: recorder,
    listeners: listeners,
    merge: merge,
    _mounted: function () { return mounted.slice(); },
    _prune: prune,
    _started: function () { return started; },
    _autoStart: autoStart
  };

  return api;
});
