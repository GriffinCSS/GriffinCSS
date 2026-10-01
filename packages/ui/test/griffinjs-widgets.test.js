'use strict';

// Семейство прокрутки GriffinJS на мок-DOM: слайдер (кнопки, точки,
// автоплей с паузой), галерея (превью ведут дорожку), лайтбокс (окно
// строится из группы и уничтожается при закрытии).

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, el, mount, event, track: build, ORIGIN } = require('./helpers/griffinjs-dom');

// Origin страницы под тестом: запись 'self' списка кадров сверяется с ним.
global.location = { origin: ORIGIN };

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
    // Во фрейм встаёт только плеер: короткая ссылка youtu.be и страница
    // ролика отдают X-Frame-Options и в окне не играют.
    el('a', { href: 'https://www.youtube.com/embed/x', 'data-gr-lightbox': 'g' }),
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

// Кадр открытого окна: что встало и с каким адресом.
function frameOf(G, doc, link) {
  doc.fire('click', event('click', link));

  const item = G.lightbox._dialog().querySelector('.gr-lightbox-item');
  const media = item.children[0];
  const out = { tag: media.tagName.toLowerCase(), src: media.getAttribute('src') };

  G.lightbox.close();

  return out;
}

test('лайтбокс: data-gr-src — адрес кадра, href остаётся ссылкой без скрипта', () => {
  const { G, doc } = setup(PARTS);
  const video = (href, src) => el('a', { href, 'data-gr-src': src, 'data-gr-lightbox': '' });
  const rutube = video('https://rutube.ru/video/0a1b2c/', 'https://rutube.ru/play/embed/0a1b2c');
  const vk = video('https://vkvideo.ru/video-1_2', 'https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=f00d');
  const youtube = video('https://www.youtube.com/watch?v=x', 'https://www.youtube.com/embed/x');
  mount(doc, el('div', {}, [rutube, vk, youtube]));

  G.start();

  assert.deepEqual(frameOf(G, doc, rutube), { tag: 'iframe', src: 'https://rutube.ru/play/embed/0a1b2c' });
  assert.deepEqual(frameOf(G, doc, vk), { tag: 'iframe', src: 'https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=f00d' });
  assert.deepEqual(frameOf(G, doc, youtube), { tag: 'iframe', src: 'https://www.youtube.com/embed/x' });
  assert.equal(rutube.getAttribute('href'), 'https://rutube.ru/video/0a1b2c/', 'ссылка без скрипта не тронута');
});

test('лайтбокс: плеер Rutube и VK Видео без data-gr-type угадывается как iframe', () => {
  const { G, doc } = setup(PARTS);
  const links = [
    'https://rutube.ru/play/embed/0a1b2c',
    'https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=f00d',
    'https://vk.com/video_ext.php?oid=-1&id=2&hash=f00d',
  ].map((src) => el('button', { type: 'button', 'data-gr-src': src, 'data-gr-lightbox': '' }));
  mount(doc, el('div', {}, links));

  G.start();

  for (const link of links) assert.equal(frameOf(G, doc, link).tag, 'iframe', link.getAttribute('data-gr-src'));
});

test('лайтбокс: без data-gr-src кадр — по href, а явный data-gr-type старше угадывания', () => {
  const { G, doc } = setup(PARTS);
  const photo = el('a', { href: 'photo.jpg', 'data-gr-lightbox': '' });
  const stream = el('a', { href: 'https://cdn.example.com/stream/7', 'data-gr-type': 'video', 'data-gr-lightbox': '' });
  const typed = el('a', { href: '#', 'data-gr-src': 'https://rutube.ru/play/embed/0a1b2c', 'data-gr-type': 'image', 'data-gr-lightbox': '' });
  mount(doc, el('div', {}, [photo, stream, typed]));

  G.start();

  assert.deepEqual(frameOf(G, doc, photo), { tag: 'img', src: 'photo.jpg' });
  assert.deepEqual(frameOf(G, doc, stream), { tag: 'video', src: 'https://cdn.example.com/stream/7' });
  assert.deepEqual(frameOf(G, doc, typed), { tag: 'img', src: 'https://rutube.ru/play/embed/0a1b2c' });
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

// Предупреждения слоя за время fn().
function warnings(fn) {
  const said = [];
  const before = console.warn;

  console.warn = (message) => said.push(String(message));

  try { fn(); } finally { console.warn = before; }

  return said;
}

test('лайтбокс: кадр — по http(s), относительному, data: и blob:; javascript: кадр не открывает, щелчок остаётся браузеру', () => {
  const { G, doc } = setup(PARTS);
  const allowed = [
    'https://cdn.example.com/p.jpg',
    'photo.jpg',
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
    'blob:https://example.com/0a1b2c',
  ].map((src) => [src, el('a', { href: '#', 'data-gr-src': src, 'data-gr-lightbox': '' })]);
  const refused = [
    // Случаи из разбора: тип задан явно — и угадан по имени хостинга в хвосте.
    ["javascript:parent.document.title='XSS'", { 'data-gr-type': 'iframe' }],
    ['javascript:parent.document.body.dataset.xss=1//rutube.ru', {}],
    // Разбор адреса по правилам браузера: регистр, пробел впереди, таб внутри схемы.
    [' JaVaScRiPt:alert(1)', { 'data-gr-type': 'iframe' }],
    ['java\tscript:alert(1)', { 'data-gr-type': 'iframe' }],
  ].map(([src, attrs]) => [src, el('a', Object.assign({ href: 'https://rutube.ru/video/abc/', 'data-gr-src': src, 'data-gr-lightbox': '' }, attrs))]);
  // Без data-gr-src адрес кадра — href, и правило то же.
  const byHref = el('a', { href: 'javascript:alert(1)', 'data-gr-type': 'iframe', 'data-gr-lightbox': '' });
  refused.push(['javascript:alert(1)', byHref]);
  mount(doc, el('div', {}, allowed.concat(refused).map(([, node]) => node)));

  G.start();

  for (const [src, node] of allowed) assert.equal(frameOf(G, doc, node).src, src);

  for (const [src, node] of refused) {
    const click = event('click', node);
    const said = warnings(() => doc.fire('click', click));

    assert.equal(G.lightbox._dialog(), null, `окно открылось: ${JSON.stringify(src)}`);
    assert.equal(click.defaultPrevented, false, `щелчок отменён: ${JSON.stringify(src)}`);
    assert.ok(said.some((m) => m.includes(src)), `нет предупреждения с адресом: ${JSON.stringify(src)}`);
  }

  G.destroy();
});

test('лайтбокс: кадр группы с отвергнутым адресом выпадает, счётчик считает оставшиеся', () => {
  const { G, doc } = setup(PARTS);
  const links = [
    el('a', { href: 'a.jpg', 'data-gr-lightbox': 'g' }),
    el('a', { href: '#', 'data-gr-src': 'javascript:alert(1)', 'data-gr-type': 'iframe', 'data-gr-lightbox': 'g' }),
    el('a', { href: 'c.jpg', 'data-gr-lightbox': 'g' }),
  ];
  mount(doc, el('div', {}, links));

  G.start();

  const said = warnings(() => doc.fire('click', event('click', links[2])));
  const dialog = G.lightbox._dialog();
  const real = (sel) => dialog.querySelectorAll(sel).filter((n) => !n.closest('[data-gr-clone]'));

  assert.ok(dialog, 'окно не построено');
  assert.equal(real('.gr-lightbox-item').length, 2);
  assert.equal(real('iframe').length, 0);
  assert.deepEqual(real('img').map((n) => n.getAttribute('src')), ['a.jpg', 'c.jpg']);
  assert.equal(dialog.querySelector('.gr-lightbox-counter').textContent, '2 / 2');
  assert.equal(G.lightbox._track().index, 1, 'открыт не тот кадр');
  assert.ok(said.some((m) => m.includes('javascript:alert(1)')));

  G.destroy();
});

// Два отвергнутых кадра: номер открываемого сверяется с исходным номером
// в группе, а не со сдвинутым — иначе окно встаёт на чужой кадр или
// отвергнутый открываемый не узнаётся.
test('лайтбокс: два отвергнутых кадра в группе — окно на своём кадре или окна нет', () => {
  const { G, doc } = setup(PARTS);
  const js = { src: 'javascript:alert(1)', type: 'image' };
  const img = (src) => ({ src, type: 'image' });
  const shown = () => {
    const dialog = G.lightbox._dialog();

    if (!dialog) return null;

    const track = G.lightbox._track();
    const real = dialog.querySelectorAll('img').filter((n) => !n.closest('[data-gr-clone]'));
    const counter = dialog.querySelector('.gr-lightbox-counter');

    return { src: real[track ? track.index : 0].getAttribute('src'), n: real.length, counter: counter ? counter.textContent : null };
  };
  const run = (items, index) => {
    let result;

    warnings(() => { result = G.lightbox.open(items, index); });

    const out = { result: result ? 'api' : result, shown: shown() };

    G.lightbox.close();

    return out;
  };

  G.start();

  assert.deepEqual(run([js, img('a.jpg'), js], 2), { result: null, shown: null }, '[js, a, js] открыть 2');
  assert.deepEqual(run([js, img('a.jpg'), img('b.jpg'), js, img('c.jpg')], 3), { result: null, shown: null }, '[js, a, b, js, c] открыть 3');
  assert.deepEqual(run([js, js, img('a.jpg')], 2), { result: 'api', shown: { src: 'a.jpg', n: 1, counter: null } }, '[js, js, a] открыть 2');
  assert.deepEqual(run([js, img('a.jpg'), js, img('b.jpg')], 3), { result: 'api', shown: { src: 'b.jpg', n: 2, counter: '2 / 2' } }, '[js, a, js, b] открыть 3');

  G.destroy();
});

test('лайтбокс: щелчок по отвергнутому кадру в группе с двумя отвергнутыми остаётся ссылке', () => {
  const { G, doc } = setup(PARTS);
  const bad = (n) => el('a', { href: '#bad-' + n, 'data-gr-src': 'javascript:alert(' + n + ')', 'data-gr-lightbox': 'g' });
  const links = [bad(1), el('a', { href: 'a.jpg', 'data-gr-lightbox': 'g' }), bad(2)];
  mount(doc, el('div', {}, links));

  G.start();

  const click = event('click', links[2]);

  warnings(() => doc.fire('click', click));

  assert.equal(G.lightbox._dialog(), null, 'окно открылось на чужом кадре');
  assert.equal(click.defaultPrevented, false, 'щелчок отменён');

  G.destroy();
});

// Адрес из кода проверяется и пишется одной строкой: объект с toString,
// отдающим разное, проверку прошёл бы безопасной строкой, а в атрибут
// лёг бы другой.
test('лайтбокс: open() из кода — адрес приводится к строке один раз', () => {
  const { G } = setup(PARTS);
  let calls = 0;
  const src = { toString() { calls++; return calls === 1 ? 'b.jpg' : 'javascript:alert(1)'; } };
  const items = [{ src, type: 'image' }];

  G.start();
  warnings(() => G.lightbox.open(items));

  const dialog = G.lightbox._dialog();

  assert.ok(dialog, 'окно не построено');
  assert.equal(dialog.querySelector('img').getAttribute('src'), 'b.jpg', 'в атрибут лёг не проверенный адрес');
  assert.equal(items[0].src, src, 'описание кадра вызывающего изменено');

  G.destroy();
});

test('лайтбокс: open() из кода — то же правило адреса', () => {
  const { G, doc } = setup(PARTS);

  G.start();

  assert.equal(G.lightbox.open([]), null, 'пустой набор кадров построил окно');
  assert.equal(G.lightbox._dialog(), null);

  let result;
  warnings(() => { result = G.lightbox.open([{ src: 'javascript:alert(1)', type: 'iframe' }]); });
  assert.equal(result, null);
  assert.equal(G.lightbox._dialog(), null);

  warnings(() => G.lightbox.open([{ src: 'javascript:alert(1)', type: 'iframe' }, { src: 'b.jpg', type: 'image' }], 1));
  const dialog = G.lightbox._dialog();

  assert.ok(dialog, 'окно не построено');
  assert.equal(dialog.querySelectorAll('.gr-lightbox-item').length, 1);
  assert.equal(dialog.querySelector('iframe'), null);
  assert.equal(dialog.querySelector('img').getAttribute('src'), 'b.jpg');

  G.destroy();
  assert.equal(doc.body.querySelector('dialog'), null);
});

test('лайтбокс: плеер угадывается по хосту адреса, а не по подстроке', () => {
  const { G, doc } = setup(PARTS);
  const cases = {
    'https://example.com/uploads/rutube.ru-logo.png': 'img',
    'https://rutube.ru.example.com/play/embed/1': 'img',
    'https://evilyoutube.com/embed/x': 'img',
    'https://player.vimeo.com/video/1': 'iframe',
    'https://m.vk.com/video_ext.php?oid=-1&id=2&hash=f00d': 'iframe',
  };
  const links = Object.keys(cases).map((src) => el('button', { type: 'button', 'data-gr-src': src, 'data-gr-lightbox': '' }));
  mount(doc, el('div', {}, links));

  G.start();

  for (const link of links) {
    const src = link.getAttribute('data-gr-src');

    assert.equal(frameOf(G, doc, link).tag, cases[src], src);
  }

  G.destroy();
});

// Имя группы из данных не склеивается в селектор: кавычка роняла
// querySelectorAll, подобранное имя собирало в группу чужие ссылки.
test('лайтбокс: имя группы с кавычкой — группа только из своих ссылок', () => {
  const { G, doc } = setup(PARTS);
  const name = 'a"b';
  const links = [
    el('a', { href: 'a.jpg', 'data-gr-lightbox': name }),
    el('a', { href: 'b.jpg', 'data-gr-lightbox': name }),
    el('a', { href: 'c.jpg', 'data-gr-lightbox': 'a' }),
  ];
  mount(doc, el('div', {}, links));

  G.start();

  const click = event('click', links[1]);

  assert.doesNotThrow(() => doc.fire('click', click));

  const dialog = G.lightbox._dialog();
  const real = dialog.querySelectorAll('img').filter((n) => !n.closest('[data-gr-clone]'));

  assert.deepEqual(real.map((n) => n.getAttribute('src')), ['a.jpg', 'b.jpg']);
  assert.equal(click.defaultPrevented, true);

  G.destroy();
});

// --- кадры лайтбокса: список GriffinJS.config.frames и песочница ------------

const DEFAULT_FRAMES = ['self', 'youtube.com', 'youtu.be', 'vimeo.com', 'rutube.ru', 'vkvideo.ru', 'vk.com/video'];
// allow-presentation не входит: WebKit считает его неизвестным и пишет ошибку
// в консоль на каждый кадр, а плеерам он по замеру не нужен.
const SANDBOX = ['allow-scripts', 'allow-popups', 'allow-popups-to-escape-sandbox'];

// Щелчок по ссылке: что открылось (кадр и его песочница) или что щелчок остался ссылке.
function openLink(G, doc, link) {
  const click = event('click', link);
  const said = warnings(() => doc.fire('click', click));
  const dialog = G.lightbox._dialog();
  const media = dialog ? dialog.querySelector('.gr-lightbox-item').children[0] : null;
  const out = {
    tag: media ? media.tagName.toLowerCase() : null,
    sandbox: media && media.hasAttribute('sandbox') ? media.getAttribute('sandbox').split(/\s+/).sort() : null,
    prevented: click.defaultPrevented,
    said,
  };

  G.lightbox.close();

  return out;
}

const frameLink = (src, attrs = {}) => el('a', Object.assign({ href: '#page', 'data-gr-src': src, 'data-gr-type': 'iframe', 'data-gr-lightbox': '' }, attrs));

test('кадры: список по умолчанию — свой сайт и плееры четырёх хостингов', () => {
  const { G } = setup(PARTS);

  assert.deepEqual(G.config.frames, DEFAULT_FRAMES);
});

test('кадры: хост списка — фрейм в песочнице с allow-same-origin; свой сайт (self) — без него; allow-top-navigation — никогда', () => {
  const { G, doc } = setup(PARTS);
  const player = frameLink('https://www.youtube.com/embed/x');
  const own = frameLink('/player/1.html');
  mount(doc, el('div', {}, [player, own]));

  G.start();

  const a = openLink(G, doc, player);
  const b = openLink(G, doc, own);

  assert.equal(a.tag, 'iframe');
  assert.deepEqual(a.sandbox, [...SANDBOX, 'allow-same-origin'].sort(), 'песочница хоста списка');
  assert.equal(b.tag, 'iframe');
  assert.deepEqual(b.sandbox, [...SANDBOX].sort(), 'свой адрес получил allow-same-origin');

  for (const r of [a, b]) assert.ok(!r.sandbox.some((t) => t.startsWith('allow-top-navigation')), 'кадр может увести вкладку');

  G.destroy();
});

test('кадры: data-gr-type="iframe" с адресом вне списка — отказ, щелчок остаётся ссылке, в группе кадр выпадает', () => {
  const { G, doc } = setup(PARTS);
  const foreign = frameLink('https://evil.example/player.html');
  const data = frameLink('data:text/html,<p>форма входа</p>');
  const blob = frameLink('blob:https://example.com/0a1b2c');
  const group = [
    el('a', { href: 'a.jpg', 'data-gr-lightbox': 'g' }),
    frameLink('https://evil.example/player.html', { 'data-gr-lightbox': 'g' }),
    el('a', { href: 'c.jpg', 'data-gr-lightbox': 'g' }),
  ];
  mount(doc, el('div', {}, [foreign, data, blob, ...group]));

  G.start();

  for (const [link, src] of [[foreign, 'https://evil.example/player.html'], [data, 'data:text/html'], [blob, 'blob:']]) {
    const r = openLink(G, doc, link);

    assert.equal(r.tag, null, `окно открылось: ${src}`);
    assert.equal(r.prevented, false, `щелчок отменён: ${src}`);
    assert.ok(r.said.some((m) => m.includes(src) && m.includes('GriffinJS.config.frames')), `нет предупреждения: ${src}\n${r.said.join('\n')}`);
  }

  warnings(() => doc.fire('click', event('click', group[2])));

  const dialog = G.lightbox._dialog();
  const real = dialog.querySelectorAll('.gr-lightbox-item').filter((n) => !n.closest('[data-gr-clone]'));

  assert.equal(real.length, 2, 'кадр вне списка остался в группе');
  assert.equal(dialog.querySelector('iframe'), null);

  G.destroy();
});

test('кадры: push расширяет список, присваивание заменяет, пустой массив — фреймов нет', () => {
  const { G, doc } = setup(PARTS);
  const custom = frameLink('https://player.example.ru/embed/7');
  const sub = frameLink('https://cdn.player.example.ru/embed/7');
  const youtube = frameLink('https://www.youtube.com/embed/x');
  const own = frameLink('/player/1.html');
  mount(doc, el('div', {}, [custom, sub, youtube, own]));

  G.start();

  assert.equal(openLink(G, doc, custom).tag, null, 'хост вне списка открылся');

  G.config.frames.push('player.example.ru');
  assert.equal(openLink(G, doc, custom).tag, 'iframe', 'push не расширил список');
  assert.equal(openLink(G, doc, sub).tag, 'iframe', 'поддомен записи не вошёл');
  assert.ok(openLink(G, doc, custom).sandbox.includes('allow-same-origin'));

  G.config.frames = ['self', 'player.example.ru'];
  assert.equal(openLink(G, doc, youtube).tag, null, 'присваивание не заменило список');
  assert.equal(openLink(G, doc, custom).tag, 'iframe');
  assert.equal(openLink(G, doc, own).tag, 'iframe');

  G.config.frames = ['player.example.ru'];
  assert.equal(openLink(G, doc, own).tag, null, 'без self свой адрес открылся фреймом');

  G.config.frames = [];
  for (const link of [custom, youtube, own]) assert.equal(openLink(G, doc, link).tag, null, 'пустой список открыл фрейм');

  G.destroy();
});

test('кадры: запись с путём — только начало пути; хост сверяется целиком, а не подстрокой', () => {
  const { G, doc } = setup(PARTS);
  const cases = {
    'https://vk.com/video_ext.php?oid=-1&id=2&hash=f00d': 'iframe',
    'https://m.vk.com/video_ext.php?oid=-1&id=2&hash=f00d': 'iframe',
    'https://vk.com/wall-1_2': null,
    'https://evilyoutube.com/embed/x': null,
    'https://youtube.com.evil.example/embed/x': null,
    'https://evil.example/www.youtube.com/embed/x': null,
  };
  const links = Object.keys(cases).map((src) => [src, frameLink(src)]);
  mount(doc, el('div', {}, links.map(([, n]) => n)));

  G.start();

  for (const [src, link] of links) assert.equal(openLink(G, doc, link).tag, cases[src], src);

  G.destroy();
});

test('кадры: без data-gr-type фреймом угадываются хосты списка, но не свой сайт', () => {
  const { G, doc } = setup(PARTS);
  const guess = (src) => el('a', { href: '#', 'data-gr-src': src, 'data-gr-lightbox': '' });
  const player = guess('https://player.example.ru/embed/7');
  const own = guess('/player/1.html');
  mount(doc, el('div', {}, [player, own]));

  G.start();

  assert.equal(openLink(G, doc, player).tag, 'img', 'хост вне списка угадан фреймом');

  G.config.frames.push('player.example.ru');
  assert.equal(openLink(G, doc, player).tag, 'iframe', 'хост из списка не угадан');
  assert.equal(openLink(G, doc, own).tag, 'img', 'свой адрес угадан фреймом');

  G.destroy();
});

// Страница с диска: у неё и у её файлов origin непрозрачный ('null'),
// и своё узнаётся по протоколу file: — иначе с диска не открылся бы ни
// один свой кадр (демо документации). data: и blob: — по-прежнему нет.
test('кадры: страница с диска — свои файлы по записи self, в песочнице без allow-same-origin', () => {
  const { G, doc } = setup(PARTS);
  const own = frameLink('fragments/player-1.html');
  const data = frameLink('data:text/html,<p>форма входа</p>');
  const saved = global.location;

  doc.baseURI = 'file:///Users/me/site/docs/page.html';
  global.location = { origin: 'null', protocol: 'file:' };
  mount(doc, el('div', {}, [own, data]));

  try {
    G.start();

    const r = openLink(G, doc, own);

    assert.equal(r.tag, 'iframe', 'свой файл с диска не открылся кадром');
    assert.deepEqual(r.sandbox, [...SANDBOX].sort());
    assert.equal(openLink(G, doc, data).tag, null, 'data: открылся кадром');

    G.config.frames = ['youtube.com'];
    assert.equal(openLink(G, doc, own).tag, null, 'без self свой файл открылся');

    // Картинка по относительному адресу с диска — тоже file:.
    const photo = el('a', { href: 'photo.jpg', 'data-gr-lightbox': '' });

    mount(doc, photo);
    assert.deepEqual(frameOf(G, doc, photo), { tag: 'img', src: 'photo.jpg' }, 'картинка с диска не открылась');
  } finally {
    global.location = saved;
    G.destroy();
  }
});

test('кадры: страница по http — адрес file: кадром не открывается', () => {
  const { G, doc } = setup(PARTS);
  const local = frameLink('file:///Users/me/player.html');
  mount(doc, el('div', {}, [local]));

  G.start();

  assert.equal(openLink(G, doc, local).tag, null);

  G.destroy();
});

test('кадры: open() из кода — то же правило списка', () => {
  const { G } = setup(PARTS);

  G.start();

  let result;
  const said = warnings(() => { result = G.lightbox.open([{ src: 'https://evil.example/p.html', type: 'iframe' }]); });

  assert.equal(result, null);
  assert.ok(said.some((m) => m.includes('https://evil.example/p.html')));

  G.lightbox.open([{ src: 'https://player.vimeo.com/video/1', type: 'iframe' }]);
  assert.ok(G.lightbox._dialog().querySelector('iframe').getAttribute('sandbox').includes('allow-same-origin'));

  G.destroy();
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
