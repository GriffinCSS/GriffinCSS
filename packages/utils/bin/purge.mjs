#!/usr/bin/env node
// Griffincss — отсечение неиспользуемых правил из собранного CSS.
//
// Опора — разбор собранного файла, а не regex по его тексту: правило
// выбрасывается по своим селекторам, а не по совпадению подстроки.
// Структурное сохраняется целиком: объявление слоёв, :root, правила
// по тегам и атрибутам — в них классов нет, и решать по ним нечего.
//
// Чего скрипт увидеть не может — классы, которые собираются в рантайме
// ('gr-mt-' + n). Для них есть --safelist, и молчать об этом нельзя:
// отчёт печатается всегда.
//
// Едет в пакете griffincss-utils командой griffincss-purge и экспортом
// `griffincss-utils/purge` (фидбек CHU по 0.29.2, п. 6): у того, кто
// поставил библиотеку из npm, `npm run purge` клона нет.
//
// Ноль зависимостей.

import { readFileSync, writeFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, extname, resolve, dirname, relative } from 'node:path';

// --- разбор CSS -------------------------------------------------------------

// At-правила, внутри которых лежат обычные правила, а не объявления.
// Остальные (@property, @font-face, @keyframes) — непрозрачные блоки.
// @starting-style — тоже вложенный (Этап 48a): непрозрачным он уносил
// в отсечённый файл стартовые кадры тоста и окна, которых на странице нет.
const NESTED = new Set(['media', 'supports', 'container', 'layer', 'scope', 'document', 'starting-style']);

// Конец строкового литерала: i указывает на открывающую кавычку.
function skipString(css, i) {
  const quote = css[i];

  for (i++; i < css.length; i++) {
    if (css[i] === '\\') i++;
    else if (css[i] === quote) return i + 1;
  }

  return css.length;
}

// Пробельные знаки CSS (CSS Syntax 4.2) — не `\s` JS: неразрывный пробел
// для CSS и HTML — знак, а не разделитель.
const WHITESPACE = /[ \t\n\r\f]/;

// Комментарии из прелюдии (Этап 76, фидбек CHU по 0.29.2, п. 7): решение
// о правиле принимается по тексту без них, и в вывод они не идут — иначе
// at-правило после комментария читалось как селектор, точка в комментарии —
// как класс, а запятая резала его так, что вывод открывал незакрытый
// комментарий. Вплотную между двумя знаками комментарий для браузера —
// граница токенов: `.a/**/b` — два слова без пробела (правило негодно),
// `and/**/(` — слово и скобка, а не функция. Пробел дал бы комбинатор,
// склейка — функцию; ту же границу даёт только пустой комментарий.
function stripComments(text) {
  if (!text.includes('/*')) return text;

  let out = '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '\\') {
      out += text.slice(i, i + 2);
      i++;
    } else if (c === '"' || c === "'") {
      const end = skipString(text, i);

      out += text.slice(i, end);
      i = end - 1;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const next = end === -1 ? text.length : end + 2;

      if (out && !WHITESPACE.test(out[out.length - 1]) && next < text.length && !WHITESPACE.test(text[next])) {
        out += '/**/';
      }

      i = next - 1;
    } else out += c;
  }

  return out;
}

// Индекс парной закрывающей скобки: i указывает на `{`.
function blockEnd(css, i) {
  let depth = 0;

  for (; i < css.length; i++) {
    const c = css[i];

    if (c === '\\') i++;
    else if (c === '"' || c === "'") i = skipString(css, i) - 1;
    else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);

      i = end === -1 ? css.length : end + 1;
    }
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }

  return css.length;
}

export function parse(css, from = 0, to = css.length) {
  const nodes = [];
  let start = from;
  // Первый значащий знак прелюдии: at-правило ли она, решается один раз,
  // а не на каждой `;` заново от `start` — иначе тысячи лишних `;` стоили
  // квадрат длины.
  let lead = '';
  let i = from;

  while (i < to) {
    const c = css[i];

    if (!lead && !WHITESPACE.test(c) && !(c === '/' && css[i + 1] === '*')) lead = c;

    // Экранированный знак — часть имени: `\{` не открывает блок, `\"` — строку.
    if (c === '\\') {
      i += 2;
      continue;
    }

    if (c === '"' || c === "'") {
      i = skipString(css, i);
      continue;
    }

    // Незакрытый комментарий тянется до конца (п. 8): `indexOf` даёт −1,
    // и прежняя запись `−1 + 2` возвращала разбор к позиции 1 — по кругу.
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);

      i = end === -1 ? to : end + 2;
      continue;
    }

    // `;` завершает только at-правило (п. 13). Лишняя `;` в списке правил
    // для браузера — начало прелюдии следующего правила, и оно гибнет;
    // здесь она так же входит в его селектор, и правило уходит целиком
    // (straySemicolon).
    if (c === ';') {
      if (lead === '@') {
        nodes.push({ type: 'statement', text: `${stripComments(css.slice(start, i)).trim()};` });
        start = i + 1;
        lead = '';
      }

      i++;
      continue;
    }

    if (c === '{') {
      const prelude = stripComments(css.slice(start, i)).trim();
      const end = blockEnd(css, i);
      const name = prelude.startsWith('@') ? prelude.slice(1).match(/^[\w-]+/) : null;

      if (name && NESTED.has(name[0].toLowerCase())) {
        nodes.push({ type: 'at', prelude, children: parse(css, i + 1, end) });
      } else if (prelude.startsWith('@')) {
        nodes.push({ type: 'block', prelude, body: css.slice(i + 1, end) });
      } else {
        nodes.push({ type: 'rule', selector: prelude, body: css.slice(i + 1, end) });
      }

      start = i = end + 1;
      lead = '';
      continue;
    }

    i++;
  }

  return nodes;
}

export function stringify(nodes) {
  return nodes
    .map((node) => {
      if (node.type === 'statement') return node.text;
      if (node.type === 'rule') return `${node.selector}{${node.body}}`;
      if (node.type === 'block') return `${node.prelude}{${node.body}}`;

      return `${node.prelude}{${stringify(node.children)}}`;
    })
    .join('');
}

// --- классы в селекторах ----------------------------------------------------

// Селектор режется по запятым верхнего уровня: скобки и строки внутри
// :is(), :not() и [attr="a,b"] запятыми не считаются. Экспорт — для
// сверки объявлений по селекторам (diff-css.mjs).
export function splitSelector(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;

  for (; i < selector.length; i++) {
    const c = selector[i];

    if (c === '\\') i++;
    else if (c === '"' || c === "'") i = skipString(selector, i) - 1;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(selector.slice(start));

  return parts.map((part) => part.trim()).filter(Boolean);
}

// Экранирование — по CSS Syntax 4.3.7: `\` и до шести шестнадцатеричных
// знаков с необязательным пробелом — кодовая точка, иначе — следующий знак.
// Имя — только знаки имени (CSS Syntax 4.3.9): `.a#b` — класс `a` и id `b`,
// а `/` в `.a/**/.b` имя заканчивает.
const CLASS_IN_SELECTOR = /\.((?:\\[0-9a-fA-F]{1,6}[ \t\n\r\f]?|\\.|[-\w\u0080-\uffff])+)/g;

// `.gr-w-1\/2` → `gr-w-1/2`, `.\31 0` → `10`: браузер сопоставляет класс
// с разметкой уже без экранирования, и скрипт обязан сравнивать так же.
function unescape(name) {
  return name.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\(.)/g, (match, hex, char) => {
    if (char !== undefined) return char;

    const code = parseInt(hex, 16);

    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
  });
}

// Строки и содержимое скобок атрибута — пробелами той же длины (п. 9):
// точка в `a[href$=".pdf"]` — часть значения, `:is(` в строке —
// не псевдокласс, а селектор по атрибуту класса не требует. Позиции
// не сдвигаются, сами `[` и `]` остаются: альтернатива `:has([required])`
// без них стала бы пустой — и мёртвой.
function maskAttributes(part) {
  let out = '';
  let depth = 0;

  for (let i = 0; i < part.length; i++) {
    const c = part[i];

    if (c === '\\') {
      const pair = part.slice(i, i + 2);

      out += depth ? ' '.repeat(pair.length) : pair;
      i++;
    } else if (c === '"' || c === "'") {
      const end = skipString(part, i);

      out += ' '.repeat(end - i);
      i = end - 1;
    } else if (c === '[') {
      depth++;
      out += c;
    } else if (c === ']' && depth) {
      depth--;
      out += c;
    } else out += depth ? ' ' : c;
  }

  return out;
}

// Лишняя `;` в селекторе (п. 13): браузер такое правило не применяет —
// негоден весь список, а не одна его часть. Оно уходит целиком, вид
// страницы от этого не меняется.
function straySemicolon(selector) {
  const text = maskAttributes(selector);
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '\\') i++;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth <= 0) return true;
  }

  return false;
}

function classesInPart(text) {
  return [...text.matchAll(CLASS_IN_SELECTOR)].map(([, name]) => unescape(name));
}

// Функциональные псевдоклассы. Класс внутри них — не условие всего правила
// (фидбек темы griffin по 0.26.0, п. 7: `.gr-breadcrumb > :where(li,
// .gr-breadcrumb-item)` выбрасывался у крошек без класса на пунктах, хотя
// `li` подходил всегда). В :not() отсутствие класса делает правило шире,
// а не мёртвым; в :is()/:where()/:has() список — альтернативы, и правило
// живо, пока подходит хоть одна (тег, атрибут, `*`, встреченный класс) —
// та же логика, что у списка селекторов верхнего уровня, рекурсивно.
// Мёртвые альтернативы внутри списка не вырезаются: цена — байты,
// а переписывание вложенных списков — отдельный риск.
// Имена псевдоклассов регистр по ASCII не различают (п. 14): `:NOT(` —
// тот же `:not(`.
const FUNCTIONAL = /:(not|is|where|has)\(/gi;

// Индекс закрывающей скобки для открывающей в позиции `open`.
function parenEnd(text, open) {
  let depth = 0;

  for (let i = open; i < text.length; i++) {
    const c = text[i];

    if (c === '\\') i++;
    else if (c === '"' || c === "'") i = skipString(text, i) - 1;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }

  return text.length;
}

// Предел вложенности функциональных псевдоклассов: разбор рекурсивен,
// и тысячи уровней `:is(` роняли его переполнением стека — без места
// и причины. В настоящем CSS их единицы.
const MAX_NESTING = 64;

// В ошибке — начало селектора правила (`root`), а не самая внутренняя часть:
// по ней правило в файле не найти. `:not()` вглубь не разбирается и в счёт
// не идёт.
function partAlive(part, isKept, depth = 0, root = part) {
  if (depth > MAX_NESTING) {
    throw new Error(`purge: вложенность :is()/:where()/:has() глубже ${MAX_NESTING} уровней в селекторе «${root.slice(0, 80)}…»`);
  }

  const text = maskAttributes(part);
  let outside = '';
  let i = 0;

  while (i < text.length) {
    FUNCTIONAL.lastIndex = i;
    const m = FUNCTIONAL.exec(text);

    if (!m) { outside += text.slice(i); break; }

    const open = m.index + m[0].length - 1;
    const close = parenEnd(text, open);

    outside += text.slice(i, m.index);
    i = close + 1;

    if (m[1].toLowerCase() === 'not') continue;
    if (!splitSelector(text.slice(open + 1, close)).some((alt) => partAlive(alt, isKept, depth + 1, root))) return false;
  }

  return classesInPart(outside).every((cls) => isKept(cls));
}

// --- классы в разметке ------------------------------------------------------

// Значение атрибута class: и в разметке, и в экранированном примере
// внутри <pre>. Пробел вокруг `=` не допускается намеренно — иначе
// `el.className = '…'` в HTML-файле читался бы как атрибут.
// Экранированный пример (`class=&quot;a b&quot;`) — своей веткой: без неё
// значение читалось как без кавычек и кончалось на первом пробеле.
const CLASS_ATTR = /(?:class|className|class:list)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|&quot;([^&<>]*)&quot;|([^\s>]+))/g;

// Строковые литералы: только для файлов с кодом. Класс, собранный
// склейкой ('gr-mt-' + n), так не найдётся — на то и safelist.
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

const TOKEN = /[\p{L}_][\p{L}\p{N}_\-/.%[\]()]*/gu;

// Значение атрибута — список через пробел, и имя в нём — всё между
// пробелами: `md:gr-a`, `-foo`, `кнопка`. Пробелы — только ASCII, как
// у HTML: неразрывный пробел — часть имени. В выражении (`{'gr-a': on}`)
// и в строке кода имя окружено знаками языка — его достаёт TOKEN.
// Берутся оба: лишнее имя только оставит правило, а не уберёт.
function addTokens(value, found) {
  for (const word of value.split(/[\t\n\f\r ]+/)) if (word) found.add(word);
  for (const [token] of value.matchAll(TOKEN)) found.add(token);
}

export function extractClasses(text, { js = false } = {}) {
  const found = new Set();

  for (const match of text.matchAll(CLASS_ATTR)) {
    addTokens(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '', found);
  }

  if (js) {
    for (const match of text.matchAll(STRING_LITERAL)) {
      addTokens(match[1] ?? match[2] ?? match[3] ?? '', found);
    }
  }

  return found;
}

// --- ось оформления ---------------------------------------------------------

// Стилей четыре, странице нужен один, и правила `[data-gr-style="X"]`
// по классам от прочих не отличить: класс в них как раз используемый.
// Поэтому ось идёт своим множеством — значениями атрибута из разметки.
const STYLE_ATTR = /data-gr-style\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s>]+))/g;

// `[data-gr-style]` — блок токенов, `[data-gr-style="compact"]` — правила
// одного стиля. Значение возвращается без кавычек, безымянный — как null.
const STYLE_IN_SELECTOR = /\[data-gr-style(?:[~^$*|]?=("[^"]*"|'[^']*'|[^\]]*))?\]/g;

export function extractStyles(text) {
  const found = new Set();

  for (const match of text.matchAll(STYLE_ATTR)) {
    addTokens(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '', found);
  }

  return found;
}

function stylesInPart(part) {
  return [...part.matchAll(STYLE_IN_SELECTOR)].map(([, value]) =>
    (value === undefined ? null : value.replace(/^["']|["']$/g, '')));
}

function declaredStyles(nodes, found = new Set()) {
  for (const node of nodes) {
    if (node.type === 'at') declaredStyles(node.children, found);
    if (node.type !== 'rule') continue;

    for (const value of stylesInPart(node.selector)) {
      if (value !== null) found.add(value);
    }
  }

  return found;
}

// --- safelist ---------------------------------------------------------------

// `gr-mt-*` — шаблон, `/^gr-/` — регулярное выражение, остальное —
// точное имя: `gr-mt-4` не должен утаскивать за собой `gr-mt-40`.
function safelistMatcher(patterns) {
  const exact = new Set();
  const expressions = [];

  for (const pattern of patterns) {
    if (pattern instanceof RegExp) expressions.push(pattern);
    else if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      const end = pattern.lastIndexOf('/');
      expressions.push(new RegExp(pattern.slice(1, end), pattern.slice(end + 1)));
    } else if (pattern.includes('*')) {
      const source = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      expressions.push(new RegExp(`^${source}$`));
    } else exact.add(pattern);
  }

  return (name) => exact.has(name) || expressions.some((re) => re.test(name));
}

// --- пресеты safelist -------------------------------------------------------

// Классы, которые ставят скрипты пакета ui — рантайм компонентов
// (griffincss-ui.js) и слой виджетов (griffinjs*.js): тост, регион тостов,
// список и теги комбобокса, лайтбокс, кнопки слайдера, панель календаря,
// список файлов, сводка ошибок. В разметке страницы их нет — они
// собираются в рантайме, — и отсечение по разметке их не увидит.
// Список НЕ ВЕДЁТСЯ РУКАМИ: тест packages/utils/test/purge-preset.test.js
// собирает его из src/ (строковые литералы вне комментариев, без
// селекторов и идентификаторов) и роняет npm test при расхождении.
// Подключается ключом --preset ui — к любому файлу пакета:
// griffincss-ui.css, griffinjs.css, griffinjs-fields.css.
export const PRESETS = {
  ui: [
    'gr-btn', 'gr-btn-ghost', 'gr-btn-icon', 'gr-btn-sm',
    'gr-combobox-empty', 'gr-combobox-group', 'gr-combobox-list', 'gr-combobox-option',
    'gr-combobox-tag', 'gr-combobox-tag-remove', 'gr-combobox-tags',
    'gr-counter',
    'gr-datetime-clock', 'gr-datetime-clock-input', 'gr-datetime-day', 'gr-datetime-grid',
    'gr-datetime-head', 'gr-datetime-nav', 'gr-datetime-panel', 'gr-datetime-row',
    'gr-datetime-rows', 'gr-datetime-title', 'gr-datetime-weekday', 'gr-datetime-year',
    'gr-file-item', 'gr-file-list', 'gr-file-name', 'gr-file-remove', 'gr-file-size',
    'gr-lightbox', 'gr-lightbox-caption', 'gr-lightbox-close', 'gr-lightbox-counter',
    'gr-lightbox-item', 'gr-lightbox-next', 'gr-lightbox-prev', 'gr-lightbox-track',
    'gr-modal', 'gr-slider-dot', 'gr-slider-pause',
    'gr-toast', 'gr-toast-*', 'gr-toast-body', 'gr-toast-icon', 'gr-toast-leaving',
    'gr-toast-region', 'gr-toast-region-*', 'gr-toast-title',
    'gr-track',
    'gr-validate', 'gr-validate-list', 'gr-validate-title',
  ],
};

// --- отсечение --------------------------------------------------------------

// Имена анимаций, на которые ссылаются уцелевшие правила: @keyframes
// классов не содержит, и решить по нему самому нечего.
function animationNames(nodes, names = new Set()) {
  for (const node of nodes) {
    if (node.type === 'at') animationNames(node.children, names);
    if (node.type !== 'rule') continue;

    for (const [, value] of node.body.matchAll(/animation(?:-name)?\s*:([^;}]*)/gi)) {
      addTokens(value, names);
    }
  }

  return names;
}

function keyframesName(prelude) {
  const match = prelude.match(/^@(?:-\w+-)?keyframes\s+(.+)$/i);

  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

// Имена слоёв, которые объявляет узел: `@layer a, b;` и `@layer a {…}`.
// Пустой комментарий на месте пробела (`@layer/**/base`) — тот же пробел.
function layerNames(node) {
  const text = (node.type === 'statement' ? node.text.slice(0, -1) : node.prelude ?? '').replace(/\/\*\*\//g, ' ');
  const match = /^@layer\s+([^{]+)$/i.exec(text);

  return match ? match[1].split(',').map((name) => name.trim()) : [];
}

// Опустевший блок не остаётся: пустой блок — это байты, за которые
// пользователь платит ни за что. Именованный слой — исключение (п. 12):
// порядок слоёв задаёт первое появление имени, и без него слой переехал
// бы туда, где встретится его следующий блок. Он остаётся объявлением —
// если только имя не встречалось раньше в том же списке (объявлением
// порядка, как в каждом файле библиотеки, или своим блоком): тогда место
// слоя уже задано, и блок уходит без следа. Встреченные имена — множеством:
// перебор уцелевших соседей на каждый опустевший блок стоил квадрат их числа.
function emptied(node, declared) {
  const [name] = layerNames(node);

  if (!name || declared.has(name)) return null;

  return { type: 'statement', text: `@layer ${name};` };
}

// Список с учётом объявленных в нём слоёв.
function layerList() {
  const nodes = [];
  const declared = new Set();

  return {
    nodes,
    declared,
    push(node) {
      nodes.push(node);
      for (const name of layerNames(node)) declared.add(name);
    },
  };
}

function filterNodes(nodes, isKept, counters, axis) {
  const result = layerList();

  for (const node of nodes) {
    if (node.type === 'statement' || node.type === 'block') {
      result.push(node);
      continue;
    }

    if (node.type === 'at') {
      const children = filterNodes(node.children, isKept, counters, axis);
      const kept = children.length ? { ...node, children } : emptied(node, result.declared);

      if (kept) result.push(kept);

      continue;
    }

    if (straySemicolon(node.selector)) {
      counters.dropped++;
      continue;
    }

    const parts = splitSelector(node.selector).filter((part) =>
      partAlive(part, isKept)
      // Безымянный `[data-gr-style]` держит токены всех стилей: он нужен,
      // пока уцелел хоть один, и не нужен, если ось не встретилась вовсе.
      && stylesInPart(part).every((value) => (value === null ? axis.used : axis.keep(value))),
    );

    if (!parts.length) {
      counters.dropped++;
      continue;
    }

    counters.kept++;
    result.push({ ...node, selector: parts.join(',') });
  }

  return result.nodes;
}

// Второй проход: @keyframes оставляем только те, на которые кто-то
// ссылается. Первый проход их не трогает — ссылки становятся известны
// только после того, как решена судьба обычных правил.
function filterKeyframes(nodes, used, isKept, counters) {
  const result = layerList();

  for (const node of nodes) {
    if (node.type === 'at') {
      const children = filterKeyframes(node.children, used, isKept, counters);
      const kept = children.length ? { ...node, children } : emptied(node, result.declared);

      if (kept) result.push(kept);

      continue;
    }

    if (node.type === 'block') {
      const name = keyframesName(node.prelude);

      if (name && !used.has(name) && !isKept(name)) {
        counters.dropped++;
        continue;
      }

      if (name) counters.kept++;
    }

    result.push(node);
  }

  return result.nodes;
}

export function purge(css, used, { safelist = [], styles = null } = {}) {
  const safe = safelistMatcher(safelist);
  const isKept = (name) => used.has(name) || safe(name);
  const counters = { kept: 0, dropped: 0 };

  const tree = parse(css);

  // styles = null — про разметку ничего не известно (вызов из чужого кода
  // без этой опции): ось не трогаем, отсекать по незнанию нельзя.
  const declared = [...declaredStyles(tree)];
  const keep = styles ? (value) => styles.has(value) || safe(value) : () => true;
  const axis = { keep, used: !styles || declared.some(keep) };

  const filtered = filterNodes(tree, isKept, counters, axis);
  const nodes = filterKeyframes(filtered, animationNames(filtered), isKept, counters);

  return {
    css: stringify(nodes),
    kept: counters.kept,
    dropped: counters.dropped,
    styles: { kept: declared.filter(keep), dropped: declared.filter((value) => !keep(value)) },
  };
}

// --- CLI --------------------------------------------------------------------

// Файлы с кодом: кроме атрибутов class, в них читаются строковые литералы —
// класс, собранный в коде, чаще всего лежит в строке. Python и Rust здесь
// со Этапа 40: вёрстка серверной панели живёт в .py и в шаблонах, и обход
// каталога без них молча отдавал файл без половины стилей.
export const CODE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro', '.py', '.rs',
]);

// Что берётся при обходе каталога. Явно переданный файл берётся всегда,
// с любым расширением, — список действует только на обход.
export const CONTENT_EXT = new Set([
  ...CODE_EXT,
  '.html', '.htm', '.xhtml', '.php', '.twig', '.erb', '.hbs', '.md', '.mdx', '.liquid', '.blade',
  '.jinja', '.jinja2', '.j2', '.django', '.tmpl', '.gotmpl',
]);

export function collectFiles(target, files = []) {
  const stats = statSync(target);

  if (stats.isFile()) {
    files.push(target);
    return files;
  }

  for (const entry of readdirSync(target)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;

    const child = join(target, entry);

    if (statSync(child).isDirectory()) collectFiles(child, files);
    else if (CONTENT_EXT.has(extname(child).toLowerCase())) files.push(child);
  }

  return files;
}

// По умолчанию — CSS утилит своего пакета, а не путь от текущего каталога:
// команду зовут из проекта, где библиотека лежит в node_modules.
const OWN_CSS = fileURLToPath(new URL('../dist/griffincss-utils.css', import.meta.url));

// Пресет идёт за версией отсекаемого CSS: список классов, которые ставят
// скрипты ui, у каждой версии свой, а `npx -p griffincss-utils` проекту
// с одними компонентами ставит последнюю версию утилит. Порядок поиска:
//   1. purge-presets.json рядом с файлом из --css — он лежит в той же dist,
//      что griffincss-ui.css, griffinjs.css и griffinjs-fields.css; кто
//      переносит файлы библиотеки к себе, кладёт его рядом с CSS;
//   2. griffincss-ui, найденный разрешением модулей от текущего каталога, —
//      как у require, и в node_modules выше по дереву (в монорепозитории
//      так находится корневой node_modules), поэтому только вторым;
//   3. встроенный список.
// Отчёт называет, откуда взят пресет, — путь найденного файла, а не «проект»:
// griffincss-ui выше по дереву может оказаться чужим (ревью CHU, п. 36).
function presetSources(css) {
  const sources = [];
  const beside = join(dirname(resolve(css)), 'purge-presets.json');

  try {
    sources.push({ presets: JSON.parse(readFileSync(beside, 'utf8')), source: shown(beside) });
  } catch { /* рядом с CSS файла нет */ }

  try {
    const require = createRequire(join(process.cwd(), 'package.json'));
    const file = require.resolve('griffincss-ui/dist/purge-presets.json');
    const version = require('griffincss-ui/package.json').version;

    sources.push({ presets: JSON.parse(readFileSync(file, 'utf8')), source: `${shown(file)}, griffincss-ui ${version}` });
  } catch { /* griffincss-ui не найден или он старше 0.30.0 */ }

  return sources;
}

// Путь для отчёта — от текущего каталога и от одинаковой нормализации:
// на macOS рабочий каталог приходит в NFD, а путь, набранный руками, — в NFC,
// и relative() иначе обрывал общую часть на первой «й» и печатал обход.
function shown(file) {
  return relative(process.cwd().normalize('NFC'), file.normalize('NFC'));
}

function parseArgs(argv) {
  const options = { css: OWN_CSS, out: null, safelist: [], presets: [], content: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--css') options.css = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--safelist') options.safelist.push(...String(argv[++i]).split(',').filter(Boolean));
    else if (arg === '--preset') {
      const name = String(argv[++i]);

      if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) {
        console.error(`purge: неизвестный пресет ${name}; есть: ${Object.keys(PRESETS).join(', ')}`);
        process.exit(1);
      }

      options.presets.push({ name });
    }
    else if (arg.startsWith('--')) {
      console.error(`purge: неизвестная опция ${arg}`);
      process.exit(1);
    } else options.content.push(arg);
  }

  // Пресеты — после разбора: --css может стоять в строке и после --preset.
  const sources = options.presets.length ? presetSources(options.css) : [];

  for (const preset of options.presets) {
    const found = sources.find((candidate) => Array.isArray(candidate.presets?.[preset.name]));
    const list = found ? found.presets[preset.name] : PRESETS[preset.name];

    preset.size = list.length;
    preset.source = found ? found.source : 'встроенный';
    options.safelist.push(...list);
  }

  return options;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;
const gzip = (text) => gzipSync(Buffer.from(text), { level: 9 }).length;
const brotli = (text) => brotliCompressSync(Buffer.from(text)).length;

// Классы, которые есть в селекторах отсекаемого CSS.
function cssClasses(nodes, found = new Set()) {
  for (const node of nodes) {
    if (node.type === 'at') cssClasses(node.children, found);
    else if (node.type === 'rule') for (const name of classesInPart(maskAttributes(node.selector))) found.add(name);
  }

  return found;
}

function main(argv) {
  const options = parseArgs(argv);

  if (!options.content.length) {
    console.error('purge: не указано ни одного файла разметки');
    console.error('  использование: griffincss-purge [--css файл] [--out файл] [--safelist a,b*] [--preset ui] <файлы или каталоги>');
    process.exit(1);
  }

  const files = options.content.flatMap((target) => collectFiles(resolve(target)));
  const used = new Set();
  const styles = new Set();

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const js = CODE_EXT.has(extname(file).toLowerCase());

    for (const cls of extractClasses(text, { js })) used.add(cls);
    for (const value of extractStyles(text)) styles.add(value);
  }

  const source = readFileSync(resolve(options.css), 'utf8');
  const result = purge(source, used, { safelist: options.safelist, styles });

  if (options.out) writeFileSync(resolve(options.out), result.css);
  else process.stdout.write(result.css);

  // Отчёт всегда и всегда в stderr: без --out поток stdout занят самим CSS.
  // Молчаливое отсечение — это пропавший в проде стиль, о котором никто
  // не узнал до того, как его увидел пользователь.
  const total = result.kept + result.dropped;

  // Имён в разметке больше, чем классов: значение class делится по пробелам,
  // и на шаблонах (Twig, JSX) это и обрывки вроде `{{` или `th-total{%`
  // (ревью OcapiCMS к 0.30.0, п. 2). С классом из CSS они не совпадут
  // и отсечению не мешают, а диагностика — второе число.
  const inCss = cssClasses(parse(source));
  const known = [...used].filter((name) => inCss.has(name)).length;

  console.error(`purge: ${files.length} файлов разметки, имён в разметке: ${used.size}, из них классов этого CSS: ${known}`);
  console.error(`purge: правил оставлено ${result.kept} из ${total}, выброшено ${result.dropped}`);
  console.error(
    `purge: ${kb(source.length)} → ${kb(result.css.length)}` +
      ` (gzip ${gzip(source)} → ${gzip(result.css)} Б, brotli ${brotli(source)} → ${brotli(result.css)} Б)`,
  );

  // Ось оформления: тот, кто отсекает неиспользуемое, перестаёт платить
  // за три стиля из четырёх — но только если стиль стоит в разметке.
  if (result.styles.kept.length || result.styles.dropped.length) {
    const kept = result.styles.kept.length ? result.styles.kept.join(', ') : 'ни одного — в разметке нет data-gr-style';

    console.error(`purge: ось оформления — оставлено: ${kept}` +
      (result.styles.dropped.length ? `; выброшено: ${result.styles.dropped.join(', ')}` : ''));

    if (!result.styles.kept.length) {
      console.error('purge: стиль, который ставится в рантайме (el.dataset.grStyle), укажите в --safelist');
    }
  }

  // Пресет назван в отчёте: по счётчикам видно, что safelist собран
  // правильно, а по этой строке — из чего он собран.
  for (const { name, size, source } of options.presets) {
    console.error(`purge: пресет ${name} (${source}) — классы, которые ставят скрипты пакета ${name}; имён в safelist: ${size}`);
  }

  if (!options.safelist.length) {
    console.error('purge: safelist пуст — классы, которые собираются в рантайме, отсечены вместе с остальными');
  }
}

// Запуск, а не импорт. npm кладёт в node_modules/.bin ссылку на файл,
// и process.argv[1] — путь ссылки: сравниваются настоящие пути.
function invoked() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (process.argv[1] && invoked()) {
  main(process.argv.slice(2));
}
