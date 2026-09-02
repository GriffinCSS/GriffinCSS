'use strict';

// Мок-DOM для слоя GriffinJS. Надстройка над мок-DOM рантайма компонентов:
// добавляет то, чем пользуется слой, — слушатели на элементах со всплытием,
// style.setProperty (для --gr-progress), isConnected, прокрутку
// и размеры дорожки. Ноль зависимостей.

const path = require('node:path');
const fs = require('node:fs');
const base = require('./dom');

const SRC = path.join(__dirname, '..', '..', 'src', 'griffinjs');

class Style {
  constructor() { this.props = new Map(); }
  setProperty(name, value) { this.props.set(name, String(value)); }
  getPropertyValue(name) { return this.props.has(name) ? this.props.get(name) : ''; }
  removeProperty(name) { this.props.delete(name); }
}

class Element extends base.MockElement {
  constructor(tag, attrs = {}) {
    super(tag, attrs);
    this.style = new Style();
    this.listeners = new Map();
    this.scrollLeft = 0;
    this.clientWidth = 0;
    this.scrollWidth = 0;
    this.scrollCalls = [];
    this.inert = false;
  }

  // setAttribute('class', …) синхронизирует classList — рантайм ставит
  // классы созданным элементам именно так.
  setAttribute(name, value) {
    super.setAttribute(name, value);
    if (name === 'class') {
      this.classList.items = String(value).split(/\s+/).filter(Boolean);
    }
  }

  // focus() — как у базового мока плюс focusin: слой слушает его на обёртке.
  focus() {
    this.focusCalls += 1;
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
    this.dispatchEvent(event('focusin', this));
  }

  get isConnected() {
    let node = this;
    while (node) {
      if (node.tagName === 'HTML') return true;
      node = node.parentNode;
    }
    return false;
  }

  get firstElementChild() { return this.children[0] || null; }
  get firstChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }

  get nextElementSibling() {
    if (!this.parentNode) return null;
    const at = this.parentNode.children.indexOf(this);
    return this.parentNode.children[at + 1] || null;
  }

  // Текстовых узлов между элементами в моке не бывает, поэтому следующий
  // узел — следующий элемент; insertBefore(node, el.nextSibling) работает
  // как в браузере.
  get nextSibling() { return this.nextElementSibling; }

  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }

  // input.value: в браузере это живое значение, в моке — зеркало атрибута.
  // Виджету ползунка достаточно: он и читает, и пишет одно и то же свойство.
  get value() { return this.getAttribute('value') || ''; }
  set value(v) { this.setAttribute('value', String(v)); }

  // Выделение в текстовом поле — для маски (Этап 38): selectionStart/End
  // ставит тест, setSelectionRange пишет виджет, и по нему проверяется каретка.
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }

  // Выделить всё в ячейке кода — в моке достаточно факта вызова.
  select() { this.selectCalls = (this.selectCalls || 0) + 1; }

  // <form>: контролы и проверка платформы. validity в моке ставит тест;
  // контрол без validity считается верным.
  get elements() { return this.querySelectorAll('input, select, textarea'); }
  checkValidity() { return this.elements.every((c) => !c.validity || c.validity.valid !== false); }

  // <option>: selected зеркалит атрибут — как checked у радиокнопки.
  get selected() { return this.hasAttribute('selected'); }
  set selected(v) { if (v) this.setAttribute('selected', ''); else this.removeAttribute('selected'); }

  // Радиокнопка и флажок: checked зеркалит атрибут, как value.
  get checked() { return this.hasAttribute('checked'); }
  set checked(v) { if (v) this.setAttribute('checked', ''); else this.removeAttribute('checked'); }

  // Проверка ограничений: своё сообщение виджет ставит так же, как в браузере,
  // а читает его тест из validationMessage. Платформенной проверки в моке нет.
  setCustomValidity(message) { this.validationMessage = String(message || ''); }

  // <select>: список позиций и выбранная — как в браузере, по атрибуту
  // selected; без него выбрана первая. Поле телефона читает и пишет
  // selectedIndex, а не value.
  get options() { return this.children.filter((c) => c.tagName === 'OPTION'); }

  get selectedIndex() {
    const opts = this.options;
    const at = opts.findIndex((o) => o.hasAttribute('selected'));

    return at === -1 ? (opts.length ? 0 : -1) : at;
  }

  set selectedIndex(i) {
    this.options.forEach((o, k) => { if (k === i) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
  }

  // innerHTML в моке — строка без разбора: тест проверяет, что именно
  // вставлено, а не как оно распарсилось.
  get innerHTML() { return this._html || ''; }
  set innerHTML(value) { this._html = String(value); for (const c of this.children.slice()) c.remove(); }

  // Popover API: showPopover/hidePopover и событие toggle с newState —
  // как в браузере. Состояние — popoverOpen; псевдокласса :popover-open
  // у мока нет, и слой на него не полагается.
  showPopover() {
    if (this.popoverOpen) return;
    this.popoverOpen = true;
    this.dispatchEvent(event('toggle', this, { bubbles: false, newState: 'open', oldState: 'closed' }));
  }

  hidePopover() {
    if (!this.popoverOpen) return;
    this.popoverOpen = false;
    this.dispatchEvent(event('toggle', this, { bubbles: false, newState: 'closed', oldState: 'open' }));
  }

  addEventListener(type, fn, opts) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    const at = list.indexOf(fn);
    if (at !== -1) list.splice(at, 1);
  }

  count(type) { return (this.listeners.get(type) || []).length; }

  // Событие с всплытием: по цепочке предков, затем на документ.
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    let node = this;
    while (node) {
      for (const fn of (node.listeners ? node.listeners.get(event.type) || [] : []).slice()) fn(event);
      if (event.cancelBubble || event.bubbles === false) return true;
      node = node.parentNode;
    }
    if (this.ownerDocument) this.ownerDocument.fire(event.type, event);
    return true;
  }

  // <dialog>: showModal/close, событие close — как в браузере.
  showModal() { this.setAttribute('open', ''); }
  close() {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(event('close', this, { bubbles: false }));
  }

  // <details>: свойство open зеркалит атрибут и шлёт toggle, как браузер.
  get open() { return this.hasAttribute('open'); }
  set open(value) {
    const was = this.hasAttribute('open');
    if (value) this.setAttribute('open', ''); else this.removeAttribute('open');
    if (was !== !!value) this.dispatchEvent(event('toggle', this, { bubbles: false, newState: value ? 'open' : 'closed' }));
  }

  contains(node) {
    let n = node;
    while (n) { if (n === this) return true; n = n.parentNode; }
    return false;
  }

  scrollIntoView() { this.scrolledIntoView = (this.scrolledIntoView || 0) + 1; }

  cloneNode(deep) {
    const copy = new Element(this.tagName.toLowerCase());
    for (const [k, v] of this.attributes) copy.setAttribute(k, v);
    copy.classList.items = this.classList.items.slice();
    copy.rect = Object.assign({}, this.rect);
    copy.textContent = this.textContent;
    copy.ownerDocument = this.ownerDocument;
    if (deep) for (const c of this.children) copy.appendChild(c.cloneNode(true));
    return copy;
  }

  insertBefore(child, ref) {
    child.remove();
    child.parentNode = this;
    const at = this.children.indexOf(ref);
    if (at === -1) this.children.push(child); else this.children.splice(at, 0, child);
    return child;
  }

  scrollTo(opts) {
    const left = typeof opts === 'object' ? opts.left : opts;
    this.scrollCalls.push({ left, behavior: typeof opts === 'object' ? opts.behavior : undefined });
    this.scrollLeft = left;
  }
}

class Document extends base.MockDocument {
  constructor() {
    super();
    this.documentElement = this.own(new Element('html'));
    this.body = this.own(new Element('body'));
    this.documentElement.appendChild(this.body);
  }

  createElement(tag) { return this.own(new Element(tag)); }

  getElementById(id) { return this.body.querySelector('#' + id) || (this.documentElement.getAttribute('id') === id ? this.documentElement : null); }

  // Текстовый узел: живёт среди children, на селекторы не отвечает.
  createTextNode(text) {
    return {
      nodeType: 3, textContent: String(text), children: [], parentNode: null, listeners: new Map(),
      matches() { return false; }, querySelectorAll() { return []; },
      remove() { if (this.parentNode) { const at = this.parentNode.children.indexOf(this); if (at !== -1) this.parentNode.children.splice(at, 1); this.parentNode = null; } },
    };
  }
}

// Широкий экран: токен --gr-bp-md на корне и matchMedia, отвечающий
// «совпадает» на любой запрос. Возвращает функцию отката.
function wide(doc, px = '768px') {
  doc.documentElement.style.setProperty('--gr-bp-md', px);
  doc.documentElement.clientWidth = 1200;
  doc.documentElement.clientHeight = 800;
  const prevMatch = global.matchMedia;
  const prevStyle = global.getComputedStyle;
  global.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  global.getComputedStyle = (node) => node.style;
  return () => { global.matchMedia = prevMatch; global.getComputedStyle = prevStyle; };
}

// Событие: {type, target, ...поля}; stopPropagation/preventDefault учитываются.
function event(type, target, fields = {}) {
  return Object.assign({
    type,
    target,
    bubbles: true,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
  }, fields);
}

// Свежий GriffinJS: сброс кеша всех файлов слоя, ядро + перечисленные
// части (относительно src/griffinjs). Глобальный document — мок.
function setup(parts = []) {
  const doc = new Document();

  global.document = doc;
  global.Event = class {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = !!init.bubbles;
    }
  };
  global.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
      this.bubbles = !!init.bubbles;
    }
  };

  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SRC)) delete require.cache[key];
  }

  const G = require(path.join(SRC, 'core', 'griffinjs-core.js'));

  for (const part of parts) require(path.join(SRC, part));

  return { G, doc };
}

function el(tag, attrs = {}, children = []) {
  const node = new Element(tag, attrs);
  for (const child of children) node.appendChild(child);
  return node;
}

function mount(doc, node) {
  doc.body.appendChild(node);
  (function walk(n) { n.ownerDocument = doc; for (const c of n.children) walk(c); })(node);
  return node;
}

// Дорожка из n слайдов шириной width, видимая область — тоже width.
// perView — сколько слайдов видно разом: окно дорожки шире слайда во столько раз.
function track(doc, n, width = 100, attrs = {}, perView = 1) {
  const slides = [];
  for (let i = 0; i < n; i++) slides.push(el('div', { class: 'gr-slide' }));
  const node = mount(doc, el('div', attrs, slides));
  node.clientWidth = width * perView;
  node.scrollWidth = width * n;
  node.at(0, 0, width * perView, 100);
  slides.forEach((s, i) => s.at(i * width, 0, width, 100));
  // Прокрутка сдвигает прямоугольники ДЕТЕЙ по их порядку, как в браузере:
  // клоны краёв, вставленные движком, тоже получают своё место.
  const place = (v) => node.children.forEach((c, i) => c.at(i * width - v, 0, width, 100));
  Object.defineProperty(node, 'scrollLeft', {
    get() { return this._scrollLeft || 0; },
    set(v) { this._scrollLeft = v; place(v); },
  });
  const origAppend = node.appendChild.bind(node);
  const origInsert = node.insertBefore.bind(node);
  node.appendChild = (c) => { const r = origAppend(c); place(node.scrollLeft); node.scrollWidth = width * node.children.length; return r; };
  node.insertBefore = (c, ref) => { const r = origInsert(c, ref); place(node.scrollLeft); node.scrollWidth = width * node.children.length; return r; };
  return { node, slides };
}

module.exports = { Element, Document, setup, el, mount, event, track, wide, SRC };
