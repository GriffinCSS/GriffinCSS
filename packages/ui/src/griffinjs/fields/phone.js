/*
 * GriffinJS — поле телефона: код страны в <select>, номер по маске.
 *
 *   <div class="gr-input-group" data-gr-phone>
 *     <select class="gr-select" name="code" aria-label="Код страны">
 *       <option value="+7" data-gr-iso="RU" data-gr-format="(000) 000-00-00" selected>RU +7</option>
 *       <option value="+375" data-gr-iso="BY" data-gr-format="(00) 000-00-00">BY +375</option>
 *     </select>
 *     <input class="gr-input" type="tel" name="phone" autocomplete="tel-national">
 *   </div>
 *
 * Телефон — это маска плюс код страны, и ничего сверх того. Состав стран
 * виджету не принадлежит: он читает его из разметки — value кода,
 * data-gr-iso и data-gr-format на каждом <option>. Атрибут маски здесь
 * зовётся иначе, чем виджет: data-gr-mask на позиции списка ядро приняло бы
 * за виджет и попыталось бы надеть маску на <option>. Пустой <select> заполняется
 * из таблицы griffinjs-countries.js, если она подключена; без неё виджет
 * предупреждает и работает как поле без маски. Данные со своим темпом
 * обновления библиотека вместе с кодом не сопровождает.
 *
 * Имя страны и флаг — у платформы: Intl.DisplayNames в языке страницы
 * (lang документа) и пара региональных индикаторов из двух букв ISO.
 * Ни строки на перевод, ни картинки. Подписи <option> переписываются
 * так — «🇷🇺 Россия +7» — и возвращаются в destroy(); names: false
 * оставляет подписи автора.
 *
 * Смена кода меняет маску, знаки номера остаются. Полный номер с плюсом —
 * вставка из буфера или автозаполнение — выбирает страну по самому
 * длинному подходящему коду, остаток ложится в маску. Номер с национальным
 * префиксом (data-gr-trunk на позиции: «8» у России и Казахстана) — набор
 * 8 912 … на одиннадцать знаков, вставка или автозаполнение — теряет
 * префикс, когда знаков на один больше, чем в маске: так «8» становится
 * «+7», а десятизначный номер с восьмёрки не трогается. Форма отправляет
 * два поля: код и национальный номер; целиком он в value() и в событии
 * griffin:change.
 *
 * База без скрипта: type="tel" и <select> кодов в .gr-input-group —
 * обе части платформенные.
 */
(function (G) {
  'use strict';

  var DEFAULTS = { country: '', names: true };

  // Флаг из двух букв ISO: 🇷🇺 — это пара региональных индикаторов R и U.
  function flag(iso) {
    iso = String(iso || '').toUpperCase();

    if (!/^[A-Z]{2}$/.test(iso)) return '';

    return String.fromCodePoint(0x1F1E6 + iso.charCodeAt(0) - 65, 0x1F1E6 + iso.charCodeAt(1) - 65);
  }

  // Имя страны в языке страницы. Платформа без Intl.DisplayNames или
  // неизвестный код — пустая строка, а не исключение: подпись останется авторской.
  function name(iso, lang) {
    try {
      return new Intl.DisplayNames([lang || 'en'], { type: 'region' }).of(String(iso).toUpperCase()) || '';
    } catch (e) {
      return '';
    }
  }

  function lang() {
    return (document.documentElement && document.documentElement.getAttribute('lang')) || 'en';
  }

  function digits(text) {
    return String(text || '').replace(/\D/g, '');
  }

  function element(tag, attrs) {
    var node = document.createElement(tag);

    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);

    return node;
  }

  G.defineWidget('phone', { needs: ['mask'] }, function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var events = G.listeners();
    var select = el.querySelector('select');
    var input = el.querySelector('input');
    var locale = lang();

    if (!input) throw new Error('у поля телефона нет <input>');

    var created = [];   // позиции, добавленные из таблицы
    var texts = [];     // [позиция, подпись автора] — для destroy
    var mask = null;

    function options() {
      return select ? select.options : [];
    }

    function current() {
      return select ? options()[select.selectedIndex] || null : null;
    }

    function info(option) {
      return {
        iso: option ? option.getAttribute('data-gr-iso') || '' : '',
        code: option ? option.value : '',
        mask: option ? option.getAttribute('data-gr-format') || '' : '',
        trunk: option ? option.getAttribute('data-gr-trunk') || '' : ''
      };
    }

    // Пустой список — из таблицы, отсортированной по имени в языке страницы.
    if (select && !options().length && G.phone.table) {
      var rows = [];

      for (var r = 0; r < G.phone.table.length; r++) {
        var row = G.phone.table[r];

        rows.push({ iso: row[0], code: row[1], mask: row[2], trunk: row[3] || '', label: name(row[0], locale) || row[0] });
      }

      var compare = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(locale).compare : function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };

      rows.sort(function (a, b) { return compare(a.label, b.label); });

      for (var c = 0; c < rows.length; c++) {
        var option = element('option', { value: rows[c].code, 'data-gr-iso': rows[c].iso, 'data-gr-format': rows[c].mask });

        option.textContent = rows[c].label;
        if (rows[c].trunk) option.setAttribute('data-gr-trunk', rows[c].trunk);
        select.appendChild(option);
        created.push(option);
      }
    }

    if (!options().length) {
      G.warn('телефон: список кодов пуст — перечислите <option> сами или подключите griffinjs-countries.js');
    }

    // Подписи: флаг + имя в языке страницы + код. Только там, где есть ISO
    // и платформа знает имя; остальное остаётся как написал автор.
    if (o.names) {
      var all = options();

      for (var i = 0; i < all.length; i++) {
        var iso = all[i].getAttribute('data-gr-iso');
        var label = iso ? name(iso, locale) : '';

        if (!label) continue;

        texts.push([all[i], all[i].textContent]);
        all[i].textContent = flag(iso) + ' ' + label + ' ' + all[i].value;
      }
    }

    // Начальная страна из параметра — по ISO, регистр не важен.
    if (o.country && select) {
      var want = String(o.country).toUpperCase();
      var list = options();

      for (var k = 0; k < list.length; k++) {
        if ((list[k].getAttribute('data-gr-iso') || '').toUpperCase() === want) { select.selectedIndex = k; break; }
      }
    }

    // Маска по выбранному коду. Без маски у страны или без griffinjs-mask.js
    // номер остаётся обычным полем.
    function apply() {
      var format = info(current()).mask;

      if (format && G.widgets.mask) {
        if (mask) mask.use(format);
        else mask = G.mount(input, 'mask', { format: format });
      } else if (mask) {
        G.unmount(input, 'mask');
        mask = null;
      }
    }

    function value() {
      var national = mask ? mask.raw() : digits(input.value);

      return national ? info(current()).code + national : '';
    }

    function emit() {
      var c = info(current());

      G.emit('griffin:change', el, { iso: c.iso, code: c.code, value: value() });
    }

    // Полный номер с плюсом: страна — по самому длинному коду, который
    // с него начинается; остаток — в маску. Неизвестный код — не наш номер.
    function adopt(text) {
      var all = digits(text);
      var list = options();
      var best = -1;
      var length = 0;

      for (var i = 0; i < list.length; i++) {
        var code = digits(list[i].value);

        if (code && all.indexOf(code) === 0 && code.length > length) { best = i; length = code.length; }
      }

      if (best === -1) return false;

      select.selectedIndex = best;
      apply();

      if (mask) mask.set(all.slice(length));
      else input.value = all.slice(length);

      emit();

      return true;
    }

    // Национальный префикс: «8 912 345-67-89» — одиннадцать знаков при десяти
    // в маске, лишний и есть префикс. Десять знаков с восьмёрки — просто номер.
    function untrunk(all) {
      var trunk = info(current()).trunk;

      if (mask && trunk && all.indexOf(trunk) === 0 && all.length > mask.size()) return all.slice(trunk.length);

      return null;
    }

    function onPaste(event) {
      var text = event.clipboardData ? event.clipboardData.getData('text') : '';

      if (/^\s*\+/.test(text)) {
        if (adopt(text)) event.preventDefault();
        return;
      }

      var national = untrunk(digits(text));

      if (national !== null) { event.preventDefault(); mask.set(national); }
    }

    // Набор по знаку: одиннадцатый знак к десяти в маске — префикс уходит,
    // и маска получает номер без него. Слушатель стоит раньше маски.
    function onBeforeInput(event) {
      if (!/^insert/.test(event.inputType || '')) return;

      var data = event.data || (event.dataTransfer ? event.dataTransfer.getData('text') : '') || '';
      var national = mask ? untrunk(mask.raw() + digits(data)) : null;

      if (national !== null) { event.preventDefault(); mask.set(national); }
    }

    // Автозаполнение пишет полный номер и шлёт input без beforeinput.
    // Слушатель стоит раньше маски, поэтому забирает плюс до того, как
    // она сложит его цифры в национальный номер.
    function onInput() {
      if (/^\s*\+/.test(input.value)) { adopt(input.value); return; }

      var national = untrunk(digits(input.value));

      if (national !== null) mask.set(national);
    }

    function onChange() {
      apply();
      emit();
    }

    if (select) events.add(select, 'change', onChange);
    events.add(input, 'paste', onPaste);
    events.add(input, 'beforeinput', onBeforeInput);
    events.add(input, 'input', onInput);

    apply();

    return {
      el: el,
      select: select,
      input: input,
      country: function () { return info(current()); },
      value: value,
      set: adopt,
      destroy: function () {
        events.removeAll();

        if (mask) G.unmount(input, 'mask');

        for (var i = 0; i < texts.length; i++) texts[i][0].textContent = texts[i][1];
        for (var j = 0; j < created.length; j++) created[j].remove();
      }
    };
  });

  // Таблица стран приезжает отдельным файлом и кладётся сюда на старте.
  G.phone = { flag: flag, name: name, table: null };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
