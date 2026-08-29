/*
 * GriffinJS — лайтбокс: <dialog> + дорожка.
 *
 *   <a href="large.jpg" data-gr-lightbox="promo" data-gr-caption="Подпись"><img src="thumb.jpg" alt="…"></a>
 *
 * Значение атрибута — группа: элементы с одним значением листаются в одном
 * окне; пустое значение — окно на один элемент, и дорожка вырождается
 * в один кадр без кнопок. Тип — по адресу (картинка, видео, iframe для
 * YouTube/Vimeo) или явно: data-gr-type="iframe".
 *
 * База без JS — ссылка на большое изображение. Окно строится при открытии
 * и уничтожается при закрытии: так видео гарантированно останавливается,
 * а в документе не копится по <dialog> на каждую группу. Верхний слой,
 * ловушка фокуса, Esc, возврат фокуса — от <dialog>.
 */
(function (G) {
  'use strict';

  var ATTR = 'data-gr-lightbox';
  var VIDEO = /\.(mp4|webm|ogv|mov)(\?|#|$)/i;
  var EMBED = /youtube\.com|youtu\.be|vimeo\.com/i;

  var dialog = null;
  var track = null;
  var trigger = null;   // кто открыл: фокус возвращается ему явно
  var events = G.listeners();
  var listen = events.add;

  function typeOf(node, src) {
    var explicit = node && node.getAttribute && node.getAttribute('data-gr-type');

    if (explicit) return explicit;
    if (VIDEO.test(src)) return 'video';
    if (EMBED.test(src)) return 'iframe';

    return 'image';
  }

  // Элемент разметки → описание кадра.
  function itemOf(node) {
    var src = node.getAttribute('href') || node.getAttribute('data-gr-src') || '';
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
    close();

    opts = opts || {};
    index = index || 0;

    var n = items.length;

    if (n === 0) return null;

    dialog = element('dialog', 'gr-modal gr-lightbox', { 'aria-label': opts.label || 'Просмотр' });

    var trackEl = element('div', 'gr-track gr-lightbox-track', { tabindex: '0' });

    for (var i = 0; i < n; i++) {
      var figure = element('figure', 'gr-slide gr-lightbox-item');

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
    trigger = node;

    var group = groupOf(node);
    var items = [];
    var index = 0;

    for (var i = 0; i < group.length; i++) {
      if (group[i] === node) index = i;
      items.push(itemOf(group[i]));
    }

    return open(items, index);
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
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return false;

    if (event.preventDefault) event.preventDefault();
    openFrom(node);

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
  G.on('click', '[' + ATTR + ']', onClick);
  G.use({ destroy: teardown });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
