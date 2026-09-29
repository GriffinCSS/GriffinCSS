#!/usr/bin/env node
// Griffincss — сверка классов документации со сборкой.
//
//   node scripts/check-docs-classes.mjs [корень дерева]
//
// Каждый класс gr-* из docs/*.html — в разметке, в экранированных образцах
// внутри <pre>, в className образцов React и в classList обработчиков —
// обязан найтись в селекторах собранных packages/*/dist/*.css. Пример
// «Лента без скрипта» жил на трёх классах, которых в сборке нет: скопированная
// из него разметка молча теряла размеры и скругление, и заметил это читатель,
// а не сборка. Проверка — по собранному CSS, а не по исходникам SCSS: читатель
// получает именно его.
//
// Не классами сборки считаются произвольные значения (gr-w-[48px] — их
// правила пишет рантайм утилит) и заготовки шаблонов (gr-grid-{{ n }},
// gr-text-${tone}, gr-…): у таких имён нет полного вида. Остальные законно
// чужие классы — в EXEMPT, каждый со своей причиной.
//
// Разбор CSS — парсером purge.mjs; ноль зависимостей.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { parse } from './purge.mjs';

// Исключения: шаблон (звёздочка — хвост имени) и причина. Причина
// обязательна — исключение без неё скрывает ошибку, а не объясняет.
export const EXEMPT = [
  {
    pattern: 'gr-area-*',
    why: 'имя области раскладки: правило .gr-area-<имя> пишет рантайм ядра (griffincss.js) или миксин gr-grid-layout() по раскладке страницы, в собранном CSS его нет',
  },
  {
    pattern: 'gr-l-*',
    why: 'класс раскладки: gr-l-<хеш> ставит рантайм ядра, gr-l-<имя> заводит миксин gr-grid-layout(…, $name) в SCSS страницы',
  },
  {
    pattern: 'gr-theme-keep',
    why: 'маркер griffincss-theme.js: поддерево остаётся вне гашения переходов при смене темы; правила в CSS нет намеренно',
  },
];

export function exemptReason(cls) {
  const rule = EXEMPT.find(({ pattern }) => (pattern.endsWith('*') ? cls.startsWith(pattern.slice(0, -1)) : cls === pattern));

  return rule ? rule.why : null;
}

// --- классы сборки ------------------------------------------------------------

const CLASS_IN_SELECTOR = /\.((?:\\.|[^\s.,:>+~()[\]{}'"*|=$^!])+)/g;

// `.gr-w-1\/2` → `gr-w-1/2`: браузер сравнивает класс разметки с селектором
// уже без экранирования, и сторож обязан сравнивать так же.
const unescape = (name) => name.replace(/\\(.)/g, '$1');

export function builtClasses(css, found = new Set()) {
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'at') walk(node.children);
      if (node.type !== 'rule') continue;

      for (const [, name] of node.selector.matchAll(CLASS_IN_SELECTOR)) found.add(unescape(name));
    }
  };

  walk(parse(css));

  return found;
}

// --- классы документации ------------------------------------------------------

// Значение атрибута class: и в разметке, и в экранированном образце внутри
// <pre> (кавычки там не экранируются), и в className образцов React.
// Пробел вокруг `=` не допускается намеренно — `el.className = '…'`
// в образце скрипта собирает имя в рантайме и атрибутом не является.
const CLASS_ATTR = /\b(?:class|className)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;

// Аргументы classList.add/remove/toggle/replace в обработчиках демо.
const CLASS_LIST = /classList\.(?:add|remove|toggle|replace)\(([^)]*)\)/g;
const STRING_LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;

// Имя класса библиотеки. Скобки и слэш — ради дробей и произвольных
// значений: последние отбрасываются целиком, а не обрезаются до префикса.
const TOKEN = /(?<![\w-])gr-[\w\-/.%[\]()+]*/g;

// Произвольное значение (есть `[`) или заготовка без хвоста (оканчивается
// дефисом: gr-grid-{{ n }}, gr-text-${tone}, gr-…) — не класс сборки.
const complete = (token) => !token.includes('[') && !token.endsWith('-');

// Строка, в которой стоит символ с данным индексом (с единицы).
function lineAt(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;

    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }

  return lo + 1;
}

// Карта «класс → строки», где он встречается. Позиция считается по самому
// классу, а не по началу атрибута: у многострочного атрибута это разные строки.
export function classesInDoc(html) {
  const starts = [0];

  for (let i = html.indexOf('\n'); i !== -1; i = html.indexOf('\n', i + 1)) starts.push(i + 1);

  const found = new Map();
  const add = (value, offset) => {
    for (const match of value.matchAll(TOKEN)) {
      const token = match[0];

      if (!complete(token)) continue;

      const line = lineAt(starts, offset + match.index);
      const lines = found.get(token) || [];

      if (lines[lines.length - 1] !== line) lines.push(line);
      found.set(token, lines);
    }
  };

  for (const match of html.matchAll(CLASS_ATTR)) {
    const group = match[1] !== undefined ? 1 : match[2] !== undefined ? 2 : 3;

    add(match[group], match.index + match[0].indexOf(match[group]));
  }

  for (const match of html.matchAll(CLASS_LIST)) {
    const args = match[1];
    const base = match.index + match[0].indexOf(args);

    for (const literal of args.matchAll(STRING_LITERAL)) {
      const value = literal[1] ?? literal[2];

      add(value, base + literal.index + 1);
    }
  }

  return found;
}

export function unknownClasses(html, known) {
  const out = [];

  for (const [cls, lines] of classesInDoc(html)) {
    if (known.has(cls) || exemptReason(cls)) continue;
    out.push({ cls, lines });
  }

  return out.sort((a, b) => a.lines[0] - b.lines[0] || a.cls.localeCompare(b.cls));
}

// --- командная строка ---------------------------------------------------------

function cssFiles(root) {
  const packages = join(root, 'packages');
  const files = [];

  if (!existsSync(packages)) return files;

  for (const pkg of readdirSync(packages)) {
    const dist = join(packages, pkg, 'dist');

    if (!existsSync(dist)) continue;

    for (const name of readdirSync(dist)) if (name.endsWith('.css')) files.push(join(dist, name));
  }

  return files;
}

function main(root) {
  const known = new Set();

  for (const file of cssFiles(root)) builtClasses(readFileSync(file, 'utf8'), known);

  const docs = join(root, 'docs');
  const pages = readdirSync(docs).filter((name) => name.endsWith('.html')).sort();
  const problems = [];
  let checked = 0;

  for (const name of pages) {
    const html = readFileSync(join(docs, name), 'utf8');

    checked += classesInDoc(html).size;

    for (const { cls, lines } of unknownClasses(html, known)) {
      const shown = lines.length > 6 ? `${lines.slice(0, 6).join(', ')}, …` : lines.join(', ');

      problems.push(`${cls} → docs/${name} × ${lines.length} (${lines.length === 1 ? 'строка' : 'строки'} ${shown})`);
    }
  }

  if (problems.length > 0) {
    console.error('check-docs-classes: в документации классы, которых нет в собранном CSS\n');
    for (const problem of problems) console.error(`  ✖ ${problem}`);
    console.error(`\ncheck-docs-classes: неизвестных классов — ${problems.length}; класс образца обязан быть в packages/*/dist/*.css или в EXEMPT с причиной`);
    process.exit(1);
  }

  console.log(`check-docs-classes: классов в ${pages.length} страницах — ${checked}, неизвестных нет`);
}

if (process.argv[1] && process.argv[1].endsWith('check-docs-classes.mjs')) {
  main(resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..')));
}
