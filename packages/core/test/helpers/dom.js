'use strict';

// Минимальный мок DOM для тестов рантайма. Ноль зависимостей.
// Поддерживает ровно то, чем пользуется griffincss.js:
// атрибуты, classList, style, children, querySelectorAll по
// простым селекторам вида `[attr]`, `[attr*="value"]`, `.class`, `tag`
// и их перечислениям.

const path = require('node:path');

class ClassList {
  constructor(el) {
    this.el = el;
    this.items = [];
  }

  add(name) {
    if (!this.items.includes(name)) this.items.push(name);
  }

  remove(name) {
    const i = this.items.indexOf(name);
    if (i !== -1) this.items.splice(i, 1);
  }

  contains(name) {
    return this.items.includes(name);
  }

  item(index) {
    return index < this.items.length ? this.items[index] : null;
  }

  get length() {
    return this.items.length;
  }

  toString() {
    return this.items.join(' ');
  }
}

class Style {
  constructor() {
    this.props = new Map();
  }

  setProperty(name, value) {
    this.props.set(name, String(value));
  }

  getPropertyValue(name) {
    return this.props.get(name) || '';
  }

  removeProperty(name) {
    this.props.delete(name);
  }

  get size() {
    return this.props.size;
  }
}

class MockElement {
  constructor(tag = 'div', attrs = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.classList = new ClassList(this);
    this.style = new Style();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';

    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'class') {
        for (const cls of String(value).split(/\s+/).filter(Boolean)) this.classList.add(cls);
      } else if (name === 'style') {
        // Инлайновые объявления обязаны доехать до getPropertyValue:
        // рантайм утилит читает --gr-p именно из атрибута, а не из
        // computed-стилей.
        this.attrs.set(name, String(value));

        for (const declaration of String(value).split(';')) {
          const colon = declaration.indexOf(':');
          const prop = colon === -1 ? '' : declaration.slice(0, colon).trim();

          if (prop) this.style.setProperty(prop, declaration.slice(colon + 1).trim());
        }
      } else {
        this.attrs.set(name, String(value));
      }
    }

    for (const child of children) this.appendChild(child);
  }

  get className() {
    return this.classList.toString();
  }

  // Присваивание целиком — то, что делает фреймворк при изменении пропа
  // className: прежний список токенов не дополняется, а заменяется.
  set className(value) {
    this.classList.items = String(value).split(/\s+/).filter(Boolean);
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  // nonce — IDL-свойство, а не атрибут: браузер прячет содержимое
  // атрибута после разбора, и рантайм читает именно свойство.
  get nonce() {
    return this.getAttribute('nonce') || '';
  }

  set nonce(value) {
    this.setAttribute('nonce', value);
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  hasAttribute(name) {
    return this.attrs.has(name);
  }

  removeAttribute(name) {
    this.attrs.delete(name);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i !== -1) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }

  matches(selector) {
    return selector
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => matchesSimple(this, part));
  }

  querySelectorAll(selector) {
    const found = [];
    walk(this, (el) => {
      if (el !== this && el.matches(selector)) found.push(el);
    });
    return found;
  }
}

function walk(el, visit) {
  visit(el);
  for (const child of el.children.slice()) walk(child, visit);
}

function matchesSimple(el, selector) {
  if (selector.startsWith('[')) {
    // `[attr]`, `[attr="value"]` и `[attr*="value"]`: последним рантайм
    // утилит ищет произвольные значения по скобке в имени класса.
    const match = /^\[([\w-]+)(?:([*^$|~]?)=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]$/.exec(selector);

    if (!match) return false;

    const [, name, operator, quoted, single, bare] = match;

    if (!el.hasAttribute(name) && name !== 'class') return false;
    if (operator === undefined) return el.hasAttribute(name);

    const actual = name === 'class' ? el.className : el.getAttribute(name) || '';
    const value = quoted ?? single ?? bare ?? '';

    return operator === '*' ? actual.includes(value) : actual === value;
  }
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  return el.tagName === selector.toUpperCase();
}

class MockDocument {
  constructor(body) {
    this.readyState = 'complete';
    this.documentElement = new MockElement('html');
    this.head = new MockElement('head');
    this.body = body || new MockElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.listeners = new Map();
    this.currentScript = null;
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    let found = null;
    walk(this.documentElement, (el) => {
      if (!found && el.getAttribute('id') === id) found = el;
    });
    return found;
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  // Тестовый хук: запускает слушателей события (DOMContentLoaded).
  fire(type) {
    for (const fn of this.listeners.get(type) || []) fn();
  }

  dispatchEvent(event) {
    for (const fn of this.listeners.get(event.type) || []) fn(event);
    return true;
  }
}

// Мок MutationObserver: собирает экземпляры, мутации подаются вручную.
class MockMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    this.disconnected = false;
    MockMutationObserver.instances.push(this);
  }

  observe(target, options) {
    this.targets.push({ target, options });
  }

  disconnect() {
    this.disconnected = true;
  }

  // Тестовый хук: имитирует добавление узлов. Отключённый наблюдатель
  // записей не доставляет — как настоящий MutationObserver.
  fireAdded(nodes) {
    if (this.disconnected) return;

    this.callback([{ addedNodes: nodes }], this);
  }

  // Правка атрибута: настоящая запись всегда несёт и пустой addedNodes.
  fireAttribute(target, name = 'class') {
    if (this.disconnected) return;

    this.callback([{ type: 'attributes', attributeName: name, target, addedNodes: [] }], this);
  }
}

MockMutationObserver.instances = [];

const RUNTIME_PATH = path.join(__dirname, '..', '..', 'src', 'griffincss.js');

// Свежий экземпляр рантайма: сбрасывает кеш модуля, поэтому
// внутреннее состояние (кеши CSS) не протекает между тестами.
function loadRuntime() {
  delete require.cache[require.resolve(RUNTIME_PATH)];
  return require(RUNTIME_PATH);
}

const UTILS_PATH = path.join(__dirname, '..', '..', '..', 'utils', 'src', 'griffincss-utils.js');

// Свежий экземпляр рантайма утилит. Эмиттер, хеш и <style> он берёт у ядра
// через window.Griffincss — глобал ставится здесь, после загрузки ядра.
// Автостарт отключается тем же способом, что и в браузере: тесты вызывают
// каскад явно, и лишний проход дал бы второе предупреждение.
function loadUtilsRuntime() {
  const core = require(RUNTIME_PATH);

  if (!global.window) global.window = {};
  if (!global.window.Griffincss) global.window.Griffincss = {};
  for (const key of Object.keys(core)) global.window.Griffincss[key] = core[key];

  const previous = global.document ? global.document.currentScript : null;

  if (global.document) global.document.currentScript = new MockElement('script', { 'data-auto': 'false' });

  delete require.cache[require.resolve(UTILS_PATH)];

  try {
    return require(UTILS_PATH);
  } finally {
    if (global.document) global.document.currentScript = previous;
  }
}

// Ставит глобальные document/getComputedStyle/MutationObserver и
// возвращает { doc, griffin }.
function setupDom(body, tokens = {}, options = {}) {
  const doc = new MockDocument(body);

  // Потоковый режим проверяется только при readyState 'loading' и
  // доступном currentScript — оба состояния задаются тестом.
  if (options.readyState) doc.readyState = options.readyState;
  if (options.script) doc.currentScript = options.script;
  const values = Object.assign(
    {
      '--gr-bp-sm': '640px',
      '--gr-bp-md': '768px',
      '--gr-bp-lg': '1024px',
      '--gr-bp-xl': '1280px',
    },
    tokens,
  );

  global.document = doc;
  global.getComputedStyle = () => ({
    getPropertyValue: (name) => values[name] || '',
    paddingTop: '0px',
    paddingLeft: '0px',
  });
  MockMutationObserver.instances = [];
  global.MutationObserver = MockMutationObserver;

  return { doc, griffin: loadRuntime() };
}

// Текст сгенерированного рантаймом <style>.
function generatedCSS(doc) {
  const styleEl = doc.getElementById('griffincss-dynamic');
  return styleEl ? styleEl.textContent : '';
}

// Секция сгенерированного CSS по маркеру-комментарию.
function cssSection(doc, marker) {
  const css = generatedCSS(doc);
  const start = css.indexOf('/* ' + marker + ' */');
  if (start === -1) return '';
  const rest = css.slice(start + marker.length + 6);
  const next = rest.indexOf('/*');
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function el(tag, attrs, children) {
  return new MockElement(tag, attrs || {}, children || []);
}

// Мок matchMedia: тест сам решает, какие запросы совпадают, и умеет
// менять ответ на лету — так проверяется реакция на смену системной темы.
class MockMediaQueryList {
  constructor(query, matches) {
    this.media = query;
    this.matches = matches;
    this.handlers = [];
  }

  addEventListener(type, fn) {
    if (type === 'change') this.handlers.push(fn);
  }

  // Тестовый хук: меняет ответ системы и уведомляет слушателей.
  change(matches) {
    this.matches = matches;
    for (const fn of this.handlers.slice()) fn({ matches });
  }
}

// Мок localStorage. Режим broken имитирует приватный просмотр,
// где обращение к хранилищу бросает.
class MockStorage {
  constructor(broken = false) {
    this.items = new Map();
    this.broken = broken;
  }

  getItem(key) {
    if (this.broken) throw new Error('storage disabled');
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    if (this.broken) throw new Error('storage disabled');
    this.items.set(key, String(value));
  }

  removeItem(key) {
    if (this.broken) throw new Error('storage disabled');
    this.items.delete(key);
  }
}

const THEME_PATH = path.join(__dirname, '..', '..', 'src', 'griffincss-theme.js');

// Ставит окружение для рантайма темы и загружает его свежим экземпляром.
// window и document объявляются до require — рантайм считает окружение
// браузерным и вызывает _autoStart() сам, как в настоящей странице.
// options: {dark, contrast, stored, brokenStorage, script, attrs}
function setupThemeDom(options = {}) {
  const doc = new MockDocument();

  for (const [name, value] of Object.entries(options.attrs || {})) {
    doc.documentElement.setAttribute(name, value);
  }

  const media = {
    '(prefers-color-scheme: dark)': new MockMediaQueryList('(prefers-color-scheme: dark)', !!options.dark),
    '(prefers-contrast: more)': new MockMediaQueryList('(prefers-contrast: more)', !!options.contrast),
  };

  const storage = new MockStorage(!!options.brokenStorage);
  for (const [key, value] of Object.entries(options.stored || {})) storage.items.set(key, value);

  doc.currentScript = options.script || null;

  // Кадры: requestAnimationFrame складывает обратные вызовы в очередь,
  // frame() проигрывает один кадр — так проверяется снятие гашения
  // переходов через два кадра. noFrames — окружение без rAF.
  const frames = [];
  const frame = () => {
    const queued = frames.splice(0);

    for (const fn of queued) fn();
  };

  global.document = doc;
  global.window = {
    matchMedia: (query) => media[query] || new MockMediaQueryList(query, false),
    localStorage: storage,
  };

  if (!options.noFrames) global.window.requestAnimationFrame = (fn) => frames.push(fn);
  global.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = (init || {}).detail;
    }
  };

  delete require.cache[require.resolve(THEME_PATH)];
  const theme = require(THEME_PATH);

  return { doc, theme, media, storage, frame, frames };
}

module.exports = {
  MockElement,
  MockDocument,
  MockMutationObserver,
  MockMediaQueryList,
  MockStorage,
  el,
  setupDom,
  setupThemeDom,
  loadRuntime,
  loadUtilsRuntime,
  generatedCSS,
  cssSection,
};
