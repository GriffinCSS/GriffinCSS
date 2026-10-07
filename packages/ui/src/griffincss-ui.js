/*!
 * Griffincss UI — Runtime v0.29.2
 * Опциональный рантайм пакета компонентов. Делает ровно то, чего платформа
 * не даёт вовсе; всё, что умеют <details>, <dialog> и Popover API, остаётся
 * за ними. Без этого файла компоненты работают — просто без перечисленного.
 *
 * Здесь пять вещей:
 *
 *   1. Закрытие модального окна и выдвижной панели щелчком по подложке.
 *      <dialog> закрывается по Esc сам, но щелчок мимо окна ему безразличен,
 *      а ждут его почти всегда. Включается атрибутом на самом окне:
 *
 *        <dialog class="gr-modal" data-gr-overlay-close>…</dialog>
 *
 *      Так поведение остаётся решением автора страницы: у окна с формой,
 *      где случайный щелчок мимо потерял бы введённое, атрибута просто нет.
 *
 *   2. Закрытие сообщения крестиком — [data-gr-dismiss] на кнопке внутри
 *      .gr-alert, .gr-toast или .gr-tag. Убирает узел из документа, а не
 *      прячет: закрытое сообщение не должно оставаться в порядке обхода.
 *
 *   3. Тосты — Griffincss.ui.toast(text, options): вставка в живую область
 *      и авто-скрытие. Единственный компонент библиотеки, у которого нет
 *      статического применения.
 *
 *   4. Клавиатура вкладок — стрелки, Home/End, roving tabindex и aria-*
 *      для разметки с [data-gr-tabs]. Без скрипта та же разметка остаётся
 *      списком ссылок-якорей и секциями подряд.
 *
 *   5. Таблица в .gr-prose. Она прокручивается сама и потому — блок:
 *      Firefox считает такую таблицу без заголовков таблицей раскладки,
 *      и рантайм ставит ей role="table". Широкую он ставит в порядок Tab:
 *      Chromium с Firefox делают это сами, Safari — нет, а tabindex в тексте
 *      из редактора поставить некому; стала помещаться — снимает. Таблицы
 *      в поверхности редактора (contenteditable) не трогает. Разметке,
 *      вставленной позже, роль ставит повторный start(), фрагменту
 *      GriffinJS — событие griffin:load.
 *
 * Всё, что умеют <details>, <dialog> и Popover API, остаётся за ними.
 */
(function (factory) {
  'use strict';

  var api = factory();

  // Node (тесты) — модуль; браузер — глобальный объект и автостарт.
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Слияние, а не присваивание: рантайм раскладок, тема и компоненты
    // делят один глобал, и порядок тегов <script> не должен ничего значить.
    if (!window.Griffincss) window.Griffincss = {};

    window.Griffincss.ui = api;
    api._autoStart();
  }
})(function () {
  'use strict';

  var VERSION = '0.29.2';

  var OVERLAY_ATTR = 'data-gr-overlay-close';

  // Крестик закрытия и то, что он закрывает. Список закрыт намеренно:
  // «убрать ближайшего предка» без ограничения снесло бы полстраницы,
  // если крестик поставили не туда.
  var DISMISS_ATTR = 'data-gr-dismiss';
  var DISMISSIBLE = '.gr-toast,.gr-alert,.gr-tag';

  // Тосты.
  var TOAST_POSITIONS = ['top-start', 'top-end', 'bottom-start', 'bottom-end'];
  var TOAST_STATUSES = ['info', 'success', 'warning', 'danger'];
  var TOAST_TIMEOUT = 5000;

  // Запас на переход ухода: --gr-transition — 0.2s, и узел убирается,
  // когда движение заведомо кончилось. Ждать transitionend нельзя —
  // при prefers-reduced-motion и на скрытой вкладке событие может
  // не прийти вовсе, и тост остался бы в документе навсегда.
  var TOAST_LEAVE = 300;

  var TABS_ATTR = 'data-gr-tabs';

  // Таблица прозы со своей прокруткой (_table.scss) и то, на чём внутри
  // неё может остановиться Tab: он и так докручивает таблицу до своей
  // остановки. Кандидаты отсеивает stopsTab(): tabindex="-1", отключённое
  // и скрытое разметкой — не остановки. Ссылки и кнопки Safari обычным Tab
  // пропускает, до них доходит Option+Tab.
  var PROSE_TABLES = '.gr-prose table:not(.gr-table)';
  var FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,iframe,' +
    '[tabindex],[contenteditable]:not([contenteditable=false])';

  // Скрыто разметкой: hidden (и until-found), inert, закрытый details вне
  // своего summary. Проверка по дереву — раскладку не трогает.
  var UNSHOWN = '[hidden],[inert],details:not([open])>:not(summary)';

  // Причина закрытия попадает в dialog.returnValue: обработчик close
  // на странице отличит щелчок мимо от кнопки «Сохранить».
  var OVERLAY_REASON = 'overlay';

  var started = false;

  // Таблицы, которым рантайм поставил tabindex и роль: снимается только
  // своё. Слабые наборы — таблицу, убранную из документа на время
  // перерисовки, рантайм не держит и, вернувшуюся, не забывает.
  var tabTables = new WeakSet();
  var roleTables = new WeakSet();

  // Цель нажатия. Щелчок — это пара «нажал» и «отпустил», и закрывать окно
  // нужно, только если обе половины пришлись на подложку: выделение текста,
  // начатое в окне и законченное за его краем, щелчком по подложке не является.
  var pressed = null;

  // Щелчок по подложке приходит на сам <dialog>: подложка — его псевдоэлемент,
  // собственной цели у неё нет. Отличить её от полей окна можно только
  // по координатам.
  function outsideBox(dialog, event) {
    if (typeof dialog.getBoundingClientRect !== 'function') return false;

    var rect = dialog.getBoundingClientRect();

    // Нулевой прямоугольник — окно не отрисовано (скрытая вкладка,
    // печать, тест без раскладки). Закрывать по такому нельзя.
    if (!rect || (!rect.width && !rect.height)) return false;

    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return false;

    // Щелчок с клавиатуры (Enter на кнопке) приходит с координатами 0,0
    // и не является щелчком по подложке.
    if (event.clientX === 0 && event.clientY === 0) return false;

    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }

  function onPointerDown(event) {
    pressed = event.target;
  }

  // Щелчок по подложке: обе половины щелчка пришлись на сам <dialog>
  // и легли вне его прямоугольника. closest здесь недостаточен — щелчок
  // по содержимому окна тоже нашёл бы диалог, поэтому цель события
  // сверяется с найденным узлом напрямую. Что это <dialog>, гарантирует
  // селектор регистрации; проверить остаётся только наличие close().
  function onOverlayClick(event, dialog) {
    if (event.target !== dialog) return false;
    if (typeof dialog.close !== 'function') return false;
    if (pressed !== null && pressed !== dialog) return false;
    if (!outsideBox(dialog, event)) return false;

    dialog.close(OVERLAY_REASON);

    return true;
  }

  // --- Реестр делегирования ---------------------------------------------------

  // Компонент объявляет {событие, селектор, обработчик}; диспетчер один
  // на тип события. Обработчик получает (event, node) — node найден
  // closest по селектору — и возвращает true, когда событие обработано
  // и очередь дальше не идёт. Порядок регистрации значим: крестик внутри
  // окна не должен считаться щелчком по подложке, а вкладка-ссылка
  // не должна уводить страницу к якорю.
  var registry = {};   // тип события → [{selector, handler}]

  function register(type, selector, handler) {
    if (!registry[type]) registry[type] = [];

    registry[type].push({ selector: selector, handler: handler });
  }

  function dispatch(event) {
    var entries = registry[event.type] || [];

    for (var i = 0; i < entries.length; i++) {
      var node = closest(event.target, entries[i].selector);

      if (node && entries[i].handler(event, node) === true) return;
    }
  }

  // --- Общее ------------------------------------------------------------------

  // Ближайший предок, включая сам узел. Element.closest есть везде, где есть
  // <dialog>, но в мок-DOM тестов его может не быть — отсюда запасной обход.
  function closest(node, selector) {
    if (!node) return null;

    if (typeof node.closest === 'function') return node.closest(selector);

    var current = node;

    while (current) {
      if (typeof current.matches === 'function' && current.matches(selector)) return current;
      current = current.parentNode;
    }

    return null;
  }

  function contains(root, node) {
    var current = node;

    while (current) {
      if (current === root) return true;
      current = current.parentNode;
    }

    return false;
  }

  function warn(message) {
    if (typeof console !== 'undefined' && console.warn) console.warn('Griffincss UI: ' + message);
  }

  function element(tag, className) {
    var node = document.createElement(tag);

    if (className) {
      className.split(' ').forEach(function (name) { node.classList.add(name); });
    }

    return node;
  }

  // Значение из закрытого списка или дефолт: чужое значение не должно
  // уехать в имя класса.
  function oneOf(list, value, fallback) {
    return list.indexOf(value) === -1 ? fallback : value;
  }

  // Событие компонента — по образцу griffincss:themechange у рантайма
  // темы. Диспетчеризуется на самом узле со всплытием; если окружение
  // не даёт dispatchEvent на узле, уходит с документа.
  function emitEvent(name, node, detail) {
    try {
      var target = node && typeof node.dispatchEvent === 'function' ? node : document;

      target.dispatchEvent(new CustomEvent(name, { detail: detail, bubbles: true }));
    } catch (e) { /* окружение без CustomEvent */ }
  }

  // --- Закрытие крестиком -----------------------------------------------------

  // Цель задаётся значением атрибута, если она не предок кнопки:
  //
  //   <button data-gr-dismiss="#banner">×</button>
  //
  // Пустое значение — обычный случай: убрать ближайшее сообщение,
  // внутри которого стоит сам крестик. Сигнатура — как у обработчика
  // реестра: регистрируется напрямую, и щелчок по крестику обработан
  // всегда, даже когда закрывать оказалось нечего.
  function dismissFrom(event, trigger) {
    var selector = trigger.getAttribute(DISMISS_ATTR);
    var target = null;

    // Цель из атрибута — только сообщение, как обещают доки: значение
    // пишут и данные, и data-gr-dismiss="main" иначе убрал бы <main>.
    if (!selector) target = closest(trigger, DISMISSIBLE);
    else {
      try { target = document.querySelector(selector); } catch (e) { /* не селектор */ }
      if (target && closest(target, DISMISSIBLE) !== target) target = null;
    }

    if (!target) {
      warn('close button has nothing to close: no .gr-alert, .gr-toast or .gr-tag as data-gr-dismiss target or around it');
      return true;
    }

    dismiss(target);

    return true;
  }

  // Тост уходит движением — у него для этого есть класс и переход;
  // остальное убирается сразу. Прятать вместо удаления нельзя: скрытое
  // классом сообщение осталось бы в порядке обхода и в озвучке.
  function dismiss(node) {
    if (!node) return false;

    if (node.classList && node.classList.contains('gr-toast')) {
      leave(node);
      return true;
    }

    if (typeof node.remove === 'function') node.remove();

    return true;
  }

  // --- Тосты ------------------------------------------------------------------

  // Живая область под тосты. Ищется среди уже стоящих на странице: регион,
  // объявленный в разметке, — предпочтительный случай, потому что программа
  // чтения с экрана замечает вставку только в область, существовавшую
  // до неё. Созданный на лету регион работает в современных движках,
  // но остаётся запасным путём.
  function ensureRegion(position, urgent) {
    var live = urgent ? 'assertive' : 'polite';
    var wanted = 'gr-toast-region-' + position;
    var existing = document.querySelectorAll('.gr-toast-region');

    for (var i = 0; i < existing.length; i++) {
      var region = existing[i];

      if (region.classList.contains(wanted) && region.getAttribute('aria-live') === live) {
        return region;
      }
    }

    var created = element('div', 'gr-toast-region ' + wanted);

    created.setAttribute('aria-live', live);
    created.setAttribute('role', urgent ? 'alert' : 'status');
    document.body.appendChild(created);

    return created;
  }

  function buildToast(text, options, status) {
    var node = element('div', status ? 'gr-toast gr-toast-' + status : 'gr-toast');

    if (options.icon) {
      var icon = element('span', 'gr-toast-icon');

      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = options.icon;
      node.appendChild(icon);
    }

    var body = element('div', 'gr-toast-body');

    if (options.title) {
      var title = element('strong', 'gr-toast-title');

      title.textContent = options.title;
      body.appendChild(title);
    }

    var line = element('span');

    line.textContent = text === undefined || text === null ? '' : String(text);
    body.appendChild(line);
    node.appendChild(body);

    if (options.dismissible !== false) {
      var close = element('button', 'gr-btn gr-btn-icon gr-btn-ghost gr-btn-sm');

      close.setAttribute('type', 'button');
      close.setAttribute(DISMISS_ATTR, '');
      close.setAttribute('aria-label', options.closeLabel || 'Закрыть');
      close.textContent = '×';
      node.appendChild(close);
    }

    return node;
  }

  // Griffincss.ui.toast('Черновик сохранён', { status: 'success', title: 'Готово' })
  //
  // timeout: 0 — тост без таймера, только с крестиком. Так показывают то,
  // что нельзя пропустить: ошибку отправки формы или предложение отменить
  // необратимое действие.
  function toast(text, options) {
    options = options || {};

    var status = oneOf(TOAST_STATUSES, options.status, '');
    var position = oneOf(TOAST_POSITIONS, options.position, 'bottom-end');

    // Срочность по умолчанию выводится из статуса: ошибка перебивает
    // текущее чтение, остальное ждёт своей очереди.
    var urgent = options.assertive === undefined ? status === 'danger' : !!options.assertive;

    if (status && !options.title) {
      warn('toast with status "' + status + '" has no title: the status is shown by colour alone, '
        + 'which is lost in greyscale print and to colour-blind readers');
    }

    var node = buildToast(text, options, status);

    ensureRegion(position, urgent).appendChild(node);

    var timeout = options.timeout === undefined ? TOAST_TIMEOUT : Number(options.timeout);

    if (timeout > 0) startTimer(node, timeout);

    emitEvent('griffincss:toast', node, { node: node, status: status || null, position: position });

    return node;
  }

  // Таймер живёт на самом узле: тостов на экране бывает несколько,
  // и общего состояния у них нет.
  function startTimer(node, rest) {
    node.grToastRest = rest;
    node.grToastFrom = now();
    node.grToastTimer = setTimeout(function () { leave(node); }, rest);
  }

  function stopTimer(node) {
    if (node.grToastTimer) {
      clearTimeout(node.grToastTimer);
      node.grToastTimer = null;
    }
  }

  function now() {
    return typeof Date !== 'undefined' && Date.now ? Date.now() : 0;
  }

  // Пауза под указателем и под фокусом. Сообщение, исчезающее ровно тогда,
  // когда его начали читать или потянулись к ссылке внутри, — не удобство,
  // а ловушка. Остаток дочитывается, а не начинается заново: иначе тост
  // висел бы на экране, пока по нему возят мышью.
  function pauseToast(node) {
    if (!node || node.grToastLeaving || !node.grToastTimer) return;

    stopTimer(node);
    node.grToastRest = Math.max(0, node.grToastRest - (now() - node.grToastFrom));
  }

  function resumeToast(node) {
    if (!node || node.grToastLeaving || node.grToastTimer) return;
    if (!node.grToastRest) return;

    startTimer(node, node.grToastRest);
  }

  function leave(node) {
    if (node.grToastLeaving) return;

    node.grToastLeaving = true;
    stopTimer(node);

    if (node.classList) node.classList.add('gr-toast-leaving');

    setTimeout(function () {
      if (typeof node.remove === 'function') node.remove();
    }, TOAST_LEAVE);
  }

  // pointerover / pointerout и focusin / focusout, а не enter / leave и
  // focus / blur: эти всплывают, и хватает одного слушателя на документ.
  // Пара обработчиков одна на указатель и фокус — реестр вешает её на оба
  // типа события. Переход между частями одного тоста — не уход:
  // relatedTarget внутри того же узла.
  function onToastEnter(event, node) {
    pauseToast(node);
  }

  function onToastLeave(event, node) {
    if (!contains(node, event.relatedTarget)) resumeToast(node);
  }

  // --- Вкладки ----------------------------------------------------------------

  var tabsSeq = 0;

  // Разметка до скрипта — список ссылок-якорей и секции подряд: страница
  // читается и печатается целиком. Скрипт добавляет роли, прячет неактивные
  // панели атрибутом hidden и заводит roving tabindex, при котором Tab
  // выводит из ряда вкладок, а не идёт по всем его пунктам.
  function initTabs(root) {
    var scope = root || document;
    var groups = scope.querySelectorAll('[' + TABS_ATTR + ']');

    for (var i = 0; i < groups.length; i++) initGroup(groups[i]);

    return publicApi;
  }

  function initGroup(group) {
    var tabs = group.querySelectorAll('.gr-tab');

    if (!tabs.length) return;

    var lists = group.querySelectorAll('.gr-tablist');

    if (lists.length) lists[0].setAttribute('role', 'tablist');

    var selected = 0;

    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var panel = panelOf(tab);

      tab.setAttribute('role', 'tab');

      if (!tab.getAttribute('id')) tab.setAttribute('id', 'gr-tab-' + (++tabsSeq));

      if (panel) {
        tab.setAttribute('aria-controls', panel.getAttribute('id'));
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.getAttribute('id'));

        // Панель получает фокус после стрелок: иначе клавиатура из ряда
        // вкладок уходила бы в конец страницы, мимо только что открытого
        // содержимого.
        panel.setAttribute('tabindex', '0');
      }

      // Активная вкладка ищется тем же признаком, которым её отметили
      // в разметке без скрипта.
      if (tab.hasAttribute('aria-current') || tab.getAttribute('aria-selected') === 'true') {
        selected = i;
      }
    }

    // Тихий выбор: расстановка ролей при инициализации — не действие
    // пользователя, события о ней не шлются.
    select(tabs, selected, false, true);
  }

  // Панель — по href="#id" у ссылки или по aria-controls у кнопки.
  function panelOf(tab) {
    var href = tab.getAttribute('href');
    var id = tab.getAttribute('aria-controls');

    if (!id && href && href.charAt(0) === '#') id = href.slice(1);
    if (!id) return null;

    return document.getElementById(id);
  }

  function select(tabs, index, focus, silent) {
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var on = i === index;
      var panel = panelOf(tab);

      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.setAttribute('tabindex', on ? '0' : '-1');

      // aria-current — признак варианта без скрипта. Оставь его скрипт
      // на месте, программа чтения с экрана объявила бы вкладку и текущей
      // страницей, и выбранной вкладкой сразу.
      tab.removeAttribute('aria-current');

      if (panel) {
        if (on) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      }
    }

    if (focus && typeof tabs[index].focus === 'function') tabs[index].focus();

    if (!silent) {
      emitEvent('griffincss:tabchange', tabs[index], {
        index: index,
        tab: tabs[index],
        panel: panelOf(tabs[index])
      });
    }
  }

  function disabled(tab) {
    return tab.getAttribute('aria-disabled') === 'true' || tab.hasAttribute('disabled');
  }

  // Следующая доступная вкладка в заданном направлении, по кругу:
  // ряд замкнут, как того требует WAI-ARIA для вкладок.
  function step(tabs, from, delta) {
    var index = from;

    for (var i = 0; i < tabs.length; i++) {
      index = (index + delta + tabs.length) % tabs.length;

      if (!disabled(tabs[index])) return index;
    }

    return from;
  }

  function edge(tabs, delta) {
    var index = delta > 0 ? -1 : tabs.length;

    return step(tabs, index, delta);
  }

  function onTabKeyDown(event, tab) {
    var group = closest(tab, '[' + TABS_ATTR + ']');

    if (!group) return false;

    // Список читается заново: вкладки добавляют и убирают вместе
    // с разметкой, и запомненный при инициализации массив устарел бы молча.
    var tabs = group.querySelectorAll('.gr-tab');
    var current = indexOfNode(tabs, tab);

    if (current === -1) return false;

    var next = current;
    var key = event.key;

    // Обе оси: ряд вкладок бывает и горизонтальным, и — в чужой раскладке —
    // поставленным в колонку.
    if (key === 'ArrowRight' || key === 'ArrowDown') next = step(tabs, current, 1);
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = step(tabs, current, -1);
    else if (key === 'Home') next = edge(tabs, 1);
    else if (key === 'End') next = edge(tabs, -1);
    else return false;

    if (typeof event.preventDefault === 'function') event.preventDefault();

    select(tabs, next, true);

    return true;
  }

  // Щелчок по вкладке-ссылке переключает панель, а не уводит страницу
  // к якорю: прыжок сдвинул бы ряд вкладок за верхний край экрана.
  function onTabClick(event, tab) {
    var group = closest(tab, '[' + TABS_ATTR + ']');

    if (!group) return false;
    if (disabled(tab)) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return true;
    }

    var tabs = group.querySelectorAll('.gr-tab');
    var index = indexOfNode(tabs, tab);

    if (index === -1) return false;

    if (typeof event.preventDefault === 'function') event.preventDefault();
    select(tabs, index, false);

    return true;
  }

  // NodeList не имеет indexOf, но массивный метод работает по нему.
  function indexOfNode(list, node) {
    return Array.prototype.indexOf.call(list, node);
  }

  // --- Таблица прозы: роль и порядок Tab ---------------------------------------

  // Firefox решает, таблица это данных или раскладки, по числу столбцов
  // у её рамки, а у таблицы со своей прокруткой рамка — блок без столбцов:
  // без признаков данных она для читалки — раскладка, без «таблица, N строк»
  // и перехода по ячейкам. Явная роль возвращает данные. В Chromium
  // и WebKit своя прокрутка роли не отнимает, и роль там лишь подтверждает
  // таблицу — а WebKit и сам гадает о раскладке: таблицу, где второй
  // столбец даёт один rowspan, роль делает таблицей и для него. Как
  // в Firefox у таблицы без своей прокрутки:
  // от двух строк и двух столбцов по карте таблицы (colspan и rowspan),
  // без своих признаков данных (th, thead, tfoot, col; у вложенной таблицы —
  // её признаки). Пустой role — не роль. Таблица, ставшая редактируемой,
  // теряет свои роль и tabindex: иначе они уйдут в HTML, который сохранит
  // редактор.
  function markRole(table) {
    if (table.isContentEditable) {
      unmark(table, tabTables, 'tabindex', '0');
      return unmark(table, roleTables, 'role', 'table');
    }
    if (table.getAttribute('role') || table.tHead || table.tFoot || table.querySelector(':scope>col,:scope>colgroup')) return;

    var rows = table.rows;
    var spans = []; // ячейки с rowspan сверху: [colSpan, строк осталось]
    var columns = false;

    for (var i = 0; i < rows.length; i++) {
      var cols = 0;

      for (var k = spans.length; k--;) {
        cols += spans[k][0];
        if (!--spans[k][1]) spans.splice(k, 1);
      }

      for (var j = 0, cell; (cell = rows[i].cells[j]); j++) {
        if (cell.tagName === 'TH') return;
        cols += cell.colSpan;
        if (cell.rowSpan > 1) spans.push([cell.colSpan, cell.rowSpan - 1]);
      }

      if (cols > 1) columns = true;
    }

    if (columns && rows.length > 1) {
      table.setAttribute('role', 'table');
      roleTables.add(table);
    }
  }

  function markRoles() {
    eachTable(PROSE_TABLES, markRole);
  }

  // Перед каждым Tab, в перехвате: порядок обхода браузер считает после
  // обработчиков, и отметка, поставленная здесь, уже в нём. Так не нужны
  // ни наблюдатели, ни замеры вне нажатия. Мерить все таблицы нельзя:
  // в Chromium каждое чтение раскладки стоит пропорционально числу анимаций
  // по прокрутке, и замер всех на каждый Tab — квадрат их числа. Поэтому —
  // от фокуса по ходу Tab до первой широкой: дальше неё Tab не уйдёт.
  // Фокус на body — откуда пойдёт Tab, неизвестно (щелчок в текст), и
  // меряются все.
  function onTabPress(event) {
    if (event.key !== 'Tab') return;

    var tables = document.querySelectorAll(PROSE_TABLES);
    var from = document.activeElement;
    var all = !from || from === document.body;
    var step = all || !event.shiftKey ? 1 : -1;
    var i = all ? 0 : firstAfter(tables, from) - (step < 0 ? 1 : 0);

    // Shift+Tab с самой таблицы: она уже позади, замер — с предыдущей.
    // Иначе отмеченная под фокусом останавливала его сразу, а предыдущая
    // широкая оставалась без отметки — Safari её пропускал.
    if (tables[i] === from) i += step;

    // Встать можно только на таблице, до которой Tab дойдёт: невидимую
    // широкую (закрытый details, inert) он пропустит — за ней идём дальше.
    for (; i >= 0 && i < tables.length; i += step) {
      markRole(tables[i]);
      if (syncTabStop(tables[i]) && !all && shown(tables[i])) return;
    }
  }

  // Tab до таблицы может дойти: она не скрыта разметкой и видна —
  // checkVisibility (второе имя опции — у Chrome 105–120), а в Safari
  // до 17.4, где его нет, — вычисленное visibility.
  function shown(node) {
    return !node.closest(UNSHOWN) && (node.checkVisibility
      ? node.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
      : getComputedStyle(node).visibility !== 'hidden');
  }

  // Остановка Tab внутри таблицы — только по дереву: в Chromium и чтение
  // раскладки, и checkVisibility стоят по числу анимаций по прокрутке
  // на странице, а таблиц со ссылками в тексте бывают сотни. Цена —
  // ссылка, скрытая только стилями (visibility, display классом),
  // считается остановкой. Хост правки tabIndex не даёт, но остановка.
  function stopsTab(table) {
    var found = table.querySelectorAll(FOCUSABLE);

    for (var i = 0; i < found.length; i++) {
      var node = found[i];

      if ((node.tabIndex >= 0 || node.isContentEditable && !node.hasAttribute('tabindex')) &&
        !node.matches(':disabled') && !node.closest(UNSHOWN)) return true;
    }

    return false;
  }

  // Первая таблица после узла в порядке документа — двоичным поиском:
  // сравнение позиций раскладку не трогает. Таблица внутри узла — после
  // него (4 — DOCUMENT_POSITION_FOLLOWING), таблица вокруг узла — до.
  function firstAfter(tables, node) {
    var lo = 0;
    var hi = tables.length;

    while (lo < hi) {
      var mid = (lo + hi) >> 1;

      if (node.compareDocumentPosition(tables[mid]) & 4) hi = mid;
      else lo = mid + 1;
    }

    return lo;
  }

  // tabindex="0" — широкой таблице, где Tab больше не на чем остановиться;
  // стала помещаться — снять. Своё — в наборе и сейчас "0": значение
  // страницы (окно-ловушка фокуса ставит -1 на время, потом возвращает
  // сохранённое) рантайм не снимает и не возвращает, а вернувшийся "0" —
  // снова его. Атрибут сняли совсем (морфинг разметки) — это не значение
  // страницы: отметка ставится заново. Остановки внутри — раньше ширины:
  // по дереву они дешевле, а таблицу, где Tab и так остановится, мерить
  // незачем. true — таблица теперь остановка Tab.
  function syncTabStop(table) {
    var mine = tabTables.has(table);
    var value = table.getAttribute('tabindex');

    if (mine && value === null) {
      tabTables.delete(table);
      mine = false;
    }

    if (mine ? value !== '0' : value !== null) return false;

    var wide = !table.isContentEditable && !stopsTab(table) && table.scrollWidth > table.clientWidth;

    if (wide && !mine) {
      table.setAttribute('tabindex', '0');
      tabTables.add(table);
    } else if (!wide) {
      unmark(table, tabTables, 'tabindex', '0');
    }

    return wide;
  }

  // Снять своё — атрибут, который поставил рантайм и с тех пор не сменили.
  function unmark(table, set, name, value) {
    if (set.has(table) && table.getAttribute(name) === value) table.removeAttribute(name);
    set.delete(table);
  }

  function eachTable(selector, fn) {
    var tables = document.querySelectorAll(selector);

    for (var i = 0; i < tables.length; i++) fn(tables[i]);
  }

  // Один делегированный обработчик на документ, а не по слушателю на окно:
  // окна появляются и исчезают вместе с разметкой, и переподписываться
  // на каждое пришлось бы вручную. Повторный вызов подписки не удваивает,
  // а проходит таблицы прозы ещё раз: разметке, вставленной после старта
  // (смена варианта товара, догруженный текст), роль нужна сразу — читалка
  // идёт по тексту без Tab и прохода перед Tab может не дождаться.
  function start() {
    if (!started) {
      started = true;
      listen('addEventListener');
    }

    markRoles();

    return publicApi;
  }

  function destroy() {
    if (!started) return publicApi;

    started = false;
    pressed = null;
    listen('removeEventListener');

    // Все таблицы документа с такими значениями, а не только таблицы прозы:
    // отмеченную могли вынести из прозы или дать ей класс .gr-table.
    eachTable('table[tabindex="0"],table[role=table]', function (table) {
      unmark(table, tabTables, 'tabindex', '0');
      unmark(table, roleTables, 'role', 'table');
    });

    return publicApi;
  }

  // Подписка и отписка — один список: диспетчер на каждый тип события
  // из реестра плюс перехват нажатия для щелчка по подложке и Tab
  // для широких таблиц прозы и конец вставки фрагмента GriffinJS.
  function listen(method) {
    document[method]('pointerdown', onPointerDown, true);
    document[method]('keydown', onTabPress, true);
    document[method]('griffin:load', markRoles);

    for (var type in registry) {
      if (Object.prototype.hasOwnProperty.call(registry, type)) {
        document[method](type, dispatch);
      }
    }
  }

  // --- Регистрация компонентов ------------------------------------------------

  // Порядок значим: крестик внутри окна — не щелчок по подложке,
  // вкладка перехватывает щелчок раньше, чем он дойдёт до окна.
  register('click', '[' + DISMISS_ATTR + ']', dismissFrom);
  register('click', '.gr-tab', onTabClick);
  register('click', 'dialog[' + OVERLAY_ATTR + ']', onOverlayClick);

  register('keydown', '.gr-tab', onTabKeyDown);

  register('pointerover', '.gr-toast', onToastEnter);
  register('focusin', '.gr-toast', onToastEnter);
  register('pointerout', '.gr-toast', onToastLeave);
  register('focusout', '.gr-toast', onToastLeave);

  // Автостарт: только в браузере и только если его не отключили атрибутом
  // data-auto="false" на теге <script>.
  function autoStart() {
    try {
      var script = document.currentScript;
      // Только настоящий тег: <img name="currentScript"> перекрывает
      // свойство документа, его атрибуты — чужая разметка.
      if (script && script.tagName === 'SCRIPT' && script.getAttribute('data-auto') === 'false') return;
    } catch (e) { /* currentScript недоступен */ }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { start(); initTabs(); });
      return;
    }

    start();
    initTabs();
  }

  var publicApi = {
    start: start,
    destroy: destroy,
    toast: toast,
    dismiss: dismiss,
    tabs: initTabs,
    version: VERSION,
    _autoStart: autoStart
  };

  return publicApi;
});
