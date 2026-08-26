'use strict';

// Минимальный мок DOM для рантайма компонентов. Ноль зависимостей.
// Поддерживает ровно то, чем griffincss-ui.js пользуется: атрибуты,
// classList, дерево, простые селекторы, делегированные слушатели
// на документе, координаты элемента и close() у <dialog>.

const path = require('node:path');

class ClassList {
  constructor() {
    this.items = [];
  }

  add(name) {
    if (!this.items.includes(name)) this.items.push(name);
  }

  remove(name) {
    const at = this.items.indexOf(name);
    if (at !== -1) this.items.splice(at, 1);
  }

  contains(name) {
    return this.items.includes(name);
  }

  toString() {
    return this.items.join(' ');
  }
}

class MockElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.classList = new ClassList();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.focusCalls = 0;
    this.rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };

    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'class') {
        for (const cls of String(value).split(/\s+/).filter(Boolean)) this.classList.add(cls);
      } else {
        this.attributes.set(name, String(value));
      }
    }
  }

  get className() {
    return this.classList.toString();
  }

  appendChild(child) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const at = this.parentNode.children.indexOf(this);
    if (at !== -1) this.parentNode.children.splice(at, 1);
    this.parentNode = null;
  }

  focus() {
    this.focusCalls += 1;
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  matches(selector) {
    return selector
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => matchesSimple(this, part));
  }

  closest(selector) {
    let node = this;

    while (node) {
      if (typeof node.matches === 'function' && node.matches(selector)) return node;
      node = node.parentNode;
    }

    return null;
  }

  querySelectorAll(selector) {
    const found = [];

    walk(this, (el) => {
      if (el !== this && el.matches(selector)) found.push(el);
    });

    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  getBoundingClientRect() {
    return this.rect;
  }

  // Тестовый хук: задаёт положение окна на экране.
  at(left, top, width, height) {
    this.rect = { left, top, width, height, right: left + width, bottom: top + height };
    return this;
  }
}

function walk(el, visit) {
  visit(el);
  for (const child of el.children.slice()) walk(child, visit);
}

// Простые селекторы: `tag`, `.class`, `[attr]`, `#id` и их сцепление
// (`.gr-tab[aria-disabled]`). Ровно то, чем пользуется рантайм.
function matchesSimple(el, selector) {
  const parts = selector.match(/(^[a-zA-Z][\w-]*)|(\.[\w-]+)|(#[\w-]+)|(\[[^\]]+\])/g) || [];

  return parts.every((part) => {
    if (part.startsWith('.')) return el.classList.contains(part.slice(1));
    if (part.startsWith('#')) return el.getAttribute('id') === part.slice(1);

    if (part.startsWith('[')) {
      const body = part.slice(1, -1);
      const eq = body.indexOf('=');

      if (eq === -1) return el.hasAttribute(body);

      const name = body.slice(0, eq);
      const value = body.slice(eq + 1).replace(/^["']|["']$/g, '');

      return el.getAttribute(name) === value;
    }

    return el.tagName === part.toUpperCase();
  });
}

// <dialog> с тем минимумом, который знает рантайм: open, close(), returnValue.
class MockDialog extends MockElement {
  constructor(attrs = {}) {
    super('dialog', attrs);
    this.open = false;
    this.returnValue = '';
    this.closeCalls = 0;
  }

  showModal() {
    this.open = true;
    this.setAttribute('open', '');
  }

  close(value) {
    this.open = false;
    this.closeCalls += 1;
    this.removeAttribute('open');
    if (value !== undefined) this.returnValue = value;
  }
}

class MockDocument {
  constructor() {
    this.readyState = 'complete';
    this.currentScript = null;
    this.listeners = new Map();
    this.activeElement = null;
    this.documentElement = this.own(new MockElement('html'));
    this.body = this.own(new MockElement('body'));
    this.documentElement.appendChild(this.body);
  }

  // Элемент помнит документ, чтобы focus() было куда записать
  // активный узел: рантайм вкладок опирается на него.
  own(el) {
    el.ownerDocument = this;
    return el;
  }

  createElement(tag) {
    return this.own(new MockElement(tag));
  }

  getElementById(id) {
    return this.documentElement.querySelector(`#${id}`);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  key(type, capture) {
    return `${type}:${capture ? 'capture' : 'bubble'}`;
  }

  addEventListener(type, fn, capture) {
    const key = this.key(type, capture);
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(fn);
  }

  removeEventListener(type, fn, capture) {
    const list = this.listeners.get(this.key(type, capture)) || [];
    const at = list.indexOf(fn);
    if (at !== -1) list.splice(at, 1);
  }

  // Тестовый хук: разносит событие сперва по перехватывающим слушателям,
  // затем по всплывающим — так же, как это делает браузер.
  fire(type, event) {
    for (const fn of (this.listeners.get(this.key(type, true)) || []).slice()) fn(event);
    for (const fn of (this.listeners.get(this.key(type, false)) || []).slice()) fn(event);
  }

  count(type, capture) {
    return (this.listeners.get(this.key(type, capture)) || []).length;
  }
}

const RUNTIME_PATH = path.join(__dirname, '..', '..', 'src', 'griffincss-ui.js');

// Свежий экземпляр рантайма: кеш модуля сбрасывается, чтобы внутреннее
// состояние (подписки, запомненное нажатие) не протекало между тестами.
function loadRuntime() {
  delete require.cache[require.resolve(RUNTIME_PATH)];
  return require(RUNTIME_PATH);
}

// Ставит глобальный document и поднимает рантайм. window намеренно
// не объявляется: под Node модуль отдаёт себя через module.exports,
// а автостарт тесты зовут сами — так видно, что он делает.
function setupDom() {
  const doc = new MockDocument();

  global.document = doc;

  const ui = loadRuntime();
  ui.start();

  return { doc, ui };
}

// Дерево из вложенных описаний: el('div', { class: 'gr-toast' }, [el('span')]).
// Документ проставляется всему поддереву разом — иначе focus() у вкладки,
// собранной вручную, некуда было бы записать активный узел.
function el(tag, attrs = {}, children = []) {
  const node = new MockElement(tag, attrs);

  for (const child of children) node.appendChild(child);

  return node;
}

// Кладёт узел в <body> мок-документа и раздаёт поддереву ownerDocument.
function mount(doc, node) {
  doc.body.appendChild(node);

  walk(node, (child) => { child.ownerDocument = doc; });

  return node;
}

// Щелчок: пара «нажал» и «отпустил». По умолчанию обе половины приходятся
// на одну цель — как при обычном клике.
function click(doc, target, x, y, pressedOn) {
  doc.fire('pointerdown', { target: pressedOn || target, clientX: x, clientY: y });
  doc.fire('click', { target, clientX: x, clientY: y });
}

module.exports = { MockElement, MockDialog, MockDocument, setupDom, loadRuntime, click, el, mount };
