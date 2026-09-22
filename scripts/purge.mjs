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
// Ноль зависимостей.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, extname, resolve } from 'node:path';

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

// Индекс парной закрывающей скобки: i указывает на `{`.
function blockEnd(css, i) {
  let depth = 0;

  for (; i < css.length; i++) {
    const c = css[i];

    if (c === '"' || c === "'") i = skipString(css, i) - 1;
    else if (c === '/' && css[i + 1] === '*') i = css.indexOf('*/', i + 2) + 1 || css.length;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }

  return css.length;
}

export function parse(css, from = 0, to = css.length) {
  const nodes = [];
  let start = from;
  let i = from;

  while (i < to) {
    const c = css[i];

    if (c === '"' || c === "'") {
      i = skipString(css, i);
      continue;
    }

    if (c === '/' && css[i + 1] === '*') {
      i = (css.indexOf('*/', i + 2) + 2) || to;
      continue;
    }

    if (c === ';') {
      const text = css.slice(start, i + 1).trim();

      if (text) nodes.push({ type: 'statement', text });

      start = ++i;
      continue;
    }

    if (c === '{') {
      const prelude = css.slice(start, i).trim();
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

    if (c === '"' || c === "'") i = skipString(selector, i) - 1;
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

const CLASS_IN_SELECTOR = /\.((?:\\.|[^\s.,:>+~()[\]{}'"*|=$^!])+)/g;

// `.gr-w-1\/2` → `gr-w-1/2`: браузер сопоставляет класс с разметкой
// уже без экранирования, и скрипт обязан сравнивать так же.
const unescape = (name) => name.replace(/\\(.)/g, '$1');

function classesInPart(part) {
  return [...part.matchAll(CLASS_IN_SELECTOR)].map(([, name]) => unescape(name));
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
const FUNCTIONAL = /:(not|is|where|has)\(/g;

// Индекс закрывающей скобки для открывающей в позиции `open`.
function parenEnd(text, open) {
  let depth = 0;

  for (let i = open; i < text.length; i++) {
    const c = text[i];

    if (c === '"' || c === "'") i = skipString(text, i) - 1;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }

  return text.length;
}

function partAlive(part, isKept) {
  let outside = '';
  let i = 0;

  while (i < part.length) {
    FUNCTIONAL.lastIndex = i;
    const m = FUNCTIONAL.exec(part);

    if (!m) { outside += part.slice(i); break; }

    const open = m.index + m[0].length - 1;
    const close = parenEnd(part, open);

    outside += part.slice(i, m.index);
    i = close + 1;

    if (m[1] === 'not') continue;
    if (!splitSelector(part.slice(open + 1, close)).some((alt) => partAlive(alt, isKept))) return false;
  }

  return classesInPart(outside).every((cls) => isKept(cls));
}

// --- классы в разметке ------------------------------------------------------

// Значение атрибута class: и в разметке, и в экранированном примере
// внутри <pre>. Пробел вокруг `=` не допускается намеренно — иначе
// `el.className = '…'` в HTML-файле читался бы как атрибут.
const CLASS_ATTR = /(?:class|className|class:list)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s>]+))/g;

// Строковые литералы: только для файлов с кодом. Класс, собранный
// склейкой ('gr-mt-' + n), так не найдётся — на то и safelist.
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

const TOKEN = /[A-Za-z_][A-Za-z0-9_\-/.%[\]()]*/g;

function addTokens(value, found) {
  for (const [token] of value.matchAll(TOKEN)) found.add(token);
}

export function extractClasses(text, { js = false } = {}) {
  const found = new Set();

  for (const match of text.matchAll(CLASS_ATTR)) {
    addTokens(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '', found);
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
    'gr-modal', 'gr-slide', 'gr-slider-dot', 'gr-slider-pause',
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

    for (const [, value] of node.body.matchAll(/animation(?:-name)?\s*:([^;}]*)/g)) {
      addTokens(value, names);
    }
  }

  return names;
}

function keyframesName(prelude) {
  const match = prelude.match(/^@(?:-\w+-)?keyframes\s+(.+)$/i);

  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

function filterNodes(nodes, isKept, counters, axis) {
  const result = [];

  for (const node of nodes) {
    if (node.type === 'statement' || node.type === 'block') {
      result.push(node);
      continue;
    }

    if (node.type === 'at') {
      const children = filterNodes(node.children, isKept, counters, axis);

      // Опустевший @media не остаётся: пустой блок — это байты,
      // за которые пользователь платит ни за что.
      if (children.length) result.push({ ...node, children });

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

  return result;
}

// Второй проход: @keyframes оставляем только те, на которые кто-то
// ссылается. Первый проход их не трогает — ссылки становятся известны
// только после того, как решена судьба обычных правил.
function filterKeyframes(nodes, used, isKept, counters) {
  const result = [];

  for (const node of nodes) {
    if (node.type === 'at') {
      result.push({ ...node, children: filterKeyframes(node.children, used, isKept, counters) });
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

  return result.filter((node) => node.type !== 'at' || node.children.length);
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

function parseArgs(argv) {
  const options = { css: 'packages/utils/dist/griffincss-utils.css', out: null, safelist: [], presets: [], content: [] };

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

      options.presets.push(name);
      options.safelist.push(...PRESETS[name]);
    }
    else if (arg.startsWith('--')) {
      console.error(`purge: неизвестная опция ${arg}`);
      process.exit(1);
    } else options.content.push(arg);
  }

  return options;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;
const gzip = (text) => gzipSync(Buffer.from(text), { level: 9 }).length;
const brotli = (text) => brotliCompressSync(Buffer.from(text)).length;

function main(argv) {
  const options = parseArgs(argv);

  if (!options.content.length) {
    console.error('purge: не указано ни одного файла разметки');
    console.error('  использование: node scripts/purge.mjs [--css файл] [--out файл] [--safelist a,b*] [--preset ui] <файлы или каталоги>');
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

  console.error(`purge: ${files.length} файлов разметки, найдено классов: ${used.size}`);
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
  for (const name of options.presets) {
    console.error(`purge: пресет ${name} — классы, которые ставят скрипты пакета ${name}; имён в safelist: ${PRESETS[name].length}`);
  }

  if (!options.safelist.length) {
    console.error('purge: safelist пуст — классы, которые собираются в рантайме, отсечены вместе с остальными');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
