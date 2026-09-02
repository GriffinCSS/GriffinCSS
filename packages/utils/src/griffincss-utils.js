/*!
 * Griffincss Utils — Runtime v0.23.0
 * Достраивает то, чего статический CSS выразить не может.
 * Пишется руками и не компилируется — правится этот файл.
 */
(function (factory) {
  'use strict';

  var api = factory();

  if (typeof module === 'object' && module.exports) module.exports = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Слияние, а не присваивание: ядро, тема и утилиты делят один глобал,
    // и порядок тегов <script> не должен ничего значить. Своё
    // пространство имён — по образцу Griffincss.theme: имена вроде
    // observe и _autoStart есть и у ядра.
    if (!window.Griffincss) window.Griffincss = {};

    window.Griffincss.utils = api;
    api._autoStart();
  }
})(function () {
  'use strict';

  var VERSION = '0.23.0';

  // Таблица правил выводится из SCSS-карт скриптом scripts/sync-rule-table.mjs.
  // Правьте карты в SCSS, а не этот блок: npm run sync -- --fix перепишет его.
  var RULES = {
    /* gr:rule-table */
    'gr-radius-': { base: 0.25, unit: 'rem', steps: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], literal: { full: '9999px' } },
    'gr-p-': { base: 0.25, unit: 'rem', steps: [0,1,2,3,4,5,6,7,8,10,12,16] }
    /* /gr:rule-table */
  };

  // 'gr-radius-8' → '2rem'; 'gr-p-4' → '1rem'; 'gr-p-[13px]' → '13px';
  // чужое → null.
  function classValue(cls) {
    if (cls.indexOf('[') !== -1) {
      var custom = arbitraryOf(cls);

      return custom ? custom.value : null;
    }

    for (var prefix in RULES) {
      if (!Object.prototype.hasOwnProperty.call(RULES, prefix)) continue;
      if (cls.indexOf(prefix) !== 0) continue;

      var rest = cls.slice(prefix.length);
      var rule = RULES[prefix];

      if (rule.literal && Object.prototype.hasOwnProperty.call(rule.literal, rest)) {
        return rule.literal[rest];
      }

      var step = Number(rest);

      if (rest !== '' && !isNaN(step) && rule.steps.indexOf(step) !== -1) {
        return step * rule.base + rule.unit;
      }
    }

    return null;
  }

  // === Каскад скруглений ===
  //
  // Ничего не измеряет: getComputedStyle здесь нет вовсе. Собирает
  // выражение из объявленных значений, арифметику делает CSS в calc().
  // Статический CSS покрывает первый уровень и его прямых детей;
  // достраивается только невыразимое — рекуррента r(n) = max(0, r(n−1) − p(n−1))
  // для .gr-radius глубже первого.
  //
  // Состояния между вызовами рантайм не держит: действующий радиус
  // предка пересчитывается по цепочке на месте. Поэтому проход
  // идемпотентен, а перенос поддерева к другому предку даёт правильный
  // ответ, а не подсказку из прошлой раскладки.

  var LAYER = 'griffincss.utils';
  var CONTAINER = 'gr-radius';
  var DERIVED = /^gr-r-[0-9a-z]+$/;

  // Пауза перед пересчётом после мутаций DOM — как в ядре.
  var REFRESH_DELAY = 16;

  var scanner = null;       // экземпляр фабрики ядра, заводится лениво
  var warned = {};          // текст предупреждения → уже сказано

  // Одно и то же предупреждение говорится один раз: проход повторяется
  // при каждой мутации, и без этого консоль заполнилась бы копиями.
  function warn(message) {
    if (Object.prototype.hasOwnProperty.call(warned, message)) return;

    warned[message] = true;

    if (typeof console !== 'undefined' && console.warn) console.warn('Griffincss: ' + message);
  }

  // Ядро: эмиттер, хеш и <style> живут в нём. Читается на месте, а не
  // при загрузке, — порядок двух тегов <script> не должен ничего значить.
  function core() {
    var G = typeof window !== 'undefined' ? window.Griffincss : null;

    if (G && typeof G._emit === 'function') return G;

    warn('каскад скруглений требует griffincss.js — подключите ядро');

    return null;
  }

  // Машинерия наблюдения берётся у ядра той же фабрикой, которой
  // пользуется оно само: своей копии тех же ста строк у утилит нет.
  // Экземпляр заводится лениво — по той же причине, что и core().
  function scannerOf() {
    if (scanner) return scanner;

    var G = core();

    if (!G || typeof G._scanner !== 'function') return null;

    scanner = G._scanner({
      delay: REFRESH_DELAY,
      hasWork: hasWork,
      handleAdded: handleAdded,
      flush: G._flush,
      refresh: sweep
    });

    return scanner;
  }

  // Объявленное значение переменной: инлайн сильнее класса. Оба чтения —
  // разбор атрибута: раскладка не трогается.
  function declared(el, prop, prefix) {
    var inline = el.style ? el.style.getPropertyValue(prop).trim() : '';
    var fromClass = null;
    var i;

    for (i = 0; i < el.classList.length; i++) {
      var cls = el.classList.item(i);
      var value = classValue(cls);

      if (value !== null && cls.indexOf(prefix) === 0) fromClass = value;
    }

    if (inline && fromClass && inline !== fromClass) {
      warn(prop + ' задан и классом (' + fromClass + '), и в style (' + inline + ') — значения расходятся');
    }

    return inline || fromClass || null;
  }

  // Выражение радиуса для детей контейнера. Ничего не вычисляет —
  // складывает строку, арифметику делает CSS.
  function childRadius(radius, gap) {
    if (!radius) return null;
    if (!gap) return radius;

    return 'max(0px,calc(' + radius + ' - ' + gap + '))';
  }

  function hasClass(node, name) {
    return !!(node.classList && node.classList.contains(name));
  }

  // Действующие радиус и зазор ближайшего контейнера на уровне node или
  // выше. Цепочка предков собирается подъёмом по parentNode, как в ядре,
  // и разворачивается сверху вниз: радиус уровня — либо объявленный
  // на нём самом, либо выведенный из предка.
  function levelOf(node) {
    var chain = [];
    var cur = node;
    var level = null;
    var i;

    while (cur && cur.classList) {
      if (hasClass(cur, CONTAINER)) chain.push(cur);

      cur = cur.parentNode;
    }

    for (i = chain.length - 1; i >= 0; i--) {
      var own = declared(chain[i], '--gr-r', 'gr-radius-');

      level = {
        radius: own || (level ? childRadius(level.radius, level.gap) : null),
        gap: declared(chain[i], '--gr-p', 'gr-p-')
      };
    }

    return level;
  }

  // Один контейнер. Возвращает true, если в буфер ушло новое правило.
  function apply(node) {
    var G = core();

    if (!G) return false;

    var own = declared(node, '--gr-r', 'gr-radius-');

    // Зазор читается и тогда, когда радиус свой и выводить нечего:
    // расхождение класса и style — дефект разметки, и заметить его надо
    // на любом контейнере, даже бездетном. Нужно здесь не значение,
    // а сама проверка.
    declared(node, '--gr-p', 'gr-p-');

    var expr = own ? null : derivedRadius(node);
    var cls = expr ? 'gr-r-' + G._hash(expr) : null;
    var i;

    // Прежние выведенные классы снимаются всегда: после переноса
    // поддерева или появления явного радиуса старый класс остался бы
    // на элементе и спорил бы с новым по порядку правил в таблице.
    for (i = node.classList.length - 1; i >= 0; i--) {
      var existing = node.classList.item(i);

      if (DERIVED.test(existing) && existing !== cls) node.classList.remove(existing);
    }

    if (!cls) return false;

    var fresh = G._emit(LAYER, expr, '.' + cls + '{--gr-r:' + expr + '}');

    node.classList.add(cls);

    return fresh;
  }

  // Радиус, выведенный из ближайшего предка-контейнера.
  function derivedRadius(node) {
    var above = levelOf(node.parentNode);

    return above ? childRadius(above.radius, above.gap) : null;
  }

  // Проход по корню без записи в <style>: флаш делает вызывающий.
  // Одна форма вложенности — один класс и одно правило: ключ буфера ядра
  // и есть само выражение.
  function scanRadius(root) {
    var containers = (root || document).querySelectorAll('.' + CONTAINER);
    var dirty = false;
    var i;

    for (i = 0; i < containers.length; i++) {
      if (apply(containers[i])) dirty = true;
    }

    return dirty;
  }

  function radiusCascade(root) {
    var G = core();

    if (!G) return;

    if (scanRadius(root)) G._flush();
  }

  // === Произвольные значения ===
  //
  // `.gr-mt-[13px]` — то, чего статический файл выразить не может:
  // список значений неизвестен до того, как страница написана.
  // Правило собирается в рантайме и уезжает в тот же слой утилит,
  // поэтому спорит с остальными классами по порядку, а не по весу.
  //
  // Таблица повторяет объявления статического класса один в один:
  // `.gr-p-4` пишет и `--gr-p`, и `padding`, и произвольный вариант
  // обязан писать столько же — иначе каскад скруглений увидит зазор
  // у одного класса и не увидит у другого. Сверяется тестом
  // arbitrary.test.js по собранному CSS.
  //
  // Свойств с двумя смыслами в таблице нет: `.gr-text-2xl` — кегль,
  // а `.gr-text-white` — цвет, и `.gr-text-[13px]` пришлось бы угадывать.
  // Угадывать рантайм не будет.
  //
  // Физических односторонних свойств в таблице нет с Этапа 36: таблица
  // повторяет статические классы один в один, а статические удалены.
  // Привязку к строке произвольным значением дают gr-start-/gr-end- —
  // логическая пара, заведённая взамен gr-left-/gr-right- тем же этапом:
  // удаление без пары забрало бы возможность, а не перевело её. Верх
  // и низ (mt/mb, pt/pb, top/bottom) — физические по устройству
  // и остаются.
  //
  // Запись единая — `свойство:{}` в каждой строке, даже там, где
  // объявление одно. Короткая форма замерена и отвергнута: gzip
  // повторение съедает сам, и выигрыш в 11 Б не стоит второй формы
  // записи в таблице.
  var PROPS = {
    'gr-m-': 'margin:{}',
    'gr-mt-': 'margin-top:{}',
    'gr-mb-': 'margin-bottom:{}',
    'gr-ms-': 'margin-inline-start:{}',
    'gr-me-': 'margin-inline-end:{}',
    'gr-mx-': 'margin-inline:{}',
    'gr-my-': 'margin-top:{};margin-bottom:{}',
    'gr-p-': '--gr-p:{};padding:var(--gr-p)',
    'gr-pt-': 'padding-top:{}',
    'gr-pb-': 'padding-bottom:{}',
    'gr-ps-': 'padding-inline-start:{}',
    'gr-pe-': 'padding-inline-end:{}',
    'gr-px-': 'padding-inline:{}',
    'gr-py-': 'padding-top:{};padding-bottom:{}',
    'gr-radius-': '--gr-r:{};border-radius:{}',
    'gr-gap-': 'gap:{}',
    'gr-w-': 'width:{}',
    'gr-h-': 'height:{}',
    'gr-min-w-': 'min-width:{}',
    'gr-max-w-': 'max-width:{}',
    'gr-min-h-': 'min-height:{}',
    'gr-max-h-': 'max-height:{}',
    'gr-top-': 'top:{}',
    'gr-bottom-': 'bottom:{}',
    'gr-start-': 'inset-inline-start:{}',
    'gr-end-': 'inset-inline-end:{}',
    'gr-inset-': 'inset:{}',
    'gr-z-': 'z-index:{}'
  };

  // Содержимое скобок — ввод из разметки, и проверяется он так же, как
  // строка раскладки в ядре: длина и запрет на то, чем правило можно
  // закрыть досрочно. Пробела в имени класса не бывает по определению,
  // но проверяется и он: classValue вызывают и напрямую.
  var MAX_VALUE_LENGTH = 48;
  var BAD_VALUE = /[{};]|\/\*|\s/;

  // Элементы с произвольным значением: скобка в имени класса.
  var ARBITRARY_SELECTOR = '[class*="["]';

  // Самый длинный подходящий префикс: короткий не должен перехватывать
  // класс длинного, как и в таблице правил.
  function propFor(name) {
    var best = null;
    var prefix;

    for (prefix in PROPS) {
      if (!Object.prototype.hasOwnProperty.call(PROPS, prefix)) continue;
      if (name.indexOf(prefix) !== 0) continue;
      if (!best || prefix.length > best.length) best = prefix;
    }

    return best;
  }

  // 'gr-mt-[13px]' → { prefix: 'gr-mt-', value: '13px' }.
  // Невалидное — предупреждение и null: пропуск одного класса дешевле
  // сломанного правила, за которым в таблице стилей идут остальные.
  function arbitraryOf(cls) {
    var open = cls.indexOf('[');

    if (open === -1 || cls.charAt(cls.length - 1) !== ']') return null;

    var value = cls.slice(open + 1, cls.length - 1);

    if (value === '' || value.length > MAX_VALUE_LENGTH || BAD_VALUE.test(value)) {
      warn('произвольное значение в .' + cls + ' отклонено');

      return null;
    }

    var prefix = propFor(cls.slice(0, open));

    if (!prefix) {
      warn('произвольное значение .' + cls + ' — свойство неизвестно');

      return null;
    }

    return { prefix: prefix, value: value };
  }

  // Экранирование обязательно: без него `.gr-mt-[13px]` читается как
  // селектор класса `gr-mt-` с последующим селектором по атрибуту,
  // и правило не сматчится ни с чем.
  function escapeClass(cls) {
    return cls.replace(/[^\w-]/g, function (ch) {
      return '\\' + ch;
    });
  }

  function arbitraryRule(cls) {
    var parsed = arbitraryOf(cls);

    if (!parsed) return null;

    return '.' + escapeClass(cls) + '{' + PROPS[parsed.prefix].split('{}').join(parsed.value) + '}';
  }

  // Один элемент. Ключ буфера — само имя класса: одинаковые значения
  // на разных элементах дают одно правило.
  function applyArbitrary(node) {
    var G = core();
    var fresh = false;
    var i;

    if (!G || !node.classList) return false;

    for (i = 0; i < node.classList.length; i++) {
      var cls = node.classList.item(i);

      if (cls.indexOf('[') === -1) continue;

      var rule = arbitraryRule(cls);

      if (rule && G._emit(LAYER, cls, rule)) fresh = true;
    }

    return fresh;
  }

  // Проход по корню без записи в <style>: флаш делает вызывающий.
  function scanArbitrary(root) {
    root = root || document;

    var nodes = root.querySelectorAll(ARBITRARY_SELECTOR);
    var dirty = applyArbitrary(root);
    var i;

    for (i = 0; i < nodes.length; i++) {
      if (applyArbitrary(nodes[i])) dirty = true;
    }

    return dirty;
  }

  function arbitrary(root) {
    var G = core();

    if (!G) return;

    if (scanArbitrary(root)) G._flush();
  }

  // Оба прохода разом. Флаш один на два: таблица переписывается целиком,
  // и делать это дважды подряд незачем.
  function sweep(root) {
    var G = core();

    if (!G) return;

    var dirty = scanArbitrary(root);

    if (scanRadius(root)) dirty = true;

    if (dirty) G._flush();
  }

  // Добавленные узлы: сам узел и всё, что внутри него.
  function handleAdded(nodes) {
    var dirty = false;
    var i;
    var j;

    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];

      if (!node || node.nodeType !== 1) continue;

      if (applyArbitrary(node)) dirty = true;

      if (hasClass(node, CONTAINER) && apply(node)) dirty = true;

      if (!node.querySelectorAll) continue;

      var custom = node.querySelectorAll(ARBITRARY_SELECTOR);

      for (j = 0; j < custom.length; j++) {
        if (applyArbitrary(custom[j])) dirty = true;
      }

      var inner = node.querySelectorAll('.' + CONTAINER);

      for (j = 0; j < inner.length; j++) {
        if (apply(inner[j])) dirty = true;
      }
    }

    return dirty;
  }

  // Есть ли в порции добавленных узлов работа: контейнер скруглений или
  // произвольное значение. Без этой проверки дебаунс срабатывал бы на любой
  // вставке текста.
  function hasWork(mutations) {
    var i;

    for (i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      var j;

      for (j = 0; j < nodes.length; j++) {
        var node = nodes[j];

        if (!node || node.nodeType !== 1) continue;
        if (hasClass(node, CONTAINER)) return true;
        if (node.className && node.className.indexOf('[') !== -1) return true;
        if (!node.querySelectorAll) continue;
        if (node.querySelectorAll('.' + CONTAINER).length > 0) return true;
        if (node.querySelectorAll(ARBITRARY_SELECTOR).length > 0) return true;
      }
    }

    return false;
  }

  // Наблюдение за парсингом документа: контейнеры получают радиус по мере
  // появления, а не разом на DOMContentLoaded. Без ядра наблюдение не
  // заводится вовсе: обрабатывать поток всё равно нечем, а финальный
  // sweep() на DOMContentLoaded достроит всё, когда ядро появится.
  function observeParsing() {
    var s = scannerOf();

    if (s) s.observeParsing();
  }

  function stopParseObserver() {
    if (scanner) scanner.stopParseObserver();
  }

  // Наблюдение за живым поддеревом: пересчёт с дебаунсом и только по
  // этому корню. Пока страница разбирается, работает поток, дальше —
  // этот наблюдатель.
  function observe(root) {
    var s = scannerOf();

    if (s) s.observe(root);
  }

  // Снять всё наблюдение. Выданные классы и правила остаются: они
  // описывают текущее дерево и снимаются только сменой разметки.
  function stop() {
    if (scanner) scanner.stop();
  }

  // Автостарт: только в браузере.
  //   data-auto="false"    — не запускаться вовсе;
  //   data-stream="false"  — без потокового режима, один проход в конце;
  //   data-observe="false" — без наблюдения за живым деревом.
  function autoStart() {
    var auto = true;
    var streaming = true;
    var watching = true;

    try {
      var script = document.currentScript;

      if (script) {
        if (script.getAttribute('data-auto') === 'false') auto = false;
        if (script.getAttribute('data-stream') === 'false') streaming = false;
        if (script.getAttribute('data-observe') === 'false') watching = false;
      }
    } catch (e) { /* currentScript недоступен */ }

    if (!auto) return;

    function settle() {
      stopParseObserver();
      sweep(document);

      // Наблюдение за живым деревом включено по умолчанию, в отличие от
      // ядра: раскладку скругление не двигает, зато вставленная позже
      // карточка без него осталась бы с квадратными углами молча.
      if (watching) observe(document.body);
    }

    if (document.readyState === 'loading') {
      if (streaming) observeParsing();

      document.addEventListener('DOMContentLoaded', settle);
    } else {
      settle();
    }
  }

  return {
    radiusCascade: radiusCascade,
    arbitrary: arbitrary,
    observe: observe,
    stop: stop,
    classValue: classValue,
    version: VERSION,
    _rules: RULES,
    _props: PROPS,
    _autoStart: autoStart
  };
});
