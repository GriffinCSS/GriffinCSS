/*!
 * Griffincss — Runtime Grid Parser v0.23.1
 * Парсит data-gr-layout и data-gr-layout-{sm,md,lg,xl} в DOM.
 * На каждый набор раскладок — свой класс .gr-l-<хеш>, поэтому
 * одинаковая базовая раскладка с разной адаптивностью не конфликтует.
 * Непересекающиеся @media-диапазоны в range-синтаксисе.
 * Авто-скрытие через :not(), авто-присвоение gr-area-* свободными именами.
 */
(function (factory) {
  'use strict';

  var api = factory();

  // Node (тесты) — модуль; браузер — глобальный объект и автостарт.
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Слияние, а не присваивание: рантайм темы кладёт себя в тот же
    // глобал, и порядок двух тегов <script> не должен ничего значить.
    if (!window.Griffincss) window.Griffincss = {};

    for (var key in api) {
      if (Object.prototype.hasOwnProperty.call(api, key)) window.Griffincss[key] = api[key];
    }
    api._autoStart();
  }
})(function () {
  'use strict';

  var VERSION = '0.23.1';
  var STYLE_ID = 'griffincss-dynamic';

  // Границы валидности раскладки
  var MAX_REPEAT = 64;
  var MAX_NAME_LENGTH = 32;
  var NAME_PATTERN = /^[a-zA-Z][a-zA-Z_]*$/;

  // Пауза перед перерисовкой после мутаций DOM
  var REFRESH_DELAY = 16;

  // Каскадные слои: правила рантайма живут в том же слое, что и статический
  // griffincss-core.css, поэтому пользовательский CSS вне слоёв выигрывает
  // без !important. Порядок объявляется целиком — на случай, когда подключён
  // только рантайм, без CSS-файлов.
  var LAYER_ORDER = '@layer griffincss.reset, griffincss.core, griffincss.ui, griffincss.utils, griffincss.style;';
  var LAYER = 'griffincss.core';

  // Имена слоёв выводятся из той же строки: порядок вывода буферов
  // и объявленный порядок слоёв разойтись не могут.
  var LAYER_NAMES = LAYER_ORDER.replace('@layer ', '').replace(';', '').split(', ');

  // Фолбэки брейкпоинтов на случай, когда griffincss-core.css не подключён.
  // Блок между маркерами генерируется из packages/core/scss/_breakpoints.scss
  // (scripts/sync-breakpoints.mjs) — правьте карту там, а не здесь.
  // При подключённом CSS значения перекрываются из --gr-bp-*.
  var BREAKPOINTS = {
    /* gr:breakpoints */
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px'
    /* /gr:breakpoints */
  };

  // Порядок и атрибуты выводятся из карты: добавление брейкпоинта — правка
  // одной карты в SCSS, рантайм подхватывает его сам.
  //
  // Ключ набора: '' — базовая раскладка, 'md' — ширина окна, 'cmd' — ширина
  // ближайшего предка-контейнера. Одна буква разницы, синтаксис один.
  // Контейнерные ключи идут после оконных, и в том же порядке правила
  // выходят в таблицу: при совпадении диапазонов побеждает контейнерный.
  var BP_NAMES = Object.keys(BREAKPOINTS);

  var BP_ORDER = [''].concat(BP_NAMES);

  for (var bpIndex = 0; bpIndex < BP_NAMES.length; bpIndex++) {
    BP_ORDER.push('c' + BP_NAMES[bpIndex]);
  }

  var BP_ATTRS = { '': 'data-gr-layout' };

  for (var attrIndex = 1; attrIndex < BP_ORDER.length; attrIndex++) {
    BP_ATTRS[BP_ORDER[attrIndex]] = 'data-gr-layout-' + BP_ORDER[attrIndex];
  }

  var LAYOUT_SELECTOR = BP_ORDER.map(function (bp) {
    return '[' + BP_ATTRS[bp] + ']';
  }).join(',');

  // === Состояние ===
  var styleEl = null;
  var nonce = '';        // nonce тега <script>: пропуск под строгим CSP
  var generatedSets = {};   // ключ набора раскладок → имя класса
  var generatedAreas = {};  // имя области → CSS уже выдан
  var layoutCSS = '';
  var areaCSS = '';
  var buffers = {};         // слой → {keys, css}: вывод чужих рантаймов
  var touched = [];         // что рантайм навесил на элементы — для destroy()
  var breakpointsRead = false;

  function fail(message) {
    throw new Error('Griffincss: ' + message);
  }

  function readBreakpoints() {
    if (breakpointsRead) return;
    breakpointsRead = true;
    try {
      var styles = getComputedStyle(document.documentElement);
      for (var i = 0; i < BP_NAMES.length; i++) {
        var bp = BP_NAMES[i];
        var value = styles.getPropertyValue('--gr-bp-' + bp).trim();
        if (value) BREAKPOINTS[bp] = value;
      }
    } catch (e) { /* остаются значения по умолчанию */ }
  }

  // Значения брейкпоинтов одной строкой — для сверки «до/после».
  function breakpointFingerprint() {
    return BP_NAMES.map(function (bp) {
      return bp + ':' + BREAKPOINTS[bp];
    }).join(',');
  }

  function bpValue(bp) {
    return BREAKPOINTS[bp] || BREAKPOINTS[bp.slice(1)] || null;
  }

  // Ключ описывает контейнерный диапазон? Имя проверяется по карте,
  // а не по первой букве: брейкпоинт с именем на «c» иначе молча
  // стал бы контейнерным.
  function isContainerBp(bp) {
    return bp.charAt(0) === 'c' && !BREAKPOINTS[bp] && !!BREAKPOINTS[bp.slice(1)];
  }

  function byBpOrder(a, b) {
    return BP_ORDER.indexOf(a) - BP_ORDER.indexOf(b);
  }

  // === Парсер раскладок ===

  // Проверяет имя области и переводит '_' в пустую ячейку.
  function cellName(name, layout) {
    if (name === '_') return '.';
    if (name.length > MAX_NAME_LENGTH) {
      fail('area name "' + name + '" in "' + layout + '" is longer than ' + MAX_NAME_LENGTH + ' characters');
    }
    if (!NAME_PATTERN.test(name)) {
      fail('invalid area name "' + name + '" in layout "' + layout + '"');
    }
    return name;
  }

  // "a3b4" → ["a","a","a","b","b","b","b"]
  function parseSegment(segment, layout) {
    var cells = [];
    var i = 0;
    var len = segment.length;
    var name = '';

    while (i < len) {
      var ch = segment.charAt(i);

      if (ch >= '0' && ch <= '9') {
        var digits = '';
        while (i < len && segment.charAt(i) >= '0' && segment.charAt(i) <= '9') {
          digits += segment.charAt(i);
          i++;
        }

        var count = parseInt(digits, 10);

        if (name === '') {
          fail('repeat count "' + digits + '" without an area name in layout "' + layout + '"');
        }
        if (count === 0) {
          fail('zero repeat count for area "' + name + '" in layout "' + layout + '"');
        }
        if (count > MAX_REPEAT) {
          fail('repeat count ' + count + ' in layout "' + layout + '" exceeds ' + MAX_REPEAT);
        }

        var cell = cellName(name, layout);
        for (var n = 0; n < count; n++) cells.push(cell);
        name = '';
      } else {
        name += ch;
        i++;
      }
    }

    if (name !== '') cells.push(cellName(name, layout));
    if (cells.length === 0) fail('empty row in layout "' + layout + '"');

    return cells;
  }

  function parseLayout(layout) {
    if (typeof layout !== 'string' || layout === '') {
      fail('empty layout');
    }

    var rows = layout.split('-');
    var grid = [];

    for (var r = 0; r < rows.length; r++) {
      grid.push(parseSegment(rows[r], layout));
    }

    return grid;
  }

  function collectAreaNames(grid) {
    var names = [];
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        var name = grid[r][c];
        if (name !== '.' && names.indexOf(name) === -1) names.push(name);
      }
    }
    return names;
  }

  function getMaxColumnCount(grid) {
    var max = 0;
    for (var r = 0; r < grid.length; r++) {
      if (grid[r].length > max) max = grid[r].length;
    }
    return max > 0 ? max : 1;
  }

  // === Генерация CSS ===

  // djb2 → base36. Ключ набора раскладок превращается в имя класса,
  // поэтому два контейнера с разными наборами не делят одно правило.
  function hashKey(key) {
    var hash = 5381;
    for (var i = 0; i < key.length; i++) {
      hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
  }

  function getStyleElement() {
    if (!styleEl) {
      styleEl = document.getElementById(STYLE_ID);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        // Без nonce строгая политика style-src молча выбрасывает
        // содержимое листа: раскладки теряются, ошибки в консоли нет.
        if (nonce) styleEl.nonce = nonce;
        document.head.appendChild(styleEl);
      }
    }
    return styleEl;
  }

  // Защита от FOUC живёт в рантайме, а не в статическом CSS:
  // без выполненного JS правила нет и контент виден.
  //
  // Открытие контейнера — переход 0,3 с, то есть видимое движение.
  // При prefers-reduced-motion: reduce перехода нет: содержимое
  // появляется сразу. Скрытие остаётся — снимается не защита,
  // а анимация её снятия.
  function foucGuardCSS() {
    var hidden = [];
    var shown = [];

    for (var i = 0; i < BP_ORDER.length; i++) {
      var attr = '[' + BP_ATTRS[BP_ORDER[i]] + ']';
      hidden.push(attr + ':not(.gr-ready)');
      shown.push(attr + '.gr-ready');
    }

    var open = shown.join(',\n');

    return hidden.join(',\n') + ' {\n  opacity: 0;\n}\n'
      + open + ' {\n  opacity: 1;\n  transition: opacity 0.3s ease;\n}\n'
      + '@media (prefers-reduced-motion: reduce) {\n'
      + open + ' {\n  transition: none;\n}\n}\n';
  }

  // Правило в буфер слоя — один раз по ключу. Ключ, а не текст правила:
  // рантайм утилит опирается на него как на признак «уже выдано».
  // Возвращает true, когда правило новое.
  function emit(layer, key, css) {
    if (!buffers[layer]) buffers[layer] = { keys: {}, css: '' };

    var buffer = buffers[layer];

    if (Object.prototype.hasOwnProperty.call(buffer.keys, key)) return false;

    buffer.keys[key] = true;
    buffer.css += css;

    return true;
  }

  // Тело слоя ядра: скелет фиксированный, секции опознаются по
  // комментариям — на них опираются тесты и отладка в браузере.
  function coreCSS() {
    var css = '/* FOUC guard */\n' + foucGuardCSS();

    if (layoutCSS) css += '\n/* Grid Layouts */\n' + layoutCSS;
    if (areaCSS) css += '\n/* Grid Areas */\n' + areaCSS;
    if (buffers[LAYER] && buffers[LAYER].css) css += buffers[LAYER].css;

    return css + '/* end */\n';
  }

  function flushCSS() {
    var css = '';

    for (var i = 0; i < LAYER_NAMES.length; i++) {
      var layer = LAYER_NAMES[i];
      var body = layer === LAYER ? coreCSS() : (buffers[layer] ? buffers[layer].css : '');

      if (body) css += '@layer ' + layer + ' {\n' + body + '}\n';
    }

    getStyleElement().textContent = LAYER_ORDER + '\n' + css;
  }

  // Отступ рантайм не пишет: его даёт статическое правило [class*="gr-l-"]
  // в _grid-parser.scss — одно на все раскладки, а модификаторы .gr-gap-*
  // перекрывают его порядком в том же слое.
  function buildGridRule(selector, grid) {
    var cols = getMaxColumnCount(grid);
    var rows = grid.length;
    var areaRows = [];

    for (var r = 0; r < rows; r++) {
      var padded = grid[r].slice();
      while (padded.length < cols) padded.push('.');
      areaRows.push('"' + padded.join(' ') + '"');
    }

    return selector + ' {\n'
      + '  display: grid;\n'
      + '  grid-template-areas: ' + areaRows.join(' ') + ';\n'
      + '  grid-template-columns: var(--gr-l-cols, repeat(' + cols + ', minmax(0, 1fr)));\n'
      + '  grid-template-rows: var(--gr-l-rows, repeat(' + rows + ', auto));\n'
      + '}\n';
  }

  // :not()-цепочка скрывает чужие области, сохраняя родной display элемента.
  function buildHideRule(selector, names) {
    if (!names || names.length === 0) return '';

    var notChain = '';
    for (var i = 0; i < names.length; i++) {
      notChain += ':not(.gr-area-' + names[i] + ')';
    }

    return selector + ' > [class*="gr-area-"]' + notChain + ' {\n'
      + '  display: none;\n'
      + '}\n';
  }

  // Непересекающиеся диапазоны в range-синтаксисе: без арифметики -1px,
  // поэтому единицы измерения брейкпоинта роли не играют и щелей не остаётся.
  // Запись одна на оба вида запроса: @container понимает range наравне
  // с @media, и цепочка диапазонов у них устроена одинаково.
  function rangeQuery(bp, activeBps) {
    if (activeBps.length === 0) return null;
    if (bp === '') return '(width < ' + bpValue(activeBps[0]) + ')';

    var index = activeBps.indexOf(bp);

    if (index === activeBps.length - 1) return '(width >= ' + bpValue(bp) + ')';

    return '(' + bpValue(bp) + ' <= width < ' + bpValue(activeBps[index + 1]) + ')';
  }

  function wrapInQuery(rule, query, css) {
    return rule + ' ' + query + ' {\n  ' + css.replace(/\n(?!$)/g, '\n  ') + '}\n';
  }

  // Ключ набора: отсортированные bp:layout — порядок атрибутов не важен.
  function setKey(set) {
    var parts = [];
    for (var i = 0; i < set.length; i++) parts.push(set[i].bp + ':' + set[i].layout);
    return parts.sort().join(',');
  }

  // CSS для набора раскладок одного элемента. Возвращает имя класса.
  function ensureSetCSS(set) {
    var key = setKey(set);

    if (generatedSets[key]) return generatedSets[key];

    var className = 'gr-l-' + hashKey(key);
    var selector = '.' + className;
    var windowBps = [];
    var containerBps = [];
    var i;

    // Две независимые цепочки: ширина окна и ширина контейнера меняются
    // порознь, и диапазоны одной не обязаны считаться с другой.
    for (i = 0; i < set.length; i++) {
      if (!set[i].bp) continue;
      (isContainerBp(set[i].bp) ? containerBps : windowBps).push(set[i].bp);
    }

    windowBps.sort(byBpOrder);
    containerBps.sort(byBpOrder);

    for (i = 0; i < set.length; i++) {
      var entry = set[i];
      var block = buildGridRule(selector, entry.grid) + buildHideRule(selector, entry.names);

      if (entry.bp === '') {
        // Базу закрывают обе цепочки сразу. Оставь её открытой по одной
        // из осей — она накрыла бы диапазон другой, и какая раскладка
        // победит, решал бы порядок правил, а не ширина.
        var containerRange = rangeQuery('', containerBps);
        var windowRange = rangeQuery('', windowBps);

        if (containerRange) block = wrapInQuery('@container', containerRange, block);
        if (windowRange) block = wrapInQuery('@media', windowRange, block);
      } else if (isContainerBp(entry.bp)) {
        block = wrapInQuery('@container', rangeQuery(entry.bp, containerBps), block);
      } else {
        block = wrapInQuery('@media', rangeQuery(entry.bp, windowBps), block);
      }

      layoutCSS += block;
    }

    for (i = 0; i < set.length; i++) {
      var names = set[i].names;
      for (var n = 0; n < names.length; n++) ensureAreaCSS(names[n]);
    }

    generatedSets[key] = className;

    return className;
  }

  function ensureAreaCSS(name) {
    if (generatedAreas[name]) return;
    areaCSS += '.gr-area-' + name + ' {\n  grid-area: ' + name + ';\n}\n';
    generatedAreas[name] = true;
  }

  // === Сканер ===

  // Обобщённая машинерия наблюдения за DOM: потоковый наблюдатель парсинга
  // и наблюдатели живых поддеревьев с дебаунсом. Ядро пользуется ею само,
  // рантаймы-надстройки получают фабрику через _scanner — вместо
  // собственных копий тех же ста строк.
  //
  // spec: { delay, hasWork(mutations), handleAdded(nodes) → dirty,
  //         flush(), refresh(root), attributeFilter? }
  //
  // attributeFilter — список атрибутов, чья правка тоже будит наблюдатель.
  // Без него наблюдение идёт только за childList, как было до Этапа 37.
  //
  // Без MutationObserver оба наблюдателя молча бездействуют: рантайм
  // в таком окружении работает разовыми проходами.
  function createScanner(spec) {
    var observers = [];       // {root, observer, timer}
    var parseObserver = null; // наблюдатель парсинга: живёт до DOMContentLoaded

    // Наблюдение за конкретным корнем: пересчёт с дебаунсом и только
    // по этому корню, а не по всему документу.
    function observe(root) {
      if (typeof MutationObserver === 'undefined') return;

      root = root || document.body;

      for (var i = 0; i < observers.length; i++) {
        if (observers[i].root === root) return;
      }

      var entry = { root: root, observer: null, timer: null };

      entry.observer = new MutationObserver(function (mutations) {
        if (!spec.hasWork(mutations)) return;

        if (entry.timer) clearTimeout(entry.timer);

        entry.timer = setTimeout(function () {
          entry.timer = null;
          spec.refresh(entry.root);
        }, spec.delay);
      });

      var options = { childList: true, subtree: true };

      if (spec.attributeFilter) {
        options.attributes = true;
        options.attributeFilter = spec.attributeFilter;
      }

      entry.observer.observe(root, options);
      observers.push(entry);
    }

    // Наблюдение за парсингом документа: узлы обрабатываются по мере
    // появления, а не разом на DOMContentLoaded. Дебаунса здесь нет
    // намеренно — он и есть та задержка, которой мы избегаем.
    function observeParsing() {
      if (parseObserver || typeof MutationObserver === 'undefined') return;

      parseObserver = new MutationObserver(function (mutations) {
        var dirty = false;

        for (var i = 0; i < mutations.length; i++) {
          if (spec.handleAdded(mutations[i].addedNodes)) dirty = true;
        }

        // Флаш один на порцию, а не на элемент: таблица переписывается
        // целиком.
        if (dirty) spec.flush();
      });

      parseObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    function stopParseObserver() {
      if (!parseObserver) return;

      parseObserver.disconnect();
      parseObserver = null;
    }

    function stop() {
      stopParseObserver();

      for (var i = 0; i < observers.length; i++) {
        if (observers[i].timer) clearTimeout(observers[i].timer);
        observers[i].observer.disconnect();
      }

      observers = [];
    }

    return {
      observe: observe,
      observeParsing: observeParsing,
      stopParseObserver: stopParseObserver,
      stop: stop
    };
  }

  // === Обработка DOM ===

  // Запись о том, что рантайм навесил на элемент — чтобы destroy() всё снял.
  function track(el) {
    for (var i = 0; i < touched.length; i++) {
      if (touched[i].el === el) return touched[i];
    }

    var record = { el: el, layoutClass: null, areas: [], names: [] };
    touched.push(record);

    return record;
  }

  // Запись элемента, если рантайм его уже трогал. В отличие от track()
  // новую не заводит: для чужих узлов ответ — null.
  function recordOf(el) {
    if (!el) return null;

    for (var i = 0; i < touched.length; i++) {
      if (touched[i].el === el) return touched[i];
    }

    return null;
  }

  // Снимает области, выданные рантаймом. Классы, проставленные в разметке
  // вручную, в записи не числятся и остаются на месте.
  function releaseAreas(record) {
    for (var i = 0; i < record.areas.length; i++) {
      record.areas[i].el.classList.remove('gr-area-' + record.areas[i].name);
    }

    record.areas = [];
  }

  // Возвращает имя области, уже стоящей на элементе, или null.
  function areaNameOf(el) {
    var cls = typeof el.className === 'string' ? el.className : '';
    var parts = cls.split(/\s+/);

    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf('gr-area-') === 0) return parts[i].slice(8);
    }

    return null;
  }

  // Массив {bp, layout, grid, names} для одного элемента.
  // Бросает исключение на первой невалидной раскладке — элемент
  // пропускается целиком, а не покрывается сломанным CSS.
  function readElementLayouts(el) {
    var result = [];

    for (var b = 0; b < BP_ORDER.length; b++) {
      var bp = BP_ORDER[b];
      var layout = el.getAttribute(BP_ATTRS[bp]);

      if (!layout) continue;

      var grid = parseLayout(layout);
      result.push({ bp: bp, layout: layout, grid: grid, names: collectAreaNames(grid) });
    }

    return result;
  }

  // Имена областей базовой раскладки — источник авто-присвоения.
  // Раскладки брейкпоинтов своих имён не раздают: класс у ребёнка один
  // на все ширины.
  function baseNames(set) {
    for (var i = 0; i < set.length; i++) {
      if (set[i].bp === '') return set[i].names;
    }

    return [];
  }

  // Первое имя базовой раскладки, не стоящее ни на одном ребёнке —
  // ни явным классом из разметки, ни выданным рантаймом.
  function freeAreaName(el, record) {
    var children = el.children;

    for (var n = 0; n < record.names.length; n++) {
      var free = true;

      for (var i = 0; i < children.length; i++) {
        if (areaNameOf(children[i]) === record.names[n]) { free = false; break; }
      }

      if (free) return record.names[n];
    }

    return null;
  }

  // Полный пересчёт авто-областей контейнера: снимает выданное рантаймом
  // и раздаёт заново в порядке детей. Классы, проставленные в разметке
  // вручную, в записи не числятся и остаются на месте.
  function assignAreaClasses(el, record) {
    if (record.names.length === 0) return;

    releaseAreas(record);

    var children = el.children;

    for (var i = 0; i < children.length; i++) {
      var child = children[i];

      if (areaNameOf(child)) continue;

      var name = freeAreaName(el, record);

      if (!name) return;

      child.classList.add('gr-area-' + name);
      record.areas.push({ el: child, name: name });
    }
  }

  // Приём одного ребёнка в уже разложенный контейнер — потоковый путь.
  // Явный класс из разметки сильнее выданного рантаймом: если это имя
  // уже кому-то выдано, контейнер пересчитывается целиком, иначе итог
  // зависел бы от порядка прихода детей.
  function admitChild(el, record, child) {
    if (record.names.length === 0) return;

    var explicit = areaNameOf(child);

    if (explicit) {
      for (var i = 0; i < record.areas.length; i++) {
        if (record.areas[i].name === explicit && record.areas[i].el !== child) {
          assignAreaClasses(el, record);
          return;
        }
      }

      return;
    }

    var name = freeAreaName(el, record);

    if (!name) return;

    child.classList.add('gr-area-' + name);
    record.areas.push({ el: child, name: name });
  }

  function markReady(el) {
    el.classList.add('gr-ready');
    track(el);
  }

  // Обработка одного элемента: класс раскладки, CSS, области, .gr-ready.
  // Возвращает true, если в таблицу добавились новые правила — вызывающий
  // решает, когда флашить CSS.
  function processElement(el) {
    var set;

    try {
      set = readElementLayouts(el);
    } catch (error) {
      console.warn(error.message);
      // Контейнер всё равно открываем: сломанная раскладка не должна
      // оставить его невидимым под FOUC-защитой.
      markReady(el);
      return false;
    }

    // Атрибуты есть, но все пустые: раскладывать нечего. Контейнер всё
    // равно открываем — FOUC-защита ловит его по наличию атрибута
    // и без .gr-ready оставила бы прозрачным навсегда.
    if (set.length === 0) {
      markReady(el);
      return false;
    }

    var key = setKey(set);
    var dirty = !generatedSets[key];
    var className = ensureSetCSS(set);
    var record = track(el);

    // Элемент мог быть обработан раньше и с другой раскладкой. Прежний
    // класс снимаем: два .gr-l-* на контейнере — это два действующих
    // правила, и побеждает то, что стоит в таблице позже, а не новое.
    // Выданные тогда же области тоже устарели: без сброса дети остаются
    // с именами, которых нет в новом шаблоне, и авто-скрытие прячет их все.
    if (record.layoutClass && record.layoutClass !== className) {
      el.classList.remove(record.layoutClass);
    }

    el.classList.add(className);
    record.layoutClass = className;
    record.names = baseNames(set);

    assignAreaClasses(el, record);
    markReady(el);

    return dirty;
  }

  function processLayouts(root) {
    readBreakpoints();

    var elements = root.querySelectorAll(LAYOUT_SELECTOR);
    var dirty = false;

    for (var e = 0; e < elements.length; e++) {
      if (processElement(elements[e])) dirty = true;
    }

    if (dirty || !styleEl) flushCSS();
  }

  // === Публичный API ===

  // Полная пересборка таблицы: кеши сбрасываются, классы раскладок
  // снимаются, документ проходится заново. Нужна, когда сгенерированный
  // CSS опирался на устаревшие брейкпоинты.
  function rebuild() {
    generatedSets = {};
    generatedAreas = {};
    layoutCSS = '';
    areaCSS = '';
    buffers = {};

    for (var i = 0; i < touched.length; i++) {
      if (!touched[i].layoutClass) continue;

      touched[i].el.classList.remove(touched[i].layoutClass);
      touched[i].layoutClass = null;
    }

    processLayouts(document);
    flushCSS();
  }

  function init() {
    // Потоковый режим читал токены в момент загрузки скрипта. Если
    // таблица стилей приехала позже, значения могли быть дефолтными —
    // сверяем и пересобираем, когда разошлись.
    var before = breakpointFingerprint();

    breakpointsRead = false;
    readBreakpoints();

    if (layoutCSS && breakpointFingerprint() !== before) {
      rebuild();
      return;
    }

    flushCSS();
    processLayouts(document);
  }

  function refresh(root) {
    processLayouts(root || document);
  }

  function hasLayoutAttr(node) {
    if (!node.hasAttribute) return false;

    for (var b = 0; b < BP_ORDER.length; b++) {
      if (node.hasAttribute(BP_ATTRS[BP_ORDER[b]])) return true;
    }

    return false;
  }

  // Порция узлов от парсера. Контейнер приходит сюда с уже разобранными
  // атрибутами, но обычно ещё без детей — раскладку выдаём немедленно,
  // дети подхватываются следующими порциями.
  // Возвращает true, если в таблицу добавились новые правила.
  function handleAdded(nodes) {
    var dirty = false;

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];

      if (!node || node.nodeType !== 1) continue;

      if (hasLayoutAttr(node) && processElement(node)) dirty = true;

      // Узел мог прийти целым поддеревом — например от innerHTML.
      if (node.querySelectorAll) {
        var inner = node.querySelectorAll(LAYOUT_SELECTOR);

        for (var j = 0; j < inner.length; j++) {
          if (processElement(inner[j])) dirty = true;
        }
      }

      var parent = recordOf(node.parentNode);

      if (parent && parent.layoutClass) admitChild(node.parentNode, parent, node);
    }

    return dirty;
  }

  // Есть ли рантайму работа после порции мутаций. Причин две: пришёл
  // новый контейнер (childList) и с уже разложенного слетели маркеры
  // (class).
  //
  // Второе — перезапись className фреймворком (Этап 37a): React и Vue
  // считают className своим и присваивают его целиком при изменении
  // пропа. С узла слетают .gr-ready и .gr-l-<хеш>: раскладка исчезает,
  // а FOUC-защита ловит элемент по атрибуту и оставляет его в opacity: 0
  // навсегда. Наблюдение за childList такую мутацию не видит.
  //
  // Ответ читается по текущему состоянию узла, а не по oldValue: возврат
  // класса — сам мутация атрибута, и на ней ответ обязан быть «работы
  // нет», иначе перерисовка вызывала бы саму себя без конца.
  function hasWork(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;

      for (var j = 0; j < added.length; j++) {
        var node = added[j];

        if (!node || node.nodeType !== 1) continue;

        if (hasLayoutAttr(node)) return true;

        if (node.querySelectorAll && node.querySelectorAll(LAYOUT_SELECTOR).length > 0) return true;
      }

      // Цель без записи — контейнер ещё не обработан; это забота ветки
      // выше. Цель мутации childList проверку проходит тем же путём:
      // потерявший маркеры контейнер требует работы, кто бы ни разбудил.
      var el = mutations[i].target;
      var record = el && el.nodeType === 1 && hasLayoutAttr(el) ? recordOf(el) : null;

      if (!record) continue;

      if (!el.classList.contains('gr-ready')) return true;
      if (record.layoutClass && !el.classList.contains(record.layoutClass)) return true;
    }

    return false;
  }

  // Собственный экземпляр сканера ядра: раскладки обрабатываются той же
  // машинерией, которую _scanner отдаёт рантаймам-надстройкам.
  var scanner = createScanner({
    delay: REFRESH_DELAY,
    attributeFilter: ['class'],
    hasWork: hasWork,

    handleAdded: handleAdded,
    flush: flushCSS,
    refresh: refresh
  });

  // Потоковая раскладка: контейнеры открываются сверху вниз по мере
  // разбора документа, а не разом на DOMContentLoaded. Предварительная
  // работа — брейкпоинты и FOUC-защита — нужна до первого узла.
  function observeParsing() {
    if (typeof MutationObserver === 'undefined') return;

    readBreakpoints();
    flushCSS();
    scanner.observeParsing();
  }

  function destroy() {
    var i;

    scanner.stop();

    for (i = 0; i < touched.length; i++) {
      var record = touched[i];

      record.el.classList.remove('gr-ready');
      if (record.layoutClass) record.el.classList.remove(record.layoutClass);

      releaseAreas(record);
    }

    touched = [];
    generatedSets = {};
    generatedAreas = {};
    layoutCSS = '';
    areaCSS = '';
    buffers = {};

    // Брейкпоинты перечитываются при следующем запуске: за время между
    // destroy() и init() значения --gr-bp-* могли поменяться.
    breakpointsRead = false;

    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
  }

  // Автостарт: только в браузере.
  // Запрет автоинициализации — data-auto="false" на теге <script>.
  function autoStart() {
    var autoInit = true;
    var streaming = true;

    try {
      var script = document.currentScript;
      if (script && script.getAttribute('data-auto') === 'false') autoInit = false;
      if (script && script.getAttribute('data-stream') === 'false') streaming = false;
      // Свойство, а не атрибут: содержимое атрибута браузер прячет
      // после разбора. Читается здесь, потому что позже
      // document.currentScript уже null.
      if (script) nonce = script.nonce || '';
    } catch (e) { /* currentScript недоступен */ }

    if (!autoInit) return;

    // FOUC-защита ставится сразу при загрузке скрипта, до разбора DOM.
    try {
      if (document.head) flushCSS();
    } catch (e) { /* <head> ещё не готов — защиту поставит init() */ }

    if (document.readyState === 'loading') {
      // Потоковый режим: контейнеры раскладываются по мере разбора
      // документа, а init() на DOMContentLoaded остаётся финальной
      // сверкой — он идемпотентен для уже обработанных элементов.
      if (streaming) observeParsing();

      document.addEventListener('DOMContentLoaded', function () {
        scanner.stopParseObserver();
        init();
      });
    } else {
      init();
    }
  }

  return {
    init: init,
    refresh: refresh,
    observe: scanner.observe,
    destroy: destroy,
    parseLayout: parseLayout,
    version: VERSION,
    _autoStart: autoStart,

    // Для рантаймов-надстроек: ядро остаётся единственным владельцем
    // <style id="griffincss-dynamic">, а они кладут правила в свой слой
    // и берут машинерию наблюдения из той же фабрики, что и само ядро.
    _emit: emit,
    _hash: hashKey,
    _flush: flushCSS,
    _scanner: createScanner
  };
});
