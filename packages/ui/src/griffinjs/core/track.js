/*
 * GriffinJS — дорожка: состояние + интерфейс движка.
 *
 * Состояние — индекс, число слайдов, цикл, aria, клавиатура, синхронизация,
 * события — живёт здесь и не знает, как слайды двигаются. Движение —
 * у движка за интерфейсом из трёх частей:
 *
 *   goTo(physical, instant)   — привести дорожку к слайду
 *   layout()                  — перемерить после мутации/ресайза
 *   visible()                 — какие слайды сейчас на экране (для inert)
 *
 * Движок отчитывается обратно: track._report(position) — дробная позиция
 * в физических индексах на каждый кадр, track._settle(physical) — когда
 * движение кончилось. Отсюда — инвариант: состояние дорожки нигде
 * не выводится из scrollLeft, кроме scroll-движка.
 *
 * Индекс ВИРТУАЛЬНЫЙ: track.index никогда не равен позиции в DOM,
 * между ними всегда physical(index). Без цикла physical — зажим в границы,
 * с циклом — по модулю; клоны краёв для scroll-движка (21d) не меняют
 * состояние, только physical.
 *
 * JS пишет только aria-*, inert, --gr-progress и --gr-snap (снап-точки
 * по страницам); оформление активного слайда — .gr-slide[aria-current] в CSS.
 */
(function (G) {
  'use strict';

  var CHANGE = 'griffin:change';
  var LAYOUT = 'griffin:layout';

  var DEFAULTS = {
    engine: 'scroll',
    loop: false,
    rewind: false,        // с последнего — на первый, с первого — на последний; без клонов
    step: 1,              // на сколько слайдов листают next/prev и точки: число или 'page'
    index: 0,
    keyboard: true,
    inert: true,
    label: 'Слайд {i} из {n}'
  };

  function mod(value, count) {
    return ((value % count) + count) % count;
  }

  function track(el, opts) {
    var o = G.merge(DEFAULTS, opts);

    var slides = [];
    var index = 0;
    var perView = 1;       // сколько слайдов помещается в окне дорожки — считает движок
    var engine = null;

    // Цикл возможен, только если движок его умеет (engine.loop — клоны краёв
    // у scroll появятся в 21d, у fade он бесплатен). Иначе loop честно
    // вырождается в rewind: страницы считаются по достижимому, с края —
    // перескок на другой край. Точки, ведущие в никуда, хуже отсутствия цикла.
    var looping = false;
    var rewinding = !!o.rewind;
    var attrs = G.recorder();
    var events = G.listeners();
    var observers = [];
    var mo = null;
    var syncing = false;
    var destroyed = false;
    var setAttr = attrs.set;

    // --- Слайды и индекс -------------------------------------------------------

    function readSlides() {
      var nodes = o.slides ? el.querySelectorAll(o.slides) : el.children;
      var out = [];

      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].nodeType !== undefined && nodes[i].nodeType !== 1) continue;
        // Клоны краёв — собственность движка, для состояния их нет.
        if (nodes[i].hasAttribute && nodes[i].hasAttribute('data-gr-clone')) continue;

        out.push(nodes[i]);
      }

      return out;
    }

    function count() { return slides.length; }

    // Крайний индекс без цикла: дальше последний слайд уже стоит у конца
    // дорожки, и браузер всё равно не прокрутит. Индекс, которого нельзя
    // достичь прокруткой, — не индекс.
    function last() {
      return Math.max(0, count() - perView);
    }

    function physical(i) {
      var n = count();

      if (n === 0) return 0;
      if (looping) return mod(i, n);

      var max = last();

      return i < 0 ? 0 : i > max ? max : i;
    }

    // --- Страницы --------------------------------------------------------------

    // Шаг листания: 'page' — на число видимых, иначе число слайдов.
    function stepSize() {
      if (o.step === 'page') return Math.max(1, perView);

      var n = Number(o.step);

      return n >= 1 ? Math.floor(n) : 1;
    }

    // Число страниц — столько и точек: каждая ведёт туда, куда дорожка
    // действительно доедет. Последняя страница может быть короче шага.
    function pages() {
      var n = count();

      if (n === 0) return 0;
      if (looping) return Math.ceil(n / stepSize());

      return Math.ceil(last() / stepSize()) + 1;
    }

    function pageStart(k) {
      var start = k * stepSize();

      return looping ? start : Math.min(start, last());
    }

    function pageOf(i) {
      var p = physical(i);
      var total = pages();

      if (!looping && p >= last()) return total - 1;

      return Math.min(total - 1, Math.round(p / stepSize()));
    }

    // Виртуальный индекс с заданным physical, ближайший к текущему:
    // при цикле «с 0 назад» — это −1, а не n−1, иначе движок поехал бы
    // через всю дорожку вперёд.
    function nearest(p) {
      var n = count();

      if (!looping || n === 0) return p;

      var delta = mod(p - physical(index), n);

      if (delta > n / 2) delta -= n;

      return index + delta;
    }

    // --- Применение состояния --------------------------------------------------

    function labelOf(i) {
      return o.label.replace('{i}', i + 1).replace('{n}', count());
    }

    function decorate() {
      for (var i = 0; i < slides.length; i++) {
        var s = slides[i];

        if (!s.getAttribute('role')) setAttr(s, 'role', 'group');
        if (!s.getAttribute('aria-roledescription')) setAttr(s, 'aria-roledescription', 'slide');
        if (!s.getAttribute('aria-label') && !s.getAttribute('aria-labelledby')) setAttr(s, 'aria-label', labelOf(i));
      }
    }

    function apply() {
      var current = physical(index);
      var visible = engine && typeof engine.visible === 'function' ? engine.visible() : [current];

      for (var i = 0; i < slides.length; i++) {
        setAttr(slides[i], 'aria-current', i === current ? 'true' : null);

        // Неактивные слайды — inert: иначе VoiceOver проваливается в ссылки
        // невидимого слайда (требование 6 к дорожке на iOS).
        if (o.inert) setAttr(slides[i], 'inert', visible.indexOf(i) === -1 ? '' : null);
      }
    }

    function emit(previous) {
      var detail = { index: index, physical: physical(index), previous: previous, track: api };

      if (typeof G.emit === 'function') G.emit(CHANGE, el, detail);
      else if (typeof el.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        el.dispatchEvent(new CustomEvent(CHANGE, { detail: detail, bubbles: true }));
      }
    }

    function commit(next, options) {
      var previous = index;

      index = next;

      apply();

      if (options && options.silent) return;

      emit(previous);
    }

    // --- Снап по страницам -----------------------------------------------------

    // Свайп с инерцией останавливается там, где стоит снап-точка. При шаге
    // больше одного точки обязаны совпадать со страницами, иначе палец
    // приводит на слайд, куда ни кнопки, ни точки не ведут. Дорожка пишет
    // на слайды --gr-snap, CSS читает его в scroll-snap-align: начало каждой
    // страницы — start, последний слайд — end (последняя страница может быть
    // короче шага и выравнивается к концу), остальные — none.
    function applySnaps() {
      var step = stepSize();
      var n = count();
      var max = last();
      var paged = step > 1 && !looping;

      for (var i = 0; i < n; i++) {
        var style = slides[i].style;

        if (!style) continue;

        if (!paged) style.removeProperty('--gr-snap');
        else style.setProperty('--gr-snap', i === n - 1 ? 'end' : i % step === 0 && (i < max || !i) ? 'start' : 'none');
      }
    }

    // --- Прогресс --------------------------------------------------------------

    // position — дробный физический индекс. Каждый слайд получает
    // --gr-progress = 1 на своём месте и 0 на расстоянии в один слайд;
    // дорожка — долю пройденного пути. Потребители — fade, масштаб соседей,
    // полоса прогресса — источника не знают.
    function report(position) {
      var n = count();

      if (G.motion) {
        for (var i = 0; i < n; i++) {
          var distance = Math.abs(position - i);

          // В цикле расстояние — по кругу: позиция −0.5 наполовину на последнем.
          if (looping && n) distance = Math.min(distance, n - distance);

          G.motion.set(slides[i], distance >= 1 ? 0 : 1 - distance);
        }

        G.motion.set(el, n > 1 ? position / (n - 1) : 1);
      }

      follow(position);
    }

    // Начало страницы, ближайшее к дробной позиции: именно туда доснапит
    // браузер, и туда же обязаны указывать точки.
    function nearestPage(position) {
      var best = 0;
      var total = pages();

      for (var k = 0; k < total; k++) {
        if (Math.abs(position - pageStart(k)) < Math.abs(position - pageStart(best))) best = k;
      }

      return pageStart(best);
    }

    // Индекс следует за движением пользователя, не дожидаясь остановки:
    // слайд встал на место, а точки ждали scrollend или дебаунс после
    // инерции — заметное отставание на телефоне. Только для движков,
    // которые это объявили (engine.live): fade сам решает исход жеста
    // по отпусканию пальца и на track.index опирается как на базу.
    // Пока дорожка едет по своей команде, индекс уже целевой.
    function follow(position) {
      var n = count();

      if (!n || !engine || !engine.live) return;
      if (typeof engine.moving === 'function' && engine.moving()) return;
      // Команда отложена до конца жеста: индекс уже её, палец не перебивает.
      if (typeof engine.queued === 'function' && engine.queued()) return;

      var p;

      if (looping) p = mod(Math.round(position), n);
      else p = paged() ? nearestPage(position) : physical(Math.round(position));

      var next = nearest(p);

      if (next !== index) commit(next);
    }

    function settle(p) {
      if (destroyed) return;

      var next = nearest(p);

      if (next === index) { apply(); return; }

      commit(next);
    }

    // --- Публичное движение ----------------------------------------------------

    // Страничный режим без цикла: индекс приводится к началу ближайшей
    // страницы. Снап-точки стоят только там, и команда «на слайд 1» при шаге 2
    // всё равно кончилась бы на 0 или 2 — только уже руками браузера,
    // с индексом, разошедшимся с положением дорожки.
    function paged() {
      return !looping && stepSize() > 1;
    }

    function goTo(i, options) {
      if (destroyed || count() === 0) return false;

      if (!looping && (i < 0 || i > last())) return false;

      var next = looping ? i : physical(i);

      if (paged()) next = pageStart(pageOf(next));

      // Движок вправе отказать: дорожка ещё едет по прошлой команде.
      // Индекс тогда не меняется — точки не убегают от слайдов.
      if (engine && engine.goTo(physical(next), !!(options && options.instant)) === false) return false;

      if (next === index) return true;

      commit(next, options);

      return true;
    }

    // Шаг вперёд/назад — по СТРАНИЦАМ, а не «индекс ± шаг»: последняя
    // страница короче шага и выровнена к концу, и «назад» с неё обязано
    // вести на начало предыдущей страницы, а не на шаг от её индекса —
    // там снап-точки нет. Без цикла у края — отказ, с rewind — перескок
    // на другой край: «бесконечная» лента без клонов и без обмана позиции.
    function next(options) {
      if (looping) return goTo(index + stepSize(), options);

      var page = pageOf(index);

      if (page < pages() - 1) return goTo(pageStart(page + 1), options);

      return rewinding ? goTo(0, options) : false;
    }

    function prev(options) {
      if (looping) return goTo(index - stepSize(), options);

      var page = pageOf(index);

      if (page > 0) return goTo(pageStart(page - 1), options);

      return rewinding ? goTo(pageStart(pages() - 1), options) : false;
    }

    function goToPage(k, options) {
      return goTo(pageStart(Math.max(0, Math.min(k, pages() - 1))), options);
    }

    // --- Клавиатура ------------------------------------------------------------

    function rtl() {
      try {
        return getComputedStyle(el).direction === 'rtl';
      } catch (e) {
        var dir = el.getAttribute('dir') || (document.documentElement && document.documentElement.getAttribute('dir'));

        return dir === 'rtl';
      }
    }

    function onKeyDown(event) {
      var key = event.key;
      var back = rtl() ? 'ArrowRight' : 'ArrowLeft';
      var forward = rtl() ? 'ArrowLeft' : 'ArrowRight';
      var handled = false;

      // У края без цикла клавиша не наша: браузер волен прокрутить
      // страницу, как сделал бы без скрипта.
      if (key === forward) handled = next();
      else if (key === back) handled = prev();
      else if (key === 'Home') handled = goTo(looping ? index - physical(index) : 0);
      else if (key === 'End') handled = goTo(looping ? index - physical(index) + count() - 1 : last());

      if (handled && event.preventDefault) event.preventDefault();
    }

    // --- Синхронизация ---------------------------------------------------------

    // Две дорожки — галерея и превью — держат один индекс. Защита
    // от эха: чужое изменение применяется, только если индекс отличается,
    // и пока применяется, своё событие не порождает ответного.
    function sync(other) {
      // Событие ловится на своём элементе, но приходить может и от вложенной
      // дорожки — отсюда сверка с отправителем.
      function follow(event) {
        if (syncing || !event.detail || event.detail.track !== api) return;

        syncing = true;
        try {
          if (other.index !== event.detail.index) other.goTo(event.detail.index);
        } finally {
          syncing = false;
        }
      }

      function lead(event) {
        if (syncing || !event.detail || event.detail.track !== other) return;

        syncing = true;
        try {
          if (index !== event.detail.index) goTo(event.detail.index);
        } finally {
          syncing = false;
        }
      }

      events.add(el, CHANGE, follow);
      events.add(other.el, CHANGE, lead);

      return function () {
        el.removeEventListener(CHANGE, follow);
        other.el.removeEventListener(CHANGE, lead);
      };
    }

    // --- Перестройка -----------------------------------------------------------

    // Мутация содержимого сбивает снап-позицию (требование 5): после неё —
    // перечитать слайды, перемерить и перепривязаться к текущему индексу.
    // Перемер: движок измеряет, дорожка узнаёт, сколько слайдов видно.
    // О смене геометрии (число слайдов, число видимых) сообщается событием
    // griffin:layout — слайдер по нему перестраивает точки.
    function layout() {
      var before = perView + ':' + count();

      if (engine) {
        engine.layout();
        perView = typeof engine.perView === 'function' ? Math.max(1, engine.perView()) : 1;
      }

      if (!looping) index = physical(index);
      applySnaps();
      if (engine) engine.goTo(physical(index), true);

      if (before !== perView + ':' + count()) emitLayout();
    }

    function emitLayout() {
      if (typeof G.emit === 'function') G.emit(LAYOUT, el, { perView: perView, count: count(), pages: pages(), track: api });
    }

    function refresh() {
      if (destroyed) return api;

      slides = readSlides();
      decorate();
      layout();
      apply();

      return api;
    }

    function observe() {
      // Клоны движка тоже приходят мутациями: они отфильтрованы в readSlides,
      // и refresh на них ничего не меняет — цикла нет.
      if (typeof MutationObserver === 'function') {
        mo = new MutationObserver(function () { refresh(); });

        mo.observe(el, { childList: true });
        observers.push(mo);
      }

      if (typeof ResizeObserver === 'function') {
        var ro = new ResizeObserver(function () { layout(); apply(); });

        ro.observe(el);
        observers.push(ro);
      }
    }

    // --- Жизненный цикл --------------------------------------------------------

    function destroy() {
      if (destroyed) return;

      destroyed = true;

      if (engine && typeof engine.destroy === 'function') engine.destroy();
      engine = null;

      events.removeAll();

      for (var j = 0; j < observers.length; j++) observers[j].disconnect();
      observers = [];

      for (var k = 0; k < slides.length; k++) {
        if (G.motion) G.motion.clear(slides[k]);
        if (slides[k].style) slides[k].style.removeProperty('--gr-snap');
      }

      if (G.motion) G.motion.clear(el);

      attrs.restore();
    }

    var api = {
      el: el,
      goTo: goTo,
      goToPage: goToPage,
      next: next,
      prev: prev,
      physical: physical,
      pageOf: pageOf,
      pageStart: pageStart,
      sync: sync,
      refresh: refresh,
      destroy: destroy,
      _report: report,
      _settle: settle,
      _engine: function () { return engine; }
    };

    Object.defineProperty(api, 'index', { get: function () { return index; } });
    Object.defineProperty(api, 'count', { get: count });
    Object.defineProperty(api, 'perView', { get: function () { return perView; } });
    Object.defineProperty(api, 'last', { get: last });
    Object.defineProperty(api, 'pages', { get: pages });
    Object.defineProperty(api, 'step', { get: stepSize });
    Object.defineProperty(api, 'slides', { get: function () { return slides.slice(); } });
    Object.defineProperty(api, 'loop', { get: function () { return !!looping; } });
    Object.defineProperty(api, 'moving', { get: function () { return !!(engine && typeof engine.moving === 'function' && engine.moving()); } });
    Object.defineProperty(api, 'rewind', { get: function () { return rewinding; } });

    // --- Подъём ----------------------------------------------------------------

    slides = readSlides();
    index = o.index || 0;

    var factory = G.engines[o.engine];

    if (!factory) {
      G.warn('движок «' + o.engine + '» не зарегистрирован — дорожка без движения');
    } else {
      engine = factory(api, el, o) || null;
    }

    looping = !!(o.loop && engine && engine.loop);
    if (o.loop && !looping) rewinding = true;

    decorate();
    layout();
    apply();

    if (o.keyboard) events.add(el, 'keydown', onKeyDown);

    observe();

    return api;
  }

  G.track = track;
  G.track.CHANGE = CHANGE;
  G.track.LAYOUT = LAYOUT;

  // Дорожка без органов управления — тоже виджет: data-gr-track на
  // scroll-snap-контейнере даёт клавиатуру, aria и событие изменения.
  G.defineWidget('track', { needs: ['motion'] }, function (el, opts) {
    return track(el, opts);
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('./griffinjs-core.js'));
