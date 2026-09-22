/*!
 * Griffincss — Theme Runtime v0.26.1
 * Переключение цветовой темы, стратегии оформления и режима для слабовидящих:
 * атрибуты data-gr-theme, data-gr-style и data-gr-a11y на <html>.
 * Все три оси независимы. Выбор запоминается в localStorage.
 * Подключается отдельно от грид-рантайма и без него.
 */
(function (factory) {
  'use strict';

  var api = factory();

  // Node (тесты) — модуль; браузер — глобальный объект и автостарт.
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Слияние, а не присваивание: грид-рантайм и тема делят один глобал,
    // и порядок двух тегов <script> не должен ничего значить.
    if (!window.Griffincss) window.Griffincss = {};

    window.Griffincss.theme = api;
    api._autoStart();
  }
})(function () {
  'use strict';

  var VERSION = '0.26.1';

  var THEME_ATTR = 'data-gr-theme';
  var A11Y_ATTR = 'data-gr-a11y';
  var STYLE_ATTR = 'data-gr-style';
  var THEME_KEY = 'gr-theme';
  var A11Y_KEY = 'gr-a11y';
  var STYLE_KEY = 'gr-style';
  var EVENT = 'griffincss:themechange';

  var THEMES = ['light', 'dark', 'auto'];
  var LOW_VISION = 'low-vision';

  // Смена темы — за один кадр, а не пятнами (фидбек темы griffin, п. 17).
  // У компонентов переходы цвета 0,2 с, и при переключении каждый ехал
  // к новому цвету сам по себе: шапка уже тёмная, карточки ещё нет.
  // На время переключения на <html> ставится класс, а в <head> —
  // безслойный <style> с этим правилом; снимаются оба через два кадра.
  // Правило не кладётся ни в один CSS-файл: переходы компонентов (ui),
  // утилит (utils) и темы потребителя стоят в разных слоях, и в каком бы
  // слое библиотеки оно ни лежало, кто-то из них его перебьёт; безслойное
  // объявление старше всех слоёв без !important. Тот же путь, каким
  // грид-рантайм ставит защиту от FOUC, и nonce — оттуда же.
  //
  // Гасятся переходы цвета, а не всё, что движется: элемент с классом
  // gr-theme-keep и его поддерево остаются вне правила — плашка
  // переключателя, значок кнопки режима, любой переход, которым тема
  // отвечает на само переключение (фидбек темы griffin по 0.26.0, п. 3).
  var SWITCHING = 'gr-theme-switching';
  var KEEP = ':not(.gr-theme-keep,.gr-theme-keep *)';
  var FREEZE_CSS = '.gr-theme-switching,.gr-theme-switching ' + KEEP + ',.gr-theme-switching ' + KEEP + '::before,.gr-theme-switching ' + KEEP + '::after{transition:none}';

  // standard в списке нет намеренно: он равносилен отсутствию атрибута,
  // и ставить его в разметку незачем. Значением атрибута он при этом
  // остаётся — стандартный островок внутри воздушной страницы собирает CSS,
  // а не рантайм.
  var STYLES = ['airy', 'strict', 'compact'];

  var persist = true;
  var started = false;
  var mediaDark = null;
  var mediaContrast = null;
  var nonce = '';         // nonce тега <script>: пропуск под строгим CSP
  var freezeEl = null;    // <style> гашения, создаётся один раз
  var freezing = 0;       // номер текущего гашения: позднее продлевает раннее

  function root() {
    return document.documentElement;
  }

  // Значение из закрытого списка или дефолт: чужое значение не должно
  // попасть в атрибут на <html>.
  function oneOf(list, value, fallback) {
    return list.indexOf(value) === -1 ? fallback : value;
  }

  function media(query) {
    if (typeof window === 'undefined' || !window.matchMedia) return null;

    try {
      return window.matchMedia(query);
    } catch (e) {
      return null;
    }
  }

  // Хранилище бросает в приватном режиме и при запрете сторонних данных:
  // молчаливый откат на «выбор живёт до перезагрузки» лучше, чем сломанный
  // переключатель.
  function store(key, value) {
    if (!persist) return;

    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* хранилище недоступно */ }
  }

  function stored(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function currentTheme() {
    var value = root().getAttribute(THEME_ATTR);
    return value === 'light' || value === 'dark' ? value : 'auto';
  }

  function currentA11y() {
    var value = root().getAttribute(A11Y_ATTR);
    return value === LOW_VISION || value === 'off' ? value : 'auto';
  }

  function currentStyle() {
    return oneOf(STYLES, root().getAttribute(STYLE_ATTR), 'standard');
  }

  function state() {
    var theme = currentTheme();
    var a11y = currentA11y();
    var systemDark = !!(mediaDark && mediaDark.matches);
    var systemContrast = !!(mediaContrast && mediaContrast.matches);

    return {
      theme: theme,
      resolved: theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme,
      a11y: a11y,
      // Системная настройка поднимает контраст, но не кегль — поэтому
      // у неё своё значение, отличное от полного режима.
      resolvedA11y: a11y === 'auto' ? (systemContrast ? 'contrast' : 'off') : a11y,

      // Третья ось. Разрешённого значения «авто» у неё нет: системной
      // настройки «предпочитаю строгое оформление» не существует.
      style: currentStyle(),
      version: VERSION
    };
  }

  function emit() {
    var detail = state();

    try {
      document.dispatchEvent(new CustomEvent(EVENT, { detail: detail, bubbles: true }));
    } catch (e) { /* окружение без CustomEvent */ }

    return detail;
  }

  // Два кадра, не один. На первом браузер считает стили с новыми цветами
  // при погашенных переходах и рисует их; сними гашение в этом же кадре —
  // переходы вернулись бы до пересчёта и цвета поехали бы. На втором
  // цвета уже на месте, и возврат переходов ничего не двигает.
  //
  // Событие смены — там же, ПОСЛЕ снятия гашения: слушатель, который
  // в ответ двигает что-то своё, иначе попадал в окно transition: none.
  // Второе переключение в окне продлевает гашение и забирает событие
  // себе — уходит одно, с итоговым состоянием. Возвращает true, если
  // гашение поставлено и событие за ним; false — гасить нечем.
  function freeze() {
    var raf = window.requestAnimationFrame;

    if (typeof raf !== 'function' || !document.head) return false;

    if (!freezeEl) {
      freezeEl = document.createElement('style');
      freezeEl.textContent = FREEZE_CSS;
      if (nonce) freezeEl.nonce = nonce;
    }

    if (!freezeEl.parentNode) document.head.appendChild(freezeEl);
    root().classList.add(SWITCHING);

    var token = ++freezing;

    raf(function () {
      raf(function () {
        if (token !== freezing) return;

        freezeEl.remove();
        root().classList.remove(SWITCHING);
        emit();
      });
    });

    return true;
  }

  function apply(attr, key, value) {
    var frozen = freeze();

    if (value === null) {
      root().removeAttribute(attr);
      store(key, null);
    } else {
      root().setAttribute(attr, value);
      store(key, value);
    }

    // Возврат — состояние сразу; событие — после гашения, а без него
    // (нет requestAnimationFrame) — здесь же, как раньше.
    return frozen ? state() : emit();
  }

  function set(value) {
    var theme = oneOf(THEMES, value, 'auto');
    return apply(THEME_ATTR, THEME_KEY, theme === 'auto' ? null : theme);
  }

  function toggle() {
    return set(state().resolved === 'dark' ? 'light' : 'dark');
  }

  function a11y(value) {
    var mode = null;

    if (value === true || value === LOW_VISION) mode = LOW_VISION;
    else if (value === false || value === 'off') mode = 'off';

    return apply(A11Y_ATTR, A11Y_KEY, mode);
  }

  function style(value) {
    return apply(STYLE_ATTR, STYLE_KEY, oneOf(STYLES, value, null));
  }

  function get() {
    return state();
  }

  // Слушатель системной настройки: событие имеет смысл только там, где
  // выбор отдан системе. При явно выбранной теме её смена ничего не меняет.
  function listen(query, isAuto) {
    if (!query) return;

    var handler = function () {
      if (isAuto()) emit();
    };

    if (query.addEventListener) query.addEventListener('change', handler);
    else if (query.addListener) query.addListener(handler);
  }

  // Порядок приоритетов: сохранённый выбор старше атрибута из разметки —
  // пользователь выбирал позже, чем верстался сервер. Атрибут ставится
  // синхронно, поэтому тег <script> в <head> и есть защита от мигания.
  function start(options) {
    options = options || {};

    if (options.persist === false) persist = false;

    mediaDark = media('(prefers-color-scheme: dark)');
    mediaContrast = media('(prefers-contrast: more)');

    var savedTheme = stored(THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') root().setAttribute(THEME_ATTR, savedTheme);

    var savedA11y = stored(A11Y_KEY);
    if (savedA11y === LOW_VISION || savedA11y === 'off') root().setAttribute(A11Y_ATTR, savedA11y);

    var savedStyle = stored(STYLE_KEY);
    if (STYLES.indexOf(savedStyle) !== -1) root().setAttribute(STYLE_ATTR, savedStyle);

    // Слушатели — ровно один раз: start() вызывается и автостартом,
    // и вручную, а вторая подписка удваивала бы события смены настройки.
    if (!started) {
      started = true;
      listen(mediaDark, function () { return currentTheme() === 'auto'; });
      listen(mediaContrast, function () { return currentA11y() === 'auto'; });
    }

    return state();
  }

  // Автостарт: только в браузере.
  // data-auto="false" — не трогать документ; data-persist="false" — не запоминать.
  function autoStart() {
    var options = {};

    try {
      var script = document.currentScript;
      // Свойство, а не атрибут: содержимое атрибута браузер прячет
      // после разбора. Читается до проверки data-auto: гашение нужно
      // и тому, кто запускает рантайм вручную.
      if (script) nonce = script.nonce || '';
      if (script && script.getAttribute('data-auto') === 'false') return;
      if (script && script.getAttribute('data-persist') === 'false') options.persist = false;
    } catch (e) { /* currentScript недоступен */ }

    start(options);
  }

  return {
    set: set,
    toggle: toggle,
    a11y: a11y,
    style: style,
    get: get,
    start: start,
    version: VERSION,
    _autoStart: autoStart
  };
});
