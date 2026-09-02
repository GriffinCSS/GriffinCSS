/*
 * GriffinJS — комбобокс: поле с подсказками из внешнего источника.
 *
 *   <div class="gr-combobox" data-gr-combobox="src: /search?q={q}; min: 2; delay: 250">
 *     <input class="gr-input" type="search" name="q">
 *   </div>
 *
 * Источник — адрес с {q} (ответ — JSON: массив строк или объектов
 * {value, label, href, group, id}, либо {items: […]}) или функция
 * через JS: GriffinJS.mount(el, 'combobox', { source: (q, signal) => Promise }).
 * Рендер позиции подменяется render(item) → узел.
 *
 * База без JS — само поле: форма поиска отправляется Enter, как всегда.
 * Скрипт добавляет список под полем и то, что описано в WAI-ARIA combobox:
 * role=combobox с aria-autocomplete=list, listbox с option,
 * aria-activedescendant — фокус остаётся в поле, иначе набирать дальше
 * было бы нечем; ↓↑ Home End по позициям, Enter выбирает (без выбранной —
 * отдаётся форме), Esc закрывает, не стирая запрос, Tab закрывает.
 *
 * Перенос из ocapi/livesearch.js: дебаунс и минимальная длина, отмена
 * прошлого запроса, кеш выдачи, возврат прошлой выдачи по ↓ и по фокусу,
 * наведение = выбор, подсветка совпадения через textContent (никакого
 * innerHTML из данных). Не переносится оформление витрины: двухколоночная
 * карточка, значки групп, цены — это render() и событие griffin:select
 * в теме, а не слой.
 *
 * Мультивыбор (Этап 38g) — флаг multiple, а не новый виджет:
 *
 *   <div class="gr-combobox" data-gr-combobox="src: /tags?q={q}; multiple">
 *     <select name="tags[]" multiple>
 *       <option value="css" selected>CSS</option>
 *     </select>
 *     <input class="gr-input" type="search">
 *   </div>
 *
 * База без скрипта — сам <select multiple>. Со скриптом он уходит с экрана
 * (CSS по состоянию), выбранное показывается тегами перед полем, выбор
 * позиции включает её в <select> (добавляя, если такой нет) и очищает поле,
 * удаление тега или Backspace в пустом поле снимает выбор. Значение всегда
 * в <select> — форма отправляет его как без скрипта; о смене он сообщает
 * событием change.
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    src: '',          // адрес с {q}
    source: null,     // (query, signal) → Promise<items>
    render: null,     // (item, query) → узел | null
    min: 1,
    delay: 200,
    empty: '',        // подпись пустого ответа; '' — список просто закрывается
    navigate: false,  // выбор позиции с href — переход по адресу
    highlight: true,
    cache: true,
    multiple: false,  // выбранное — теги, значение — в <select multiple>
    remove: 'Убрать {label}'
  };

  var seq = 0;

  function normalize(raw) {
    var items = raw && raw.items ? raw.items : raw;
    var out = [];

    if (!items || !items.length) return out;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];

      if (typeof it === 'string') out.push({ value: it, label: it });
      else if (it && typeof it === 'object') {
        out.push({
          value: it.value !== undefined ? String(it.value) : String(it.label || ''),
          label: it.label !== undefined ? String(it.label) : String(it.value || ''),
          href: it.href || null,
          group: it.group || null,
          data: it
        });
      }
    }

    return out;
  }

  // Подсветка совпадения: текст ставится textContent, <mark> — узлом.
  function marked(target, text, query, highlight) {
    var at = highlight && query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;

    if (at === -1) { target.textContent = text; return; }

    var mark = document.createElement('mark');

    mark.textContent = text.slice(at, at + query.length);

    if (at > 0) target.appendChild(document.createTextNode(text.slice(0, at)));
    target.appendChild(mark);
    if (at + query.length < text.length) target.appendChild(document.createTextNode(text.slice(at + query.length)));
  }

  // Подвоз позиции в видимую часть списка — только по вертикали и только
  // у списка: scrollIntoView прокрутил бы и страницу под полем.
  function reveal(container, node) {
    if (typeof container.getBoundingClientRect !== 'function' || typeof node.getBoundingClientRect !== 'function') return;

    var c = container.getBoundingClientRect();
    var n = node.getBoundingClientRect();
    var top = container.scrollTop || 0;
    var target = top;

    if (n.top < c.top) target = top - (c.top - n.top);
    else if (n.bottom > c.bottom) target = top + (n.bottom - c.bottom);

    if (target !== top) container.scrollTop = target;
  }

  function element(tag, className, attrs) {
    var node = document.createElement(tag);

    if (className) node.setAttribute('class', className);
    for (var k in attrs || {}) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);

    return node;
  }

  G.defineWidget('combobox', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();
    var setAttr = attrs.set;
    var listen = events.add;

    var input = el.querySelector('input');

    if (!input) throw new Error('у комбобокса нет поля ввода');

    var choice = o.multiple ? el.querySelector('select[multiple]') : null;

    if (o.multiple && !choice) throw new Error('для multiple нужен <select multiple> внутри');

    var list = el.querySelector('[role="listbox"]');
    var created = false;

    if (!list) {
      list = element('ul', 'gr-combobox-list');
      el.appendChild(list);
      created = true;
    }

    var uid = ++seq;
    var items = [];        // текущая выдача
    var nodes = [];        // узлы позиций, по индексу
    var active = -1;
    var lastQuery = null;
    var timer = null;
    var controller = null;
    var cache = {};
    var opened = false;
    var tags = null;       // теги мультивыбора
    var added = [];        // позиции <select>, созданные скриптом

    // --- Показ ----------------------------------------------------------------

    function open() {
      if (opened) return;

      opened = true;
      setAttr(el, 'data-gr-state', 'open');
      setAttr(input, 'aria-expanded', 'true');
    }

    function close() {
      cancel();

      if (!opened) return;

      opened = false;
      activate(-1);
      setAttr(el, 'data-gr-state', 'ready');
      setAttr(input, 'aria-expanded', 'false');
    }

    function cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    // --- Выдача ---------------------------------------------------------------

    function clear() {
      while (list.firstElementChild) list.firstElementChild.remove();
      nodes = [];
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }

    function row(item, query, index) {
      var custom = o.render ? o.render(item, query) : null;
      var node = custom || element('li', 'gr-combobox-option');

      if (!custom) marked(node, item.label, query, o.highlight);

      node.setAttribute('role', 'option');
      node.setAttribute('aria-selected', 'false');
      node.setAttribute('id', 'gr-combobox-' + uid + '-' + index);

      return node;
    }

    function render(query, found) {
      clear();

      items = found;
      lastQuery = query;

      if (!found.length) {
        if (!o.empty) { close(); return; }

        var empty = element('li', 'gr-combobox-empty', { role: 'status' });

        empty.textContent = o.empty;
        list.appendChild(empty);
        open();
        return;
      }

      var group = null;

      for (var i = 0; i < found.length; i++) {
        if (found[i].group && found[i].group !== group) {
          group = found[i].group;

          var head = element('li', 'gr-combobox-group', { role: 'presentation' });

          head.textContent = group;
          list.appendChild(head);
        }

        var node = row(found[i], query, i);

        nodes.push(node);
        list.appendChild(node);
      }

      open();
    }

    // --- Запрос ---------------------------------------------------------------

    function request(query) {
      if (o.cache && Object.prototype.hasOwnProperty.call(cache, query)) {
        render(query, cache[query]);
        return;
      }

      if (controller && controller.abort) controller.abort();
      controller = typeof AbortController === 'function' ? new AbortController() : null;

      var signal = controller ? controller.signal : undefined;
      var promise;

      if (typeof o.source === 'function') {
        promise = Promise.resolve(o.source(query, signal));
      } else if (o.src && typeof fetch === 'function') {
        promise = fetch(o.src.replace('{q}', encodeURIComponent(query)), { signal: signal }).then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        });
      } else {
        G.warn('комбобокс: нет источника (src или source)');
        return;
      }

      var mine = controller;

      promise.then(function (raw) {
        // Ответ на стёртую букву уже не нужен.
        if (mine !== controller) return;

        var found = normalize(raw);

        if (o.cache) cache[query] = found;
        render(query, found);
      }, function (error) {
        if (error && error.name === 'AbortError') return;
        G.warn('комбобокс: запрос не удался: ' + (error && error.message));
      });
    }

    function query(text) {
      cancel();

      text = (text === undefined ? input.value : text).trim();

      if (text.length < o.min) {
        close();
        clear();
        items = [];
        lastQuery = null;
        return api;
      }

      if (o.delay > 0) timer = setTimeout(function () { timer = null; request(text); }, o.delay);
      else request(text);

      return api;
    }

    // --- Мультивыбор ----------------------------------------------------------

    function optionOf(value) {
      var all = choice.options;

      for (var i = 0; i < all.length; i++) if (all[i].value === value) return all[i];

      return null;
    }

    function renderTags() {
      while (tags.firstElementChild) tags.firstElementChild.remove();

      var all = choice.options;

      for (var i = 0; i < all.length; i++) {
        if (!all[i].selected) continue;

        var tag = element('li', 'gr-combobox-tag');
        var text = element('span');
        var remove = element('button', 'gr-combobox-tag-remove', {
          type: 'button',
          'data-gr-value': all[i].value,
          'aria-label': String(o.remove).replace('{label}', all[i].textContent)
        });

        text.textContent = all[i].textContent;
        remove.textContent = '×';
        tag.appendChild(text);
        tag.appendChild(remove);
        tags.appendChild(tag);
      }
    }

    function changed() {
      try {
        choice.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) { /* окружение без Event */ }
    }

    // Включить позицию: та, что есть в <select>, — как есть; новой —
    // добавляется <option>, и снимается вместе с выбором.
    function add(value, label) {
      var option = optionOf(value);

      if (!option) {
        option = element('option', '', { value: value });
        option.textContent = label;
        choice.appendChild(option);
        added.push(option);
      }

      if (option.selected) return;

      option.selected = true;
      renderTags();
      changed();
    }

    function drop(value) {
      var option = optionOf(value);

      if (!option) return;

      option.selected = false;

      var at = added.indexOf(option);

      if (at !== -1) { added.splice(at, 1); option.remove(); }

      renderTags();
      changed();
    }

    function onTagsClick(event) {
      var button = G.closest(event.target, '.gr-combobox-tag-remove');

      if (!button) return;

      drop(button.getAttribute('data-gr-value'));
      input.focus();
    }

    // --- Выбор ----------------------------------------------------------------

    function activate(index, scroll) {
      if (active >= 0 && nodes[active]) nodes[active].setAttribute('aria-selected', 'false');

      active = index;

      if (index < 0 || !nodes[index]) {
        input.removeAttribute('aria-activedescendant');
        return;
      }

      nodes[index].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', nodes[index].getAttribute('id'));

      if (scroll) reveal(list, nodes[index]);
    }

    function move(delta) {
      if (!items.length) return;

      if (!opened) { open(); activate(delta > 0 ? 0 : items.length - 1, true); return; }

      var next = active + delta;

      if (next < 0) next = items.length - 1;
      if (next >= items.length) next = 0;

      activate(next, true);
    }

    function select(index) {
      var item = items[index];

      if (!item) return api;

      if (choice) { add(item.value, item.label); input.value = ''; }
      else input.value = item.value;

      close();
      G.emit('griffin:select', input, { item: item, index: index, input: input });

      if (o.navigate && item.href && typeof location !== 'undefined') location.href = item.href;

      return api;
    }

    // --- События --------------------------------------------------------------

    function onInput() { query(); }

    function onKeyDown(event) {
      var key = event.key;

      if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (!items.length) return;
        move(key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
      } else if (key === 'Home' || key === 'End') {
        if (!opened || !items.length) return;
        activate(key === 'Home' ? 0 : items.length - 1, true);
        event.preventDefault();
      } else if (key === 'Enter') {
        if (!opened || active < 0) return;
        select(active);
        event.preventDefault();
      } else if (key === 'Escape') {
        if (!opened) return;
        close();
        event.preventDefault();
      } else if (key === 'Tab') {
        close();
      } else if (key === 'Backspace' && choice && !input.value) {
        // Пустое поле: Backspace снимает последний тег.
        var last = null;

        for (var i = 0; i < choice.options.length; i++) if (choice.options[i].selected) last = choice.options[i];
        if (last) { drop(last.value); event.preventDefault(); }
      }
    }

    function indexOfNode(node) {
      var found = G.closest(node, '[role="option"]');

      return found ? nodes.indexOf(found) : -1;
    }

    function onListClick(event) {
      var index = indexOfNode(event.target);

      if (index !== -1) { select(index); event.preventDefault(); }
    }

    // Наведение = выбор, без подкрутки списка под указателем.
    function onListOver(event) {
      var index = indexOfNode(event.target);

      if (index !== -1 && index !== active) activate(index, false);
    }

    // Указатель на списке не должен уводить фокус из поля.
    function onListDown(event) {
      if (event.preventDefault) event.preventDefault();
    }

    function onFocus() {
      if (!opened && items.length && input.value.trim() === lastQuery) open();
    }

    function onPointerDown(event) {
      var n = event.target;

      while (n) { if (n === el) return; n = n.parentNode; }

      close();
    }

    function destroy() {
      cancel();
      if (controller && controller.abort) controller.abort();
      events.removeAll();
      clear();
      if (created) list.remove();
      if (tags) tags.remove();
      attrs.restore();
    }

    var api = {
      el: el,
      input: input,
      list: list,
      open: open,
      close: close,
      query: query,
      select: select,
      items: function () { return items.slice(); },
      values: function () {
        var out = [];

        if (choice) for (var i = 0; i < choice.options.length; i++) if (choice.options[i].selected) out.push(choice.options[i].value);

        return out;
      },
      destroy: destroy
    };

    // --- Подъём ---------------------------------------------------------------

    if (!list.getAttribute('id')) setAttr(list, 'id', 'gr-combobox-list-' + uid);
    setAttr(list, 'role', 'listbox');
    setAttr(input, 'role', 'combobox');
    setAttr(input, 'aria-autocomplete', 'list');
    setAttr(input, 'aria-expanded', 'false');
    setAttr(input, 'aria-controls', list.getAttribute('id'));
    setAttr(input, 'autocomplete', 'off');
    setAttr(el, 'data-gr-state', 'ready');

    if (choice) {
      tags = element('ul', 'gr-combobox-tags', { role: 'list' });
      el.insertBefore(tags, input);
      renderTags();
      listen(tags, 'click', onTagsClick);
    }

    listen(input, 'input', onInput);
    listen(input, 'keydown', onKeyDown);
    listen(input, 'focus', onFocus);
    listen(list, 'click', onListClick);
    listen(list, 'pointerover', onListOver);
    listen(list, 'pointerdown', onListDown);
    listen(document, 'pointerdown', onPointerDown, true);

    return api;
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
