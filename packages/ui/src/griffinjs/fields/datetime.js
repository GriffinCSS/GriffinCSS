/*
 * GriffinJS — дата и время: маска по локали и календарь на указателе мыши.
 *
 *   <input class="gr-input" type="date" name="from" min="2026-01-01" data-gr-datetime>
 *
 * Разметка всегда несёт нативное поле — date, time или datetime-local —
 * и без скрипта форма работает ровно как сегодня. Виджет не спорит
 * с платформой, а делит с ней работу по pointerType КАЖДОГО события:
 * на тач-устройстве он разметку не трогает вовсе — системный календарь
 * лучше нашего, это невыдуманная часть отказа Этапа 33; на указателе
 * мыши тип подменяется на text, надевается маска по локали, значение
 * уходит в скрытый спутник с прежним именем в ISO, а показывается текст
 * через Intl.DateTimeFormat с локалью из lang документа — то, чего
 * нативное поле не умеет и за что здесь платят килобайтами. Тач-событие
 * на уже подменённом поле возвращает нативный тип — на гибридном
 * устройстве календарь снова системный.
 *
 * Плата названа, а не замолчана: на текстовом поле платформа не проверяет
 * min/max — проверка переезжает сюда через setCustomValidity. Спутник
 * несёт границы, и там, где платформа умеет, сообщение берётся у неё,
 * в языке браузера; невозможная дата — своё, из параметра invalid.
 * required остаётся на видимом поле и проверяется платформой как прежде.
 * destroy() возвращает нативный тип, имя и ISO.
 *
 * Время (type="time") виджет не трогает вовсе — ни на мыши, ни на тач:
 * выбор часов и минут у платформы встроен в само поле, и подменять его
 * текстом с панелью значило бы отдавать при фокусе дубль того же поля.
 * Атрибут на нём допустим, чтобы одна разметка годилась всем трём типам,
 * но делает он там ничего.
 *
 * Панель у даты и даты-времени: сетка месяца, role="dialog", фокус
 * остаётся в поле, активный день — aria-activedescendant, год — отдельным
 * списком в шапке, у даты-времени под сеткой — нативное поле времени. ↓ и ↑ — неделя (↓ на закрытой панели
 * открывает её), ← → — день, Home/End — край недели (трое последних — пока
 * день активен, иначе ходят по тексту), PageUp/PageDown — месяц, с Shift —
 * год, Enter — выбор, Esc — закрыть. Для даты-времени в панели есть
 * и время — нативное <input type="time"> под сеткой; в маске оно
 * набирается тоже, всегда в 24-часовом виде. Положение — G.anchor.place,
 * санкционированное исключение инварианта 7, как у dropdown.
 *
 * Невозможное значение — «31.02.2026», «25:70» — помечается сразу, как
 * только набрано целиком: aria-invalid на поле (его красит CSS семьи)
 * и своё сообщение в setCustomValidity; неполный ввод не краснеет.
 *
 *   data-gr-datetime="invalid: Такой даты нет; label: Календарь"
 * invalid, range — сообщения проверки; label, prev, next, year, time —
 * подписи панели.
 *
 * Диапазон «с — по» (Этап 43a) — пара нативных полей, связанная атрибутом:
 *   <input type="date" name="from" data-gr-datetime="to: #until">
 *   <input type="date" name="until" id="until" data-gr-datetime>
 * Одного контрола с двумя концами нет намеренно: база без скрипта — два
 * нативных поля, и панель одного поля пишет одно поле. Связка строится
 * на готовом: значение «с» становится min у «по», значение «по» — max
 * у «с», через собственный API соседа (limit), — и проверка границ,
 * сообщения и aria-disabled в панели работают без новой логики; на тач-
 * устройстве системный календарь сам скроет недоступное. Авторская
 * граница остаётся, если она уже; очистка и destroy() возвращают её.
 * Порядок дат виджет не толкает: «по» раньше «с» — ошибка ввода, и её
 * показывает проверка границ, а не молчаливая правка второго поля.
 * Сверх границ — только панель: пустое поле открывается на месяце
 * соседа, оба конца — aria-selected, дни между ними — data-gr-in-range
 * (красит CSS панели), и range: {from, to} в detail griffin:change обоих.
 *
 * Виджет пишет value контрола — расширение инварианта 7, объявленное
 * в docs/griffinjs-architecture.html («Инварианты»).
 */
(function (G) {
  'use strict';

  var DEFAULTS = {
    invalid: '',
    range: 'Дата вне допустимых границ',
    label: 'Календарь',
    prev: 'Предыдущий месяц',
    next: 'Следующий месяц',
    year: 'Год',
    time: 'Время'
  };
  var INVALID = { date: 'Такой даты нет', time: 'Такого времени нет', datetime: 'Такой даты или времени нет' };
  var MODES = { date: 'date', time: 'time', 'datetime-local': 'datetime' };
  var WIDTH = { year: 4, month: 2, day: 2, hour: 2, minute: 2 };
  // Образец, в котором все части различимы: 24.12.2001 13:45.
  var SAMPLE = new Date(2001, 11, 24, 13, 45);

  var seq = 0;

  function pad(n, width) {
    var s = String(n);

    while (s.length < width) s = '0' + s;

    return s;
  }

  function lang() {
    return (document.documentElement && document.documentElement.getAttribute('lang')) || 'en';
  }

  // Раскладка по локали: порядок частей и литералы — у Intl.DateTimeFormat.
  // Из неё же собирается маска: год — четыре слота, остальное — по два.
  function layout(locale, mode) {
    var opts = {};

    if (mode !== 'time') { opts.year = 'numeric'; opts.month = '2-digit'; opts.day = '2-digit'; }
    if (mode !== 'date') { opts.hour = '2-digit'; opts.minute = '2-digit'; opts.hourCycle = 'h23'; }

    var parts;

    try {
      parts = new Intl.DateTimeFormat(locale, opts).formatToParts(SAMPLE);
    } catch (e) {
      parts = new Intl.DateTimeFormat('en', opts).formatToParts(SAMPLE);
    }

    var mask = '';
    var order = [];
    var template = [];

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];

      if (WIDTH[part.type]) {
        order.push(part.type);
        template.push({ type: part.type });
        mask += pad('', WIDTH[part.type]);
      } else {
        template.push({ lit: part.value });
        mask += part.value.replace(/[0aA*?\\]/g, '\\$&');
      }
    }

    return { mode: mode, mask: mask, order: order, template: template };
  }

  function daysIn(year, month) {
    return new Date(year, month, 0).getDate();
  }

  // Цифры из маски → ISO; неполный ввод и невозможная дата — пустая строка.
  function parse(lay, raw) {
    var v = {};
    var at = 0;

    for (var i = 0; i < lay.order.length; i++) {
      var type = lay.order[i];

      if (raw.length < at + WIDTH[type]) return '';

      v[type] = parseInt(raw.substr(at, WIDTH[type]), 10);
      at += WIDTH[type];
    }

    if (lay.mode !== 'time' && !(v.year >= 1 && v.month >= 1 && v.month <= 12 && v.day >= 1 && v.day <= daysIn(v.year, v.month))) return '';
    if (lay.mode !== 'date' && !(v.hour >= 0 && v.hour <= 23 && v.minute >= 0 && v.minute <= 59)) return '';

    var date = lay.mode === 'time' ? '' : pad(v.year, 4) + '-' + pad(v.month, 2) + '-' + pad(v.day, 2);
    var time = lay.mode === 'date' ? '' : pad(v.hour, 2) + ':' + pad(v.minute, 2);

    return lay.mode === 'date' ? date : lay.mode === 'time' ? time : date + 'T' + time;
  }

  function split(iso) {
    var m = /^(?:(\d{4})-(\d{2})-(\d{2}))?T?(?:(\d{2}):(\d{2}))?/.exec(iso || '') || [];

    return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
  }

  // ISO → текст по раскладке: те же литералы, что дала платформа.
  function format(lay, iso) {
    if (!iso) return '';

    var v = split(iso);
    var out = '';

    for (var i = 0; i < lay.template.length; i++) {
      var t = lay.template[i];

      if (t.lit !== undefined) { out += t.lit; continue; }
      if (isNaN(v[t.type])) return '';

      out += pad(v[t.type], WIDTH[t.type]);
    }

    return out;
  }

  function dateOf(iso) {
    return (iso || '').slice(0, 10).replace(/T.*$/, '');
  }

  function timeOf(iso) {
    return (/(\d{2}:\d{2})$/.exec(iso || '') || [])[1] || '';
  }

  function isoDate(d) {
    return pad(d.getFullYear(), 4) + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }

  function fromIso(key) {
    var v = split(key);

    return new Date(v.year, v.month - 1, v.day);
  }

  // Первый день недели — у платформы (weekInfo), иначе понедельник.
  // Возвращает номер дня по getDay(): 0 — воскресенье.
  function firstDay(locale) {
    try {
      var L = new Intl.Locale(locale);
      var info = typeof L.getWeekInfo === 'function' ? L.getWeekInfo() : L.weekInfo;

      if (info && info.firstDay) return info.firstDay % 7;
    } catch (e) { /* без weekInfo */ }

    return 1;
  }

  function element(tag, className, attrs) {
    var node = document.createElement(tag);

    if (className) node.setAttribute('class', className);
    for (var k in attrs || {}) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);

    return node;
  }

  function attr(node, name, value) {
    if (value) node.setAttribute(name, value);
    else node.removeAttribute(name);
  }

  G.defineWidget('datetime', { needs: ['mask', 'anchor'] }, function (el, opts) {
    var o = G.merge(DEFAULTS, opts);
    var native = el.getAttribute('type');
    var mode = MODES[native];

    if (!mode) throw new Error('нужен type="date", "time" или "datetime-local"');

    var attrs = G.recorder();
    var events = G.listeners();    // на всё время жизни
    var live = G.listeners();      // пока поле текстовое
    var shown = G.listeners();     // пока панель открыта
    var locale = lang();
    var lay = layout(locale, mode);
    var uid = ++seq;
    var fd = firstDay(locale);

    var mask = null;
    var companion = null;
    var panel = null;
    var body = null;
    var title = null;
    var years = null;      // список лет в шапке панели
    var clock = null;      // время в панели (дата-время)
    var total = 0;         // знаков в полном значении маски

    for (var w = 0; w < lay.order.length; w++) total += WIDTH[lay.order[w]];

    var invalidText = o.invalid || INVALID[mode];
    var opened = false;
    var view = null;       // первое число показанного месяца
    var active = null;     // активный день панели, 'YYYY-MM-DD'
    var last = null;       // последнее ISO, о котором сказано событием
    var peer = null;       // второе поле пары «с — по»
    var role = '';         // 'from' | 'to' — кто это поле в паре
    var own = { min: el.getAttribute('min'), max: el.getAttribute('max') };   // авторские границы

    function iso() {
      return companion ? companion.value : el.value;
    }

    // --- Пара «с — по» ------------------------------------------------------------

    function range() {
      var mine = iso();
      var theirs = peer.value();

      return role === 'from' ? { from: mine, to: theirs } : { from: theirs, to: mine };
    }

    // Граница на поле и спутнике; проверка и панель узнают о ней тем же
    // путём, что о всякой другой.
    function apply(name, value) {
      attr(el, name, value);

      if (companion) { attr(companion, name, value); check(); }
      if (opened && body) render(view);
    }

    // Граница от соседа: авторская остаётся, если она уже; пустое
    // значение возвращает авторскую.
    function limit(name, value) {
      var mine = own[name];

      apply(name, !value ? mine : mine && (name === 'min' ? mine > value : mine < value) ? mine : value);
    }

    function push() {
      if (peer) peer.limit(role === 'from' ? 'min' : 'max', iso());
    }

    function unpair() {
      var name = role === 'from' ? 'max' : 'min';

      peer = null;
      role = '';
      apply(name, own[name]);
    }

    // --- Проверка ---------------------------------------------------------------

    function check() {
      var raw = mask ? mask.raw() : String(el.value || '').replace(/\D/g, '');
      var value = raw ? parse(lay, raw) : '';
      var message = '';

      companion.value = value;

      if (raw && !value) {
        message = invalidText;
      } else if (value) {
        if (companion.validity) {
          if (!companion.validity.valid) message = companion.validationMessage || o.range;
        } else {
          var min = el.getAttribute('min');
          var max = el.getAttribute('max');

          if ((min && value < min) || (max && value > max)) message = o.range;
        }
      }

      if (typeof el.setCustomValidity === 'function') el.setCustomValidity(message);

      // Красным — только набранное целиком: неполная дата ещё не ошибка.
      attrs.set(el, 'aria-invalid', message && raw.length >= total ? 'true' : null);

      if (value !== last) {
        last = value;
        G.emit('griffin:change', el, peer ? { value: value, range: range() } : { value: value });
        push();
      }
    }

    // ISO → текст в поле; маска шлёт input, и check() идёт по нему.
    function write(value) {
      var text = format(lay, value);

      if (mask) mask.set(text);
      else { el.value = text; check(); }
    }

    // --- Режим text -------------------------------------------------------------

    function assist() {
      if (companion) return;

      var value = el.value;

      companion = element('input', '', { type: native, hidden: '' });

      for (var i = 0, copy = ['name', 'min', 'max', 'step']; i < copy.length; i++) {
        var v = el.getAttribute(copy[i]);

        if (v !== null) companion.setAttribute(copy[i], v);
      }

      companion.value = value;
      el.parentNode.insertBefore(companion, el.nextSibling);

      // WebKit теряет фокус при смене типа; поле, бывшее в фокусе, в нём и остаётся.
      var focused = document.activeElement === el;

      attrs.set(el, 'name', null);
      attrs.set(el, 'type', 'text');
      attrs.set(el, 'autocomplete', 'off');

      if (focused && document.activeElement !== el && typeof el.focus === 'function') el.focus();

      attrs.set(el, 'aria-haspopup', 'dialog');
      attrs.set(el, 'aria-expanded', 'false');

      el.value = format(lay, value);
      last = value;
      mask = G.widgets.mask ? G.mount(el, 'mask', { format: lay.mask }) : null;

      live.add(el, 'input', onInput);
      live.add(el, 'keydown', onKeyDown);
      live.add(el, 'blur', onBlur);

      check();
    }

    function restore() {
      if (!companion) return;

      close();
      live.removeAll();

      if (mask) { G.unmount(el, 'mask'); mask = null; }

      var value = companion.value;

      companion.remove();
      companion = null;
      attrs.restore();
      el.value = value;

      if (typeof el.setCustomValidity === 'function') el.setCustomValidity('');
    }

    // Развилка — по pointerType каждого события, не по классу устройства.
    // Подмена типа откладывается на тик: смена посреди нажатия обрывает
    // его цепочку — ни focus, ни click до поля уже не доходят. Нажатие
    // завершается на нативном поле, фокус остаётся, тип меняется следом
    // и панель поднимается тут же; click открывает её в следующие разы.
    function onPointerDown(event) {
      if (mode === 'time') return;

      if (event.pointerType === 'mouse') {
        if (!companion) setTimeout(function () { assist(); open(); }, 0);
      } else if (event.pointerType && companion) {
        restore();
      }
    }

    function onClick() {
      if (companion) open();
    }

    // Нативное поле: значение пишет платформа, и сосед по паре узнаёт о нём здесь.
    function onNativeInput() {
      if (!companion) push();
    }

    function onInput() {
      check();

      if (opened) {
        var d = dateOf(iso());

        if (d && body) { active = null; render(fromIso(d)); }
        if (clock) clock.value = timeOf(iso());
      }
    }

    // Фокус уходит в панель — к году или времени — панель остаётся;
    // уходит куда-то ещё — поле возвращается к нативному типу: значок
    // календаря и подсказка платформы снова на месте, значение в ISO.
    function onBlur(event) {
      if (panel && event && event.relatedTarget && panel.contains(event.relatedTarget)) return;

      leave();
    }

    function onPanelFocusOut(event) {
      var to = event.relatedTarget;

      if (to === el || (to && panel.contains(to))) return;

      leave();
    }

    // Уход из поля — обратно к нативному. Откладывается на тик: blur
    // приходит и посреди щелчка по панели, и от pointerdown снаружи —
    // к моменту проверки фокус уже там, где он окажется на самом деле.
    function leave() {
      setTimeout(function () {
        if (!companion) return;

        var focus = document.activeElement;

        if (focus === el || (panel && focus && panel.contains(focus))) return;

        restore();
      }, 0);
    }

    // --- Панель -----------------------------------------------------------------

    function build() {
      var id = 'gr-datetime-' + uid;

      panel = element('div', 'gr-datetime-panel', { id: id, role: 'dialog', 'aria-label': o.label, 'data-gr-state': 'closed' });

      try {
        if ('popover' in panel) panel.setAttribute('popover', 'manual');
      } catch (e) { /* без popover */ }

      if (mode !== 'time') {
        var head = element('div', 'gr-datetime-head');
        var prev = element('button', 'gr-datetime-nav', { type: 'button', 'aria-label': o.prev, 'data-gr-step': '-1' });
        var next = element('button', 'gr-datetime-nav', { type: 'button', 'aria-label': o.next, 'data-gr-step': '1' });

        title = element('span', 'gr-datetime-title', { id: id + '-title', 'aria-live': 'polite' });
        years = element('select', 'gr-datetime-year', { 'aria-label': o.year });

        // Годы: от нижней границы (или ста двадцати лет назад) до верхней
        // (или двадцати вперёд) — дата рождения и бронирование одним списком.
        var today = new Date().getFullYear();
        var min = dateOf(el.getAttribute('min'));
        var max = dateOf(el.getAttribute('max'));
        var lo = min ? split(min).year : today - 120;
        var hi = max ? split(max).year : today + 20;

        for (var y = lo; y <= hi; y++) {
          var option = element('option', '', { value: String(y) });

          option.textContent = String(y);
          years.appendChild(option);
        }

        prev.textContent = '‹';
        next.textContent = '›';
        head.appendChild(prev);
        head.appendChild(title);
        head.appendChild(years);
        head.appendChild(next);

        var grid = element('div', 'gr-datetime-grid', { role: 'grid', 'aria-labelledby': id + '-title' });
        var week = element('div', 'gr-datetime-row', { role: 'row' });
        var names = new Intl.DateTimeFormat(locale, { weekday: 'short' });

        for (var i = 0; i < 7; i++) {
          var day = element('div', 'gr-datetime-weekday', { role: 'columnheader' });

          // 1 января 2023 — воскресенье: день k недели — это 1 + k января.
          day.textContent = names.format(new Date(2023, 0, 1 + ((fd + i) % 7)));
          week.appendChild(day);
        }

        body = element('div', 'gr-datetime-rows', { role: 'rowgroup' });
        grid.appendChild(week);
        grid.appendChild(body);
        panel.appendChild(head);
        panel.appendChild(grid);
        events.add(years, 'change', onYear);
      }

      // Дата-время: время — нативным полем под сеткой, его проверяет платформа.
      if (mode === 'datetime') {
        var row = element('label', 'gr-datetime-clock');
        var text = element('span');

        clock = element('input', 'gr-datetime-clock-input', { type: 'time' });
        text.textContent = o.time;
        row.appendChild(text);
        row.appendChild(clock);
        panel.appendChild(row);
        events.add(clock, 'change', onClock);
      }

      document.body.appendChild(panel);

      // Указатель на панели не уводит фокус из поля — кроме её собственных
      // полей: год и время берут фокус сами и возвращают его по Esc.
      events.add(panel, 'pointerdown', function (event) {
        if (!G.closest(event.target, 'select, input')) event.preventDefault();
      });
      events.add(panel, 'click', onPanelClick);
      events.add(panel, 'focusout', onPanelFocusOut);
      events.add(panel, 'keydown', onPanelKeyDown);
    }

    function onYear() {
      var y = parseInt(years.value, 10);

      if (view && y) render(new Date(y, view.getMonth(), 1));
    }

    function onClock() {
      if (!clock.value) return;

      write((dateOf(iso()) || isoDate(new Date())) + 'T' + clock.value);
    }

    // Esc из года или времени — закрыть и вернуть фокус в поле.
    function onPanelKeyDown(event) {
      if (event.key !== 'Escape') return;

      close();
      if (typeof el.focus === 'function') el.focus();
      event.preventDefault();
    }

    // Месяц, в котором лежит base: шесть недель всегда — панель не прыгает
    // по высоте от месяца к месяцу.
    function render(base) {
      var y = base.getFullYear();
      var m = base.getMonth();
      var offset = (new Date(y, m, 1).getDay() - fd + 7) % 7;
      var start = new Date(y, m, 1 - offset);
      // Концы отрезка: у одиночного поля оба — его значение.
      var ends = peer ? range() : { from: iso(), to: iso() };
      var lo = dateOf(ends.from);
      var hi = dateOf(ends.to);
      var today = isoDate(new Date());
      var min = dateOf(el.getAttribute('min'));
      var max = dateOf(el.getAttribute('max'));
      var descendant = null;

      view = new Date(y, m, 1);
      title.textContent = new Intl.DateTimeFormat(locale, { month: 'long' }).format(view);
      years.value = String(y);

      while (body.firstElementChild) body.firstElementChild.remove();

      for (var w = 0; w < 6; w++) {
        var tr = element('div', 'gr-datetime-row', { role: 'row' });

        for (var d = 0; d < 7; d++) {
          var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
          var key = isoDate(date);
          var cell = element('div', 'gr-datetime-day', { role: 'gridcell', id: panel.id + '-' + key, 'data-gr-date': key });

          cell.textContent = String(date.getDate());
          cell.setAttribute('aria-selected', key === lo || key === hi ? 'true' : 'false');

          if (lo && hi && lo < key && key < hi) cell.setAttribute('data-gr-in-range', '');
          if (key === today) cell.setAttribute('aria-current', 'date');
          if ((min && key < min) || (max && key > max)) cell.setAttribute('aria-disabled', 'true');
          if (key === active) { cell.setAttribute('data-gr-state', 'active'); descendant = cell.id; }
          else if (date.getMonth() !== m) cell.setAttribute('data-gr-state', 'outside');

          tr.appendChild(cell);
        }

        body.appendChild(tr);
      }

      attrs.set(el, 'aria-activedescendant', descendant);
    }

    function open() {
      if (opened || !companion) return;
      if (!panel) build();

      opened = true;
      active = null;

      // Пустое поле пары открывается на месяце соседа.
      var d = dateOf(iso()) || (peer ? dateOf(peer.value()) : '');

      if (body) render(d ? fromIso(d) : new Date());
      if (clock) clock.value = timeOf(iso());
      panel.setAttribute('data-gr-state', 'open');

      try {
        if (typeof panel.showPopover === 'function') panel.showPopover();
      } catch (e) { /* уже открыт или без popover */ }

      if (G.anchor) G.anchor.place(panel, el, { side: 'bottom', align: 'start', gap: 4, margin: 8 });

      attrs.set(el, 'aria-controls', panel.id);
      attrs.set(el, 'aria-expanded', 'true');

      shown.add(document, 'pointerdown', onOutside, true);
      if (typeof window !== 'undefined') shown.add(window, 'resize', close);
    }

    function close() {
      if (!opened) return;

      opened = false;
      active = null;
      shown.removeAll();
      panel.setAttribute('data-gr-state', 'closed');

      try {
        if (typeof panel.hidePopover === 'function') panel.hidePopover();
      } catch (e) { /* уже закрыт */ }

      attrs.set(el, 'aria-expanded', 'false');
      attrs.set(el, 'aria-activedescendant', null);
    }

    function onOutside(event) {
      var n = event.target;

      while (n) { if (n === panel || n === el) return; n = n.parentNode; }

      close();
    }

    function pick(key) {
      write(mode === 'datetime' ? key + 'T' + ((clock && clock.value) || timeOf(iso()) || '00:00') : key);
      close();
    }

    function onPanelClick(event) {
      var cell = G.closest(event.target, '[role="gridcell"]');

      if (cell) {
        if (cell.getAttribute('aria-disabled') !== 'true') pick(cell.getAttribute('data-gr-date'));
        return;
      }

      var nav = G.closest(event.target, '[data-gr-step]');

      if (nav) move(0, parseInt(nav.getAttribute('data-gr-step'), 10), 0, true);
    }

    // Сдвиг активного дня — от него, от выбранной даты или от показанного
    // месяца; стрелки панели (viewOnly) листают месяц, не трогая активный
    // день. При шаге в месяцах и годах число не перетекает в следующий
    // месяц, а упирается в последнее.
    function move(days, months, years, viewOnly) {
      var selected = dateOf(iso());
      var origin = viewOnly ? view : active ? fromIso(active) : selected ? fromIso(selected) : view;
      var date = new Date(origin.getFullYear() + years, origin.getMonth() + months, origin.getDate() + days);

      if ((months || years) && date.getMonth() !== ((origin.getMonth() + months) % 12 + 12) % 12) {
        date = new Date(date.getFullYear(), date.getMonth(), 0);
      }

      if (!viewOnly) active = isoDate(date);
      render(date);
    }

    function onKeyDown(event) {
      var key = event.key;

      if (!opened) {
        if (key === 'ArrowDown') { open(); event.preventDefault(); }
        return;
      }

      if (key === 'Escape') { close(); event.preventDefault(); return; }
      if (!body) return;
      if (key === 'Enter') {
        if (active) { pick(active); event.preventDefault(); }
        return;
      }

      var rtl = document.documentElement.getAttribute('dir') === 'rtl';
      var week = active ? (fromIso(active).getDay() - fd + 7) % 7 : 0;
      var step = { ArrowDown: [7, 0, 0], ArrowUp: [-7, 0, 0], PageDown: [0, 1, 0], PageUp: [0, -1, 0] };

      if (event.shiftKey && (key === 'PageDown' || key === 'PageUp')) step = { PageDown: [0, 0, 1], PageUp: [0, 0, -1] };

      // Стрелки по строке и края недели — только при активном дне:
      // до него они ходят по тексту в поле.
      if (active) {
        step.ArrowRight = [rtl ? -1 : 1, 0, 0];
        step.ArrowLeft = [rtl ? 1 : -1, 0, 0];
        step.Home = [-week, 0, 0];
        step.End = [6 - week, 0, 0];
      }

      if (!step[key]) return;

      move(step[key][0], step[key][1], step[key][2]);
      event.preventDefault();
    }

    events.add(el, 'pointerdown', onPointerDown);
    events.add(el, 'click', onClick);
    events.add(el, 'input', onNativeInput);

    var api = {
      el: el,
      open: open,
      close: close,
      value: iso,
      set: function (value) {
        if (companion) write(value);
        else { el.value = value; push(); }
      },
      // Пара: limit — граница от соседа (единственный путь, которым виджет
      // пишет min/max чужого поля), pair — «other — моё „с“», unpair — развод.
      limit: limit,
      pair: function (other) {
        peer = other;
        role = 'to';
        push();
      },
      unpair: unpair,
      get panel() { return panel; },
      destroy: function () {
        restore();
        events.removeAll();

        if (peer) { var other = peer; unpair(); other.unpair(); }

        if (panel) {
          if (G.anchor) G.anchor.clear(panel);
          panel.remove();
          panel = null;
        }
      }
    };

    // Сосед по паре: уже поднятый — как есть, иначе поднимается здесь;
    // сканер на нём потом найдёт живой экземпляр.
    if (o.to && mode !== 'time') {
      var target = document.querySelector(o.to);
      var other = target && G.mount(target, 'datetime');

      if (other) { peer = other; role = 'from'; other.pair(api); push(); }
      else G.warn('datetime: поле «по» не найдено — ' + o.to);
    }

    return api;
  });

  G.datetime = { layout: layout, parse: parse, format: format };
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
