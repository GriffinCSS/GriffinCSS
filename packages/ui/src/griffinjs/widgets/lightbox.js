/*
 * GriffinJS — лайтбокс: <dialog> + дорожка.
 *
 *   <a href="large.jpg" data-gr-lightbox="promo" data-gr-caption="Подпись"><img src="thumb.jpg" alt="…"></a>
 *   <a href="https://rutube.ru/video/…/" data-gr-src="https://rutube.ru/play/embed/…" data-gr-lightbox>…</a>
 *
 * Значение атрибута — группа: элементы с одним значением листаются в одном
 * окне; пустое значение — окно на один элемент, и дорожка вырождается
 * в один кадр без кнопок. Адрес кадра — data-gr-src, без него — href:
 * у видео это разные адреса — во фрейм встаёт только плеер, страницу ролика
 * хостинги во фрейме не показывают, а ссылка без скрипта ведёт именно на неё.
 * Тип — по адресу кадра (картинка, видео, iframe для плееров YouTube, Vimeo,
 * Rutube и VK Видео — по хосту адреса) или явно: data-gr-type="iframe".
 *
 * Адрес кадра — http(s), относительный, data: или blob:. Любой другой кадр
 * не открывает: javascript: во фрейме исполнился бы в origin страницы,
 * а data-* редакторы и фильтры CMS не проверяют как ссылку. Отвергнутый
 * кадр из группы выпадает; щелчок по нему остаётся браузеру.
 *
 * База без JS — ссылка на большое изображение или на страницу ролика.
 * Окно строится при открытии и уничтожается при закрытии: так видео
 * гарантированно останавливается, а в документе не копится по <dialog>
 * на каждую группу. Верхний слой, ловушка фокуса, Esc, возврат фокуса —
 * от <dialog>.
 */
(function (G) {
  'use strict';

  var ATTR = 'data-gr-lightbox';
  var VIDEO = /\.(mp4|webm|ogv|mov)(\?|#|$)/i;
  // Хост и путь разобранного адреса: хостинг — сам хост или его поддомен,
  // а не подстрока где угодно (картинка …/rutube.ru-logo.png — не плеер).
  var EMBED = /^([\w-]+\.)*((youtube\.com|youtu\.be|vimeo\.com|rutube\.ru|vkvideo\.ru)\/|vk\.com\/video)/i;
  var SCHEMES = /^(https?|data|blob):$/;

  var dialog = null;
  var track = null;
  var trigger = null;   // кто открыл: фокус возвращается ему явно
  var events = G.listeners();
  var listen = events.add;

  // Адрес по правилам браузера: регистр, пробелы по краям и табы внутри
  // схемы разбор снимает. Не адрес — null.
  function parse(src) {
    try {
      return new URL(src, document.baseURI);
    } catch (e) {
      return null;
    }
  }

  function typeOf(node, src) {
    var explicit = node && node.getAttribute && node.getAttribute('data-gr-type');

    if (explicit) return explicit;
    if (VIDEO.test(src)) return 'video';

    var url = parse(src);

    return url && EMBED.test(url.hostname + url.pathname) ? 'iframe' : 'image';
  }

  // Элемент разметки → описание кадра. data-gr-src старше href: у видео
  // href — страница ролика для перехода без скрипта, а кадр — плеер.
  function itemOf(node) {
    var src = node.getAttribute('data-gr-src') || node.getAttribute('href') || '';
    var img = node.querySelector ? node.querySelector('img') : null;

    return {
      src: src,
      type: typeOf(node, src),
      caption: node.getAttribute('data-gr-caption') || '',
      alt: node.getAttribute('data-gr-alt') || (img && img.getAttribute('alt')) || ''
    };
  }

  function groupOf(node) {
    var name = node.getAttribute(ATTR);

    if (!name) return [node];

    var all = document.querySelectorAll('[' + ATTR + '="' + name + '"]');
    var out = [];

    for (var i = 0; i < all.length; i++) out.push(all[i]);

    return out;
  }

  function element(tag, className, attrs) {
    var node = document.createElement(tag);

    if (className) node.setAttribute('class', className);

    for (var name in attrs || {}) {
      if (Object.prototype.hasOwnProperty.call(attrs, name)) node.setAttribute(name, attrs[name]);
    }

    return node;
  }

  function media(item) {
    if (item.type === 'video') {
      return element('video', null, { src: item.src, controls: '', playsinline: '' });
    }

    if (item.type === 'iframe') {
      return element('iframe', null, { src: item.src, allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: '', title: item.caption || item.alt || 'Видео' });
    }

    return element('img', null, { src: item.src, alt: item.alt });
  }

  function counterText(i, n) { return (i + 1) + ' / ' + n; }

  // --- Открытие ----------------------------------------------------------------

  function open(items, index, opts) {
    var list = [];

    index = index || 0;

    // Кадр с отвергнутым адресом выпадает из группы; отвергнут
    // открываемый — окна нет.
    for (var k = 0; k < items.length; k++) {
      var url = parse(items[k].src);

      if (url && SCHEMES.test(url.protocol)) {
        list.push(items[k]);
        continue;
      }

      G.warn('lightbox: frame address refused: ' + items[k].src);

      if (k === index) return null;
      if (k < index) index--;
    }

    if (!list.length) return null;

    close();

    opts = opts || {};
    items = list;

    var n = items.length;

    dialog = element('dialog', 'gr-modal gr-lightbox', { 'aria-label': opts.label || 'Просмотр' });

    var trackEl = element('div', 'gr-track gr-lightbox-track', { tabindex: '0' });

    for (var i = 0; i < n; i++) {
      var figure = element('figure', 'gr-lightbox-item');

      figure.appendChild(media(items[i]));

      if (items[i].caption) {
        var caption = element('figcaption', 'gr-lightbox-caption');

        caption.textContent = items[i].caption;
        figure.appendChild(caption);
      }

      trackEl.appendChild(figure);
    }

    dialog.appendChild(trackEl);

    var closeBtn = element('button', 'gr-lightbox-close', { type: 'button', 'aria-label': 'Закрыть' });

    closeBtn.textContent = '×';
    dialog.appendChild(closeBtn);
    listen(closeBtn, 'click', close);

    var counter = null;

    if (n > 1) {
      var prevBtn = element('button', 'gr-lightbox-prev', { type: 'button', 'aria-label': 'Назад' });
      var nextBtn = element('button', 'gr-lightbox-next', { type: 'button', 'aria-label': 'Вперёд' });

      prevBtn.textContent = '‹';
      nextBtn.textContent = '›';
      counter = element('div', 'gr-lightbox-counter', { 'aria-live': 'polite' });
      counter.textContent = counterText(index, n);

      dialog.appendChild(prevBtn);
      dialog.appendChild(nextBtn);
      dialog.appendChild(counter);

      listen(prevBtn, 'click', function () { if (track) track.prev(); });
      listen(nextBtn, 'click', function () { if (track) track.next(); });
    }

    // Щелчок мимо кадра — по самой сцене — закрывает, как по подложке.
    listen(dialog, 'click', function (event) {
      if (event.target === dialog || event.target === trackEl || G.closest(event.target, '.gr-lightbox-item') === event.target) close();
    });

    // Стрелки работают из любого места окна, не только с фокусом на дорожке.
    listen(dialog, 'keydown', function (event) {
      if (!track || event.target === trackEl) return;

      if (event.key === 'ArrowRight') { track.next(); event.preventDefault(); }
      else if (event.key === 'ArrowLeft') { track.prev(); event.preventDefault(); }
    });

    listen(dialog, 'close', teardown);

    document.body.appendChild(dialog);

    if (n > 1) {
      track = G.track(trackEl, { loop: true, index: index });
      listen(trackEl, G.track.CHANGE, function (event) {
        if (counter) counter.textContent = counterText(event.detail.physical, n);
      });
    }

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    return api;
  }

  function openFrom(node) {
    var group = groupOf(node);
    var items = [];
    var index = 0;

    for (var i = 0; i < group.length; i++) {
      if (group[i] === node) index = i;
      items.push(itemOf(group[i]));
    }

    var opened = open(items, index);

    if (opened) trigger = node;

    return opened;
  }

  // --- Закрытие ----------------------------------------------------------------

  function stopMedia() {
    if (!dialog) return;

    var videos = dialog.querySelectorAll('video');
    var frames = dialog.querySelectorAll('iframe');

    for (var i = 0; i < videos.length; i++) {
      if (typeof videos[i].pause === 'function') videos[i].pause();
    }

    for (var j = 0; j < frames.length; j++) frames[j].setAttribute('src', 'about:blank');
  }

  function teardown() {
    if (!dialog) return;

    stopMedia();

    if (track) track.destroy();
    track = null;

    events.removeAll();

    dialog.remove();
    dialog = null;

    // <dialog> возвращает фокус туда, откуда его забрал, но в WebKit щелчок
    // по ссылке фокуса ей не даёт — возвращать было бы некуда. Поэтому
    // инициатор запоминается и получает фокус сам, одинаково во всех движках.
    if (trigger && typeof trigger.focus === 'function') trigger.focus();
    trigger = null;
  }

  function close() {
    if (!dialog) return;

    if (typeof dialog.close === 'function' && dialog.hasAttribute('open')) dialog.close();
    else teardown();
  }

  function onClick(event, node) {
    // Ctrl/Cmd/средняя кнопка — читатель хочет новую вкладку, а не окно.
    // Кадр не открылся — ссылка работает как без скрипта.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button || !openFrom(node)) return false;

    if (event.preventDefault) event.preventDefault();

    return true;
  }

  var api = {
    open: open,
    openFrom: openFrom,
    close: close,
    _dialog: function () { return dialog; },
    _track: function () { return track; }
  };

  G.lightbox = api;
  G.needs('lightbox', ['track']);
  G.on('click', '[' + ATTR + ']', onClick);
  G.use({ destroy: teardown });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
