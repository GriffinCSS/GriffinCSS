/*!
 * Griffincss UI — Runtime v0.16.0
 * Опциональный рантайм пакета компонентов. Делает ровно то, чего платформа
 * не даёт вовсе; всё, что умеют <details>, <dialog> и Popover API, остаётся
 * за ними. Без этого файла компоненты работают — просто без перечисленного.
 *
 * Здесь четыре вещи:
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

  var VERSION = '0.16.0';

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

  // Причина закрытия попадает в dialog.returnValue: обработчик close
  // на странице отличит щелчок мимо от кнопки «Сохранить».
  var OVERLAY_REASON = 'overlay';

  var started = false;

  // Цель нажатия. Щелчок — это пара «нажал» и «отпустил», и закрывать окно
  // нужно, только если обе половины пришлись на подложку: выделение текста,
  // начатое в окне и законченное за его краем, щелчком по подложке не является.
  var pressed = null;

  function isDialog(node) {
    return !!node && node.tagName === 'DIALOG' && typeof node.close === 'function';
  }

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

  function onClick(event) {
    // Три разных щелчка приходят одним событием, и порядок разбора значим:
    // крестик внутри окна не должен считаться щелчком по подложке,
    // а вкладка-ссылка не должна уводить страницу к якорю.
    var trigger = closest(event.target, '[' + DISMISS_ATTR + ']');

    if (trigger) {
      dismissFrom(trigger);
      return;
    }

    if (onTabClick(event)) return;

    var dialog = event.target;

    if (!isDialog(dialog)) return;
    if (!dialog.hasAttribute(OVERLAY_ATTR)) return;
    if (pressed !== null && pressed !== dialog) return;
    if (!outsideBox(dialog, event)) return;

    dialog.close(OVERLAY_REASON);
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
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      console.warn('Griffincss UI: ' + message);
    }
  }

  function element(tag, className) {
    var node = document.createElement(tag);

    if (className) {
      var names = className.split(' ');

      for (var i = 0; i < names.length; i++) node.classList.add(names[i]);
    }

    return node;
  }

  // --- Закрытие крестиком -----------------------------------------------------

  // Цель задаётся значением атрибута, если она не предок кнопки:
  //
  //   <button data-gr-dismiss="#banner">×</button>
  //
  // Пустое значение — обычный случай: убрать ближайшее сообщение,
  // внутри которого стоит сам крестик.
  function dismissFrom(trigger) {
    var selector = trigger.getAttribute(DISMISS_ATTR);
    var target = selector
      ? (typeof document.querySelector === 'function' ? document.querySelector(selector) : null)
      : closest(trigger, DISMISSIBLE);

    if (!target) {
      warn('крестику нечего закрывать: ни цели в data-gr-dismiss, ни сообщения вокруг');
      return;
    }

    dismiss(target);
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

    var status = indexOf(TOAST_STATUSES, options.status) === -1 ? '' : options.status;
    var position = indexOf(TOAST_POSITIONS, options.position) === -1 ? 'bottom-end' : options.position;

    // Срочность по умолчанию выводится из статуса: ошибка перебивает
    // текущее чтение, остальное ждёт своей очереди.
    var urgent = options.assertive === undefined ? status === 'danger' : !!options.assertive;

    if (status && !options.title) {
      warn('тост со статусом "' + status + '" без title: статус остался одним цветом, '
        + 'а он не переживает чёрно-белую печать и дальтонизм');
    }

    var node = buildToast(text, options, status);

    ensureRegion(position, urgent).appendChild(node);

    var timeout = options.timeout === undefined ? TOAST_TIMEOUT : Number(options.timeout);

    if (timeout > 0) startTimer(node, timeout);

    return node;
  }

  function indexOf(list, value) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === value) return i;
    }

    return -1;
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

  // pointerover / pointerout, а не enter / leave: эти всплывают, и хватает
  // одного слушателя на документ. Переход между частями одного тоста —
  // не уход: relatedTarget внутри того же узла.
  function onPointerOver(event) {
    pauseToast(closest(event.target, '.gr-toast'));
  }

  function onPointerOut(event) {
    var node = closest(event.target, '.gr-toast');

    if (!node || contains(node, event.relatedTarget)) return;

    resumeToast(node);
  }

  function onFocusIn(event) {
    pauseToast(closest(event.target, '.gr-toast'));
  }

  function onFocusOut(event) {
    var node = closest(event.target, '.gr-toast');

    if (!node || contains(node, event.relatedTarget)) return;

    resumeToast(node);
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

    select(tabs, selected, false);
  }

  // Панель — по href="#id" у ссылки или по aria-controls у кнопки.
  function panelOf(tab) {
    var href = tab.getAttribute('href');
    var id = tab.getAttribute('aria-controls');

    if (!id && href && href.charAt(0) === '#') id = href.slice(1);
    if (!id) return null;

    return document.getElementById(id);
  }

  function select(tabs, index, focus) {
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

  function onKeyDown(event) {
    var tab = closest(event.target, '.gr-tab');

    if (!tab) return;

    var group = closest(tab, '[' + TABS_ATTR + ']');

    if (!group) return;

    // Список читается заново: вкладки добавляют и убирают вместе
    // с разметкой, и запомненный при инициализации массив устарел бы молча.
    var tabs = group.querySelectorAll('.gr-tab');
    var current = indexOfNode(tabs, tab);

    if (current === -1) return;

    var next = current;
    var key = event.key;

    // Обе оси: ряд вкладок бывает и горизонтальным, и — в чужой раскладке —
    // поставленным в колонку.
    if (key === 'ArrowRight' || key === 'ArrowDown') next = step(tabs, current, 1);
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = step(tabs, current, -1);
    else if (key === 'Home') next = edge(tabs, 1);
    else if (key === 'End') next = edge(tabs, -1);
    else return;

    if (typeof event.preventDefault === 'function') event.preventDefault();

    select(tabs, next, true);
  }

  // Щелчок по вкладке-ссылке переключает панель, а не уводит страницу
  // к якорю: прыжок сдвинул бы ряд вкладок за верхний край экрана.
  function onTabClick(event) {
    var tab = closest(event.target, '.gr-tab');

    if (!tab) return false;

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

  function indexOfNode(list, node) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === node) return i;
    }

    return -1;
  }

  // Один делегированный обработчик на документ, а не по слушателю на окно:
  // окна появляются и исчезают вместе с разметкой, и переподписываться
  // на каждое пришлось бы вручную.
  function start() {
    if (started) return publicApi;

    started = true;
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);

    // pointerover / pointerout и focusin / focusout всплывают, в отличие
    // от enter / leave и focus / blur: одного слушателя на документ хватает
    // на все тосты сразу, включая ещё не созданные.
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return publicApi;
  }

  function destroy() {
    if (!started) return publicApi;

    started = false;
    pressed = null;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);

    return publicApi;
  }

  // Автостарт: только в браузере и только если его не отключили атрибутом
  // data-auto="false" на теге <script>.
  function autoStart() {
    try {
      var script = document.currentScript;
      if (script && script.getAttribute('data-auto') === 'false') return;
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
