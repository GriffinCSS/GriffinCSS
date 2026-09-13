#!/usr/bin/env node
// Griffincss — проверка собранного CSS.
// Работает по артефакту, где все селекторы буквальные, поэтому ловит то,
// что stylelint на интерполированных исходниках увидеть не может.
// Ноль зависимостей.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildIndexSource } from './build-docs-index.mjs';
import { BUNDLE, bundleContent } from './build-bundle.mjs';
import { STYLES as STYLE_NAMES, styleFile } from './build-styles.mjs';
import { TOKENS, SETS, rootVariables, tokensContent } from './build-tokens.mjs';
import { bytes, kb, rawOf } from './sizes.mjs';
import { FIELDS } from './build-griffinjs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CORE = 'packages/core/dist/griffincss-core.css';
const RESET = 'packages/core/dist/griffincss-reset.css';
const UI = 'packages/ui/dist/griffincss-ui.css';
const UI_SCOPED = 'packages/ui/dist/griffincss-ui-scoped.css';
const UTILS = 'packages/utils/dist/griffincss-utils.css';
const UTILS_SCOPED = 'packages/utils/dist/griffincss-utils-scoped.css';
const STYLES = 'packages/core/dist/griffincss-styles.css';
const GRIFFIN_CSS = 'packages/ui/dist/griffinjs.css';
const GRIFFIN_FIELDS_CSS = 'packages/ui/dist/griffinjs-fields.css';

// Однофайловые сборки оси: та же точка входа с одним стилем в $gr-styles.
// Список берётся у скрипта сборки — иначе проверяемые артефакты
// и собираемые разойдутся молча.
const STYLE_FILES = STYLE_NAMES.map(styleFile);

// Файлы оси: полного :root у них нет по устройству, они лишь
// переопределяют отдельные токены поверх любой сборки библиотеки.
const AXIS_FILES = [STYLES, ...STYLE_FILES];
const BREAKPOINTS = 'packages/core/scss/_breakpoints.scss';
const RUNTIME = 'packages/core/src/griffincss.js';

// Исходники рантаймов: те же четыре файла до минификации.
const RUNTIME_SOURCES = [
  RUNTIME,
  'packages/core/src/griffincss-theme.js',
  'packages/ui/src/griffincss-ui.js',
  'packages/utils/src/griffincss-utils.js',
];

// Собранные рантаймы: минифицированные terser'ом копии src/*.js.
const RUNTIMES = [
  'packages/core/dist/griffincss.js',
  'packages/core/dist/griffincss-theme.js',
  'packages/ui/dist/griffincss-ui.js',
  'packages/utils/dist/griffincss-utils.js',
];

// Бюджет на все рантаймы разом: ориентир — `bootstrap.bundle.min.js`,
// 23 731 Б gzip (замер 2026-08-30, 5.3.3). Превысить его, не давая взамен
// виджетов, — значит проиграть сравнение, ради которого библиотека
// и минифицируется.
//
// Пересчёт Этапа 28: факт 10 193 Б при потолке 10 240 — 47 Б свободного
// места, в которое не влезает ни один из двух вариантов Этапа 30
// (строгий CSP). Проба обоих теми же флагами terser, что у сборки:
// конструируемый лист +49 Б, nonce −6 Б. Потолок 10,2 КБ оставляет
// 252 Б — впятеро больше дорогой из двух проб; это запас под Этап 30
// и только под него. Правило Этапа 30 в силе: если готовая реализация
// не влезет и сюда, этап останавливается, а не двигает потолок.
const JS_BUDGET = Math.round(10.2 * 1024);

// Бандл жмётся одним словарём и обязан быть заметно легче суммы четырёх:
// перестанет — значит, склейка сломалась и смысла в ней больше нет.
// Сегодня экономия 1 519 Б (8 674 против 10 193).
//
// Пересчёт Этапа 28: потолок опущен с 9 КБ до 8,8 КБ. Своих функций
// у бандла нет — он растёт ровно настолько, насколько выросли рантаймы,
// поэтому его запас (337 Б) повторяет запас рантаймов и назван тем же:
// Этап 30. Прежние 542 Б были запасом ни подо что.
const BUNDLE_BUDGET = Math.round(8.8 * 1024);

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
  ...STYLE_FILES.map((file) => [file, 'griffincss.style']),
]);

// Классы вне схемы `gr-`: корень области видимости для scoped-сборок.
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

const artifacts = [CORE, RESET, UI, UI_SCOPED, UTILS, UTILS_SCOPED, ...AXIS_FILES];
const classesByFile = new Map();

for (const file of artifacts) {
  const css = read(file);
  const { selectors, atRules, topLevel } = parseBlocks(css);
  const classes = classNames(selectors);
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
  //    Ресет токенов не содержит — там проверять нечего. Файлы оси
  //    оформления тоже: полного :root у них нет по устройству, они лишь
  //    переопределяют отдельные токены поверх любой сборки библиотеки.
  //    Проверка «токены --gr-bp-* без пары в карте» при этом остаётся
  //    осмысленной, но объявить их файлу оси неоткуда.
  if (file !== RESET && !AXIS_FILES.includes(file)) {
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
// 11б. Оси нет нигде, кроме её файлов и ui (Этап 44). Ядро, ресет
//      и утилиты не содержат ни одного [data-gr-style: тот, кто ось
//      не подключил, платит за неё только структурными правилами
//      компонентов (девять правил в ui, замер Этапа 23 — 115 Б brotli),
//      и это единственное место, где такая плата допустима. До Этапа 44
//      это был факт без сторожа.
for (const file of [CORE, RESET, UTILS]) {
  if (read(file).includes('[data-gr-style')) fail(file, 'правило оси оформления вне файлов оси и ui — [data-gr-style]');
}

for (const file of AXIS_FILES) {
  const stylesClasses = classesByFile.get(file) ?? new Set();

  if (stylesClasses.size > 0) {
    fail(
      file,
      `ось оформления объявляет классы (${stylesClasses.size}): ${[...stylesClasses].slice(0, 5).join(', ')}`,
    );
  }
}

// 11a. Однофайловая сборка несёт ровно свой стиль.
//      Собираются они из того же источника с другим $gr-styles, поэтому
//      разойтись с общим файлом могут только через ошибку в списке сборки:
//      забытая конфигурация выродит артефакт в копию griffincss-styles.css,
//      и пользователь получит все три стиля под именем одного — молча.
for (const name of STYLE_NAMES) {
  const file = styleFile(name);
  const css = read(file);

  if (!css.includes(`[data-gr-style=${name}]`)) {
    fail(file, `нет ни одного правила стиля ${name} — сборка собрала общую часть без него`);
  }

  const strangers = STYLE_NAMES.filter((other) => other !== name && css.includes(`[data-gr-style=${other}]`));

  if (strangers.length > 0) {
    fail(file, `в файле одного стиля есть чужие: ${strangers.join(', ')}`);
  }
}

// 12. Ось оформления не просачивается в scoped-сборку компонентов.
//     Селектор там получает префикс :where(.griffin) и требует носитель
//     атрибута внутри области, а data-gr-style стоит на <html>.
//     Правило собралось бы, прошло бы все прочие проверки и молча
//     не работало — то же основание, по которому в модулях ui запрещены
//     селекторы по data-gr-theme.
if (read(UI_SCOPED).includes('[data-gr-style')) {
  fail(UI_SCOPED, 'правило оси оформления внутри области .griffin — оно никогда не сработает');
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

function checkMinified(file) {
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

for (const file of RUNTIMES) checkMinified(file);

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
  ['docs/style-presets.html', `griffincss-core@${VERSION}/dist/`],
  ['ARCHITECTURE.md', `**Version:** ${VERSION}`],
];

for (const [file, needle] of VERSION_SITES) {
  if (!read(file).includes(needle)) {
    fail(file, `версия разошлась с корневым package.json (${VERSION}): не найдено «${needle}»`);
  }
}

// 19. Бюджеты на собранный CSS (Этап 27, пересчитаны Этапом 28).
//
//     До Этапа 27 бюджетов на CSS не было ни одного: сверялись только
//     рантаймы, бандл и слой виджетов. Ориентир «ui не более 10 КБ» жил
//     в тексте плана и разошёлся с фактом на 0,5 КБ, никого не разбудив.
//     Этап 27 завёл механизм и поставил потолки по факту дня, без запаса.
//
//     Этап 28 назначил честные значения. Правила пересчёта, общие
//     для CSS и JS:
//
//       — потолок поднимается только вместе с тем, что покупается,
//         и покупка названа здесь же;
//       — запас — это байты под названную функцию, а не «на всякий
//         случай»: такой запас съедается за две недели, что и произошло
//         с рантаймами (47 Б на день ревизии);
//       — где рост не планируется, потолок равен факту плюс допуск,
//         и это сказано словами;
//       — потолок без покупки может только опускаться.
//
//     Допуск — округление вверх до 0,1 КБ (единица, в которой проект
//     называет веса): CI гоняет Node 22 и 24, и zlib разных версий даёт
//     расхождение в единицы байт. При опускании потолка допуск берётся
//     не меньше 0,1 КБ.
//
//     Замер 2026-08-30 (3091fcc), gzip уровня 9:
//
//       core          3 408 Б — рост не планируется, потолок прежний,
//                     допуск 74 Б;
//       reset           601 Б — то же, допуск 13 Б; файл нормализации
//                     закрыт по составу с Этапа 6;
//       ui           10 784 Б — потолок поднят с 10,6 до 10,8 КБ.
//                     Покупка: нативное поле даты и слот иконки (Этап 33)
//                     плюс указатель сортировки в таблице (Этап 35).
//                     Проба всех трёх на собранном файле — +184 Б;
//                     запас 275 Б;
//       utils        14 945 Б (2026-08-31, Этап 36) — потолок опущен
//                     с 16,6 КБ фазы 36a до 14,7 КБ. Размен Этапа 36:
//                     логические отступы получили адаптивные
//                     и контейнерные варианты (+1 527 Б gzip),
//                     физические односторонние классы удалены
//                     (−1 976 Б); итог −449 Б к 15 394 до этапа
//                     при расчёте −296 правкой собранного файла —
//                     честная сборка жмётся лучше ручной вставки
//                     блоков, оба замера фаз сверены по составу
//                     селекторов. Запас 108 Б — допуск, рост
//                     не планируется: вывод Этапа 28 в силе, следующая
//                     функция приходит с сокращением состава,
//                     а не с новым потолком;
//       griffinjs-css 2 408 Б — рост не планируется, потолок прежний,
//                     допуск 50 Б. Оформление виджета Этапа 35 живёт
//                     в _table.scss пакета ui, а не здесь.
//
//     Сравнение с альтернативой на потолках остаётся в пользу библиотеки
//     (замер 2026-08-30, gzip уровня 9): reset+core+ui+utils — 30 208 Б (после Этапа 36)
//     против 30 858 Б у bootstrap.min.css при 823 классах сверху
//     и 64 593 Б у bulma.min.css; core+ui+reset — 15 155 Б против
//     30 053 Б у uikit.min.css.
const kbBudget = (value) => Math.round(value * 1024);

// Артефакт, потолок, имя для сводки. Порядок — как в сводке.
const CSS_BUDGETS = [
  // core: Этап 40 — якорь бренда --gr-hsl-accent-base / -hover в обеих
  // темах и чернила на акценте в блоке контраста: 3 439 Б, потолок прежний,
  // допуск 43 Б.
  ['core', kbBudget(3.4), CORE],
  // ui: 11 054 Б после 0.22.1; Этап 38e — модуль .gr-file (+99 Б: файлового
  // поля в библиотеке не было вовсе), 11 153 Б — потолок поднят до 11,0 КБ.
  // Ревизия Этапа 38 — центровка содержимого .gr-file арифметикой
  // (кнопка заданной высоты с равными отступами) и зона перетаскивания
  // .gr-file-drop: 11 287 Б, потолок 11,1 КБ. Крестик .gr-tag-remove
  // полосками через миксин gr-cross (центр по построению на трёх движках)
  // — 11 378 Б, потолок 11,2 КБ. Этап 40 — щит a.gr-btn от правила
  // ссылок режима для слабовидящих и чернила на акценте в блоке контраста:
  // 11 395 Б, потолок прежний. Этап 42e — образцы .gr-swatch / .gr-swatch-tag
  // (радио в виде кружка цвета и плашки размера): 11 404 → 11 572 Б,
  // +168 Б, потолок 11,4 КБ. ПОКУПКА: проба композицией (.gr-choice +
  // .gr-dot / .gr-tag) не дала одного — состояния «выбран» на самом
  // образце: его показывала бы только радио рядом, а правила с :has()
  // нет ни у одной утилиты. Карточке товара выбор цвета и размера
  // обязателен.
  ['ui', kbBudget(11.4), UI],
  // utils: Этап 40 — правила режима со свойствами (кегль, a[href],
  // :focus-visible) больше не едут в этот слой, только токены: 14 854 Б.
  // Покупки нет — потолок опущен с 14,7 до 14,6 КБ, допуск 96 Б.
  ['utils', kbBudget(14.6), UTILS],
  ['reset', kbBudget(0.6), RESET],
  // griffinjs-css: 2 400 Б до Этапа 38; 38g, теги мультивыбора — 2 586 Б,
  // потолок поднят до 2,6 КБ с той же покупкой; ревизия — крестик тега
  // нарисован полосками, а не глифом (центр по построению на трёх
  // движках) — 2 684 Б, потолок 2,7 КБ.
  ['griffinjs-css', kbBudget(2.7), GRIFFIN_CSS],
  // Стили полей (Этап 38): по первому замеру 213 Б в 38a — 0,3 КБ;
  // 38d, панель календаря — 889 Б, потолок 0,9 КБ; 38e, список файлов
  // и подписи оценки поверх ряда знаков — 1 261 Б, потолок 1,3 КБ;
  // 38f, ячейки кода и сводка ошибок — 1 425 Б, потолок 1,5 КБ; ревизия:
  // год и время в панели, сетка без таблицы — 1 576 Б, потолок 1,6 КБ;
  // крестик списка файлов полосками вместо глифа — 1 698 Б, потолок 1,7 КБ;
  // Этап 43: отрезок «с — по» в панели и скругление поля перед спутником
  // в .gr-input-group — 1 755 Б, потолок 1,8 КБ.
  ['griffinjs-fields-css', kbBudget(1.8), GRIFFIN_FIELDS_CSS],
  // Ось оформления (Этап 44). Потолков у неё не было намеренно: Этап 28
  // оставил её без бюджета, пока в TODO.md первым стоял пункт «вынести
  // в отдельный пакет». Пункт закрыт решением владельца 2026-09-13 —
  // отдельного пакета не будет (замер Этапа 23: цена оси для того, кто
  // её не подключает, — 9 структурных правил в ui, 115 Б brotli; вынос
  // даёт ноль байт на странице и четвёртый пакет в peer-связке), — и ось
  // получает потолки по замеру: все три стиля 1 858 Б, airy 1 461,
  // strict 1 116, compact 1 403. Ось — только токены, класс сюда не
  // попадает (проверка 11), поэтому рост здесь — новый стиль или новый
  // токен в каждом из трёх, и он называется, как всякая покупка.
  ['styles', kbBudget(1.9), STYLES],
  ...STYLE_NAMES.map((name) => [`style-${name}`, kbBudget({ airy: 1.5, strict: 1.2, compact: 1.5 }[name]), styleFile(name)]),
];

for (const [id, budget, file] of CSS_BUDGETS) {
  const weight = bytes(id);

  if (weight > budget) {
    fail(file, `весит ${weight} Б gzip при бюджете ${budget} Б — превышение на ${weight - budget} Б`);
  }
}

// 14. Бюджет на рантаймы.
//     Вес берётся у scripts/sizes.mjs — там же, откуда его берёт
//     документация. Второй счёт разошёлся бы с первым (Этап 27).
const jsWeight = bytes('js-all');

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

  bundleWeight = bytes('bundle');

  if (bundleWeight > BUNDLE_BUDGET) {
    fail(
      BUNDLE,
      `бандл весит ${bundleWeight} Б gzip при бюджете ${BUNDLE_BUDGET} Б — превышение на ${bundleWeight - BUNDLE_BUDGET} Б`,
    );
  }
} catch (e) {
  fail(BUNDLE, 'бандл не собран — npm run build:bundle');
}

// 17. Слой GriffinJS (Этап 21).
//
//     Бюджет у слоя свой, не JS_BUDGET: ориентир — UIkit ≈ 40 КБ,
//     Swiper ≈ 45 КБ gzip. «Ядро + scroll + slider» — минимальный набор
//     для слайдера; полный файл — всё, что слой умеет.
//
//     Замер 21b: ядро с track, motion и gesture — 5,6 КБ, движок scroll —
//     0,9 КБ; первоначальные 5 КБ на всё вместе со слайдером оказались
//     недостижимы при записанном составе ядра. Решение 2026-08-29 —
//     состав сохранить, бюджет минимального набора — 8 КБ; после страниц,
//     rewind и снапа по страницам (замечания пользователя) — 9 КБ.
//
//     Замер 21f: полный файл с окнами и комбобоксом — 15,4 КБ при 15;
//     по модулям (gzip): ядро 6,0 · scroll 1,5 · fade 0,5 · anchor 0,9 ·
//     slider 1,6 · gallery 0,7 · lightbox 1,7 · parallax 0,3 · megamenu 2,2 ·
//     dropdown 1,9 · tooltip 0,9 · dialog 1,8 · combobox 2,3. Потолок 15
//     назначен в 21a до того, как в инвентарь вошли anchor и семейство
//     выпадающего; флаги terser (unsafe, props) дают 50–130 Б. Решение
//     2026-08-29 — 16 КБ; состав не режется, ориентиры UIkit/Swiper те же.
//
//     Замер 22a: 16 268 → 16 448 Б. +180 Б — цена объявленных зависимостей:
//     девять списков needs в модулях и проверка на старте, без которой
//     сборка «ядро + нужное» ломается молча и уже у читателя страницы
//     (риск №1 Этапа 22). Рост объясним построчно и не связан с переносом
//     ядра: тот состав файлов не меняет. Решение 2026-08-30 — 16,5 КБ.
//
//     Замер 25c: 16 448 → 16 892 Б. +444 Б — двенадцатый виджет, range:
//     доля пройденного пути ползунка и пара «от — до». Потолок поднят
//     ровно по прежнему правилу — «состав вырос, ориентир тот же»: так
//     он вырос в 21f, когда пришли окна и комбобокс. Решение 2026-08-30 —
//     17 КБ; ориентиры UIkit ≈ 40 КБ и Swiper ≈ 45 КБ не сдвинулись.
//
//     Пересчёт Этапа 28. Ориентиры измерены, а не оценены (2026-08-30,
//     gzip уровня 9): uikit.min.js — 50 619 Б, uikit-core.min.js —
//     33 945 Б, swiper-bundle.min.js — 42 014 Б плюс 4 827 Б своего CSS.
//
//       полный файл  16 892 Б — потолок поднят с 17 до 17,4 КБ. Покупка:
//                    сортируемая таблица (Этап 35), оценка этапа
//                    600–900 Б; запас 926 Б. Это и есть ответ на развилку
//                    35-0 «входит в полный бандл, если Этап 28 дал
//                    место»: место дано, виджет входит. Слой остаётся
//                    легче uikit.min.js втрое;
//       ядро слоя     2 689 Б — потолок опущен с 3 до 2,8 КБ, допуск
//                    178 Б. Рост не планируется по устройству: новая
//                    общая возможность кладётся в SHARED, а не в ядро
//                    (правило в CONTRIBUTING.md), и виджеты Этапов 25
//                    и 35 ядра не касаются — range приехал, ядро
//                    осталось теми же 2 689 Б. Прежние 383 Б были
//                    запасом ни подо что, а этот бюджет — плата
//                    каждого, кто взял хоть один виджет;
//       набор слайдера 7 760 Б — потолок опущен с 9 до 7,7 КБ, допуск
//                    125 Б. Рост не планируется: состав набора закрыт
//                    Этапом 22, а 1 456 Б прежнего запаса не были
//                    названы ничем. Набор легче связки Swiper
//                    (js + css) вшестеро.
const GRIFFIN_SRC = 'packages/ui/src/griffinjs';
const GRIFFIN = 'packages/ui/dist/griffinjs.js';
//     Замер 38g (2026-09-02): 17 615 → 18 110 Б. +495 Б — мультивыбор
//     в combobox: теги, позиции в <select multiple>, Backspace по тегам.
//     Единственное исключение Этапа 38 из правила «griffinjs.js не растёт»,
//     и покупка названа: сам виджет, а не второй. Решение — 17,8 КБ;
//     ориентиры UIkit ≈ 50 КБ и Swiper ≈ 42 КБ не сдвинулись.
//     Замер 42a (2026-09-13): 18 138 → 18 356 Б (официальный Node,
//     zlib 1.3.1). +218 Б — опция fields у пары ползунков: связка
//     с числовыми полями в обе стороны, зажим по min/max, порядок
//     на change. ПОКУПКА: фасет цены собирается одним атрибутом, а не
//     дюжиной строк скрипта на каждой витрине, где логику порядка
//     переписывали бы поверх той, что уже лежит в виджете.
//     Замер 42f (2026-09-13): 18 356 → 18 447 Б. +91 Б — флаг free
//     у комбобокса: Enter на непустом поле без активной позиции создаёт
//     тег из текста. ПОКУПКА: ключевые слова и адреса писем в CRM —
//     значение, которого нет в списке; мультивыбор до этого брал только
//     позиции источника. Итого за Этап 42 +309 Б. Правило владельца
//     (2026-09-13): потолки — из необходимости; нужная возможность
//     поднимает потолок, покупка называется. Решение — 18,1 КБ.
const GRIFFIN_BUDGET = Math.round(18.1 * 1024);
const GRIFFIN_CORE_BUDGET = Math.round(7.7 * 1024);
// Части минимального набора для слайдера. После Этапа 22 дорожка и анимация
// лежат вне ядра, но набору слайдера нужны обе: список повторяет needs.
const GRIFFIN_CORE_PARTS = [
  'packages/ui/dist/griffinjs-core.js',
  'packages/ui/dist/griffinjs-motion.js',
  'packages/ui/dist/griffinjs-track.js',
  'packages/ui/dist/griffinjs-scroll.js',
  'packages/ui/dist/griffinjs-slider.js',
];
// Налог на всех: ядро в одиночку. Именно оно теперь показывает, не растёт ли
// плата тех, кто взял один лёгкий виджет. Замер 22b — 2 689 Б при 6 264 до
// разнесения; бюджет пересчитан Этапом 28 (см. выше), и новая общая
// возможность кладётся в SHARED, а не сюда (правило в CONTRIBUTING.md).
const GRIFFIN_ONLY_CORE = 'packages/ui/dist/griffinjs-core.js';
const GRIFFIN_ONLY_CORE_BUDGET = Math.round(2.8 * 1024);

// Второй бандл слоя — расширенные поля форм (Этап 38). Три своих потолка
//     плюс набор «ядро + поля»; в griffinjs.js поля не входят ни одним
//     байтом, и его потолок этим этапом не трогается. Значения ставятся
//     ПО ПЕРВОМУ ЗАМЕРУ, а не назначаются заранее, и поднимаются только
//     вместе с названной покупкой — по тому же правилу, что и всё выше.
//
//       38a (2026-09-02): счётчик символов — первый груз каркаса.
//                    griffinjs-fields.js 822 Б, griffinjs-fields.css 213 Б,
//                    набор «ядро + поля» 3 205 Б. Потолки 0,9 / 0,3 / 3,3 КБ.
//       38b (2026-09-02): маска — фундамент телефона, даты и кода.
//                    +1 208 Б: разбор формата, прогон, каретка через
//                    beforeinput, отступление на композиции. Поля 2 030 Б,
//                    набор 4 307 Б. Потолки 2,1 / 4,3 КБ.
//       38c (2026-09-02): телефон — маска плюс код страны, состав из разметки
//                    или из таблицы. +1 210 Б: поля 3 240 Б, набор 5 443 Б.
//                    Таблица стран отдельным файлом — 871 Б, свой потолок.
//                    Потолки 3,3 / 5,4 / 0,9 КБ.
//       38d (2026-09-02): дата и время — раскладка по локали, спутник в ISO,
//                    проверка границ, панель календаря с клавиатурой.
//                    +3 063 Б: поля 6 303 Б; набор с anchor (панель —
//                    popover у поля) 9 062 Б; стили панели — 889 Б.
//                    Потолки 6,4 / 8,9 КБ, стили 0,9 КБ.
//       38e (2026-09-02): файловое поле (список, удаление по одному через
//                    DataTransfer) и ввод оценки поверх .gr-rating.
//                    +1 244 Б: поля 7 547 Б, набор 10 246 Б, стили 1 261 Б.
//                    Потолки 7,4 / 10,1 КБ, стили 1,3 КБ.
//       38f (2026-09-02): одноразовый код по ячейкам и сводка ошибок формы
//                    (счётчик вошёл ещё в 38a). +1 249 Б: поля 8 796 Б,
//                    набор 11 484 Б, стили 1 425 Б. Состав второго бандла
//                    закрыт: восемь полей, потолки 8,7 / 11,3 КБ, стили 1,5 КБ.
//       ревизия (2026-09-02): по замечаниям владельца — год списком и время
//                    в панели календаря, немедленная пометка невозможного
//                    значения, национальный префикс телефона (8 → +7), зона
//                    перетаскивания у файла. +838 Б: поля 9 634 Б, набор
//                    12 323 Б, стили 1 576 Б. Потолки 9,5 / 12,1 КБ, стили 1,6 КБ.
//       39a (2026-09-03): проверка недобора в маске — непустое значение
//                    с незаполненными обязательными слотами не проходит
//                    checkValidity(), aria-invalid по уходу фокуса,
//                    сброс в destroy(); телефон отдаёт полноту признаком
//                    complete. +98 Б: поля 9 766 Б, набор 12 450 Б.
//                    ПОКУПКА: проверки не было ни у одного поля с маской —
//                    ИНН, серия паспорта, номерной знак и телефон пропускали
//                    недобор одинаково, и для телефона статический pattern
//                    написать нельзя (маска приходит от выбранной страны).
//                    Потолки 9,6 / 12,2 КБ.
//       41a (2026-09-13): предупреждение телефона о стране по умолчанию —
//                    список из таблицы без country начинается с первой
//                    по алфавиту языка страницы (на русской — Австралия,
//                    +61), и виджет молчал. +51 Б: поля 9 817 Б, набор
//                    12 507 Б — потолки 9,7 / 12,3 КБ. ПОКУПКА: одна
//                    строка G.warn, снимается одним параметром; поведение
//                    не меняется.
//                    Потолок полей поднят на 0,1 КБ не под код, а под gzip:
//                    вес зависит от zlib в сборке Node. Homebrew-Node
//                    на macOS жмёт системным zlib 1.2.12 — 9 817 Б;
//                    официальные сборки Node 22 и 24 (их ставит CI) несут
//                    zlib 1.3.x — 9 854 Б, на 37 Б больше, и в прежних
//                    9 830 Б не помещаются. Потолок обязан держать там,
//                    где идёт гейт. Та же разница есть у каждого бюджета
//                    (от −9 до +50 Б), просто у остальных запас её покрывает.
//       43a (2026-09-13): диапазон дат «с — по» — пара нативных полей,
//                    связанная атрибутом to. +411 Б: поля 10 265 Б, набор
//                    12 937 Б, стили 1 718 Б. ПОКУПКА: значение одного
//                    поля — граница другого через собственный API соседа
//                    (limit), панель пустого поля открывается на месяце
//                    соседа, отрезок между концами помечен в обеих панелях,
//                    range в detail события; проверка границ, сообщения
//                    и aria-disabled — прежние пути, новой логики там нет.
//                    Отказ Этапов 33/38 снят наполовину: один контрол
//                    с двумя концами по-прежнему за пределом. Потолки
//                    10,1 / 12,7 КБ.
//       43b (2026-09-13): сумма с разрядами — новое поле number.
//                    +1 113 Б: поля 11 378 Б, набор 14 051 Б, стили
//                    1 755 Б. ПОКУПКА: разряды и дробь по локали документа
//                    на экране, число в спутнике с прежним именем, разбор
//                    любой записи из буфера, каретка счётом цифр, границы
//                    через спутник; ни type="number", ни inputmode, ни маска
//                    с фиксированными слотами этого не дают. Стили —
//                    одно правило: спутник в .gr-input-group не отнимает
//                    у поля скругление края. Потолки 11,2 / 13,8 КБ,
//                    стили 1,8 КБ.
const GRIFFIN_FIELDS = 'packages/ui/dist/griffinjs-fields.js';
const GRIFFIN_FIELDS_BUDGET = Math.round(11.2 * 1024);
const GRIFFIN_FIELDS_SET_BUDGET = Math.round(13.8 * 1024);
const GRIFFIN_COUNTRIES = 'packages/ui/dist/griffinjs-countries.js';
const GRIFFIN_COUNTRIES_BUDGET = Math.round(0.9 * 1024);

let griffinWeight = 0;
let griffinCoreWeight = 0;
let griffinOnlyCoreWeight = 0;
let griffinFieldsWeight = 0;
let griffinFieldsSetWeight = 0;
let griffinCountriesWeight = 0;

// Стили слоя: та же дисциплина, что у компонентов, — порядок слоёв
// первой строкой, весь вывод в griffincss.ui, префикс gr-, без !important.
// Проверка :root не нужна: файл подключается поверх griffincss-ui.css
// и токенов не несёт по устройству. Стили полей — тот же файл по устройству,
// поэтому и проверка та же.
function checkLayerCss(file) {
  const css = read(file);
  const parsed = parseBlocks(css);
  const strayCss = parsed.topLevel.filter((prelude) => prelude !== '@layer griffincss.ui');

  if (!css.replace(/\s+/g, ' ').startsWith(LAYER_ORDER.slice(0, -1))) {
    fail(file, 'порядок слоёв не объявлен первой строкой');
  }
  if (strayCss.length > 0) fail(file, `вне слоя griffincss.ui осталось блоков — ${strayCss.length}`);
  if (css.includes('!important')) fail(file, 'найден !important');

  for (const name of classNames(parsed.selectors)) {
    if (!name.startsWith('gr-')) fail(file, `класс .${name} без префикса gr-`);
  }
}

try {
  for (const file of [GRIFFIN, ...GRIFFIN_CORE_PARTS, GRIFFIN_FIELDS, GRIFFIN_COUNTRIES]) checkMinified(file);

  griffinWeight = bytes('griffinjs');
  griffinOnlyCoreWeight = bytes('griffinjs-core');

  // Набор меряется как ОДИН файл, той же методикой, что и полный griffinjs.js:
  // сумма трёх независимых gzip платит за три словаря вместо одного
  // (~1 КБ на пустом месте) и измеряла бы нарезку, а не код. Состав набора
  // объявлен в sizes.mjs — там же, где его берёт документация.
  griffinCoreWeight = bytes('griffinjs-slider-set');
  griffinFieldsWeight = bytes('griffinjs-fields');
  griffinFieldsSetWeight = bytes('griffinjs-fields-set');
  griffinCountriesWeight = bytes('griffinjs-countries');

  if (griffinWeight > GRIFFIN_BUDGET) {
    fail(GRIFFIN, `слой весит ${griffinWeight} Б gzip при бюджете ${GRIFFIN_BUDGET} Б — превышение на ${griffinWeight - GRIFFIN_BUDGET} Б`);
  }

  if (griffinOnlyCoreWeight > GRIFFIN_ONLY_CORE_BUDGET) {
    fail(GRIFFIN_ONLY_CORE, `ядро весит ${griffinOnlyCoreWeight} Б gzip при бюджете ${GRIFFIN_ONLY_CORE_BUDGET} Б — это плата каждого, кто взял хоть один виджет`);
  }

  if (griffinCoreWeight > GRIFFIN_CORE_BUDGET) {
    fail(GRIFFIN_CORE_PARTS[0], `набор слайдера (ядро + motion + track + scroll + slider) весит ${griffinCoreWeight} Б gzip при бюджете ${GRIFFIN_CORE_BUDGET} Б`);
  }

  if (griffinFieldsWeight > GRIFFIN_FIELDS_BUDGET) {
    fail(GRIFFIN_FIELDS, `поля весят ${griffinFieldsWeight} Б gzip при бюджете ${GRIFFIN_FIELDS_BUDGET} Б — превышение на ${griffinFieldsWeight - GRIFFIN_FIELDS_BUDGET} Б`);
  }

  if (griffinFieldsSetWeight > GRIFFIN_FIELDS_SET_BUDGET) {
    fail(GRIFFIN_FIELDS, `набор «ядро + поля» весит ${griffinFieldsSetWeight} Б gzip при бюджете ${GRIFFIN_FIELDS_SET_BUDGET} Б`);
  }

  if (griffinCountriesWeight > GRIFFIN_COUNTRIES_BUDGET) {
    fail(GRIFFIN_COUNTRIES, `таблица стран весит ${griffinCountriesWeight} Б gzip при бюджете ${GRIFFIN_COUNTRIES_BUDGET} Б`);
  }

  // Поля в полный файл не входят — ни одним виджетом. Списки сборки
  // разведены, но сторожится артефакт: разъехаться со списком он не может,
  // а вот попасть в него «раз уж влезло» — рукой автора — может.
  const full = read(GRIFFIN);

  for (const rel of FIELDS) {
    const widget = rel.replace(/^fields\//, '').replace(/\.js$/, '');

    if (new RegExp(`defineWidget\\(["']${widget}["']`).test(full)) {
      fail(GRIFFIN, `виджет поля «${widget}» попал в полный griffinjs.js — место полей во втором бандле`);
    }
  }

  checkLayerCss(GRIFFIN_CSS);
  checkLayerCss(GRIFFIN_FIELDS_CSS);
} catch (e) {
  fail(GRIFFIN, `слой не собран — npm run build:griffinjs --workspace griffincss-ui (${e.message})`);
}

// Инварианты слоя по исходникам (docs/griffinjs-architecture.html, «Инварианты»):
// JS не пишет transform и opacity — движение делает CSS через
// --gr-progress и data-gr-state; развилок по User-Agent нет.
const FORBIDDEN_IN_SRC = [
  [/\.style\.(transform|opacity)\b/, 'запись transform/opacity из JS — движение делает CSS'],
  [/setProperty\(\s*['"](transform|opacity)['"]/, 'запись transform/opacity через setProperty'],
  [/navigator\.userAgent|navigator\.platform|navigator\.vendor/, 'развилка по User-Agent'],
];

function walkJs(dir, out = []) {
  for (const name of readdirSync(join(root, dir)).sort()) {
    const rel = `${dir}/${name}`;

    if (statSync(join(root, rel)).isDirectory()) walkJs(rel, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(rel);
  }

  return out;
}

for (const file of walkJs(GRIFFIN_SRC)) {
  const code = read(file).replace(STRINGS, '');

  for (const [pattern, what] of FORBIDDEN_IN_SRC) {
    if (pattern.test(code)) fail(file, what);
  }
}

// Единственный источник <style> — рантайм ядра (Этап 30).
//     Документация обещает читателю со строгим CSP ровно это: <style>
//     создаёт один файл, и только он нуждается в nonce. Обещание, которое
//     никто не сторожит, тихо перестаёт быть правдой при первой же
//     надстройке, решившей завести свой лист.
const STYLE_MAKER = /createElement\(\s*['"]style['"]/;

for (const file of [...RUNTIME_SOURCES, ...walkJs(GRIFFIN_SRC)]) {
  if (!STYLE_MAKER.test(read(file))) continue;

  if (file !== RUNTIME) {
    fail(file, '<style> создаёт не только рантайм ядра — раздел о строгом CSP перестал быть правдой');
  }
}

if (!STYLE_MAKER.test(read(RUNTIME))) {
  fail(RUNTIME, 'рантайм ядра больше не создаёт <style> — раздел о строгом CSP описывает не то');
}

if (!/styleEl\.nonce = nonce/.test(read(RUNTIME))) {
  fail(RUNTIME, 'nonce на <style> не переносится — под строгим CSP раскладки потеряются молча');
}

// Динамический import() в тестах и скриптах — только по специферу или file:-URL.
//     Абсолютный путь работает на POSIX и падает под Windows: `C:\…`
//     разбирается как протокол. Сторож нужен потому, что вся проверка
//     идёт на ubuntu-latest, и такая ошибка на ней невидима.
{
  const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  const DYNAMIC_IMPORT = /(?<![.\w$])import\s*\(([^)]*)\)/g;
  const dirs = ['scripts', ...RUNTIME_SOURCES.map((f) => `${f.split('/').slice(0, 2).join('/')}/test`)];

  for (const dir of new Set(dirs)) {
    for (const file of walkJs(dir)) {
      // Комментарии и строки снимаются: специфер-литерал после этого
      // выглядит как пустые скобки, и именно пустые скобки здесь — норма.
      const code = read(file).replace(COMMENTS, '').replace(STRINGS, '');

      for (const [, arg] of code.matchAll(DYNAMIC_IMPORT)) {
        const spec = arg.trim();

        if (spec === '' || spec.includes('pathToFileURL') || spec.includes('import.meta.url')) continue;

        fail(file, `import(${spec}…) — путь вместо специфера или file:-URL: под Windows не разберётся`);
      }
    }
  }
}

// Версия ядра слоя — та же, что у всего репозитория.
for (const needle of [`v${VERSION}`, `VERSION = '${VERSION}'`]) {
  if (!read(`${GRIFFIN_SRC}/core/griffinjs-core.js`).includes(needle)) {
    fail(`${GRIFFIN_SRC}/core/griffinjs-core.js`, `версия разошлась с корневым package.json (${VERSION}): не найдено «${needle}»`);
  }
}
// Выход наверх из docs/ (Этап 37). На GitVerse Pages корнем сайта
//     становится сам docs/, и `../` из него не ведёт никуда. Исключение
//     одно: `../packages/` — эти адреса переписывает build-pages.mjs,
//     перекладывая dist под корень сайта.
//
//     Сторож стоит здесь, а не только в build-pages: тот запускается
//     лишь при публикации документации, то есть уже в публичном CI,
//     и ошибку показывает через выпуск. `npm run check` ловит её у автора.
{
  const docsDir = join(root, 'docs');

  for (const name of readdirSync(docsDir).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(join(docsDir, name), 'utf8');

    for (const [, href] of html.matchAll(/(?:href|src)="(\.\.\/[^"]*)"/g)) {
      if (href.startsWith('../packages/')) continue;

      fail(`docs/${name}`, `ссылка выше корня сайта — ${href}`);
    }
  }
}

// 18. Бейджи «нужен griffinjs.js» (правило разделения «с/без», Этап 21).
//     Демонстрация, чья разметка требует скрипт (data-gr-<виджет> слоя),
//     обязана нести бейдж; на страницах компонентов ui-*.html такие
//     демонстрации допустимы только в подразделе «С подключённым
//     griffinjs.js» — после заголовка с id="griffinjs". Без бейджа читатель без скрипта
//     получил бы неработающий пример без объяснения.
{
  // Поля второго бандла требуют griffinjs-fields.js — бейдж называет
  // именно его: читателю, подключившему один griffinjs.js, пример
  // без этой оговорки показал бы неработающее поле.
  const layerAttr = /data-gr-(?:track|slider|gallery|lightbox|parallax|megamenu|dropdown|tooltip|dialog|open|combobox|range|sortable)\b/;
  const fieldAttr = new RegExp(`data-gr-(?:${FIELDS.map((rel) => rel.replace(/^fields\//, '').replace(/\.js$/, '')).join('|')})\\b`);
  const docsDir = join(root, 'docs');

  for (const name of readdirSync(docsDir).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(join(docsDir, name), 'utf8');

    // (ссылки в <head> и подраздел в конце).
    // Подраздел «С подключённым griffinjs.js» начинается заголовком
    // с id="griffinjs" и идёт до конца страницы.
    const section = html.search(/<h2[^>]*\bid="griffinjs"/);

    for (const match of html.matchAll(/<div class="demo-block">([\s\S]*?)\n<\/div>\n/g)) {
      const block = match[1];

      const field = fieldAttr.test(block);

      if (!layerAttr.test(block) && !field) continue;

      const title = (block.match(/demo-block-title">([\s\S]*?)<\/div>/) || [])[1] || '';
      const inside = section !== -1 && match.index > section;
      const badge = field ? /нужен griffinjs-fields\.js/ : /нужен griffinjs\.js/;

      if (!badge.test(block)) {
        fail(`docs/${name}`, `демонстрация со скриптом без бейджа «нужен ${field ? 'griffinjs-fields.js' : 'griffinjs.js'}»: ${title.replace(/<[^>]*>/g, '').trim().slice(0, 60)}`);
      }

      if (name.startsWith('ui-') && !inside) {
        fail(`docs/${name}`, `демонстрация со скриптом вне подраздела «С подключённым griffinjs.js»: ${title.replace(/<[^>]*>/g, '').trim().slice(0, 60)}`);
      }
    }
  }
}

// 19. Экспорт токенов не отстал от CSS и покрывает :root целиком (Этап 34).
//     Файл отдают дизайнеру вместо Figma-кита, и вся его ценность в том,
//     что разойтись с исходником он не может. Проверяется поэтому двумя
//     способами сразу: содержимое — байт-в-байт против генерации из текущего
//     ядра, состав — против перечня переменных :root. Новая переменная
//     без токена роняет сборку: молча она уехала бы в никуда, и дизайнер
//     узнал бы об этом, не найдя её в Figma.
let tokenCount = 0;

try {
  const actual = read(TOKENS);

  if (actual !== tokensContent(root)) {
    fail(TOKENS, 'экспорт токенов отстал от собранного CSS — пересоберите: npm run build:tokens');
  }

  const exported = JSON.parse(actual);
  const declared = [...rootVariables(read(CORE))].map((name) => name.replace(/^--gr-/, ''));

  for (const { name } of SETS) {
    const set = exported[name];

    if (!set) {
      fail(TOKENS, `нет набора ${name} — три оси темы обязаны приехать тремя наборами`);
      continue;
    }

    tokenCount = Object.keys(set).filter((key) => !key.startsWith('$')).length;

    const missing = declared.filter((token) => !(token in set));

    if (missing.length > 0) {
      fail(TOKENS, `в наборе ${name} нет токенов для переменных :root (${missing.length}): ${missing.slice(0, 10).join(', ')}`);
    }
  }

  // Граница экспорта: это токены, а не кит. Класс, заехавший сюда, означал бы,
  // что генератор начал вывозить наружу разметку.
  if (/\.gr-/.test(actual)) fail(TOKENS, 'в экспорте токенов появился класс — это экспорт переменных, а не библиотека');
} catch (e) {
  fail(TOKENS, `экспорт токенов не собран — npm run build:tokens (${e.message})`);
}

// 20. Физических односторонних классов не осталось (Этап 36).
//     Единственное запланированное ломающее изменение библиотеки:
//     односторонние отступы, выравнивание текста, привязка к краям
//     и стороны границ — только логические (s/e, start/end). Инвариант
//     постоянный: физический класс, вернувшийся по невнимательности,
//     пришлось бы удалять вторым ломающим изменением, поэтому он роняет
//     сборку сразу. Верх и низ (t/b, top/bottom) остаются физическими:
//     блочная ось в RTL не разворачивается.
const PHYSICAL_SIDE_CLASSES = [
  /\.gr-(?:ml|mr|pl|pr)-(?:\d|auto)/,
  /\.gr-text-(?:left|right)\b/,
  /\.gr-(?:left|right)-(?:0|auto)/,
  /\.gr-border-[lr](?:-\d+)?\s*[,{.:]/,
];

for (const file of [UTILS, UTILS_SCOPED]) {
  const css = read(file);

  for (const pattern of PHYSICAL_SIDE_CLASSES) {
    const hit = css.match(pattern);

    if (hit) {
      fail(file, `физический класс вернулся: «${hit[0]}» — с Этапа 36 стороны только логические (s/e, start/end)`);
    }
  }
}

// --- итог -------------------------------------------------------------------

if (problems.length > 0) {
  console.error('check-dist: обнаружены нарушения\n');
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  console.error(`\ncheck-dist: нарушений — ${problems.length}`);
  process.exit(1);
}

const size = (file) => kb(rawOf(file));
console.log('check-dist: проверки пройдены');
console.log(`  core   ${size(CORE)} (${coreClasses.size} классов) + ресет ${size(RESET)}`);
console.log(`  ui     ${size(UI)} (${uiClasses.size} классов) + scoped ${size(UI_SCOPED)}`);
console.log(`  utils  ${size(UTILS)} (${utilsClasses.size} классов) + scoped ${size(UTILS_SCOPED)}`);
console.log(`  js     ${kb(jsWeight)} gzip на ${RUNTIMES.length} рантайма (бюджет ${kb(JS_BUDGET)})`);
console.log(`  бандл  ${kb(bundleWeight)} gzip одним файлом (бюджет ${kb(BUNDLE_BUDGET)})`);
console.log(`  griffinjs ${kb(griffinWeight)} gzip (бюджет ${kb(GRIFFIN_BUDGET)}), ядро ${kb(griffinOnlyCoreWeight)} (бюджет ${kb(GRIFFIN_ONLY_CORE_BUDGET)}), набор слайдера ${kb(griffinCoreWeight)} (бюджет ${kb(GRIFFIN_CORE_BUDGET)})`);
console.log(`  поля   ${kb(griffinFieldsWeight)} gzip (бюджет ${kb(GRIFFIN_FIELDS_BUDGET)}), набор «ядро + поля» ${kb(griffinFieldsSetWeight)} (бюджет ${kb(GRIFFIN_FIELDS_SET_BUDGET)}), таблица стран ${kb(griffinCountriesWeight)} (бюджет ${kb(GRIFFIN_COUNTRIES_BUDGET)})`);
console.log(`  ось    ${size(STYLES)} на три стиля, по одному — ${STYLE_NAMES.map((name) => `${name} ${size(styleFile(name))}`).join(', ')}; gzip ${kb(bytes('styles'))} / ${STYLE_NAMES.map((name) => kb(bytes(`style-${name}`))).join(' / ')}`);
console.log(`  бюджет CSS ${CSS_BUDGETS.map(([id, budget]) => `${id} ${kb(bytes(id))} из ${kb(budget)}`).join(' · ')}`);
console.log(`  токены ${tokenCount} на набор × ${SETS.length} набора (${SETS.map(({ name }) => name).join(', ')})`);
console.log(`  брейкпоинты: ${[...breakpoints].join(', ')}`);
