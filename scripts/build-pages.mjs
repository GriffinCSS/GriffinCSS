#!/usr/bin/env node
// Griffincss — сборка сайта документации для GitVerse Pages.
//
// Площадка публикует один каталог, и он становится корнем сайта. В дереве
// репозитория документация лежит в docs/, а сборки — в packages/*/dist/,
// и страницы тянут их выходом наверх: `../packages/core/dist/...`. Выход
// наверх из корня сайта никуда не ведёт, поэтому дерево не копируется
// один в один, а перекладывается: docs/ становится корнем, packages/
// приезжает под него, а пути в разметке переписываются.
//
// Почему отдельный скрипт, а не команды внутри workflow: перекладку нужно
// уметь запустить и проверить локально (`npm run build:pages`), а YAML
// на площадке не запускается нигде. Проверки в конце — не украшение:
// незамеченная опечатка в пути даёт страницу без стилей, и видит её
// читатель, а не сборка.
//
// Зависимостей нет намеренно: workflow не ставит их (packages/*/dist
// лежит в репозитории), и добавить сюда npm ci пришлось бы ради одной
// этой перекладки.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Каталоги docs/, которые на сайте не нужны. design/ — рабочие заметки
// по оформлению в Markdown: без генератора статики они не страница,
// а файл на скачивание.
const DOCS_SKIP_DIRS = new Set(['design']);

// Расширения, содержимое которых читается как текст и переписывается.
// Всё остальное копируется побайтно.
const TEXT = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);

// Карты кода в репозиторий не идут (см. .gitignore), значит их нет и в CI.
// Локальная сборка обязана совпадать с той, что уедет на площадку, иначе
// проверять локально нечего.
const DIST_SKIP = /\.map$/;

const extname = (name) => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot);
};

// === Перекладка =============================================================

// Единственная правка содержимого. Ровно одна замена, а не общая
// «нормализация путей»: чем шире правило, тем незаметнее оно испортит
// пример разметки внутри <pre>.
export function rewrite(text) {
  return text.split('../packages/').join('packages/');
}

function copyInto(from, into, written, { skipDirs = new Set(), skipFiles = null } = {}) {
  for (const name of readdirSync(from).sort()) {
    const full = join(from, name);

    if (statSync(full).isDirectory()) {
      if (skipDirs.has(name)) continue;
      copyInto(full, join(into, name), written, { skipDirs, skipFiles });
      continue;
    }

    if (skipFiles?.test(name)) continue;

    const dest = join(into, name);
    const buffer = readFileSync(full);

    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, TEXT.has(extname(name)) ? rewrite(buffer.toString('utf8')) : buffer);

    written.push(dest);
  }
}

// === Проверки ===============================================================

// Ссылки на сборки собираются только из атрибутов. Примеры разметки внутри
// <pre> сюда не попадают: в них путь пишется от имени пакета
// (`griffincss-core/dist/...`), а не от `packages/`.
const ASSET = /(?:href|src)="(packages\/[^"#?]+)"/g;

function checkAssets(out, pages) {
  const missing = new Set();

  for (const page of pages) {
    const html = readFileSync(page, 'utf8');

    for (const [, href] of html.matchAll(ASSET)) {
      if (!existsSync(join(out, href))) missing.add(`${relative(out, page)} → ${href}`);
    }
  }

  if (missing.size > 0) {
    throw new Error(`build-pages: ссылки ведут в пустоту:\n  ${[...missing].join('\n  ')}`);
  }
}

// Выход наверх из корня сайта не ведёт никуда. Если он где-то уцелел,
// значит замена его не покрыла, и это ошибка сборки, а не мелочь.
//
// Проверяются файлы документации: страницы, стили и скрипты доксайта —
// именно они ссылаются друг на друга и на dist по пути. Артефакты
// packages/*/dist/ копируются как есть и ни на что не ссылаются, а строка
// `../` в них — не адрес: модули GriffinJS несут в обёртке
// require('../core/griffinjs-core.js') для запуска под Node.
function checkNoEscapes(out, written) {
  const guilty = [];

  for (const file of written) {
    if (!TEXT.has(extname(file))) continue;
    if (relative(out, file).split(sep)[0] === 'packages') continue;
    if (readFileSync(file, 'utf8').includes('../')) guilty.push(relative(out, file));
  }

  if (guilty.length > 0) {
    throw new Error(`build-pages: выход наверх уцелел в файлах:\n  ${guilty.join('\n  ')}`);
  }
}

// === Сборка =================================================================

export function build(from, out) {
  const docs = join(from, 'docs');
  const packages = join(from, 'packages');

  if (!existsSync(join(docs, 'index.html'))) {
    throw new Error('build-pages: нет docs/index.html — сайту нечего показать в корне');
  }

  if (resolve(out) === resolve(from)) {
    throw new Error('build-pages: каталог сайта совпадает с исходным');
  }

  rmSync(out, { recursive: true, force: true });

  const written = [];

  copyInto(docs, out, written, { skipDirs: DOCS_SKIP_DIRS });

  for (const name of readdirSync(packages).sort()) {
    const dist = join(packages, name, 'dist');
    if (!existsSync(dist)) continue;

    copyInto(dist, join(out, 'packages', name, 'dist'), written, { skipFiles: DIST_SKIP });
  }

  const pages = written.filter((file) => file.endsWith('.html'));

  checkAssets(out, pages);
  checkNoEscapes(out, written);

  return written;
}

// === Точка входа ============================================================

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const out = resolve(process.argv[2] ?? join(root, '_site'));

  try {
    const written = build(root, out);
    const pages = written.filter((file) => file.endsWith('.html')).length;

    console.log(`build-pages: ${relative(root, out) || out} — файлов ${written.length}, страниц ${pages}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
