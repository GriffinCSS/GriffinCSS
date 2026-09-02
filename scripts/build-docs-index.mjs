#!/usr/bin/env node
// Griffincss — статический индекс поиска по документации.
//
// Собирает в один файл три вида записей: страницы, заголовки разделов
// и имена, объявленные библиотекой, — классы из dist/*.css и токены
// --gr-*. Каждое имя привязано к странице, где оно объясняется, а не
// к той, где просто встретилось: побеждает страница с наибольшим числом
// упоминаний, потому что справочная таблица класса лежит именно там.
//
// Выход — docs/search-index.js, а не JSON: fetch по file:// браузер
// блокирует политикой источников, а доксайт открывают в том числе просто
// файлом. Файл присваивает window.GR_DOCS_INDEX и подключается тегом
// <script>, который ставит сам docs/nav.js.
//
// Здесь же живут якоря заголовков: nav.js берёт их отсюда и не вычисляет
// сам — иначе один и тот же slug пришлось бы писать дважды, на Node
// и в браузере, и однажды они разошлись бы.
//
// Ноль зависимостей.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DOCS = join(root, 'docs');
const OUT = join(DOCS, 'search-index.js');

const CSS = [
  'packages/core/dist/griffincss-core.css',
  'packages/core/dist/griffincss-reset.css',
  'packages/core/dist/griffincss-styles.css',
  'packages/ui/dist/griffincss-ui.css',
  'packages/utils/dist/griffincss-utils.css',
];

// Страницы, которых в поиске быть не должно: это стенды рантайма, а не
// разделы документации. Читатель, попавший на stream-off.html из поиска,
// решит, что нашёл описание возможности, а найдёт демонстрацию её отсутствия.
//
// 404.html здесь по другой причине: это ответ площадки на неверный адрес,
// а не раздел. Найти его поиском — значит попасть на «страница не найдена»
// как на результат поиска, что читателя только собьёт.
const SKIP = new Set(['stream-off.html', 'slow.html', '404.html']);
// Полигон GriffinJS — стенд для браузерных тестов, а не раздел документации:
// та же причина, что у stream-off.html.
SKIP.add('griffinjs-lab.html');
SKIP.add('griffinjs-fields-lab.html');

// Слой GriffinJS: классы griffinjs.css попадают в индекс наравне с классами
// компонентов, а атрибуты data-gr-<виджет> слоя — отдельной группой: их
// ищут так же, как классы, а страница у них — раздел GriffinJS, где о них
// говорят, а не страница компонента, где они только стоят в разметке.
CSS.push('packages/ui/dist/griffinjs.css');

const GRIFFIN_SRC = 'packages/ui/src/griffinjs';
const ATTR = /\bdata-gr-[\w-]+/g;

// Объявленные атрибуты слоя: data-gr-<виджет> по defineWidget и строковые
// литералы 'data-gr-…' в исходниках (data-gr-open, data-gr-src, data-gr-prev…).
function griffinAttrs() {
  const out = new Set();
  const dir = join(root, GRIFFIN_SRC);

  if (!existsSync(dir)) return out;

  const walk = (at) => {
    for (const name of readdirSync(at)) {
      const full = join(at, name);

      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.js')) continue;

      const source = readFileSync(full, 'utf8');

      for (const m of source.matchAll(/defineWidget\('([\w-]+)'/g)) out.add(`data-gr-${m[1]}`);
      for (const m of source.matchAll(/'(data-gr-[\w-]+)'/g)) out.add(m[1]);
    }
  };

  walk(dir);

  return out;
}

// --- разбор HTML ------------------------------------------------------------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»',
  mdash: '—', ndash: '–', times: '×', hellip: '…', rarr: '→', larr: '←', deg: '°',
};

const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);

      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }

    return ENTITIES[code.toLowerCase()] ?? whole;
  });

const plain = (html) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

// Вырезает блоки демонстраций вместе с содержимым. Нужен из-за заголовков:
// <h3> внутри карточки тарифа — часть примера, а не раздел страницы, и в
// оглавлении с поиском ему делать нечего. Считать вложенность приходится
// вручную: у регулярного выражения парных скобок не бывает.
//
// <dialog> вырезается по той же причине: заголовок закрытого окна невидим,
// и ссылка поиска или оглавления на него приводила бы в пустоту.
export const cutDemos = (html) => {
  html = html.replace(/<dialog\b[\s\S]*?<\/dialog>/gi, '');

  const open = /<div\b[^>]*\bclass="[^"]*\bdemo-block\b[^"]*"[^>]*>/gi;
  const out = [];
  let at = 0;
  let start;

  while ((start = open.exec(html)) !== null) {
    if (start.index < at) continue;

    out.push(html.slice(at, start.index));

    let depth = 1;
    let i = start.index + start[0].length;

    const tag = /<(\/?)div\b[^>]*>/gi;

    tag.lastIndex = i;

    let step;

    while (depth > 0 && (step = tag.exec(html)) !== null) {
      depth += step[1] ? -1 : 1;
      i = tag.lastIndex;
    }

    at = depth === 0 ? i : html.length;
    open.lastIndex = at;
  }

  return out.join('') + html.slice(at);
};

// --- якоря ------------------------------------------------------------------

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

const slug = (text) => {
  const latin = [...text.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('');

  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
};

// --- сбор -------------------------------------------------------------------

// Каталог документации — параметр: сборка публичного дерева пересобирает
// индекс по СВОЕМУ docs/, где страниц меньше, чем в Dev. Без этого
// публичный check-dist сверял бы индекс, собранный там, с индексом,
// привезённым отсюда, — и находил бы «расхождение» при каждом выпуске.
export function collect(docs = DOCS) {
  const files = readdirSync(docs)
    .filter((name) => name.endsWith('.html') && !SKIP.has(name))
    .sort();

  const pages = [];
  const headings = [];

  // Два разных счёта, и различие между ними — суть привязки.
  //
  // `spoken` — имя внутри <code> или <pre>: страница о нём говорит.
  // `used` — имя где угодно ещё, то есть в основном в class="…" собственной
  // вёрстки доксайта. Класс .gr-mt-4 встречается в разметке тридцати страниц
  // и описан ровно на одной; счёт по всем упоминаниям отправлял читателя
  // на «Раскрытие» и «Grid-утилиты» вместо «Spacing».
  const spoken = new Map();
  const used = new Map();
  const families = new Map();   // префикс имени → Map(страница → сколько раз)

  const bump = (store, key, page) => {
    if (!store.has(key)) store.set(key, new Map());

    const byPage = store.get(key);

    byPage.set(page, (byPage.get(page) ?? 0) + 1);
  };

  // Семейство имени — все его префиксы по границам дефиса, кроме голого `gr-`:
  // по нему совпадает вся библиотека, и выбор страницы стал бы случайным.
  // Благодаря семействам класс, которого в тексте нет вовсе, наследует
  // страницу соседей по шкале: .gr-mt-7 уезжает туда же, где описан .gr-mt-4.
  //
  // Считаются РАЗНЫЕ имена семейства, а не упоминания. Справочник семейство
  // перечисляет, страница примера — повторяет один его член десять раз,
  // и по числу упоминаний .gr-mt-4 доставался «Произвольным значениям»
  // с их пятнадцатью `gr-mt-[…]` вместо «Spacing».
  const bumpFamilies = (name, page) => {
    for (let i = 0; i < name.length; i++) {
      if (name[i] !== '-') continue;

      const prefix = name.slice(0, i + 1);

      if (prefix === 'gr-' || prefix === '--gr-' || prefix === '-' || prefix === '--') continue;

      if (!families.has(prefix)) families.set(prefix, new Map());

      const byPage = families.get(prefix);

      if (!byPage.has(page)) byPage.set(page, new Set());

      byPage.get(page).add(name);
    }
  };

  const NAME = /--gr-[\w-]+|\bgr-[\w:-]+/g;

  files.forEach((file, page) => {
    const html = readFileSync(join(docs, file), 'utf8');
    const title = plain(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? file)
      .replace(/\s*—\s*Griffincss$/, '')
      .replace(/^Griffincss\s*—\s*/, '');
    const description = plain(html.match(/<div class="hero">[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] ?? '');

    pages.push([file, title, description]);

    const seen = new Set();
    const structure = cutDemos(html);

    for (const match of structure.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      const text = plain(match[2]);

      if (!text) continue;

      // Заголовок с готовым id уважается: на него уже могут ссылаться
      // извне, и подменять такую ссылку вычисленной нельзя.
      const explicit = /\bid="([^"]+)"/.exec(match[0])?.[1];
      let anchor = explicit ?? slug(text);

      while (!explicit && seen.has(anchor)) anchor += '-2';

      seen.add(anchor);
      headings.push([page, Number(match[1]), text, anchor]);
    }

    // Сначала — то, о чём страница говорит: содержимое <code> и <pre>.
    // Вложенный в <pre> код при этом не считается дважды: совпадение
    // забирает весь блок целиком, и разбор продолжается за ним.
    let spokenText = '';

    for (const match of html.matchAll(/<(code|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      spokenText += `${decode(match[2].replace(/<[^>]*>/g, ' '))}\n`;
    }

    for (const match of spokenText.matchAll(NAME)) {
      bump(spoken, match[0], page);
      bumpFamilies(match[0], page);
    }

    for (const match of html.matchAll(NAME)) {
      bump(used, match[0], page);
    }

    for (const match of spokenText.matchAll(ATTR)) {
      bump(spoken, match[0], page);
      bumpFamilies(match[0], page);
    }

    for (const match of html.matchAll(ATTR)) bump(used, match[0], page);
  });

  // Объявленные имена. Классы берутся из собранного CSS, а не из документации:
  // индекс обязан знать про класс даже там, где о нём ещё не написали.
  const declared = new Set();
  const tokenNames = new Set();

  for (const file of CSS) {
    const path = join(root, file);

    if (!existsSync(path)) continue;

    const css = readFileSync(path, 'utf8');

    for (const match of css.matchAll(/\.(gr-(?:[\w-]|\\.)+)/g)) {
      declared.add(match[1].replace(/\\/g, ''));
    }

    for (const match of css.matchAll(/(--gr-[\w-]+)\s*:/g)) {
      tokenNames.add(match[1]);
    }
  }

  // Ничья решается вторым признаком, а при равенстве и его — в пользу
  // страницы, которая идёт раньше по алфавиту: результат обязан быть
  // одинаковым от запуска к запуску, иначе проверка свежести срабатывала бы
  // на пустом месте.
  const pick = (byPage, score) => {
    if (!byPage || byPage.size === 0) return -1;

    let best = -1;
    let top = -1;

    for (const [page, value] of [...byPage].sort((a, b) => a[0] - b[0])) {
      const own = score(value, page);

      if (own > top) {
        top = own;
        best = page;
      }
    }

    return best;
  };

  const size = (value) => (value instanceof Set ? value.size : value);

  const familyOf = (name) => {
    const cut = name.lastIndexOf('-');

    return cut > 0 ? name.slice(0, cut + 1) : '';
  };

  // Порядок предпочтений: прямой разговор об имени, затем разговор о его
  // семействе — от самого узкого префикса к самому широкому, — и лишь
  // потом простое присутствие в разметке.
  //
  // Внутри прямого разговора страницы сравниваются сперва по широте охвата
  // семейства, и только потом по числу упоминаний: справочник перечисляет
  // двенадцать радиусов по разу, страница цветов повторяет один из них
  // трижды — и по одним упоминаниям .gr-radius-2 доставался «Colors».
  const pageOf = (name) => {
    const kin = families.get(familyOf(name));
    const breadth = (page) => (kin && kin.has(page) ? kin.get(page).size : 0);
    const direct = pick(spoken.get(name), (times, page) =>
      breadth(page) * 1000 + Math.min(size(times), 999));

    if (direct >= 0) return direct;

    for (let i = name.length - 1; i > 0; i--) {
      if (name[i] !== '-') continue;

      const family = pick(families.get(name.slice(0, i + 1)), size);

      if (family >= 0) return family;

      // Основа имени без хвоста. Так находят свою страницу адаптивные
      // варианты — .gr-italic-md уезжает туда, где описан .gr-italic:
      // семейства `gr-italic-` не существует, а основа названа прямо.
      const stem = pick(spoken.get(name.slice(0, i)), size);

      if (stem >= 0) return stem;
    }

    return pick(used.get(name), size);
  };

  const withPage = (names) => [...names].sort()
    .map((name) => [name, pageOf(name)])
    .filter(([, page]) => page >= 0);

  const data = { pages, headings, classes: withPage(declared), tokens: withPage(tokenNames) };

  data.attrs = withPage(griffinAttrs());

  return data;
}

export function render(data) {
  const rows = (list) => list.map((row) => JSON.stringify(row)).join(',\n');

  // Имена сгруппированы по странице и склеены в строку через пробел.
  // Построчный вид [имя, страница] читался бы лучше, но у утилит имён
  // под три тысячи, и на кавычках, скобках и повторе номера страницы
  // файл вырастал вдвое — а грузится он на каждой странице документации.
  const grouped = (list) => {
    const byPage = new Map();

    for (const [name, page] of list) {
      if (!byPage.has(page)) byPage.set(page, []);

      byPage.get(page).push(name);
    }

    return rows([...byPage].sort((a, b) => a[0] - b[0]).map(([page, names]) => [page, names.join(' ')]));
  };

  return [
    '/*! Griffincss docs index — построен scripts/build-docs-index.mjs, не редактируется вручную */',
    'window.GR_DOCS_INDEX = {',
    'pages: [',
    rows(data.pages),
    '],',
    'headings: [',
    rows(data.headings),
    '],',
    'classes: [',
    grouped(data.classes),
    '],',
    'tokens: [',
    grouped(data.tokens),
    ...(data.attrs ? ['],', 'attrs: [', grouped(data.attrs)] : []),
    ']',
    '};',
    '',
  ].join('\n');
}

export const buildIndexSource = (docs = DOCS) => render(collect(docs));

// --- запуск -----------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const data = collect();
  const source = render(data);

  writeFileSync(OUT, source, 'utf8');

  console.log('build-docs-index: docs/search-index.js обновлён');
  console.log(`  страниц ${data.pages.length}, заголовков ${data.headings.length}, `
    + `классов ${data.classes.length}, токенов ${data.tokens.length}, `
    + `${(source.length / 1024).toFixed(1)} КБ`);
}
