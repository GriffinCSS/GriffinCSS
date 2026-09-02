/*
 * GriffinJS — файловое поле: список выбранного и удаление по одному.
 *
 *   <input class="gr-file" type="file" name="docs" multiple data-gr-file>
 *
 * Мультивыбор даёт платформа атрибутом multiple, оформление — модуль
 * .gr-file пакета ui; без скрипта поле остаётся рабочим и показывает
 * «Файлов: 3» само. Виджет нужен ради одного: убрать ОДИН файл
 * из выбранного. Ни разметкой, ни CSS этого не сделать — input.files
 * переписывается только через DataTransfer.
 *
 * После поля появляется список (или наполняется свой — list: #id):
 * имя, размер и кнопка «убрать». Размер — в единицах локали через
 * Intl.NumberFormat, ни строки на перевод. Повторный выбор, как
 * у платформы, заменяет набор; append — добавляет к прежнему без повторов.
 *
 *   data-gr-file="append; remove: Удалить {name}; list: #chosen"
 *
 * Зона перетаскивания — обёртка .gr-file-drop вокруг поля и флаг drop:
 * файлы, брошенные на обёртку, ложатся в поле (с append — добавляются),
 * пока их тянут над ней — состояние over. Без скрипта обёртка — крупная
 * кнопка выбора, а бросать можно только на само поле.
 *
 *   <label class="gr-file-drop">
 *     <input class="gr-file" type="file" multiple data-gr-file="drop; append">
 *     Перетащите файлы сюда или выберите
 *   </label>
 *
 * Загрузка на сервер, прогресс и превью — не здесь: сеть и политика
 * не сводятся к разметке (предел записан в решениях Этапа 38).
 */
(function (G) {
  'use strict';

  var DEFAULTS = { append: false, list: '', remove: 'Убрать {name}', drop: false };
  var UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'];

  function lang() {
    return (document.documentElement && document.documentElement.getAttribute('lang')) || 'en';
  }

  // Размер в единицах локали: у платформы есть и слово, и правило округления.
  function size(bytes, locale) {
    var n = Number(bytes) || 0;
    var i = 0;

    while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; }

    try {
      return new Intl.NumberFormat(locale || lang(), { style: 'unit', unit: UNITS[i], unitDisplay: 'short', maximumFractionDigits: 1 }).format(n);
    } catch (e) {
      return Math.round(n * 10) / 10 + ' ' + UNITS[i];
    }
  }

  function element(tag, className, attrs) {
    var node = document.createElement(tag);

    if (className) node.setAttribute('class', className);
    for (var k in attrs || {}) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);

    return node;
  }

  function toArray(list) {
    var out = [];

    for (var i = 0; list && i < list.length; i++) out.push(list[i]);

    return out;
  }

  function same(a, b) {
    return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
  }

  G.defineWidget('file', function (el, opts) {
    var o = G.merge(DEFAULTS, opts);

    if (typeof DataTransfer !== 'function') throw new Error('без DataTransfer убрать один файл из выбранного нельзя');

    var attrs = G.recorder();
    var events = G.listeners();
    var locale = lang();
    var list = o.list ? document.querySelector(o.list) : null;
    var created = false;
    var known = [];

    if (!list) {
      list = element('ul', 'gr-file-list');
      el.parentNode.insertBefore(list, el.nextSibling);
      created = true;
    }

    attrs.set(list, 'aria-live', 'polite');

    // input.files — только для чтения, но принимает FileList целиком:
    // новый список собирается в DataTransfer.
    function assign(files) {
      var dt = new DataTransfer();

      for (var i = 0; i < files.length; i++) dt.items.add(files[i]);

      el.files = dt.files;
    }

    function render() {
      while (list.firstElementChild) list.firstElementChild.remove();

      for (var i = 0; i < known.length; i++) {
        var item = element('li', 'gr-file-item');
        var name = element('span', 'gr-file-name');
        var weight = element('span', 'gr-file-size');
        var remove = element('button', 'gr-file-remove', {
          type: 'button',
          'data-gr-index': String(i),
          'aria-label': String(o.remove).replace('{name}', known[i].name)
        });

        name.textContent = known[i].name;
        weight.textContent = size(known[i].size, locale);
        remove.textContent = '×';
        item.appendChild(name);
        item.appendChild(weight);
        item.appendChild(remove);
        list.appendChild(item);
      }
    }

    function update(files, notify) {
      known = files;
      render();

      if (notify) G.emit('griffin:change', el, { files: known.slice() });
    }

    // Принять набор: с append — прежние плюс новые без повторов.
    function take(incoming, force) {
      var files = incoming;

      if (o.append && known.length) {
        files = known.slice();

        for (var i = 0; i < incoming.length; i++) {
          var dup = false;

          for (var j = 0; j < files.length; j++) if (same(files[j], incoming[i])) { dup = true; break; }
          if (!dup) files.push(incoming[i]);
        }

        assign(files);
      } else if (force) {
        assign(files);
      }

      update(files, true);
    }

    function onChange() {
      take(toArray(el.files), false);
    }

    function onDragOver(event) {
      event.preventDefault();
      attrs.set(zone, 'data-gr-state', 'over');
    }

    function onDragLeave() {
      attrs.set(zone, 'data-gr-state', null);
    }

    function onDrop(event) {
      event.preventDefault();
      attrs.set(zone, 'data-gr-state', null);

      var dropped = toArray(event.dataTransfer ? event.dataTransfer.files : null);

      if (dropped.length) take(dropped, true);
    }


    function onClick(event) {
      var button = G.closest(event.target, '.gr-file-remove');

      if (!button) return;

      var at = parseInt(button.getAttribute('data-gr-index'), 10);
      var files = known.slice();

      files.splice(at, 1);
      assign(files);
      update(files, true);

      // Фокус — на соседнюю кнопку, а без неё — на поле: кнопка, на которой
      // он стоял, только что исчезла.
      var buttons = list.querySelectorAll('.gr-file-remove');
      var next = buttons[Math.min(at, buttons.length - 1)];

      if (next) next.focus();
      else if (typeof el.focus === 'function') el.focus();
    }

    var zone = o.drop ? el.parentNode : null;

    events.add(el, 'change', onChange);
    events.add(list, 'click', onClick);

    if (zone) {
      events.add(zone, 'dragover', onDragOver);
      events.add(zone, 'dragleave', onDragLeave);
      events.add(zone, 'drop', onDrop);
    }

    if (el.files && el.files.length) update(toArray(el.files), false);

    return {
      el: el,
      list: list,
      files: function () { return known.slice(); },
      remove: function (at) { onClick({ target: list.querySelectorAll('.gr-file-remove')[at] }); },
      destroy: function () {
        events.removeAll();
        attrs.restore();

        if (created) list.remove();
        else while (list.firstElementChild) list.firstElementChild.remove();
      }
    };
  });

  G.file = { size: size };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
