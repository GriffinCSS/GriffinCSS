#!/usr/bin/env node
// Griffincss — проверка собранного CSS.
// Работает по артефакту, где все селекторы буквальные, поэтому ловит то,
// что stylelint на интерполированных исходниках увидеть не может.
// Ноль зависимостей.

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildIndexSource } from './build-docs-index.mjs';
import { BUNDLE, bundleContent } from './build-bundle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CORE = 'packages/core/dist/griffincss-core.css';
const RESET = 'packages/core/dist/griffincss-reset.css';
const UI = 'packages/ui/dist/griffincss-ui.css';
const UI_SCOPED = 'packages/ui/dist/griffincss-ui-scoped.css';
const UTILS = 'packages/utils/dist/griffincss-utils.css';
const UTILS_SCOPED = 'packages/utils/dist/griffincss-utils-scoped.css';
const STYLES = 'packages/core/dist/griffincss-styles.css';
const BREAKPOINTS = 'packages/core/scss/_breakpoints.scss';
const RUNTIME = 'packages/core/src/griffincss.js';

// Собранные рантаймы: минифицированные terser'ом копии src/*.js.
const RUNTIMES = [
  'packages/core/dist/griffincss.js',
  'packages/core/dist/griffincss-theme.js',
  'packages/ui/dist/griffincss-ui.js',
  'packages/utils/dist/griffincss-utils.js',
];

// Бюджет на все рантаймы разом: Bootstrap отгружает 23,8 КБ gzip JS,
// и превысить его, не давая взамен виджетов, — значит проиграть сравнение,
// ради которого библиотека и минифицируется.
const JS_BUDGET = 10 * 1024;

// Бандл жмётся одним словарём и обязан быть заметно легче суммы четырёх:
// перестанет — значит, склейка сломалась и смысла в ней больше нет.
const BUNDLE_BUDGET = 9 * 1024;

// Порядок каскадных слоёв: объявляется целиком в каждой сборке,
// поэтому итог не зависит от того, какой файл подключён первым.
const LAYER_ORDER = '@layer griffincss.reset, griffincss.core, griffincss.ui, griffincss.utils, griffincss.style;';

// Слой, в который каждая сборка обязана уложить весь свой вывод.
const LAYER_OF = new Map([
  [CORE, 'griffincss.core'],
  [RESET, 'griffincss.reset'],
  [UI, 'griffincss.ui'],
  [UI_SCOPED, 'griffincss.ui'],
  [UTILS, 'griffincss.utils'],
  [UTILS_SCOPED, 'griffincss.utils'],
  [STYLES, 'griffincss.style'],
]);

// Классы вне схемы `gr-`: корень области видимости для @scope-сборки.
const ALLOWED_BARE_CLASSES = new Set(['griffin']);

const problems = [];
const fail = (file, message) => problems.push(`${file}: ${message}`);

const read = (file) => readFileSync(join(root, file), 'utf8');

// --- разбор CSS -------------------------------------------------------------

// Возвращает { selectors, atRules, topLevel } — преамбулы блоков;
// topLevel — те из них, что открыты на нулевой глубине вложенности.
// Достаточно точен для сжатого CSS без строк с фигурными скобками.
function parseBlocks(css) {
  const selectors = [];
  const atRules = [];
  const topLevel = [];
  const stack = [];
  let buf = '';

  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      const prelude = buf.trim();
      if (stack.length === 0) topLevel.push(prelude);
      if (prelude.startsWith('@')) {
        atRules.push(prelude);
        stack.push('at');
      } else {
        selectors.push(prelude);
        stack.push('rule');
      }
      buf = '';
    } else if (char === '}') {
      stack.pop();
      buf = '';
    } else if (char === ';' && stack[stack.length - 1] !== 'at') {
      buf = '';
    } else {
      buf += char;
    }
  }

  return { selectors, atRules, topLevel };
}

// Имена классов из списка селекторов, с раскрытием экранирования (.gr-sm\:m-4).
function classNames(selectors) {
  const found = new Set();
  for (const selector of selectors) {
    for (const match of selector.matchAll(/\.(?![0-9])((?:[\w-]|\\.)+)/g)) {
      found.add(match[1].replace(/\\/g, ''));
    }
  }
  return found;
}

// --- проверки ---------------------------------------------------------------

// 1. Префикс gr- у всех классов; 2. отсутствие !important.
// Единственный источник значений — карта $gr-breakpoints; сюда же
// сходятся токены --gr-bp-*, медиа-запросы обоих пакетов и фолбэки рантайма.
const breakpointMap = new Map(
  [...(read(BREAKPOINTS).replace(/^\s*\/\/.*$/gm, '').match(/^\$gr-breakpoints:\s*\(([^)]*)\)/m)?.[1] ?? '')
    .matchAll(/([\w-]+)\s*:\s*([^,\n]+)/g)]
    .map((m) => [m[1], m[2].trim()]),
);

const breakpoints = new Set(breakpointMap.values());

if (breakpoints.size === 0) {
  fail(BREAKPOINTS, 'карта $gr-breakpoints пуста или не найдена');
}

const artifacts = [CORE, RESET, UI, UI_SCOPED, UTILS, UTILS_SCOPED, STYLES];
const classesByFile = new Map();

for (const file of artifacts) {
  const css = read(file);
  const { selectors, atRules, topLevel } = parseBlocks(css);
  const classes = classNames(selectors.concat(atRules.filter((r) => r.startsWith('@scope'))));
  classesByFile.set(file, classes);

  for (const name of classes) {
    if (!name.startsWith('gr-') && !ALLOWED_BARE_CLASSES.has(name)) {
      fail(file, `класс .${name} без префикса gr-`);
    }
  }

  if (css.includes('!important')) {
    fail(file, 'найден !important');
  }

  // 3. В @media и @container только значения брейкпоинтов из токенов
  //    и только range-синтаксис. Шкала у контейнерных запросов та же самая:
  //    отдельная карта для них удвоила бы источник правды, и проверка
  //    ловит момент, когда её всё-таки завели.
  for (const rule of atRules) {
    const kind = ['@media', '@container'].find((name) => rule.startsWith(name));

    if (!kind) continue;

    for (const match of rule.matchAll(/([\d.]+)px/g)) {
      if (!breakpoints.has(`${match[1]}px`)) {
        fail(file, `${kind} использует ${match[0]}, которого нет среди --gr-bp-*: ${rule}`);
      }
    }

    if (/(min|max)-width/.test(rule)) {
      fail(file, `${kind} в префиксном синтаксисе вместо range: ${rule}`);
    }
  }

  // 4. Каскадные слои: полный порядок объявлен, весь вывод — внутри своего слоя.
  //    BOM проверяется отдельно, хотя его поймала бы и проверка порядка: Sass
  //    приписывает его к любому выводу с не-ASCII символом, и без отдельного
  //    сообщения диагноз читается как «порядок слоёв не объявлен». Лечится
  //    не удалением BOM, а CSS-экранированием символа — см. _link.scss.
  if (css.charCodeAt(0) === 0xfeff) {
    fail(file, 'файл начинается с BOM — в выводе появился не-ASCII символ, запишите его CSS-экранированием');
  }

  const declaration = css.slice(0, LAYER_ORDER.length + 8).replace(/\s+/g, ' ');

  if (!declaration.startsWith(LAYER_ORDER)) {
    fail(file, `порядок слоёв не объявлен первой строкой: ${declaration.slice(0, 60)}`);
  }

  const layer = LAYER_OF.get(file);
  const stray = topLevel.filter((prelude) => prelude !== `@layer ${layer}`);

  if (stray.length > 0) {
    fail(file, `вне слоя ${layer} осталось блоков — ${stray.length}: ${stray.slice(0, 3).join(' | ')}`);
  }

  // 5. Токены --gr-bp-* собраны из карты и не разошлись с ней.
  //    Ресет токенов не содержит — там проверять нечего. Файл оси
  //    оформления тоже: полного :root у него нет по устройству, он лишь
  //    переопределяет отдельные токены поверх любой сборки библиотеки.
  //    Проверка «токены --gr-bp-* без пары в карте» при этом остаётся
  //    осмысленной, но объявить их файлу оси неоткуда.
  if (file !== RESET && file !== STYLES) {
    for (const [name, value] of breakpointMap) {
      if (!new RegExp(`--gr-bp-${name}:\\s*${value}\\s*[;}]`).test(css)) {
        fail(file, `нет токена --gr-bp-${name}: ${value} — токены разошлись с ${BREAKPOINTS}`);
      }
    }

    const extra = [...css.matchAll(/--gr-bp-([\w-]+)\s*:/g)]
      .map((m) => m[1])
      .filter((name) => !breakpointMap.has(name));

    if (extra.length > 0) {
      fail(file, `токены --gr-bp-* без пары в карте: ${[...new Set(extra)].join(', ')}`);
    }
  }

  // 6. FOUC-защита не должна приходить из статического CSS:
  //    без выполненного JS контент обязан остаться видимым.
  if (css.includes('gr-ready')) {
    fail(file, 'FOUC-защита в статическом CSS — её ставит рантайм');
  }
}

// 7. Пакеты не пересекаются по классам — попарно, все три.
//    Класс принадлежит ровно одному пакету: иначе непонятно, какой из них
//    подключать ради него, и какая из двух версий правила победит.
const coreClasses = classesByFile.get(CORE);
const uiClasses = classesByFile.get(UI);
const utilsClasses = classesByFile.get(UTILS);

const PACKAGE_PAIRS = [
  [CORE, coreClasses, 'ui', uiClasses],
  [CORE, coreClasses, 'utils', utilsClasses],
  [UI, uiClasses, 'utils', utilsClasses],
];

for (const [file, own, otherName, other] of PACKAGE_PAIRS) {
  const shared = [...own].filter((name) => other.has(name));

  if (shared.length > 0) {
    fail(file, `классы протекли в ${otherName} (${shared.length}): ${shared.slice(0, 10).join(', ')}`);
  }
}

// 8. Блок :root во всех трёх пакетах идентичен.
//    Исходник токенов один (griffincss-core), но собранные файлы могут разойтись,
//    если в дереве зависимостей окажутся две версии griffincss-core — peer-зависимость
//    ui и utils это запрещает, а проверка ловит случай, когда запрет обошли.
const rootBlock = (file) => {
  const match = read(file).match(/:root\{([^}]*)\}/);
  return match ? match[1] : null;
};

// griffincss-styles.css в этой проверке не участвует: полного :root он
// не несёт по устройству — только якоря стилей и сами блоки оси.
const coreRoot = rootBlock(CORE);

if (!coreRoot) fail(CORE, 'блок :root не найден');

for (const file of [UI, UTILS]) {
  const root = rootBlock(file);

  if (!root) {
    fail(file, 'блок :root не найден');
  } else if (coreRoot && root !== coreRoot) {
    fail(file, 'блок :root отличается от griffincss-core.css');
  }
}

// 9. Тема присутствует во всех артефактах, кроме ресета.
//    Слои griffincss.ui и griffincss.utils старше griffincss.core, поэтому
//    блок темы, попавший только в ядро, проиграет базовому :root из надстройки
//    независимо от специфичности селектора — переключатель не сработает
//    на странице, где подключены оба файла.
const THEME_MARKERS = [
  [/\[data-gr-theme=["']?dark["']?\]/, 'блок тёмной темы'],
  [/\[data-gr-theme=["']?light["']?\]/, 'блок светлой темы'],
  [/prefers-color-scheme:\s*dark/, 'следование системной теме'],
  [/\[data-gr-a11y=["']?low-vision["']?\]/, 'режим для слабовидящих'],
  [/prefers-contrast:\s*more/, 'следование системному контрасту'],
];

for (const file of [CORE, UI, UI_SCOPED, UTILS, UTILS_SCOPED]) {
  const css = read(file);

  for (const [pattern, what] of THEME_MARKERS) {
    if (!pattern.test(css)) fail(file, `${what} отсутствует — тема обязана быть в обоих пакетах`);
  }
}

// 10. Порядок слоёв в рантайме совпадает с артефактами.
//     Рантайм вставляет свой <style> раньше, чем догрузятся <link>, поэтому
//     именно он объявляет порядок первым. Забытый в этой строке слой
//     регистрируется последним и начинает выигрывать у соседей — молча.
const runtimeOrder = read(RUNTIME).match(/var LAYER_ORDER = '([^']*)'/);

if (!runtimeOrder) {
  fail(RUNTIME, 'константа LAYER_ORDER не найдена');
} else if (runtimeOrder[1] !== LAYER_ORDER) {
  fail(RUNTIME, `LAYER_ORDER рантайма разошёлся с артефактами: ${runtimeOrder[1]}`);
}

// 11. Файл оси оформления не объявляет классов.
//     Структурные правила стилей живут в griffincss-ui, рядом со своим
//     компонентом: check-dist запрещает делить класс между пакетами,
//     а слой griffincss.style старше griffincss.utils — правило про .gr-table,
//     заехавшее сюда, начало бы выигрывать у утилит.
const stylesClasses = classesByFile.get(STYLES) ?? new Set();

if (stylesClasses.size > 0) {
  fail(
    STYLES,
    `ось оформления объявляет классы (${stylesClasses.size}): ${[...stylesClasses].slice(0, 5).join(', ')}`,
  );
}

// 12. Ось оформления не просачивается в scoped-сборку компонентов.
//     Внутри @scope селектор неявно получает :scope в начало и требует
//     носитель атрибута в области, а data-gr-style стоит на <html>.
//     Правило собралось бы, прошло бы все прочие проверки и молча
//     не работало — то же основание, по которому в модулях ui запрещены
//     селекторы по data-gr-theme.
if (read(UI_SCOPED).includes('[data-gr-style')) {
  fail(UI_SCOPED, 'правило оси оформления внутри @scope — оно никогда не сработает');
}

// 13. Рантаймы в dist минифицированы: остались только баннер и код.
//     Прямой признак — комментарии. Русские пояснения из src в продакшен
//     не уезжают, а лицензионная шапка держится в ASCII, чтобы отсутствие
//     кириллицы вне строковых литералов работало как проверка.
//     Строковые литералы исключены сознательно: сообщения рантайма в консоль
//     и aria-label кнопок написаны по-русски и обязаны такими остаться.
const BANNER = /^\/\*![^*]*\*\//;
const CYRILLIC = /[\u0400-\u04FF]/;
const STRINGS = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

for (const file of RUNTIMES) {
  const js = read(file);
  const banner = js.match(BANNER);

  if (!banner) {
    fail(file, 'нет однострочной лицензионной шапки /*! … */ первой строкой');
  } else if (CYRILLIC.test(banner[0])) {
    fail(file, `лицензионная шапка не в ASCII: ${banner[0].slice(0, 60)}`);
  }

  // Строковые литералы снимаются первыми: рантайм печатает в CSS
  // маркер `/* end */`, по которому тесты режут секции, и без этого шага
  // он читался бы как оставшийся комментарий.
  const code = js.slice(banner ? banner[0].length : 0).replace(STRINGS, '');

  if (code.includes('/*')) {
    fail(file, 'в собранном файле остался блочный комментарий — минификация не отработала');
  }
  const stray = code.match(CYRILLIC);

  if (stray) {
    const at = code.indexOf(stray[0]);
    fail(file, `кириллица вне строкового литерала — уехал комментарий: …${code.slice(Math.max(0, at - 30), at + 30)}…`);
  }
}

// 15. Свежесть индекса поиска. Сравнивается не хеш и не дата, а сам текст:
//     генератор детерминирован, поэтому расхождение файла с тем, что он
//     выдаёт сейчас, — это ровно «индекс отстал от документации». Забытый
//     запуск проявился бы иначе — молчащим поиском по новому разделу.
const INDEX = 'docs/search-index.js';

try {
  if (read(INDEX) !== buildIndexSource()) {
    fail(INDEX, 'индекс поиска разошёлся с документацией — выполните npm run build:docs-index');
  }
} catch (error) {
  fail(INDEX, `индекс поиска не собран: ${error.message}`);
}

// 15. Один номер версии на весь репозиторий.
//     Номер живёт в шестнадцати местах, и разъезжаются они молча: тесты
//     рантайма сверяют `VERSION`, шапку файла и свой `package.json`, но
//     до документации не дотягиваются — а читатель видит именно её.
//     К Этапу 16 доксайт обещал версию 0.8.0 при выполненных шестнадцати
//     этапах. Источник правды — корневой `package.json`.
const VERSION = JSON.parse(read('package.json')).version;

const VERSION_SITES = [
  ['packages/core/package.json', `"version": "${VERSION}"`],
  ['packages/ui/package.json', `"version": "${VERSION}"`],
  ['packages/utils/package.json', `"version": "${VERSION}"`],
  ['packages/ui/package.json', `"griffincss-core": "^${VERSION}"`],
  ['packages/utils/package.json', `"griffincss-core": "^${VERSION}"`],
  ['packages/core/src/griffincss.js', `v${VERSION}`],
  ['packages/core/src/griffincss.js', `VERSION = '${VERSION}'`],
  ['packages/core/src/griffincss-theme.js', `v${VERSION}`],
  ['packages/core/src/griffincss-theme.js', `VERSION = '${VERSION}'`],
  ['packages/ui/src/griffincss-ui.js', `v${VERSION}`],
  ['packages/ui/src/griffincss-ui.js', `VERSION = '${VERSION}'`],
  ['packages/utils/src/griffincss-utils.js', `v${VERSION}`],
  ['packages/utils/src/griffincss-utils.js', `VERSION = '${VERSION}'`],
  ['docs/nav.js', `<span>v${VERSION}</span>`],
  ['docs/index.html', `<span class="badge badge-accent">v${VERSION}</span>`],
  ['docs/runtime.html', `'${VERSION}'`],
  ['README.md', `версия \`${VERSION}\``],
  // Адреса CDN несут номер в пути: отстань он от версии — читатель
  // получил бы прошлый выпуск, не заметив этого. Суффикс -dev снимается
  // при сборке публичного дерева вместе со всеми остальными вхождениями.
  ['README.md', `griffincss-core@${VERSION}/dist/`],
  ['README.md', `griffincss-ui@${VERSION}/dist/`],
  ['README.md', `griffincss-utils@${VERSION}/dist/`],
  ['ARCHITECTURE.md', `**Version:** ${VERSION}`],
];

for (const [file, needle] of VERSION_SITES) {
  if (!read(file).includes(needle)) {
    fail(file, `версия разошлась с корневым package.json (${VERSION}): не найдено «${needle}»`);
  }
}

// 14. Бюджет на рантаймы.
const gzipOf = (file) => gzipSync(readFileSync(join(root, file)), { level: 9 }).length;
const jsWeight = RUNTIMES.reduce((sum, file) => sum + gzipOf(file), 0);

if (jsWeight > JS_BUDGET) {
  fail(
    RUNTIMES[0],
    `рантаймы весят ${jsWeight} Б gzip при бюджете ${JS_BUDGET} Б — превышение на ${jsWeight - JS_BUDGET} Б`,
  );
}

// 16. Бандл griffincss-all.js: свежесть и бюджет.
//     Свежесть — байт-в-байт против конкатенации текущих рантаймов
//     той же функцией, которой бандл собирается: пересобрали рантайм,
//     забыли npm run build целиком — бандл молча отстал бы.
let bundleWeight = 0;

try {
  const actual = read(BUNDLE);

  if (actual !== bundleContent(root)) {
    fail(BUNDLE, 'бандл отстал от рантаймов — пересоберите: npm run build:bundle');
  }

  bundleWeight = gzipOf(BUNDLE);

  if (bundleWeight > BUNDLE_BUDGET) {
    fail(
      BUNDLE,
      `бандл весит ${bundleWeight} Б gzip при бюджете ${BUNDLE_BUDGET} Б — превышение на ${bundleWeight - BUNDLE_BUDGET} Б`,
    );
  }
} catch (e) {
  fail(BUNDLE, 'бандл не собран — npm run build:bundle');
}

// --- итог -------------------------------------------------------------------

if (problems.length > 0) {
  console.error('check-dist: обнаружены нарушения\n');
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  console.error(`\ncheck-dist: нарушений — ${problems.length}`);
  process.exit(1);
}

const size = (file) => `${(readFileSync(join(root, file)).length / 1024).toFixed(1)} КБ`;
console.log('check-dist: проверки пройдены');
console.log(`  core   ${size(CORE)} (${coreClasses.size} классов) + ресет ${size(RESET)}`);
console.log(`  ui     ${size(UI)} (${uiClasses.size} классов) + scoped ${size(UI_SCOPED)}`);
console.log(`  utils  ${size(UTILS)} (${utilsClasses.size} классов) + scoped ${size(UTILS_SCOPED)}`);
console.log(`  js     ${(jsWeight / 1024).toFixed(1)} КБ gzip на ${RUNTIMES.length} рантайма (бюджет ${JS_BUDGET / 1024} КБ)`);
console.log(`  бандл  ${(bundleWeight / 1024).toFixed(1)} КБ gzip одним файлом (бюджет ${BUNDLE_BUDGET / 1024} КБ)`);
console.log(`  брейкпоинты: ${[...breakpoints].join(', ')}`);
