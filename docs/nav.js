// Оборачивает каждую таблицу в прокручиваемый контейнер: справочные таблицы
// не сжимаются ниже своего содержимого, и в узкой колонке уезжала бы вбок
// вся страница, а не одна таблица.
//
// .gr-table в готовой обёртке .gr-table-wrap пропускается: вторая обёртка,
// вставленная между ней и таблицей, отобрала бы у .gr-table-sticky
// прокручиваемого предка — шапка перестала бы липнуть. А вот .gr-table
// без обёртки — обычная таблица, и на 375 px она уводила вбок страницу
// целиком; такую оборачиваем наравне со справочными.
(function () {
  var tables = document.querySelectorAll('table');

  for (var i = 0; i < tables.length; i++) {
    var table = tables[i];

    if (table.parentNode && table.parentNode.className === 'table-scroll') continue;
    if (table.closest('.gr-table-wrap')) continue;

    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  }
})();

(function () {
  var nav = document.querySelector('.sidebar');
  if (!nav) return;

  var page = location.pathname.split('/').pop().replace(/\.html?$/, '') || 'index';

  var sections = [
    {
      title: 'Начало',
      links: [
        { href: 'index.html',              text: 'Обзор' },
        { href: 'index.html#features',     text: 'Возможности' },
        { href: 'index.html#advantages',   text: 'Достоинства' },
        { href: 'index.html#limitations',  text: 'Ограничения' },
        { href: 'index.html#quickstart',   text: 'Быстрый старт' },
        { href: 'compatibility.html',      text: 'Совместимость' }
      ]
    },
    {
      title: 'Ядро',
      links: [
        { href: 'core-reset.html',         text: 'Reset и переменные' },
        { href: 'core-grid.html',          text: 'Grid-парсер' },
        { href: 'core-grid-helpers.html',  text: 'Grid-утилиты' },
        { href: 'core-flex.html',          text: 'Flex-утилиты' },
        { href: 'container-queries.html',  text: 'Контейнерные запросы' },
        { href: 'theme.html',              text: 'Темы' },
        { href: 'style-presets.html',      text: 'Стратегии оформления' }
      ]
    },
    {
      title: 'Модули',
      links: [
        { href: 'spacing.html',            text: 'Spacing' },
        { href: 'sizing.html',             text: 'Sizing' },
        { href: 'typography.html',         text: 'Typography' },
        { href: 'colors.html',             text: 'Colors' },
        { href: 'borders.html',            text: 'Borders' },
        { href: 'border-radius.html',      text: 'Border Radius' },
        { href: 'shadows.html',            text: 'Shadows' },
        { href: 'position.html',           text: 'Position' },
        { href: 'effects.html',            text: 'Effects' },
        { href: 'visibility.html',         text: 'Visibility' },
        { href: 'interactivity.html',      text: 'Interactivity' },
        { href: 'animations.html',         text: 'Transitions' }
      ]
    },
    {
      title: 'Компоненты',
      links: [
        { href: 'ui-buttons.html',         text: 'Кнопки и ссылки' },
        { href: 'ui-forms.html',           text: 'Формы' },
        { href: 'ui-cards.html',           text: 'Карточки' },
        { href: 'ui-tables.html',          text: 'Таблицы' },
        { href: 'ui-badges.html',          text: 'Плашки и аватары' },
        { href: 'ui-feedback.html',        text: 'Сообщения' },
        { href: 'ui-states.html',          text: 'Состояния' },
        { href: 'ui-nav.html',             text: 'Навигация' },
        { href: 'ui-disclosure.html',      text: 'Раскрытие' },
        { href: 'ui-overlays.html',        text: 'Слои поверх страницы' }
      ]
    },
    // Раздел слоя GriffinJS (Этап 21) — наравне с «Компоненты».
    {
      title: 'GriffinJS',
      links: [
        { href: 'griffinjs.html',          text: 'Обзор слоя' },
        { href: 'griffinjs-slides.html',   text: 'Слайды' },
        { href: 'griffinjs-parallax.html', text: 'Параллакс' },
        { href: 'griffinjs-menus.html',    text: 'Меню' },
        { href: 'griffinjs-overlays.html', text: 'Окна и комбобокс' },
        { href: 'griffinjs-fields.html',   text: 'Поля форм' },
        { href: 'griffinjs-architecture.html', text: 'Архитектура' },
        { href: 'griffinjs-lab.html',      text: 'Полигон' },
        { href: 'griffinjs-fields-lab.html', text: 'Полигон полей' }
      ]
    },
    {
      title: 'Runtime',
      links: [
        { href: 'runtime.html',            text: 'JS-рантайм' },
        { href: 'runtime.html#api',        text: 'API' },
        { href: 'arbitrary-values.html',   text: 'Произвольные значения' },
        { href: 'frameworks.html',         text: 'React и Vue' }
      ]
    },
    {
      title: 'Рецепты',
      links: [
        { href: 'patterns.html',           text: 'Готовые блоки' }
      ]
    },
    {
      title: 'Справочники',
      links: [
        { href: 'reference-core.html',     text: 'Ядро: полный список' },
        { href: 'reference-ui.html',       text: 'Компоненты: полный список' },
        { href: 'reference-utils.html',    text: 'Утилиты: полный список' }
      ]
    },
    {
      title: 'Демо',
      links: [
        { href: 'demo.html',               text: 'Все возможности' },
        { href: 'slow.html',               text: 'Медленная загрузка' },
        { href: 'stream.html',             text: 'Потоковая раскладка' }
      ]
    }
  ];

  // Активна одна ссылка — та, что ведёт на саму страницу. Якорные ссылки
  // внутри неё активными не считаются: пять подсвеченных строк подряд
  // не сообщают, где читатель находится, а сообщают, что подсветка сломана.
  var isActive = function (href) {
    if (href.indexOf('#') !== -1) return false;

    return href.replace('.html', '') === page;
  };

  // Переключатель темы — тот же, что на theme.html: две независимые оси,
  // радиогруппа и тумблер. Документация живёт на том же механизме, который
  // описывает, поэтому проверяется на каждой странице сразу.
  //
  // С 0.8.0 оба органа управления — компоненты библиотеки: .gr-segmented
  // и .gr-switch из griffincss-ui. Раньше они были написаны здесь руками,
  // в docs/style.css и в <style> внутри theme.html — три копии одного
  // и того же. Потребность в компоненте обнаружилась в фазе 6a, раньше,
  // чем его запланировали: ровно то, ради чего документацию и собирают
  // на самой библиотеке.
  var themes = [
    { value: 'auto',  text: 'Авто' },
    { value: 'light', text: 'Светлая' },
    { value: 'dark',  text: 'Тёмная' }
  ];

  // Третья ось — стратегия оформления. Стоит рядом с темой по той же причине,
  // по которой тема стоит здесь: доксайт работает на том механизме, который
  // описывает, и любая страница документации служит его проверкой.
  //
  // Список, а не сегментированная группа: положений четыре, и в ширину
  // боковой панели они не помещаются — сегмент не переносится и не сжимается
  // ниже своего текста (замер: 228 px при доступных 198). Подрезать кегль
  // до нечитаемого ради формы органа управления смысла нет.
  var styles = [
    { value: 'standard', text: 'Стандартный' },
    { value: 'airy',     text: 'Воздушный' },
    { value: 'strict',   text: 'Строгий' },
    { value: 'compact',  text: 'Журнальный' }
  ];

  var current = (window.Griffincss && window.Griffincss.theme)
    ? window.Griffincss.theme.get()
    : { theme: 'auto', a11y: false, style: 'standard' };

  var html = '<a href="index.html" class="sidebar-logo">Griffincss<span>v0.26.1</span></a>';

  html += '<div class="sidebar-controls">';
  html += '<fieldset class="gr-segmented gr-w-full" aria-label="Цветовая тема">';

  for (var t = 0; t < themes.length; t++) {
    var checked = themes[t].value === (current.theme || 'auto') ? ' checked' : '';
    html += '<label><input type="radio" name="gr-theme" value="' + themes[t].value + '"' + checked + '>';
    html += '<span>' + themes[t].text + '</span></label>';
  }

  html += '</fieldset>';

  html += '<select class="gr-select gr-w-full gr-mt-2" id="gr-style" aria-label="Стратегия оформления">';

  for (var p = 0; p < styles.length; p++) {
    var picked = styles[p].value === (current.style || 'standard') ? ' selected' : '';
    html += '<option value="' + styles[p].value + '"' + picked + '>' + styles[p].text + '</option>';
  }

  html += '</select>';
  html += '<label class="gr-choice gr-text-sm gr-mt-2"><input class="gr-switch" type="checkbox" id="gr-a11y"'
        + (current.a11y === true ? ' checked' : '') + '> Для слабовидящих</label>';
  html += '</div>';

  // На узком экране список разделов сворачивается: иначе тридцать ссылок
  // занимают весь первый экран, и до текста страницы надо доскроллить.
  // На широком <summary> скрыт, а details открыт — обычная боковая панель.
  html += '<details class="sidebar-nav" open><summary>Разделы</summary>';

  for (var s = 0; s < sections.length; s++) {
    html += '<div class="sidebar-section">';
    html += '<div class="sidebar-section-title">' + sections[s].title + '</div>';
    for (var l = 0; l < sections[s].links.length; l++) {
      var link = sections[s].links[l];
      var cls = isActive(link.href) ? ' active' : '';
      html += '<a href="' + link.href + '" class="sidebar-link' + cls + '">' + link.text + '</a>';
    }
    html += '</div>';
  }

  html += '</details>';

  nav.innerHTML = html;

  var wide = window.matchMedia ? window.matchMedia('(width >= 48rem)') : null;
  var list = nav.querySelector('.sidebar-nav');

  if (wide && list) {
    var syncNav = function () {
      list.open = wide.matches;
    };

    syncNav();

    if (wide.addEventListener) wide.addEventListener('change', syncNav);
    else if (wide.addListener) wide.addListener(syncNav);
  }

  // Рантайм темы подключён не на всех страницах — без него переключатель
  // просто не появляется, а страница продолжает следовать системной настройке.
  if (!window.Griffincss || !window.Griffincss.theme) {
    var controls = nav.querySelector('.sidebar-controls');
    if (controls) controls.parentNode.removeChild(controls);
    return;
  }

  var theme = window.Griffincss.theme;
  var inputs = nav.querySelectorAll('input[name="gr-theme"]');

  for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener('change', function () {
      theme.set(this.value);
    });
  }

  var styleSelect = nav.querySelector('#gr-style');

  if (styleSelect) {
    styleSelect.addEventListener('change', function () {
      theme.style(this.value);
    });
  }

  var a11y = nav.querySelector('#gr-a11y');
  if (a11y) {
    a11y.addEventListener('change', function () {
      theme.a11y(this.checked);
    });
  }

  // Органы управления следуют за состоянием, а не только задают его.
  // Смена может прийти не отсюда — из скрипта страницы, из другой вкладки,
  // из системной настройки при выбранном «Авто», — и тогда панель показывала
  // бы одно, а страница выглядела бы иначе.
  document.addEventListener('griffincss:themechange', function (e) {
    var state = e.detail || theme.get();

    for (var k = 0; k < inputs.length; k++) {
      inputs[k].checked = inputs[k].value === state.theme;
    }

    if (styleSelect) styleSelect.value = state.style;
    if (a11y) a11y.checked = state.a11y === 'low-vision';
  });
})();

// Копирование, блоки примеров и оглавление страницы.
//
// Всё держится на автоматике по готовому DOM: разметка 34 страниц не меняется
// ни на строку. Цена такого решения — обязанность пропускать всё, чего модуль
// не понял: сломать разом весь доксайт здесь дешевле, чем где-либо ещё.
(function () {
  var content = document.querySelector('.content');

  if (!content) return;

  // --- сообщение для диктора ------------------------------------------------

  // Видимого отклика у копирования почти нет: рамка меняет цвет на секунду.
  // Без живой области незрячий читатель не узнал бы, что нажатие сработало.
  var live = document.createElement('div');

  live.className = 'docs-live';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  var announce = function (text) {
    // Сброс перед сообщением: два одинаковых объявления подряд диктор
    // молча пропускает, а копируют обычно несколько фрагментов подряд.
    live.textContent = '';
    window.setTimeout(function () { live.textContent = text; }, 40);
  };

  // --- буфер обмена ---------------------------------------------------------

  // Три ступени сверху вниз: асинхронный буфер, execCommand, выделение.
  // Последняя — не отказ: «скопировать не смог, но фрагмент выделен» оставляет
  // человека с решённой задачей, а не с неработающей кнопкой. Она же —
  // единственный путь там, где буфер закрыт: незащищённый источник, file://
  // в части браузеров, запрет разрешения.
  var legacyCopy = function (text) {
    var area = document.createElement('textarea');
    var ok = false;

    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();

    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }

    document.body.removeChild(area);

    return ok;
  };

  var selectNode = function (node) {
    if (!node || !window.getSelection || !document.createRange) return;

    var range = document.createRange();
    var selection = window.getSelection();

    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  var copy = function (text, node, done) {
    var finish = function (ok) {
      if (!ok) selectNode(node);
      announce(ok ? 'Скопировано' : 'Скопировать не удалось: фрагмент выделен, нажмите Ctrl+C');
      if (done) done(ok);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { finish(true); },
        function () { finish(legacyCopy(text)); }
      );

      return;
    }

    finish(legacyCopy(text));
  };

  // Мигание состоянием. Таймер хранится на самом элементе: по второму нажатию
  // подряд старый снимается, иначе он погасил бы отклик на новое нажатие.
  var flash = function (el, ok, texts) {
    if (el._grTimer) window.clearTimeout(el._grTimer);

    el.setAttribute('data-state', ok ? 'ok' : 'fail');

    if (texts) el.textContent = ok ? texts[1] : texts[2];

    el._grTimer = window.setTimeout(function () {
      el.removeAttribute('data-state');
      if (texts) el.textContent = texts[0];
      el._grTimer = null;
    }, 1600);
  };

  // --- разметка из DOM ------------------------------------------------------

  var VOID_TAGS = ' area base br col embed hr img input link meta source track wbr ';

  // Строчные элементы не рвут строку. Без этого абзац с двумя <code> внутри
  // раскладывался на семь строк, где запятая и точка стояли отдельно
  // от предложения, — читать такой код нельзя, а именно его и копируют.
  var INLINE_TAGS = ' a abbr b br code em i kbd mark s small span strong sub sup time u ';

  // Предел, после которого строчное содержимое всё-таки переносится:
  // абзац в три предложения одной строкой уезжает за край окна.
  var INLINE_LIMIT = 300;

  // Классов, перечисленных здесь, в исходной разметке не было: их дописал
  // рантайм. Список — постоянное обязательство: каждый новый класс, который
  // рантайм вешает сам, попадает сюда, иначе он уедет в чужой проект вместе
  // со скопированным примером.
  var RUNTIME_CLASS = /^(gr-ready|gr-toast-leaving)$/;

  // Класс раскладки — отдельно. Его имя — база36 от хеша, то есть в принципе
  // любое слово, и по одному виду `gr-l-page` от `gr-l-k7gi9w` не отличить.
  // Отличает не имя, а происхождение: рантайм вешает такой класс только
  // на элемент с data-gr-layout. Написанный руками `.gr-l-page` из статического
  // миксина остаётся в примере, как и задумано автором страницы.
  var LAYOUT_CLASS = /^gr-l-/;

  var isLayoutHost = function (el) {
    var attrs = el.attributes;

    for (var i = 0; i < attrs.length; i++) {
      if (attrs[i].name.indexOf('data-gr-layout') === 0) return true;
    }

    return false;
  };

  var escapeText = function (s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var escapeAttr = function (s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  };

  var keptClasses = function (el) {
    var names = (el.getAttribute('class') || '').split(/\s+/);
    var layout = isLayoutHost(el);
    var kept = [];

    for (var i = 0; i < names.length; i++) {
      if (!names[i]) continue;
      if (RUNTIME_CLASS.test(names[i])) continue;
      if (layout && LAYOUT_CLASS.test(names[i])) continue;

      kept.push(names[i]);
    }

    return kept.join(' ');
  };

  var openTag = function (el) {
    var out = '<' + el.nodeName.toLowerCase();
    var attrs = el.attributes;

    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name;
      var value = attrs[i].value;

      if (name === 'class') {
        value = keptClasses(el);
        if (!value) continue;
      }

      out += value === '' ? ' ' + name : ' ' + name + '="' + escapeAttr(value) + '"';
    }

    return out + '>';
  };

  // Возвращает строчную разметку содержимого или null, если внутри нашёлся
  // блочный элемент: тогда решение принимает serialize по общим правилам.
  var inlineMarkup = function (node) {
    var out = '';

    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];

      if (child.nodeType === 3) {
        out += escapeText(child.nodeValue.replace(/\s+/g, ' '));
        continue;
      }

      if (child.nodeType !== 1) continue;

      var name = child.nodeName.toLowerCase();

      if (INLINE_TAGS.indexOf(' ' + name + ' ') === -1) return null;

      if (VOID_TAGS.indexOf(' ' + name + ' ') !== -1) {
        out += openTag(child);
        continue;
      }

      var inner = inlineMarkup(child);

      if (inner === null) return null;

      out += openTag(child) + inner + '</' + name + '>';
    }

    return out;
  };

  var serialize = function (node, indent, out) {
    var i;

    if (node.nodeType === 3) {
      var text = node.nodeValue.replace(/\s+/g, ' ').trim();

      if (text) out.push(indent + escapeText(text));

      return;
    }

    if (node.nodeType !== 1) return;

    // Обёртку прокрутки ставит вокруг таблиц сам доксайт — в чужой проект
    // она не поедет.
    if (node.className === 'table-scroll') {
      for (i = 0; i < node.childNodes.length; i++) serialize(node.childNodes[i], indent, out);

      return;
    }

    var name = node.nodeName.toLowerCase();

    if (VOID_TAGS.indexOf(' ' + name + ' ') !== -1) {
      out.push(indent + openTag(node));

      return;
    }

    // Элемент без дочерних элементов пишется одной строкой: разнесённый
    // на три строки <span>да</span> читается хуже, чем есть.
    if (!node.firstElementChild) {
      out.push(indent + openTag(node)
        + escapeText((node.textContent || '').replace(/\s+/g, ' ').trim())
        + '</' + name + '>');

      return;
    }

    var inline = inlineMarkup(node);

    if (inline !== null && inline.length <= INLINE_LIMIT) {
      out.push(indent + openTag(node) + inline.trim() + '</' + name + '>');

      return;
    }

    out.push(indent + openTag(node));

    for (i = 0; i < node.childNodes.length; i++) serialize(node.childNodes[i], indent + '  ', out);

    out.push(indent + '</' + name + '>');
  };

  var markupOf = function (root) {
    var out = [];

    for (var i = 0; i < root.childNodes.length; i++) {
      var child = root.childNodes[i];

      // Подпись демонстрации — часть документации, а не примера.
      if (child.nodeType === 1 && child.className === 'demo-block-title') continue;

      serialize(child, '', out);
    }

    return out.join('\n');
  };

  // --- разбор содержимого блока кода ---------------------------------------

  var langOf = function (text) {
    var t = text.trim();

    // Политика — HTTP-заголовок, а не CSS: точки с запятой и буква
    // в начале иначе увели бы её в ветку ниже.
    if (/^Content-Security-Policy:/.test(t)) return 'Заголовок';
    if (t.charAt(0) === '<') return 'HTML';
    if (/^\s*(@use|@forward|@mixin|@include|\$[\w-]+\s*:)/m.test(t)) return 'SCSS';
    if (/\b(function|var |const |let |=>|Griffincss\.)/.test(t)) return 'JS';
    if (/[{;]/.test(t) && /[.#@:[a-zA-Z*]/.test(t.charAt(0))) return 'CSS';

    return 'Код';
  };

  // Корни, которые нельзя оживлять: подключение стилей и скриптов исполнилось
  // бы прямо на странице документации, а каркас документа в неё не вставить.
  var BLOCKED_ROOT = /^<\s*(!|\?|link|meta|script|style|html|head|body|title)\b/i;

  // Разметка, которая не остаётся в границах демонстрации: fixed-элемент
  // накрывает саму страницу документации (пример затемнения на position.html
  // перекрывал оверлеем весь доксайт), а закрытые <dialog> — модальные окна
  // и выдвижные панели — без вызова показать нечего.
  var ESCAPING = /\bgr-(fixed|modal|drawer|toast-region)\b|<\s*dialog\b/i;

  // Превью заслуживает пример, в котором есть что показать: видимый текст
  // (многоточия-заполнители не в счёт), орган управления или картинка
  // с настоящим адресом. Пустая рамка вместо результата — хуже, чем один код.
  var RENDERABLE = 'input, select, textarea, button, progress, meter, svg, canvas, video, iframe, audio';

  var hasRenderable = function (text) {
    var probe = document.createElement('template');

    probe.innerHTML = text;

    var root = probe.content;

    if (!root) return true;
    if (root.textContent.replace(/[\s….]+/g, '')) return true;
    if (root.querySelector(RENDERABLE)) return true;

    var imgs = root.querySelectorAll('img');

    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || '';

      if (src && src.indexOf('…') === -1) return true;
    }

    return false;
  };

  var previewable = function (text) {
    var t = text.trim();

    if (t.charAt(0) !== '<') return false;
    if (BLOCKED_ROOT.test(t)) return false;
    if (/<\s*script|\son[a-z]+\s*=|javascript:/i.test(t)) return false;
    if (ESCAPING.test(t)) return false;

    // Оживляется то, где есть что показать библиотекой. Фрагмент чужой
    // разметки без единого класса gr- превью не даёт, а место занимает.
    if (!/\bgr-|data-gr-/.test(t)) return false;

    return hasRenderable(t);
  };

  // --- блок примера ---------------------------------------------------------

  var seq = 0;

  var makePanel = function (id) {
    var el = document.createElement('div');

    el.className = 'example-panel';
    el.id = id;
    el.setAttribute('role', 'tabpanel');

    return el;
  };

  var makeTab = function (panelId, label, selected) {
    var el = document.createElement('button');

    el.type = 'button';
    el.className = 'example-tab';
    el.id = panelId + '-tab';
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-controls', panelId);
    el.setAttribute('aria-selected', selected ? 'true' : 'false');
    el.tabIndex = selected ? 0 : -1;
    el.textContent = label;

    return el;
  };

  var build = function (codeEl, demoEl) {
    var anchor = codeEl || demoEl;
    var id = 'gr-ex-' + (++seq);
    var box = document.createElement('div');
    var bar = document.createElement('div');
    var stack = document.createElement('div');
    var previewPanel = null;
    var codePanel = null;
    var codeText = '';
    var lang = 'HTML';

    box.className = 'example';
    bar.className = 'example-bar';

    anchor.parentNode.insertBefore(box, anchor);
    box.appendChild(bar);
    box.appendChild(stack);

    if (demoEl) {
      previewPanel = makePanel(id + '-preview');
      previewPanel.appendChild(demoEl);
      stack.appendChild(previewPanel);
    }

    codePanel = makePanel(id + '-code');

    if (codeEl) {
      lang = langOf(codeEl.textContent);
      codeText = codeEl.textContent;
      codePanel.appendChild(codeEl);
    } else {
      // Демонстрация без кода рядом: код собирается из её собственного DOM.
      var pre = document.createElement('pre');
      var code = document.createElement('code');

      codeText = markupOf(demoEl);
      code.textContent = codeText;
      pre.appendChild(code);
      codePanel.appendChild(pre);
    }

    stack.appendChild(codePanel);

    // Одинокий блок разметки получает превью: пример, результат которого
    // нельзя увидеть, — половина примера.
    if (!previewPanel && lang === 'HTML' && previewable(codeText)) {
      var demo = document.createElement('div');

      previewPanel = makePanel(id + '-preview');
      demo.className = 'demo-block';
      demo.innerHTML = codeText;
      previewPanel.appendChild(demo);
      stack.insertBefore(previewPanel, stack.firstChild);

      if (window.Griffincss && window.Griffincss.refresh) window.Griffincss.refresh(demo);
      if (window.Griffincss && window.Griffincss.ui && window.Griffincss.ui.refresh) {
        window.Griffincss.ui.refresh(demo);
      }
    }

    if (previewPanel && codePanel) {
      var tabs = document.createElement('div');
      var tabPreview = makeTab(previewPanel.id, 'Превью', true);
      var tabCode = makeTab(codePanel.id, 'Код', false);

      tabs.className = 'example-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Представление примера');
      tabs.appendChild(tabPreview);
      tabs.appendChild(tabCode);
      bar.appendChild(tabs);

      previewPanel.setAttribute('aria-labelledby', tabPreview.id);
      codePanel.setAttribute('aria-labelledby', tabCode.id);
      codePanel.hidden = true;
    } else {
      var label = document.createElement('span');

      label.className = 'example-label';
      label.textContent = lang;
      bar.appendChild(label);
    }

    var copyBtn = document.createElement('button');

    copyBtn.type = 'button';
    copyBtn.className = 'example-copy';
    copyBtn.textContent = 'Копировать';
    bar.appendChild(copyBtn);
  };

  var isPre = function (el) { return !!el && el.nodeName === 'PRE'; };
  var isDemo = function (el) { return !!el && el.classList && el.classList.contains('demo-block'); };

  // Обход собирается списком заранее: build() двигает элементы по дереву,
  // и живая коллекция под ним поехала бы.
  var blocks = content.querySelectorAll('pre, .demo-block');
  var pairs = [];
  var taken = [];

  for (var b = 0; b < blocks.length; b++) {
    var el = blocks[b];

    if (taken.indexOf(el) !== -1) continue;
    if (el.parentNode && el.parentNode.className === 'example-panel') continue;

    // Пара — только «код, сразу за ним результат». Обратный порядок
    // значит другое: под демонстрацией обычно стоит не её исходник,
    // а то, во что он превратился, и сводить их в один блок нельзя.
    if (isPre(el) && isDemo(el.nextElementSibling)) {
      taken.push(el.nextElementSibling);
      pairs.push([el, el.nextElementSibling]);
    } else if (isPre(el)) {
      pairs.push([el, null]);
    } else {
      pairs.push([null, el]);
    }
  }

  for (var p = 0; p < pairs.length; p++) build(pairs[p][0], pairs[p][1]);

  // --- инлайновый код -------------------------------------------------------

  // Класс, атрибут, имя токена в тексте и в справочной таблице копируются
  // нажатием. Фокусируемыми они не делаются намеренно: на странице справочника
  // их за триста, и клавиатурный обход документации стал бы непроходимым.
  // Клавиатурный эквивалент здесь родной — выделение и Ctrl+C, а если буфер
  // недоступен, обработчик выделяет фрагмент сам.
  var inline = content.querySelectorAll('code');

  for (var c = 0; c < inline.length; c++) {
    var node = inline[c];

    if (node.closest('pre, a, .sidebar')) continue;

    node.classList.add('docs-copy');
    node.title = 'Нажмите, чтобы скопировать';
  }

  // --- один обработчик на всю страницу --------------------------------------

  var switchTab = function (tab) {
    var bar = tab.parentNode;
    var tabs = bar.querySelectorAll('.example-tab');

    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i] === tab;
      var panel = document.getElementById(tabs[i].getAttribute('aria-controls'));

      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;

      if (panel) panel.hidden = !on;
    }
  };

  content.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;

    var tab = e.target.closest('.example-tab');

    if (tab) {
      switchTab(tab);

      return;
    }

    var button = e.target.closest('.example-copy');

    if (button) {
      var box = button.closest('.example');
      var pre = box ? box.querySelector('.example-panel > pre') : null;

      if (pre) {
        copy(pre.textContent, pre, function (ok) {
          flash(button, ok, ['Копировать', 'Скопировано', 'Не удалось']);
        });
      }

      return;
    }

    var code = e.target.closest('code.docs-copy');

    if (code) {
      // Человек выделяет текст мышью, а не нажимает на него: перебивать
      // выделение копированием — отнимать у него уже сделанную работу.
      if (window.getSelection && String(window.getSelection())) return;

      copy(code.textContent, code, function (ok) { flash(code, ok, null); });
    }
  });

  content.addEventListener('keydown', function (e) {
    if (!e.target || !e.target.closest) return;

    var tab = e.target.closest('.example-tab');

    if (!tab) return;

    var tabs = tab.parentNode.querySelectorAll('.example-tab');
    var at = -1;
    var next = -1;
    var i;

    for (i = 0; i < tabs.length; i++) if (tabs[i] === tab) at = i;

    if (e.key === 'ArrowRight') next = (at + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;

    e.preventDefault();
    switchTab(tabs[next]);
    tabs[next].focus();
  });
})();

// Оглавление страницы и поиск по документации.
//
// Оба живут на одном статическом индексе, который собирает
// scripts/build-docs-index.mjs. Индекс подключается тегом <script>, а не
// загружается fetch: fetch по file:// браузер блокирует политикой источников,
// а доксайт открывают в том числе просто файлом. Тег ставит этот скрипт сам —
// 34 страницы ради него править не нужно.
//
// Без индекса оглавление строится всё равно, только с порядковыми якорями:
// это вспомогательный механизм, и падать из-за него страница не должна.
(function () {
  var layout = document.querySelector('.docs-layout');
  var content = document.querySelector('.content');
  var sidebar = document.querySelector('.sidebar');

  if (!content) return;

  var index = null;
  var pageFile = location.pathname.split('/').pop() || 'index.html';

  // --- оглавление -----------------------------------------------------------

  // Якорь заголовка приходит из индекса — там он и вычисляется, единожды.
  // Сопоставление по тексту, а не по порядку: раздел, переехавший на другое
  // место страницы, сохраняет свою ссылку.
  var anchorMap = function () {
    var map = {};

    if (!index || !index.headings || !index.pages) return map;

    var page = -1;
    var i;

    for (i = 0; i < index.pages.length; i++) {
      if (index.pages[i][0] === pageFile) page = i;
    }

    if (page < 0) return map;

    for (i = 0; i < index.headings.length; i++) {
      if (index.headings[i][0] === page) map[index.headings[i][2]] = index.headings[i][3];
    }

    return map;
  };

  var spy = function (headings, links, toc) {
    var pending = false;

    var sync = function () {
      pending = false;

      // На узком экране оглавления нет — считать нечего.
      if (!toc.offsetParent) return;

      var active = 0;

      for (var i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= 120) active = i;
        else break;
      }

      for (var k = 0; k < links.length; k++) {
        links[k].classList.toggle('active', k === active);
      }
    };

    var onScroll = function () {
      if (pending) return;

      pending = true;
      window.requestAnimationFrame(sync);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    sync();
  };

  var buildToc = function () {
    var all = content.querySelectorAll('h2, h3');
    var headings = [];
    var h;

    // Заголовки внутри примеров — часть примера, а не разделы страницы.
    // Карточка тарифа со своим <h3> не должна появляться в оглавлении,
    // а якорь `#`, приписанный к ней, уехал бы в скопированный код.
    // <dialog> — тоже пример: заголовок закрытого окна невидим, и ссылка
    // оглавления на него никуда не приводила бы.
    for (h = 0; h < all.length; h++) {
      if (all[h].closest('.example, .demo-block, .callout, dialog')) continue;

      headings.push(all[h]);
    }

    // Двух заголовков оглавление не заслуживает: оно повторило бы страницу,
    // которая и так видна целиком.
    if (!layout || headings.length < 3) return;

    var map = anchorMap();
    var toc = document.createElement('aside');
    var nav = document.createElement('nav');
    var title = document.createElement('div');
    var links = [];
    var i;

    toc.className = 'toc';
    toc.setAttribute('aria-label', 'Содержание страницы');
    title.className = 'toc-title';
    title.textContent = 'На странице';
    toc.appendChild(title);
    toc.appendChild(nav);

    for (i = 0; i < headings.length; i++) {
      var heading = headings[i];
      var text = heading.textContent.trim();

      if (!heading.id) heading.id = map[text] || ('sec-' + (i + 1));

      var mark = document.createElement('a');

      mark.className = 'heading-anchor';
      mark.href = '#' + heading.id;
      mark.textContent = '#';
      mark.setAttribute('aria-label', 'Ссылка на раздел «' + text + '»');
      heading.appendChild(mark);

      var link = document.createElement('a');

      link.className = 'toc-link';
      link.href = '#' + heading.id;
      link.textContent = text;
      link.setAttribute('data-level', heading.nodeName === 'H3' ? '3' : '2');
      nav.appendChild(link);
      links.push(link);
    }

    layout.appendChild(toc);
    spy(headings, links, toc);
  };

  // --- поиск ----------------------------------------------------------------

  var LIMIT = 12;

  var entriesOf = function () {
    var out = [];
    var pages = index.pages;
    var i;

    var titleOf = function (n) { return pages[n] ? pages[n][1] : ''; };
    var fileOf = function (n) { return pages[n] ? pages[n][0] : ''; };

    for (i = 0; i < pages.length; i++) {
      out.push({ name: pages[i][1], where: 'страница', href: pages[i][0], weight: 6 });
    }

    for (i = 0; index.headings && i < index.headings.length; i++) {
      var h = index.headings[i];

      out.push({
        name: h[2],
        where: titleOf(h[0]),
        href: fileOf(h[0]) + '#' + h[3],
        weight: h[1] === 2 ? 4 : 2
      });
    }

    // Имена приходят склеенными в строку на страницу: у утилит их под три
    // тысячи, и построчный вид раздул бы индекс вдвое.
    var spread = function (rows, prefix, weight) {
      for (var r = 0; rows && r < rows.length; r++) {
        var page = rows[r][0];
        var names = rows[r][1].split(' ');

        for (var n = 0; n < names.length; n++) {
          out.push({ name: prefix + names[n], where: titleOf(page), href: fileOf(page), weight: weight });
        }
      }
    };

    spread(index.classes, '.', 5);
    spread(index.tokens, '', 3);
    // Атрибуты слоя GriffinJS — data-gr-<виджет> — ищутся как классы.
    spread(index.attrs, '', 4);

    return out;
  };

  // Совпадение целиком важнее совпадения с начала, а оно — важнее совпадения
  // в середине. Длина имени добавлена последним слагаемым, чтобы из десятка
  // одинаково подходящих .gr-m-1 … .gr-m-16 первым шло короткое.
  var score = function (name, query) {
    var lower = name.toLowerCase();
    var at = lower.indexOf(query);

    if (at === -1) return 0;
    if (lower === query) return 1000;
    if (at === 0) return 400 - Math.min(name.length, 40);

    return 200 - Math.min(at, 40) - Math.min(name.length, 40) / 4;
  };

  var buildSearch = function () {
    if (!sidebar || !index || !index.pages) return;

    var entries = entriesOf();
    var box = document.createElement('div');
    var input = document.createElement('input');
    var list = document.createElement('ul');
    var found = [];
    var active = -1;

    box.className = 'search';
    input.type = 'search';
    input.className = 'search-input';
    input.id = 'gr-search';
    input.placeholder = 'Поиск — класс, токен, раздел';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'gr-search-results');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-label', 'Поиск по документации');

    list.className = 'search-results';
    list.id = 'gr-search-results';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Найденное');
    list.hidden = true;

    box.appendChild(input);
    box.appendChild(list);

    var logo = sidebar.querySelector('.sidebar-logo');

    if (logo && logo.nextSibling) sidebar.insertBefore(box, logo.nextSibling);
    else sidebar.insertBefore(box, sidebar.firstChild);

    // Подсветка совпадения собирается узлами, а не строкой разметки:
    // в индексе лежат имена классов с точками и скобками, и склеивать
    // из них HTML — заводить себе дыру там, где она не нужна.
    var highlight = function (name, query) {
      var span = document.createElement('span');
      var at = name.toLowerCase().indexOf(query);

      span.className = 'search-name';

      if (at === -1 || !query) {
        span.textContent = name;

        return span;
      }

      var mark = document.createElement('mark');

      mark.textContent = name.slice(at, at + query.length);
      span.appendChild(document.createTextNode(name.slice(0, at)));
      span.appendChild(mark);
      span.appendChild(document.createTextNode(name.slice(at + query.length)));

      return span;
    };

    var setActive = function (n) {
      var items = list.querySelectorAll('.search-item');

      active = n;

      for (var i = 0; i < items.length; i++) {
        var on = i === n;

        items[i].setAttribute('aria-selected', on ? 'true' : 'false');

        if (on) {
          input.setAttribute('aria-activedescendant', items[i].id);
          if (items[i].scrollIntoView) items[i].scrollIntoView({ block: 'nearest' });
        }
      }

      if (n < 0) input.removeAttribute('aria-activedescendant');
    };

    var close = function () {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      setActive(-1);
    };

    var render = function (query) {
      var i;

      list.textContent = '';
      found = [];

      if (query.length < 2) {
        close();

        return;
      }

      var ranked = [];

      for (i = 0; i < entries.length; i++) {
        var value = score(entries[i].name, query);

        if (value > 0) ranked.push({ entry: entries[i], value: value + entries[i].weight });
      }

      ranked.sort(function (a, b) { return b.value - a.value; });

      for (i = 0; i < ranked.length && found.length < LIMIT; i++) found.push(ranked[i].entry);

      if (found.length === 0) {
        var empty = document.createElement('li');

        empty.className = 'search-empty';
        empty.textContent = 'Ничего не найдено';
        list.appendChild(empty);
      }

      for (i = 0; i < found.length; i++) {
        var item = document.createElement('li');
        var where = document.createElement('span');

        item.className = 'search-item';
        item.id = 'gr-search-i' + i;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        where.className = 'search-where';
        where.textContent = found[i].where;
        item.appendChild(highlight(found[i].name, query));
        item.appendChild(where);
        list.appendChild(item);
      }

      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      setActive(found.length ? 0 : -1);
    };

    var go = function (n) {
      if (!found[n]) return;

      location.href = found[n].href;
      close();
    };

    input.addEventListener('input', function () {
      render(input.value.trim().toLowerCase());
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (list.hidden) input.value = '';
        close();

        return;
      }

      if (e.key === 'Enter') {
        if (active >= 0) {
          e.preventDefault();
          go(active);
        }

        return;
      }

      if (list.hidden || !found.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((active + 1) % found.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((active - 1 + found.length) % found.length);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActive(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActive(found.length - 1);
      }
    });

    list.addEventListener('mousedown', function (e) {
      var item = e.target.closest ? e.target.closest('.search-item') : null;

      if (!item) return;

      // mousedown, а не click: click приходит после blur, и список
      // к этому моменту уже закрыт.
      e.preventDefault();

      var items = list.querySelectorAll('.search-item');

      for (var i = 0; i < items.length; i++) if (items[i] === item) go(i);
    });

    input.addEventListener('blur', function () {
      window.setTimeout(close, 120);
    });

    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 2) render(input.value.trim().toLowerCase());
    });

    // Быстрый доступ: «/» и Ctrl+K. Обе привычки живут в документации
    // и в редакторах, и обе стоят одной строки.
    document.addEventListener('keydown', function (e) {
      var tag = document.activeElement ? document.activeElement.nodeName : '';

      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  };

  var start = function () {
    index = window.GR_DOCS_INDEX || null;
    buildToc();
    buildSearch();
  };

  var script = document.createElement('script');

  script.src = 'search-index.js';
  script.onload = start;
  script.onerror = start;
  document.head.appendChild(script);
})();
