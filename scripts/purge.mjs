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
const NESTED = new Set(['media', 'supports', 'container', 'layer', 'scope', 'document']);

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
// :is(), :not() и [attr="a,b"] запятыми не считаются.
function splitSelector(selector) {
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

function filterNodes(nodes, isKept, counters) {
  const result = [];

  for (const node of nodes) {
    if (node.type === 'statement' || node.type === 'block') {
      result.push(node);
      continue;
    }

    if (node.type === 'at') {
      const children = filterNodes(node.children, isKept, counters);

      // Опустевший @media не остаётся: пустой блок — это байты,
      // за которые пользователь платит ни за что.
      if (children.length) result.push({ ...node, children });

      continue;
    }

    const parts = splitSelector(node.selector).filter((part) =>
      classesInPart(part).every((cls) => isKept(cls)),
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

export function purge(css, used, { safelist = [] } = {}) {
  const safe = safelistMatcher(safelist);
  const isKept = (name) => used.has(name) || safe(name);
  const counters = { kept: 0, dropped: 0 };

  const filtered = filterNodes(parse(css), isKept, counters);
  const nodes = filterKeyframes(filtered, animationNames(filtered), isKept, counters);

  return { css: stringify(nodes), kept: counters.kept, dropped: counters.dropped };
}

// --- CLI --------------------------------------------------------------------

const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro']);
const CONTENT_EXT = new Set([
  ...JS_EXT,
  '.html', '.htm', '.xhtml', '.php', '.twig', '.erb', '.hbs', '.md', '.mdx', '.liquid', '.blade',
]);

function collectFiles(target, files = []) {
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
  const options = { css: 'packages/utils/dist/griffincss-utils.css', out: null, safelist: [], content: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--css') options.css = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--safelist') options.safelist.push(...String(argv[++i]).split(',').filter(Boolean));
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
    console.error('  использование: node scripts/purge.mjs [--css файл] [--out файл] [--safelist a,b*] <файлы или каталоги>');
    process.exit(1);
  }

  const files = options.content.flatMap((target) => collectFiles(resolve(target)));
  const used = new Set();

  for (const file of files) {
    const js = JS_EXT.has(extname(file).toLowerCase());

    for (const cls of extractClasses(readFileSync(file, 'utf8'), { js })) used.add(cls);
  }

  const source = readFileSync(resolve(options.css), 'utf8');
  const result = purge(source, used, { safelist: options.safelist });

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

  if (!options.safelist.length) {
    console.error('purge: safelist пуст — классы, которые собираются в рантайме, отсечены вместе с остальными');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
