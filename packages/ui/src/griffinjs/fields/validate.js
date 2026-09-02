/*
 * GriffinJS — сводка ошибок формы.
 *
 *   <form data-gr-validate>
 *     …поля с required, pattern, min, max…
 *     <button class="gr-btn gr-btn-primary" type="submit">Отправить</button>
 *   </form>
 *
 * Без скрипта форму проверяет браузер и показывает свой пузырь у первого
 * непройденного поля — одного, по одному за раз. Скрипт собирает ВСЕ
 * непройденные поля в одну сводку в начале формы: список ссылок «подпись:
 * сообщение», где сообщение — платформенное, в языке браузера, а подпись —
 * <label> поля (или его aria-label, или name). Фокус после отправки —
 * на первой ссылке; Enter по ней ведёт к полю. Непройденные поля получают
 * aria-invalid="true" — их красит CSS семьи .gr-field, — и теряют его,
 * как только исправлены; список же обновляется следующей отправкой.
 *
 * Пузырь браузера на время жизни виджета снимается (novalidate): двум
 * сообщениям об одном и том же незачем спорить. Проверку это не отменяет —
 * checkValidity() платформы остаётся единственным судьёй.
 *
 *   data-gr-validate="summary: #errors; title: Исправьте:"
 * summary — свой контейнер сводки; title — заголовок над списком.
 */
(function (G) {
  'use strict';

  var DEFAULTS = { summary: '', title: 'Форма не отправлена — проверьте поля:' };

  var seq = 0;

  function element(tag, className, attrs) {
    var node = document.createElement(tag);

    if (className) node.setAttribute('class', className);
    for (var k in attrs || {}) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);

    return node;
  }

  function clear(node) {
    while (node.firstElementChild) node.firstElementChild.remove();
  }

  G.defineWidget('validate', function (el, opts) {
    if (String(el.tagName).toLowerCase() !== 'form') throw new Error('нужен <form>');

    var o = G.merge(DEFAULTS, opts);
    var attrs = G.recorder();
    var events = G.listeners();
    var box = o.summary ? document.querySelector(o.summary) : null;
    var created = false;
    var marked = [];   // поля, которым поставлен aria-invalid

    if (!box) {
      box = element('div', 'gr-validate');
      el.insertBefore(box, el.firstChild);
      created = true;
    }

    attrs.set(box, 'role', 'alert');
    attrs.set(box, 'hidden', '');
    attrs.set(el, 'novalidate', '');

    function controls() {
      return el.querySelectorAll('input, select, textarea');
    }

    function invalid(control) {
      return control.validity ? control.validity.valid === false : false;
    }

    // Подпись поля: <label>, иначе aria-label, иначе name.
    function labelOf(control) {
      var label = (control.labels && control.labels[0]) || (control.getAttribute('id') ? el.querySelector('label[for="' + control.getAttribute('id') + '"]') : null);
      var text = label ? String(label.textContent || '').trim() : '';

      return text || control.getAttribute('aria-label') || control.getAttribute('name') || '';
    }

    function idOf(control) {
      if (!control.getAttribute('id')) attrs.set(control, 'id', 'gr-validate-' + (++seq));

      return control.getAttribute('id');
    }

    function unmark() {
      for (var i = 0; i < marked.length; i++) attrs.set(marked[i], 'aria-invalid', null);
      marked = [];
    }

    function render(failed) {
      clear(box);
      unmark();

      if (!failed.length) {
        attrs.set(box, 'hidden', '');
        return;
      }

      var title = element('p', 'gr-validate-title');
      var list = element('ul', 'gr-validate-list');

      title.textContent = o.title;

      for (var i = 0; i < failed.length; i++) {
        var item = element('li');
        var link = element('a', '', { href: '#' + idOf(failed[i]) });
        var label = labelOf(failed[i]);

        link.textContent = (label ? label + ': ' : '') + (failed[i].validationMessage || '');
        item.appendChild(link);
        list.appendChild(item);
        attrs.set(failed[i], 'aria-invalid', 'true');
        marked.push(failed[i]);
      }

      box.appendChild(title);
      box.appendChild(list);
      attrs.set(box, 'hidden', null);

      var first = list.querySelector('a');

      if (first && typeof first.focus === 'function') first.focus();
    }

    function check() {
      var all = controls();
      var failed = [];

      for (var i = 0; i < all.length; i++) if (invalid(all[i])) failed.push(all[i]);

      return failed;
    }

    function onSubmit(event) {
      var failed = check();

      render(failed);

      if (failed.length) event.preventDefault();
    }

    // Ссылка ведёт к полю фокусом: якорь сам по себе поле не откроет,
    // а у поля без id его и не было бы.
    function onClick(event) {
      var link = G.closest(event.target, 'a');
      var href = link ? link.getAttribute('href') || '' : '';

      if (!link || href.charAt(0) !== '#' || !box.contains(link)) return;

      var target = document.getElementById(href.slice(1));

      if (!target) return;

      event.preventDefault();
      if (typeof target.focus === 'function') target.focus();
    }

    // Исправленное поле теряет пометку сразу — ждать отправки незачем.
    function onInput(event) {
      var control = event.target;
      var at = marked.indexOf(control);

      if (at !== -1 && !invalid(control)) {
        attrs.set(control, 'aria-invalid', null);
        marked.splice(at, 1);
      }
    }

    events.add(el, 'submit', onSubmit);
    events.add(box, 'click', onClick);
    events.add(el, 'input', onInput);
    events.add(el, 'change', onInput);

    return {
      el: el,
      summary: box,
      check: function () { return check().slice(); },
      report: function () { render(check()); },
      destroy: function () {
        events.removeAll();
        clear(box);
        attrs.restore();

        if (created) box.remove();
      }
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
