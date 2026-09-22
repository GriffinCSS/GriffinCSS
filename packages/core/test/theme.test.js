'use strict';

// Поведение рантайма темы на мок-DOM: атрибуты, хранилище, системная
// настройка, событие смены и защита от затирания глобала.
//
// setupThemeDom объявляет window и document до require, поэтому рантайм
// считает окружение браузерным и вызывает _autoStart() сам — как на живой
// странице. Тесты, зовущие start() следом, опираются на его идемпотентность.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { setupThemeDom, el } = require('./helpers/dom');

const PKG = require('../package.json');
const SRC = path.join(__dirname, '..', 'src');
const THEME_SRC = readFileSync(path.join(SRC, 'griffincss-theme.js'), 'utf8');

test('версия рантайма темы совпадает с версией пакета', () => {
  const { theme } = setupThemeDom();

  assert.equal(theme.version, PKG.version);
  assert.ok(THEME_SRC.includes('v' + PKG.version), 'версия в шапке файла тоже обновлена');
});

test('set("dark") ставит атрибут и запоминает выбор', () => {
  const { doc, theme, storage } = setupThemeDom();

  theme.set('dark');

  assert.equal(doc.documentElement.getAttribute('data-gr-theme'), 'dark');
  assert.equal(storage.items.get('gr-theme'), 'dark');
  assert.equal(theme.get().resolved, 'dark');
});

test('set("auto") снимает атрибут, тема берётся у системы', () => {
  const { doc, theme, storage } = setupThemeDom({ dark: true, stored: { 'gr-theme': 'light' } });

  theme.set('auto');

  assert.equal(doc.documentElement.getAttribute('data-gr-theme'), null);
  assert.equal(storage.items.has('gr-theme'), false, 'сохранённый выбор снят вместе с атрибутом');
  assert.deepEqual(
    { theme: theme.get().theme, resolved: theme.get().resolved },
    { theme: 'auto', resolved: 'dark' },
  );
});

test('toggle из auto отталкивается от вычисленной темы', () => {
  const { theme } = setupThemeDom({ dark: true });

  const after = theme.toggle();

  assert.equal(after.theme, 'light', 'система тёмная — переключатель обязан дать светлую');
});

test('a11y(true) включает режим, a11y("auto") возвращает системе', () => {
  const { doc, theme } = setupThemeDom({ contrast: true });

  theme.a11y(true);
  assert.equal(doc.documentElement.getAttribute('data-gr-a11y'), 'low-vision');

  theme.a11y('auto');
  assert.equal(doc.documentElement.getAttribute('data-gr-a11y'), null);
  assert.equal(theme.get().resolvedA11y, 'contrast', 'системный контраст даёт контраст, но не кегль');
});

test('a11y(false) отключает режим явно — системная настройка не действует', () => {
  const { doc, theme } = setupThemeDom({ contrast: true });

  theme.a11y(false);

  assert.equal(doc.documentElement.getAttribute('data-gr-a11y'), 'off');
  assert.equal(theme.get().resolvedA11y, 'off');
});

test('смена системной темы стреляет событием только при выборе auto', () => {
  const { doc, theme, media } = setupThemeDom();
  const seen = [];

  doc.addEventListener('griffincss:themechange', (e) => seen.push(e.detail.resolved));

  media['(prefers-color-scheme: dark)'].change(true);
  assert.deepEqual(seen, ['dark'], 'выбор отдан системе — событие обязано прийти');

  theme.set('light');
  seen.length = 0;
  media['(prefers-color-scheme: dark)'].change(false);

  assert.deepEqual(seen, [], 'тема выбрана явно — системные изменения ничего не меняют');
});

test('повторный start() не удваивает подписку на системную настройку', () => {
  const { doc, theme, media } = setupThemeDom();
  const seen = [];

  doc.addEventListener('griffincss:themechange', (e) => seen.push(e.detail.resolved));
  theme.start();
  theme.start();

  media['(prefers-color-scheme: dark)'].change(true);

  assert.deepEqual(seen, ['dark'], 'событие пришло дважды — подписка задвоилась');
});

test('недоступное хранилище не ломает переключение', () => {
  const { doc, theme } = setupThemeDom({ brokenStorage: true });

  theme.set('dark');

  assert.equal(doc.documentElement.getAttribute('data-gr-theme'), 'dark', 'выбор живёт до перезагрузки');
});

test('data-persist="false" отключает запоминание', () => {
  const script = el('script', { 'data-persist': 'false' });
  const { theme, storage } = setupThemeDom({ script });

  theme.set('dark');

  assert.equal(storage.items.size, 0, 'выбор не должен был попасть в хранилище');
});

test('старт применяет сохранённый выбор, при пустом хранилище уважает разметку', () => {
  const saved = setupThemeDom({ stored: { 'gr-theme': 'dark', 'gr-a11y': 'low-vision' } });

  assert.equal(saved.doc.documentElement.getAttribute('data-gr-theme'), 'dark');
  assert.equal(saved.doc.documentElement.getAttribute('data-gr-a11y'), 'low-vision');

  const server = setupThemeDom({ attrs: { 'data-gr-theme': 'light' } });

  assert.equal(server.doc.documentElement.getAttribute('data-gr-theme'), 'light');
});

test('глобал не затирается при любом порядке подключения рантаймов', () => {
  const gridSrc = readFileSync(path.join(SRC, 'griffincss.js'), 'utf8');

  assert.ok(
    !/window\.Griffincss\s*=\s*api/.test(gridSrc),
    'грид-рантайм присваивает глобал целиком — тема, подключённая раньше, потеряется',
  );
  assert.ok(
    !/window\.Griffincss\s*=\s*api/.test(THEME_SRC),
    'рантайм темы присваивает глобал целиком — грид, подключённый раньше, потеряется',
  );
});

// --- Третья ось: стратегия оформления ---------------------------------------

test('style("strict") ставит атрибут и запоминает выбор', () => {
  const { doc, theme, storage } = setupThemeDom();

  theme.style('strict');

  assert.equal(doc.documentElement.getAttribute('data-gr-style'), 'strict');
  assert.equal(storage.items.get('gr-style'), 'strict');
  assert.equal(theme.get().style, 'strict');
});

test('style("standard") снимает атрибут вместе с сохранённым выбором', () => {
  const { doc, theme, storage } = setupThemeDom({ stored: { 'gr-style': 'airy' } });

  theme.style('standard');

  assert.equal(doc.documentElement.getAttribute('data-gr-style'), null);
  assert.equal(storage.items.has('gr-style'), false);
  assert.equal(theme.get().style, 'standard');
});

test('неизвестный стиль приводится к стандартному, а не ставится как есть', () => {
  const { doc, theme } = setupThemeDom();

  theme.style('bootstrap');

  assert.equal(doc.documentElement.getAttribute('data-gr-style'), null);
  assert.equal(theme.get().style, 'standard');
});

test('сохранённый стиль восстанавливается при старте', () => {
  const { doc, theme } = setupThemeDom({ stored: { 'gr-style': 'compact' } });

  theme.start();

  assert.equal(doc.documentElement.getAttribute('data-gr-style'), 'compact');
  assert.equal(theme.get().style, 'compact');
});

test('ось стиля независима от темы и режима доступности', () => {
  const { doc, theme } = setupThemeDom();

  theme.set('dark');
  theme.a11y(true);
  theme.style('compact');

  assert.deepEqual(
    {
      theme: doc.documentElement.getAttribute('data-gr-theme'),
      a11y: doc.documentElement.getAttribute('data-gr-a11y'),
      style: doc.documentElement.getAttribute('data-gr-style'),
    },
    { theme: 'dark', a11y: 'low-vision', style: 'compact' },
  );
});

// --- Этап 45c: смена темы за один кадр ---------------------------------------

// Гашение переходов на время переключения: безслойный <style> от скрипта
// и класс gr-theme-switching на <html>, оба снимаются через два кадра.
const freezeStyle = (doc) => doc.head.children.find((node) => node.tagName === 'STYLE' && node.textContent.includes('transition:none')) || null;

test('переключение гасит переходы безслойным <style> на два кадра', () => {
  const { doc, theme, frame } = setupThemeDom();

  theme.set('dark');

  const style = freezeStyle(doc);

  assert.ok(style, 'нет <style> с transition: none в <head>');
  assert.ok(!style.textContent.includes('@layer'), 'правило легло в слой — переходы компонентов в ui его перебьют');
  assert.ok(!style.textContent.includes('!important'), '!important в правиле ни к чему: безслойное объявление и так старше слоёв');
  // Потомки — все, кроме .gr-theme-keep и его поддерева: то, что тема
  // анимирует в ответ на переключение (плашка переключателя), гаситься
  // не должно (фидбек темы griffin по 0.26.0, п. 3).
  const keep = ':not(.gr-theme-keep,.gr-theme-keep *)';

  assert.ok(style.textContent.includes(`.gr-theme-switching ${keep}{`) || style.textContent.includes(`.gr-theme-switching ${keep},`), 'правило не покрывает потомков или не исключает .gr-theme-keep');
  assert.ok(style.textContent.includes(`.gr-theme-switching ${keep}::before`), 'правило не покрывает ::before или гасит ::before под .gr-theme-keep');
  assert.ok(style.textContent.includes(`.gr-theme-switching ${keep}::after`), 'правило не покрывает ::after или гасит ::after под .gr-theme-keep');
  assert.ok(!/\.gr-theme-switching \*[,{]/.test(style.textContent), 'осталось правило на всех потомков без исключения');
  assert.ok(doc.documentElement.classList.contains('gr-theme-switching'), 'нет класса на <html> — теме не за что зацепиться');

  // Первый кадр: браузер считает стили с новыми цветами при погашенных
  // переходах. Снимать рано — переходы вернулись бы до пересчёта.
  frame();
  assert.ok(freezeStyle(doc), '<style> снят на первом кадре — цвета поедут переходами');
  assert.ok(doc.documentElement.classList.contains('gr-theme-switching'));

  // Второй кадр: цвета уже на месте, переходы возвращаются без движения.
  frame();
  assert.equal(freezeStyle(doc), null, '<style> не снят на втором кадре');
  assert.ok(!doc.documentElement.classList.contains('gr-theme-switching'), 'класс остался на <html>');
});

test('второе переключение в окне гашения продлевает его, а не снимает раньше времени', () => {
  const { doc, theme, frame } = setupThemeDom();

  theme.set('dark');
  frame();
  theme.a11y(true);
  frame();

  assert.ok(freezeStyle(doc), 'второй кадр первого переключения снял гашение под вторым');
  assert.equal(doc.head.children.filter((node) => node.tagName === 'STYLE').length, 1, 'на каждое переключение — свой <style>');

  frame();
  assert.equal(freezeStyle(doc), null);
});

test('<style> гашения несёт nonce тега <script> — под строгим CSP его иначе выбросят', () => {
  const script = el('script', { nonce: 'gr0test' });
  const { doc, theme } = setupThemeDom({ script });

  theme.set('dark');

  assert.equal(freezeStyle(doc).nonce, 'gr0test');
});

test('без requestAnimationFrame тема переключается, гашения просто нет', () => {
  const { doc, theme } = setupThemeDom({ noFrames: true });

  theme.set('dark');

  assert.equal(doc.documentElement.getAttribute('data-gr-theme'), 'dark');
  assert.equal(freezeStyle(doc), null);
  assert.ok(!doc.documentElement.classList.contains('gr-theme-switching'));
});

// Событие — после снятия гашения: реакция темы на него (плашка едет
// к выбранному пункту) иначе попадала в окно transition: none и прыгала.
test('griffincss:themechange приходит после снятия гашения, когда переходы уже вернулись', () => {
  const { doc, theme, frame } = setupThemeDom();
  const seen = [];

  doc.addEventListener('griffincss:themechange', (e) => seen.push({
    resolved: e.detail.resolved,
    switching: doc.documentElement.classList.contains('gr-theme-switching'),
    frozen: !!freezeStyle(doc),
  }));

  const returned = theme.set('dark');

  assert.equal(returned.resolved, 'dark', 'set() по-прежнему возвращает состояние сразу');
  assert.deepEqual(seen, [], 'событие ушло внутри окна гашения — реакция темы на него не анимируется');

  frame();
  assert.deepEqual(seen, []);

  frame();
  assert.deepEqual(seen, [{ resolved: 'dark', switching: false, frozen: false }]);
});

test('два переключения в окне гашения — одно событие с итоговым состоянием', () => {
  const { doc, theme, frame } = setupThemeDom();
  const seen = [];

  doc.addEventListener('griffincss:themechange', (e) => seen.push([e.detail.resolved, e.detail.resolvedA11y]));

  theme.set('dark');
  frame();
  theme.a11y(true);
  frame();
  assert.deepEqual(seen, [], 'первое переключение отчиталось, пока второе ещё гасит переходы');

  frame();
  assert.deepEqual(seen, [['dark', 'low-vision']]);
});

test('без requestAnimationFrame событие приходит синхронно, как раньше', () => {
  const { doc, theme } = setupThemeDom({ noFrames: true });
  const seen = [];

  doc.addEventListener('griffincss:themechange', (e) => seen.push(e.detail.resolved));
  theme.set('dark');

  assert.deepEqual(seen, ['dark']);
});
