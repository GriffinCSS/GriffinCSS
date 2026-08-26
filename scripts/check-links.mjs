#!/usr/bin/env node
// Griffincss — обходчик ссылок документации.
//
// Проверяет каждую ссылку из docs/*.html и из README.md: существует ли файл,
// на который она ведёт, и существует ли якорь внутри него. Внешние адреса
// не запрашиваются — проверка обязана работать без сети и одинаково
// в CI и на машине разработчика.
//
// Появился вместе с разделением README: справочники по классам уехали
// в docs/reference-*.html, и без обходчика цена опечатки в ссылке —
// молчащая четырёхсотая страница, которую замечает читатель, а не сборка.
//
// Ноль зависимостей.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

import { cutDemos } from './build-docs-index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

// Ссылки внутри примеров — часть примера, а не навигация: `href="/"`
// в образце разметки никуда не ведёт и вести не должен, а `href="#nav"`
// в демонстрации шапки указывает на элемент, которого на странице
// документации нет и быть не должно.
const withoutSamples = (html) => cutDemos(html).replace(/<pre\b[\s\S]*?<\/pre>/gi, '');

// Якоря страницы: заданные в разметке id плюс те, что docs/nav.js проставляет
// заголовкам из индекса поиска. Второй источник обязателен — ссылки вида
// `spacing.html#shkala` ведут именно на такой якорь, и в самой разметке
// его нет.
function anchorsOf(file, html, fromIndex) {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  for (const anchor of fromIndex.get(file) ?? []) ids.add(anchor);

  return ids;
}

function indexAnchors() {
  const byPage = new Map();
  const path = join(root, 'docs/search-index.js');

  if (!existsSync(path)) return byPage;

  const source = readFileSync(path, 'utf8');
  const pages = [...(source.match(/pages: \[\n([\s\S]*?)\n\],/)?.[1] ?? '').matchAll(/^\["([^"]+)"/gm)]
    .map((m) => m[1]);

  for (const row of (source.match(/headings: \[\n([\s\S]*?)\n\],/)?.[1] ?? '').split('\n')) {
    const parsed = /^\[(\d+),\d+,.*,"([^"]*)"\]/.exec(row);

    if (!parsed) continue;

    const page = pages[Number(parsed[1])];

    if (!page) continue;

    if (!byPage.has(page)) byPage.set(page, new Set());

    byPage.get(page).add(parsed[2]);
  }

  return byPage;
}

const fromIndex = indexAnchors();
const cache = new Map();

function pageAnchors(absolute) {
  if (cache.has(absolute)) return cache.get(absolute);

  const html = readFileSync(absolute, 'utf8');
  const ids = anchorsOf(relative(join(root, 'docs'), absolute), html, fromIndex);

  cache.set(absolute, ids);

  return ids;
}

// Разбирает одну ссылку и жалуется, если цель не находится.
function check(where, dir, href) {
  // Голая решётка — заглушка вместо адреса, а не сломанный якорь.
  if (href === '#' || href === '') return;

  if (/^(https?:|mailto:|tel:|data:|#)/.test(href)) {
    // Якорь внутри той же страницы проверяется по ней самой.
    if (href.startsWith('#')) {
      const self = join(dir, where.split('/').pop());

      if (existsSync(self) && !pageAnchors(self).has(href.slice(1))) {
        fail(where, `якоря ${href} на этой же странице нет`);
      }
    }

    return;
  }

  const [path, anchor] = href.split('#');
  const target = resolve(dir, path);

  if (!existsSync(target)) {
    fail(where, `ссылка ведёт в пустоту: ${href}`);

    return;
  }

  if (!anchor || statSync(target).isDirectory() || !target.endsWith('.html')) return;

  if (!pageAnchors(target).has(anchor)) {
    fail(where, `в ${path} нет якоря #${anchor}`);
  }
}

// --- docs/*.html ------------------------------------------------------------

const docs = join(root, 'docs');
const htmlFiles = readdirSync(docs).filter((name) => name.endsWith('.html'));
let links = 0;

for (const name of htmlFiles) {
  const html = withoutSamples(readFileSync(join(docs, name), 'utf8'));

  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    links += 1;
    check(`docs/${name}`, docs, match[1]);
  }
}

// Ссылки, которые ставит docs/nav.js: боковая панель — тоже навигация,
// и опечатка в ней ломает переход ровно так же.
const nav = readFileSync(join(docs, 'nav.js'), 'utf8');

for (const match of nav.matchAll(/href:\s*'([^']+)'/g)) {
  links += 1;
  check('docs/nav.js', docs, match[1]);
}

// --- README.md --------------------------------------------------------------

const readme = readFileSync(join(root, 'README.md'), 'utf8')
  .replace(/```[\s\S]*?```/g, '');

for (const match of readme.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
  links += 1;
  check('README.md', root, match[1]);
}

// --- итог -------------------------------------------------------------------

if (problems.length > 0) {
  console.error('check-links: обнаружены битые ссылки\n');
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  console.error(`\ncheck-links: битых ссылок — ${problems.length} из ${links}`);
  process.exit(1);
}

console.log(`check-links: проверено ссылок — ${links}, битых нет`);
