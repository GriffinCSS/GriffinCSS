'use strict';

// Семейство прокрутки GriffinJS на мок-DOM: слайдер (кнопки, точки,
// автоплей с паузой), галерея (превью ведут дорожку), лайтбокс (окно
// строится из группы и уничтожается при закрытии).

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, track: build } = require('./helpers/griffinjs-dom');

const PARTS = [
  'core/options.js', 'core/registry.js', 'core/motion.js', 'core/track.js', 'engines/scroll.js',
  'widgets/slider.js', 'widgets/gallery.js', 'widgets/lightbox.js',
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Слайдер: корень с дорожкой из n слайдов, кнопками и контейнером точек.
function slider(doc, n, attrs = {}) {
  const { node: trackEl, slides } = build(doc, n, 100, { class: 'gr-track' });
  trackEl.remove();
  const prev = el('button', { 'data-gr-prev': '' });
  const next = el('button', { 'data-gr-next': '' });
  const dots = el('div', { 'data-gr-dots': '' });
  const root = mount(doc, el('div', Object.assign({ class: 'gr-slider' }, attrs), [trackEl, prev, next, dots]));
  return { root, trackEl, slides, prev, next, dots };
}

test('слайдер: aria carousel, точки по числу страниц, кнопки у краёв aria-disabled', () => {
  const { G, doc } = setup(PARTS);
  const s = slider(doc, 3, { 'data-gr-slider': '' });

  G.start();

  const w = G.instance(s.root, 'slider');

  assert.ok(w);
  assert.equal(s.root.getAttribute('aria-roledescription'), 'carousel');
  assert.equal(s.root.getAttribute('role'), 'region');
  assert.equal(s.root.getAttribute('data-gr-state'), 'ready');
  assert.equal(s.trackEl.getAttribute('aria-live'), 'polite');
  assert.equal(s.dots.children.length, 3);
  assert.equal(s.dots.children[0].getAttribute('aria-current'), 'true');
  assert.equal(s.dots.children[1].getAttribute('aria-label'), 'Страница 2');
  assert.equal(s.prev.getAttribute('aria-disabled'), 'true');
  assert.equal(s.next.hasAttribute('aria-disabled'), false);

  s.next.dispatchEvent(event('click', s.next));
  assert.equal(w.track.index, 1);
  assert.equal(s.dots.children[1].getAttribute('aria-current'), 'true');
  assert.equal(s.prev.hasAttribute('aria-disabled'), false);

  s.dots.children[2].dispatchEvent(event('click', s.dots.children[2]));
  assert.equal(w.track.index, 2);
  assert.equal(s.next.getAttribute('aria-disabled'), 'true');

  G.destroy();
});

test('автоплей: кнопка паузы создаётся, наведение держит, кнопка — фиксирует паузу', async () => {
  const { G, doc } = setup(PARTS);
  const s = slider(doc, 3, { 'data-gr-slider': 'autoplay: 60' });

  G.start();

  const w = G.instance(s.root, 'slider');
  const pauseBtn = s.root.querySelector('[data-gr-pause]');

  assert.ok(pauseBtn, 'кнопка паузы не создана');
  assert.equal(pauseBtn.getAttribute('aria-pressed'), 'false');
  assert.equal(s.trackEl.getAttribute('aria-live'), 'off');
  assert.equal(s.root.getAttribute('data-gr-state'), 'playing');
  assert.equal(w.playing(), true);

  await wait(90);
  assert.equal(w.track.index, 1, 'автоплей не перелистнул');
  assert.notEqual(pauseBtn.style.getPropertyValue('--gr-progress'), '', 'индикатор хода не пишется');

  s.root.dispatchEvent(event('pointerenter', s.root));
  assert.equal(w.playing(), false);
  assert.equal(s.root.getAttribute('data-gr-state'), 'paused');
  s.root.dispatchEvent(event('pointerleave', s.root));
  assert.equal(w.playing(), true);

  pauseBtn.dispatchEvent(event('click', pauseBtn));
  assert.equal(pauseBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(w.playing(), false);
  s.root.dispatchEvent(event('pointerleave', s.root));
  assert.equal(w.playing(), false, 'после нажатой паузы наведение не возобновляет');

  w.destroy();
  assert.equal(s.root.querySelector('[data-gr-pause]'), null, 'созданная кнопка не убрана');
  assert.equal(s.dots.children.length, 0, 'точки не убраны');
  assert.equal(s.root.hasAttribute('data-gr-state'), false);
  assert.equal(s.root.hasAttribute('aria-roledescription'), false);
});

test('автоплей без цикла с последнего слайда возвращается к первому', async () => {
  const { G, doc } = setup(PARTS);
  const s = slider(doc, 2, { 'data-gr-slider': 'autoplay: 40' });

  G.start();

  const w = G.instance(s.root, 'slider');

  await wait(60);
  assert.equal(w.track.index, 1);
  await wait(50);
  assert.equal(w.track.index, 0);

  // Тикер автоплея держит цикл событий: без destroy процесс тестов не завершится.
  G.destroy();
});

test('галерея: щелчок по превью ведёт дорожку, активное превью получает aria-current и подъезжает', () => {
  const { G, doc } = setup(PARTS);
  const { node: trackEl } = build(doc, 3, 100, { class: 'gr-track' });
  trackEl.remove();
  const thumbs = [el('button'), el('button'), el('button')];
  const thumbsEl = el('div', { class: 'gr-track gr-gallery-thumbs' }, thumbs);
  const root = mount(doc, el('div', { 'data-gr-gallery': '' }, [trackEl, thumbsEl]));

  // Полоса шириной в одно превью: третье — за правым краем.
  thumbsEl.at(0, 0, 100, 40);
  thumbs.forEach((t, i) => t.at(i * 100, 0, 100, 40));

  G.start();

  const g = G.instance(root, 'gallery');

  assert.ok(g);
  assert.equal(thumbs[0].getAttribute('aria-current'), 'true');
  assert.equal(thumbs[1].getAttribute('aria-label'), 'Слайд 2');

  thumbs[2].dispatchEvent(event('click', thumbs[2]));
  assert.equal(g.track.index, 2);
  assert.equal(thumbs[2].getAttribute('aria-current'), 'true');
  assert.equal(thumbs[0].hasAttribute('aria-current'), false);
  // Подъезжает сама полоса, по горизонтали; страница не трогается.
  assert.deepEqual(thumbsEl.scrollCalls.map((c) => c.left), [200]);
  assert.equal(thumbs[2].scrolledIntoView, undefined);

  g.destroy();
  assert.equal(thumbs[2].hasAttribute('aria-current'), false);
  assert.equal(thumbs[1].hasAttribute('aria-label'), false);
});

test('лайтбокс: группа по атрибуту, окно с дорожкой, счётчик, закрытие уничтожает окно', () => {
  const { G, doc } = setup(PARTS);
  const links = [
    el('a', { href: 'a.jpg', 'data-gr-lightbox': 'g', 'data-gr-caption': 'Первая' }, [el('img', { alt: 'А' })]),
    el('a', { href: 'b.mp4', 'data-gr-lightbox': 'g' }),
    el('a', { href: 'https://youtu.be/x', 'data-gr-lightbox': 'g' }),
    el('a', { href: 'solo.jpg', 'data-gr-lightbox': '' }),
  ];
  mount(doc, el('div', {}, links));

  G.start();

  const click = event('click', links[1]);
  doc.fire('click', click);

  assert.equal(click.defaultPrevented, true);

  const dialog = G.lightbox._dialog();

  assert.ok(dialog, 'окно не построено');
  assert.equal(dialog.parentNode, doc.body);
  assert.equal(dialog.hasAttribute('open'), true);
  // Клоны краёв цикла не считаются: смотрим только настоящие кадры.
  const real = (sel) => dialog.querySelectorAll(sel).filter((n) => !n.closest('[data-gr-clone]'));

  assert.equal(real('.gr-lightbox-item').length, 3);
  assert.equal(dialog.querySelector('.gr-lightbox-counter').textContent, '2 / 3');
  assert.equal(real('img').length, 1);
  assert.equal(real('video').length, 1);
  assert.equal(real('iframe').length, 1);
  assert.equal(real('.gr-lightbox-caption')[0].textContent, 'Первая');
  assert.equal(real('img')[0].getAttribute('alt'), 'А');

  const track = G.lightbox._track();
  assert.equal(track.index, 1);
  track.next();
  assert.equal(dialog.querySelector('.gr-lightbox-counter').textContent, '3 / 3');

  dialog.querySelector('.gr-lightbox-close').dispatchEvent(event('click', dialog.querySelector('.gr-lightbox-close')));
  assert.equal(G.lightbox._dialog(), null);
  assert.equal(doc.body.querySelector('dialog'), null);

  // Одиночный элемент — без дорожки и кнопок листания.
  doc.fire('click', event('click', links[3]));
  const solo = G.lightbox._dialog();
  assert.ok(solo);
  assert.equal(solo.querySelectorAll('.gr-lightbox-item').length, 1);
  assert.equal(solo.querySelector('.gr-lightbox-prev'), null);
  assert.equal(G.lightbox._track(), null);

  G.destroy();
  assert.equal(G.lightbox._dialog(), null, 'destroy слоя не закрыл окно');
});

test('лайтбокс: щелчок с модификатором отдаётся браузеру', () => {
  const { G, doc } = setup(PARTS);
  const link = mount(doc, el('a', { href: 'a.jpg', 'data-gr-lightbox': '' }));

  G.start();

  const click = event('click', link, { metaKey: true });
  doc.fire('click', click);

  assert.equal(click.defaultPrevented, false);
  assert.equal(G.lightbox._dialog(), null);
});

// Слайдер с несколькими слайдами в ряд: дорожка из n слайдов шириной 100, видно perView.
function wide(doc, n, perView, attrs = {}) {
  const { node: trackEl } = build(doc, n, 100, { class: 'gr-track' }, perView);
  trackEl.remove();
  const prev = el('button', { 'data-gr-prev': '' });
  const next = el('button', { 'data-gr-next': '' });
  const dots = el('div', { 'data-gr-dots': '' });
  const root = mount(doc, el('div', Object.assign({ class: 'gr-slider' }, attrs), [trackEl, prev, next, dots]));
  return { root, trackEl, prev, next, dots };
}

test('несколько в ряд: точек столько, сколько страниц, последняя ведёт к крайнему достижимому индексу', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 6, 4, { 'data-gr-slider': '' });

  G.start();

  const w = G.instance(s.root, 'slider');

  assert.equal(w.track.perView, 4);
  assert.equal(w.track.last, 2, 'дальше индекса 2 дорожка из 6 при 4 видимых не едет');
  assert.equal(s.dots.children.length, 3, 'точки — по страницам, не по слайдам');

  s.dots.children[2].dispatchEvent(event('click', s.dots.children[2]));
  assert.equal(w.track.index, 2);
  assert.equal(s.dots.children[2].getAttribute('aria-current'), 'true');
  assert.equal(s.next.getAttribute('aria-disabled'), 'true');
  assert.equal(w.track.goTo(5), false, 'недостижимый индекс — отказ');

  G.destroy();
});

test('step: page листает на число видимых, последняя страница короче шага', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 6, 4, { 'data-gr-slider': 'step: page' });

  G.start();

  const w = G.instance(s.root, 'slider');

  assert.equal(w.track.step, 4);
  assert.equal(w.track.pages, 2);
  assert.equal(s.dots.children.length, 2);

  s.next.dispatchEvent(event('click', s.next));
  assert.equal(w.track.index, 2, 'шаг 4 упирается в крайний индекс 2');
  assert.equal(s.dots.children[1].getAttribute('aria-current'), 'true');
  assert.equal(w.next(), false);

  s.prev.dispatchEvent(event('click', s.prev));
  assert.equal(w.track.index, 0);

  G.destroy();
});

test('rewind: с последней страницы — на первую и обратно, кнопки не блокируются', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 5, 2, { 'data-gr-slider': 'step: page; rewind' });

  G.start();

  const w = G.instance(s.root, 'slider');

  assert.equal(w.track.last, 3);
  assert.equal(w.track.pages, 3, 'страницы: 0, 2, 3');
  assert.equal(s.next.hasAttribute('aria-disabled'), false);

  w.next(); w.next();
  assert.equal(w.track.index, 3);
  assert.equal(s.next.hasAttribute('aria-disabled'), false);
  w.next();
  assert.equal(w.track.index, 0, 'rewind вернул к началу без клонов');
  w.prev();
  assert.equal(w.track.index, 3, 'rewind назад — на последнюю страницу');

  G.destroy();
});

test('смена геометрии перестраивает точки', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 6, 1, { 'data-gr-slider': '' });

  G.start();

  const w = G.instance(s.root, 'slider');
  assert.equal(s.dots.children.length, 6);

  // Экран стал шире: четыре в ряд.
  s.trackEl.clientWidth = 400;
  s.trackEl.at(0, 0, 400, 100);
  w.track.refresh();

  assert.equal(w.track.perView, 4);
  assert.equal(s.dots.children.length, 3);
  assert.equal(s.dots.children[0].getAttribute('aria-current'), 'true');

  G.destroy();
});

test('снап-точки совпадают со страницами: --gr-snap start у начал страниц, end у последнего', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 5, 2, { 'data-gr-slider': 'step: page' });

  G.start();

  const w = G.instance(s.root, 'slider');
  const snaps = () => w.track.slides.map((n) => n.style.getPropertyValue('--gr-snap'));

  assert.equal(w.track.last, 3);
  assert.deepEqual(snaps(), ['start', 'none', 'start', 'none', 'end'], 'страницы 0, 2 и конец');

  // Стало видно по одному — шаг страницы равен слайду, и свойство снимается:
  // снап на каждом слайде даёт умолчание в CSS.
  s.trackEl.clientWidth = 100;
  s.trackEl.at(0, 0, 100, 100);
  w.track.refresh();
  assert.equal(w.track.step, 1);
  assert.deepEqual(snaps(), ['', '', '', '', '']);

  w.destroy();
  assert.deepEqual(snaps(), ['', '', '', '', ''], 'destroy снял --gr-snap');

  G.destroy();
});

test('при шаге 1 --gr-snap не пишется', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 4, 2, { 'data-gr-slider': '' });

  G.start();

  const w = G.instance(s.root, 'slider');
  assert.deepEqual(w.track.slides.map((n) => n.style.getPropertyValue('--gr-snap')), ['', '', '', '']);

  G.destroy();
});

test('страницы с остатком: назад с последней — на начало предыдущей, goTo мимо страницы — к её началу', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 5, 2, { 'data-gr-slider': 'step: page; rewind' });

  G.start();

  const w = G.instance(s.root, 'slider');
  const t = w.track;

  assert.equal(t.pages, 3, 'страницы 0, 2, 3(конец)');

  w.next(); w.next();
  assert.equal(t.index, 3, 'последняя страница выровнена к концу');

  w.prev();
  assert.equal(t.index, 2, 'назад — на начало предыдущей страницы, а не на 3 − 2 = 1');
  w.prev();
  assert.equal(t.index, 0);
  w.prev();
  assert.equal(t.index, 3, 'rewind назад — на последнюю страницу');

  w.goTo(1);
  assert.equal(t.index, 2, 'индекс без снап-точки приведён к ближайшей странице');
  assert.equal(w.goTo(4), false, 'за крайним индексом — отказ, как и раньше');
  w.goTo(3);
  assert.equal(t.index, 3);

  G.destroy();
});

test('остаток в один слайд при трёх в ряд: вперёд идёт на конец, назад — на предыдущую страницу', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 7, 3, { 'data-gr-slider': 'step: page' });

  G.start();

  const w = G.instance(s.root, 'slider');
  const t = w.track;

  assert.equal(t.last, 4);
  assert.equal(t.pages, 3, 'страницы 0, 3, 4(конец)');
  assert.deepEqual(t.slides.map((n) => n.style.getPropertyValue('--gr-snap')), ['start', 'none', 'none', 'start', 'none', 'none', 'end']);

  assert.equal(w.next(), true); assert.equal(t.index, 3);
  assert.equal(w.next(), true); assert.equal(t.index, 4);
  assert.equal(s.next.getAttribute('aria-disabled'), 'true');
  assert.equal(w.next(), false, 'без rewind у края — отказ');
  assert.equal(w.prev(), true); assert.equal(t.index, 3);
  assert.equal(w.prev(), true); assert.equal(t.index, 0);
  assert.equal(s.prev.getAttribute('aria-disabled'), 'true');

  G.destroy();
});

test('при шаге 1 next/prev по-прежнему идут на один слайд', () => {
  const { G, doc } = setup(PARTS);
  const s = wide(doc, 5, 2, { 'data-gr-slider': '' });

  G.start();

  const w = G.instance(s.root, 'slider');

  w.next(); w.next(); w.next();
  assert.equal(w.track.index, 3);
  w.prev();
  assert.equal(w.track.index, 2);

  G.destroy();
});

test('автоплей пропускает такт, пока дорожка едет', async () => {
  const { G, doc } = setup(PARTS);
  const s = slider(doc, 3, { 'data-gr-slider': 'autoplay: 40' });
  s.trackEl.scrollTo = (opts) => { s.trackEl.scrollCalls.push({ left: opts.left, behavior: opts.behavior }); };

  G.start();

  const w = G.instance(s.root, 'slider');

  await wait(60);
  assert.equal(w.track.index, 1, 'первый такт принят');
  await wait(50);
  assert.equal(w.track.index, 1, 'второй пропущен: дорожка так и не доехала');

  G.destroy();
});
