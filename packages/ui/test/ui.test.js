'use strict';

// Инварианты пакета компонентов, проверяемые по собранному CSS.
// check-dist.mjs следит за структурой артефакта в целом — слои, префиксы,
// непересечение пакетов, идентичность :root. Здесь — за содержимым:
// какие компоненты в сборке есть, откуда они берут размеры и цвета
// и что ни один из них не привязан к чужому пакету.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ui = fs.readFileSync(path.join(__dirname, '..', 'dist', 'griffincss-ui.css'), 'utf8');
const scoped = fs.readFileSync(path.join(__dirname, '..', 'dist', 'griffincss-ui-scoped.css'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'packages/core/dist/griffincss-core.css'), 'utf8');
const griffinjs = fs.readFileSync(path.join(__dirname, '..', 'dist', 'griffinjs.css'), 'utf8');
const utils = fs.readFileSync(path.join(ROOT, 'packages/utils/dist/griffincss-utils.css'), 'utf8');

// Преамбулы всех правил артефакта — то, что стоит перед «{» и не начинается
// с «@». Нужны там, где проверяется форма самого селектора, а не объявления
// внутри него.
function parseSelectors(css) {
  return [...css.matchAll(/(?:^|[{}])([^{}@][^{}]*)\{/g)].map((m) => m[1].trim());
}

// Якорный класс каждого модуля волн 8a и 8b: если модуль забыли подключить
// в точке входа, сборка соберётся молча, а этот список — нет.
const MODULES = {
  _accordion: '.gr-accordion',
  _alert: '.gr-alert',
  _avatar: '.gr-avatar',
  _badge: '.gr-badge',
  _breadcrumb: '.gr-breadcrumb',
  _button: '.gr-btn',
  _card: '.gr-card',
  _choice: '.gr-checkbox',
  _drawer: '.gr-drawer',
  _dropdown: '.gr-dropdown',
  _form: '.gr-input',
  _link: '.gr-link',
  _menu: '.gr-menu',
  _modal: '.gr-modal',
  _nav: '.gr-nav',
  _pagination: '.gr-pagination',
  _rating: '.gr-rating',
  _table: '.gr-table',
  _tabs: '.gr-tabs',
  _tooltip: '.gr-tooltip',
  _empty: '.gr-empty',
  _progress: '.gr-progress',
  _range: '.gr-range',
  _skeleton: '.gr-skeleton',
  _spinner: '.gr-spinner',
  _steps: '.gr-steps',
  _toast: '.gr-toast',
};

test('все двадцать семь модулей попали в обе сборки', () => {
  for (const [module, selector] of Object.entries(MODULES)) {
    // В сжатом CSS за классом идёт либо начало блока, либо запятая
    // группового селектора, либо псевдокласс: .gr-checkbox,.gr-radio{…}
    const present = new RegExp(`\\${selector}[{,:]`);

    assert.ok(present.test(ui), `${module}: нет ${selector} в griffincss-ui.css`);
    assert.ok(present.test(scoped), `${module}: нет ${selector} в scoped-сборке`);
  }
});

test('у кнопки все девять вариантов и три размера', () => {
  const variants = ['primary', 'secondary', 'success', 'warning', 'danger', 'info', 'ghost', 'link'];

  for (const variant of variants) {
    assert.ok(ui.includes(`.gr-btn-${variant}{`), `нет варианта .gr-btn-${variant}`);
  }

  assert.ok(ui.includes('.gr-btn{'), 'нет базовой .gr-btn — она и есть девятый вариант');
  assert.ok(ui.includes('.gr-btn-sm{') && ui.includes('.gr-btn-lg{'), 'нет размеров кнопки');
});

test('высоты элементов управления берутся из токенов, а не из литералов', () => {
  const block = ui.slice(ui.indexOf('.gr-btn{'), ui.indexOf('.gr-btn:'));

  assert.ok(block.includes('var(--gr-control-height)'), 'высота кнопки не из --gr-control-height');
  assert.ok(!/min-block-size:\s*\d/.test(block), 'высота кнопки задана числом');

  assert.ok(ui.includes('var(--gr-control-height-sm)'), '.gr-btn-sm не берёт токен малого размера');
  assert.ok(ui.includes('var(--gr-control-height-lg)'), '.gr-btn-lg не берёт токен крупного размера');
});

test('токены компонентов объявлены в :root всех трёх пакетов', () => {
  const TOKENS = [
    '--gr-control-height',
    '--gr-control-padding-x',
    '--gr-control-font-size',
    '--gr-ui-gap',
    '--gr-overlay',
    '--gr-z-dropdown',
    '--gr-z-modal',
    '--gr-z-toast',
  ];

  for (const token of TOKENS) {
    for (const [name, css] of [['ui', ui], ['core', core], ['utils', utils]]) {
      assert.ok(css.includes(`${token}:`), `нет ${token} в griffincss-${name}.css`);
    }
  }
});

test('цвета компонентов — только семантические токены, ни одного литерала', () => {
  // :root вырезан: там литеральная палитра и живёт.
  const rules = ui.slice(ui.indexOf('.gr-alert{'));

  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(rules), 'найден шестнадцатеричный цвет в правиле компонента');
  assert.ok(!/\bhsl\(\s*\d/.test(rules), 'найден литеральный hsl() в правиле компонента');
  assert.ok(!/\brgb\(/.test(rules), 'найден литеральный rgb() в правиле компонента');
});

test('границы компонентов масштабируются режимом для слабовидящих', () => {
  // --gr-border-width поднимается до 2px в режиме контраста: компонент,
  // записавший 1px напрямую, этого не заметит.
  const rules = ui.slice(ui.indexOf('.gr-alert{'));
  const literal = rules.match(/border(?:-\w+)*:\s*1px/g);

  assert.equal(literal, null, `граница задана литеральным 1px: ${literal}`);
  assert.ok(rules.includes('var(--gr-border-width)'), 'ни одна граница не берёт токен ширины');
});

test('текстовый цвет предупреждения нигде не служит заливкой', () => {
  // --gr-color-warning рассчитан на ТЕКСТ: в светлой теме он обязан быть
  // тёмно-коричневым, чтобы читаться на белом. Как заливка он даёт грязное
  // пятно вместо предупреждения, поэтому у фигур — кнопки, точки, счётчика,
  // полосы сообщения — своя пара --gr-color-warning-surface / -on-warning.
  assert.ok(
    !ui.includes('background-color:var(--gr-color-warning)'),
    'текстовый цвет предупреждения снова используется как фон',
  );

  const fills = [
    ['.gr-btn-warning', '--gr-btn-bg: var(--gr-color-warning-surface)'],
    ['.gr-badge-warning', '--gr-badge-fill: var(--gr-color-warning-surface)'],
    ['.gr-dot-warning', '--gr-badge-fill: var(--gr-color-warning-surface)'],
    ['.gr-alert-warning', '--gr-alert-fill: var(--gr-color-warning-surface)'],
  ];

  for (const [selector, declaration] of fills) {
    const at = ui.indexOf(`${selector}{`);

    assert.ok(at > 0, `нет правила ${selector}`);
    assert.ok(
      ui.slice(at, ui.indexOf('}', at)).includes(declaration),
      `${selector} заливается не поверхностным цветом предупреждения`,
    );
  }
});

test('статус сообщения читается словом, а не только цветом', () => {
  assert.ok(ui.includes('.gr-alert-title{'), 'нет .gr-alert-title — слово статуса поставить некуда');

  for (const status of ['info', 'success', 'warning', 'danger']) {
    assert.ok(ui.includes(`.gr-alert-${status}{`), `нет статуса .gr-alert-${status}`);
  }
});

test('интерактивные компоненты показывают фокус с клавиатуры', () => {
  for (const selector of [
    '.gr-btn:focus-visible',
    '.gr-input:focus-visible',
    '.gr-checkbox:focus-visible',
    '.gr-link:focus-visible',
    '.gr-tag-remove:focus-visible',
  ]) {
    assert.ok(ui.includes(selector), `нет правила фокуса для ${selector}`);
  }

  assert.ok(ui.includes('var(--gr-focus-width)'), 'толщина контура фокуса не из токена');
});

test('подсветка по наведению — только там, где указатель есть', () => {
  // На сенсорном экране :hover залипает после тапа: подсветка остаётся
  // на кнопке, к которой давно не прикасались.
  const hovers = [...ui.matchAll(/[^{}]*:hover[^{}]*\{/g)].map((m) => m[0]);
  const guarded = [...ui.matchAll(/@media\s*\(hover: hover\)\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
    .map((m) => m[1])
    .join('');

  const unguarded = hovers.filter((rule) => !guarded.includes(rule));

  // Исключения — правила, которые ничего не подсвечивают: они лишь поднимают
  // элемент над соседями, чтобы его граница и контур фокуса были видны
  // целиком. Залипнуть тут нечему.
  const allowed = ['.gr-card-interactive', '.gr-avatar-group', '.gr-btn-group'];

  for (const rule of unguarded) {
    assert.ok(
      allowed.some((prefix) => rule.includes(prefix)),
      `правило :hover вне @media (hover: hover): ${rule}`,
    );
  }
});

test('color-mix не вернулся ни в одну сборку', () => {
  // Оттенки и подсветки собраны из hsl-триплетов темы и полупрозрачных
  // слоёв намеренно: color-mix поднимал порог библиотеки до Chrome 111 /
  // Safari 16.2 / Firefox 113 — выше заявленных каскадных слоёв, и притом
  // молча, потому что в таблице совместимости его не было.
  //
  // Проверка стоит здесь, а не в check-dist: вернуть color-mix проще всего
  // одной строкой в компоненте, и упасть это должно там же, где пишут
  // компоненты.
  for (const [name, css] of [['ui', ui], ['ui-scoped', scoped], ['core', core], ['utils', utils]]) {
    assert.ok(!css.includes('color-mix('), `color-mix вернулся в ${name}`);
  }
});

test('полосы и подсветка таблицы — оттенок, а не готовый цвет поверхности', () => {
  // Непрозрачный цвет совпадёт с одной из подложек, на которых таблица может
  // лежать, и станет невидимым. Полупрозрачный оттенок виден на всех
  // и меняет направление вместе с темой: ink-0 в светлой тёмный,
  // в тёмной светлый.
  assert.ok(
    ui.includes('.gr-table-striped tbody tr:nth-child(odd){background-color:hsl(var(--gr-hsl-ink-0), 5%)'),
    'полосы вернулись к непрозрачному цвету',
  );
  assert.ok(
    /\.gr-table-hover tbody tr:hover\{background-image:linear-gradient\(hsl\(var\(--gr-hsl-ink-0\), 6%\)/.test(ui),
    'подсветка строки вернулась к непрозрачному цвету',
  );
});

test('подсветка строки ложится поверх полосы, а не вместо неё', () => {
  // У полосы и подсветки одна специфичность — «класс + tbody + tr +
  // псевдокласс». Задай подсветка background-color, она бы просто заменила
  // полосу, и на нечётной строке шаг при наведении стал бы почти незаметен.
  const block = ui.slice(ui.indexOf('.gr-table-hover tbody tr:hover{'));
  const rule = block.slice(0, block.indexOf('}') + 1);

  assert.ok(rule.includes('background-image:'), 'подсветка задана не слоем');
  assert.ok(
    !rule.includes('background-color:'),
    'подсветка вернулась к background-color и снова заменяет полосу',
  );
});

test('обёртка прокрутки — содержащий блок для абсолютных потомков', () => {
  // .gr-sr-only внутри кнопки-иконки позиционирован абсолютно; кнопка
  // не позиционирована, и без position: relative на обёртке его containing
  // block лежал снаружи — узел вставал у правого края широкой таблицы
  // за пределами прокрутки и растягивал документ на 53 px (ui-tables.html
  // на 375 px). Обёртка обязана удерживать всё, что в ней прокручивается.
  const block = ui.slice(ui.indexOf('.gr-table-wrap{'));
  const rule = block.slice(0, block.indexOf('}') + 1);

  assert.ok(rule.includes('position:relative'), 'обёртка не удерживает абсолютных потомков');
});

test('липкая шапка везёт линию с собой', () => {
  // При border-collapse: collapse границу рисует таблица, а не ячейка,
  // поэтому с уехавшей шапкой она не двигается. Линию даёт внутренняя тень.
  const block = ui.slice(ui.indexOf('.gr-table-sticky thead th{'));
  const rule = block.slice(0, block.indexOf('}') + 1);

  assert.ok(rule.includes('box-shadow:inset'), 'линия под липкой шапкой не нарисована тенью');
  assert.ok(rule.includes('border-block-end:0'), 'у липкой шапки осталась схлопнутая граница');
});

test('у таблицы есть и плотный, и разреженный варианты', () => {
  assert.ok(ui.includes('.gr-table-compact th,'), 'нет .gr-table-compact');
  assert.ok(ui.includes('.gr-table-relaxed th,'), 'нет .gr-table-relaxed');
});

// Этап 47c (фидбек темы griffin по 0.25.0, п. 5): ниже порога строка
// таблицы кабинета становится карточкой. Шапка остаётся читалке, подпись
// ячейки — из data-label, без него ячейка идёт без подписи.
function stackRules(css, selector) {
  const from = css.indexOf(selector);

  assert.notEqual(from, -1, `${selector} нет в сборке`);

  return css.slice(from, from + 1200);
}

test('.gr-table-stack: строка — блок с обводкой, ячейка — флекс с подписью из data-label', () => {
  const block = stackRules(ui, '.gr-table-stack,');

  assert.match(block, /\.gr-table-stack tr\{[^}]*border:var\(--gr-border-width\) solid var\(--gr-color-border\)/, 'строка без обводки');
  assert.match(block, /\.gr-table-stack tr>\*\{display:flex/, 'ячейка не флекс');
  assert.match(block, /\.gr-table-stack tr>\[data-label\]::before\{content:attr\(data-label\)/, 'подписи из data-label нет');
  assert.ok(!/\.gr-table-stack tr>\*::before/.test(block), 'подпись рисуется и без data-label — пустой ::before сдвигает значение');
});

test('.gr-table-stack прячет шапку от глаз, но не от читалки', () => {
  const block = stackRules(ui, '.gr-table-stack thead{');
  const rule = block.slice(0, block.indexOf('}') + 1);

  assert.ok(rule.includes('clip-path:inset(50%)'), 'шапка не спрятана визуально');
  assert.ok(!rule.includes('display:none'), 'display: none выбрасывает шапку из дерева доступности');
});

// Этап 47d (фидбек темы griffin, п. 8): лента в узком гнезде — столбик
// одним модификатором, вместо перебивания overflow-x и scroll-snap в слое
// темы. Только контейнерные пороги: в узком окне лента остаётся лентой —
// свайп и есть её мобильный режим.
test('.gr-track-stack-c{bp} — столбик ниже ширины контейнера', () => {
  for (const [bp, value] of Object.entries({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px' })) {
    const from = griffinjs.indexOf(`@container (width < ${value}){.gr-track-stack-c${bp}{`);

    assert.notEqual(from, -1, `.gr-track-stack-c${bp} не завёрнут в @container (width < ${value})`);

    const block = griffinjs.slice(from, from + 400);

    assert.match(block, /flex-direction:column/, 'лента не стала столбиком');
    assert.match(block, /scroll-snap-type:none/, 'снап остался');
    assert.match(block, new RegExp(`\\.gr-track-stack-c${bp}>\\*\\{flex-basis:auto`), 'слайды не отпущены по высоте');
  }

  assert.ok(!griffinjs.includes('.gr-track-stack-sm'), 'оконный порог ленты появился без решения');
  assert.ok(!/\.gr-track-stack\{/.test(griffinjs), 'бессуффиксный столбик появился без решения');
});

// Число слайдов в ряд по ширине гнезда (решение владельца 2026-09-21):
// виджет в слоте меряется слотом, и .gr-track-3-cmd — пара к столбику
// .gr-track-stack-csm. Столбик обязан стоять в файле позже: между 640
// и 768 px гнезда .gr-track-2-csm и .gr-track-stack-cmd совпадают,
// и побеждает порядок.
test('.gr-track-N-c{bp} — слайдов в ряд по ширине контейнера, столбик старше', () => {
  for (const [bp, value] of Object.entries({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px' })) {
    const from = griffinjs.indexOf(`@container (width >= ${value}){.gr-track-1-c${bp}>*{`);

    assert.notEqual(from, -1, `.gr-track-N-c${bp} не завёрнуты в @container (width >= ${value})`);

    const block = griffinjs.slice(from, from + 600);

    for (const n of [2, 3, 4]) {
      const share = `>*{flex-basis:calc((100% - var(--gr-gap)*${n - 1})/${n})}`;

      assert.ok(block.includes(`.gr-track-${n}-c${bp}${share}`), `.gr-track-${n}-c${bp}: доли слайда нет`);
      assert.ok(griffinjs.includes(`.gr-track-${n}-${bp}${share}`), `.gr-track-${n}-c${bp}: доля разошлась с оконным вариантом`);
    }

    assert.ok(from < griffinjs.indexOf(`.gr-track-stack-c${bp}{`), `столбик -c${bp} стоит раньше долей и проиграл бы им`);
  }
});

test('порог .gr-table-stack-{bp} / -c{bp} — ниже брейкпоинта, окно или контейнер', () => {
  for (const [bp, value] of Object.entries({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px' })) {
    const media = ui.indexOf(`@media(width < ${value}){.gr-table-stack-${bp},`);
    const container = ui.indexOf(`@container (width < ${value}){.gr-table-stack-c${bp},`);

    assert.notEqual(media, -1, `.gr-table-stack-${bp} не завёрнут в @media (width < ${value})`);
    assert.notEqual(container, -1, `.gr-table-stack-c${bp} не завёрнут в @container (width < ${value})`);
  }

  // Бесcуффиксный класс — всегда карточки: он не завёрнут ни во что.
  assert.ok(!/@media[^{]*\{\.gr-table-stack,/.test(ui), 'бессуффиксный вариант оказался под @media');
});

test('заливка сегментного переключателя ложится точно по рамке', () => {
  // overflow: hidden обрезает по внутреннему краю рамки, но с ВНЕШНИМ
  // радиусом, поэтому в углах между заливкой и рамкой оставался зазор.
  // Крайние сегменты скругляются сами, на внутренний радиус.
  const at = ui.indexOf('.gr-segmented{');
  const rule = ui.slice(at, ui.indexOf('}', at) + 1);

  assert.ok(!rule.includes('overflow:hidden'), 'обёртка снова обрезает сегменты по overflow');
  assert.ok(
    rule.includes('--gr-segmented-radius: calc(var(--gr-radius) - var(--gr-border-width))'),
    'внутренний радиус не выводится из толщины рамки',
  );

  for (const edge of ['first', 'last']) {
    const selector = `.gr-segmented label:${edge}-of-type span{`;
    const from = ui.indexOf(selector);

    assert.ok(from > 0, `нет правила для ${edge}-of-type`);
    assert.ok(
      ui.slice(from, ui.indexOf('}', from)).includes('var(--gr-segmented-radius)'),
      `крайний сегмент ${edge}-of-type не скруглён по внутреннему радиусу`,
    );
  }
});

test('образец цвета и плашка размера: радио прячется только через :has(), цвет — из переменной', () => {
  // Этап 42e. Радио остаётся в потоке 1px и прозрачной — как в .gr-segmented,
  // — и прячется правилом с :has(): без него (Firefox < 121) правило
  // не применяется, и радио остаётся видимой рядом с образцом. display: none
  // сломал бы и клавиатуру, и деградацию.
  const hide = ui.indexOf('.gr-choice:has(>.gr-swatch,>.gr-swatch-tag)>.gr-radio{');

  assert.ok(hide > 0, 'нет правила, прячущего радио рядом с образцом');

  const rule = ui.slice(hide, ui.indexOf('}', hide));

  assert.ok(!rule.includes('display:none'), 'радио спрятана display: none');
  assert.ok(rule.includes('opacity:0'), 'радио не прозрачна');

  // Цвет образца — только через переменную на элементе; литерала в модуле
  // нет (общий тест на литералы это тоже ловит), умолчание — токен.
  const swatch = ui.indexOf('.gr-swatch{');
  const body = ui.slice(swatch, ui.indexOf('}', swatch));

  assert.ok(body.includes('background-color:var(--gr-swatch)'), 'фон образца не из --gr-swatch');

  // Размер и скругление — токенами с прежними умолчаниями: тема задаёт их
  // из подслоя ниже ui, а новое объявление она бы не перебила.
  assert.ok(body.includes('inline-size:var(--gr-swatch-size, 1.5rem)'), 'ширина образца не из --gr-swatch-size');
  assert.ok(body.includes('block-size:var(--gr-swatch-size, 1.5rem)'), 'высота образца не из --gr-swatch-size');
  assert.ok(body.includes('border-radius:var(--gr-swatch-radius, var(--gr-radius-pill))'), 'скругление образца не из --gr-swatch-radius');

  // Выбранное и фокус — одним правилом у радио и у образца-ссылки
  // (aria-current), чтобы вид не разошёлся. a.gr-swatch-tag[aria-current]
  // весом (0,2,1) держит чернила заливки против правила режима a[href].
  assert.ok(ui.includes('.gr-radio:checked+.gr-swatch,.gr-swatch[aria-current]{'), 'нет состояния выбранного образца — у радио и у ссылки');
  assert.ok(
    ui.includes('.gr-radio:checked+.gr-swatch-tag,.gr-swatch-tag[aria-current],a.gr-swatch-tag[aria-current]{'),
    'нет состояния выбранной плашки — у радио и у ссылки',
  );
  assert.ok(
    ui.includes('.gr-radio:focus-visible+.gr-swatch,.gr-radio:focus-visible+.gr-swatch-tag,.gr-swatch:focus-visible,.gr-swatch-tag:focus-visible{'),
    'нет фокуса на образце — у радио и у ссылки',
  );

  // Подчёркивание плашка-ссылка снимает сама, длинным свойством: правило
  // по <a> из слоя темы старше ресета. Зачёркивание — утилитой, из utils.
  assert.ok(ui.includes('a.gr-swatch-tag{text-decoration-line:none}'), 'плашка-ссылка не снимает подчёркивание');
});

test('пакет не зависит от утилит: собранный CSS самодостаточен', () => {
  assert.ok(ui.includes(':root{'), 'блок :root не приехал — сборка не самодостаточна');
  assert.ok(ui.includes('[data-gr-theme=dark]'), 'блок тёмной темы не приехал');
  assert.ok(!ui.includes('.gr-mb-'), 'в сборке компонентов оказались утилиты отступов');
  assert.ok(!ui.includes('.gr-user-select-'), 'в сборке компонентов оказались утилиты выделения');
});

test('элемент формы .gr-select не пересёкся с утилитами выделения', () => {
  assert.ok(ui.includes('.gr-select'), 'нет .gr-select в компонентах');
  assert.ok(utils.includes('.gr-user-select-none{'), 'утилита user-select не переименована');
  assert.ok(!utils.includes('.gr-select-none{'), 'старое имя .gr-select-none вернулось');
});

test('display-дубли не вернулись: флекс и грид остались в ядре', () => {
  assert.ok(core.includes('.gr-grid{'), 'нет .gr-grid в ядре');
  assert.ok(core.includes('.gr-grid-md{'), 'нет адаптивного .gr-grid-md в ядре');
  assert.ok(!utils.includes('.gr-flex-display'), '.gr-flex-display вернулся в утилиты');
  assert.ok(!utils.includes('.gr-grid-display'), '.gr-grid-display вернулся в утилиты');
});

test('в scoped-сборке компоненты внутри области, а токены и тема — снаружи', () => {
  // Область задаёт префикс :where(.griffin). Специфичность у него нулевая —
  // ровно как у неявного :scope, который стоял здесь раньше, — поэтому
  // scoped-сборка остаётся каскадным двойником обычной, но не требует
  // от браузера ничего сверх каскадных слоёв.
  const bare = [...scoped.matchAll(/(?:^|[{}])\s*(\.gr-[^{}]*)\{/g)].map((m) => m[1]);

  assert.deepEqual(bare, [], 'правило компонента объявлено вне области .griffin');
  assert.ok(scoped.includes(':where(.griffin) .gr-btn{'), 'кнопка не ограничена областью');
  assert.ok(scoped.includes(':root{'), 'нет :root с токенами');
  assert.ok(!/:where\(\.griffin\)[^{}]*:root\{/.test(scoped), ':root уехал внутрь области видимости');
  assert.ok(scoped.includes('[data-gr-theme=dark]'), 'нет темы в scoped-сборке');
  assert.ok(
    !/:where\(\.griffin\)[^{}]*\[data-gr-theme/.test(scoped),
    'тема уехала внутрь области видимости',
  );
});

test('ссылка объявляет состояния в порядке LVHA', () => {
  // :visited раньше :hover — иначе посещённая ссылка не меняет цвет
  // под указателем: специфичность у обоих правил одна, решает порядок.
  const visited = ui.indexOf('.gr-link:visited');
  const hover = ui.indexOf('.gr-link:hover');

  assert.ok(visited > 0, 'нет правила .gr-link:visited');
  assert.ok(hover > visited, ':hover объявлен раньше :visited — порядок LVHA нарушен');
});

test('тихая ссылка возвращает подчёркивание по фокусу, а не только по наведению', () => {
  // Наведение живёт в @media (hover: hover) и на сенсорном экране
  // не срабатывает; фокус — единственный признак, доступный с клавиатуры.
  assert.ok(
    ui.includes('.gr-link-quiet:focus-visible{text-decoration-line:underline}'),
    '.gr-link-quiet:focus-visible без подчёркивания',
  );
});

test('линия ссылки объявлена только длинными свойствами', () => {
  // Сокращённое text-decoration сбрасывает text-decoration-thickness
  // в initial. Одно такое объявление в правиле :hover — и подчёркивание
  // у тихой ссылки перестаёт совпадать с обычной: толщина from-font,
  // заданная в базовом классе, теряется.
  // Границы среза — соседи модуля по алфавиту в точке входа: за _link
  // идёт _menu, и захватывать его правила нельзя — там text-decoration: none
  // у пункта меню законно и о толщине линии ничего не говорит.
  const block = ui.slice(ui.indexOf('.gr-link{'), ui.indexOf('.gr-menu{'));

  assert.ok(block.length > 0, 'блок правил ссылки не найден');
  assert.ok(
    !/[^-]text-decoration:/.test(block),
    'в модуле ссылок появилось сокращённое text-decoration',
  );
  assert.ok(
    block.includes('text-decoration-thickness:from-font'),
    'толщина линии не привязана к шрифту',
  );
});

test('стрелка списка нарисована currentcolor, а не зашитым цветом', () => {
  // SVG в data-URI пришлось бы красить литералом: он не следовал бы ни теме,
  // ни состоянию :disabled. Градиенты берут цвет у текста поля.
  const block = ui.slice(ui.indexOf('.gr-select{'), ui.indexOf('.gr-input::placeholder'));

  assert.ok(block.includes('appearance:none'), 'системная стрелка не снята');
  assert.ok(block.includes('currentcolor'), 'стрелка нарисована не currentcolor');
  assert.ok(!block.includes('data:'), 'в стрелку вернулся data-URI');
  assert.ok(
    block.includes('var(--gr-control-padding-x)'),
    'отступ стрелки от края не привязан к токену',
  );
});

test('кнопка-ссылка подчёркнута той же линией, что и ссылка', () => {
  // Сокращённое text-decoration сбрасывает толщину в initial, и подчёркивание
  // .gr-btn-link не совпадало бы с подчёркиванием .gr-link, стоящей рядом.
  const at = ui.indexOf('.gr-btn-link{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(at > 0, 'нет .gr-btn-link');
  assert.ok(rule.includes('text-decoration-thickness:from-font'), 'толщина линии не от шрифта');
  assert.ok(rule.includes('text-decoration-line:underline'), 'линия объявлена не длинным свойством');
  assert.ok(!/[^-]text-decoration:/.test(rule), 'у кнопки-ссылки сокращённое text-decoration');
});

test('у ссылки есть четыре стиля линии', () => {
  for (const style of ['dotted', 'dashed', 'wavy', 'double']) {
    assert.ok(ui.includes(`.gr-link-${style}{text-decoration-style:${style}}`), `нет .gr-link-${style}`);
  }
});

test('режим для слабовидящих перекрывает варианты ссылки', () => {
  // Блок темы приезжает в каждую сборку и попадает в тот же слой, что
  // и компоненты, поэтому правило [data-gr-a11y="low-vision"] a[href]
  // с его специфичностью (0,1,1) выигрывает у .gr-link-quiet и
  // .gr-link-inherit (0,1,0). Ни один вариант не может отменить
  // подчёркивание и цвет ссылки в режиме — проверяем, что правило на месте.
  for (const css of [ui, scoped]) {
    assert.ok(
      /\[data-gr-a11y=["']?low-vision["']?\] a\[href\]\{[^}]*text-decoration:underline/.test(css),
      'правило подчёркивания ссылок в режиме для слабовидящих не приехало в сборку',
    );
  }
});

test('кнопка-ссылка с заливкой защищена от правила ссылок режима', () => {
  // [data-gr-a11y="low-vision"] a[href] (0,1,1) лежит в том же слое, что
  // и компоненты, и кладёт цвет ссылки на любую <a> — в том числе поверх
  // заливки a.gr-btn-primary, а в режиме ссылка и заливка — один и тот же
  // accent-max: 1,0 : 1 (полевой отчёт по 0.23.1, Этап 40). Щит —
  // собственное правило кнопки, позже правила режима по порядку и без
  // селектора по атрибуту режима (см. «компоненты 8b не привязаны
  // к атрибутам темы»). Вариант «как ссылка» из-под щита выведен: ему
  // подчёркивание и цвет ссылки в режиме положены — это ссылка и есть.
  for (const css of [ui, scoped]) {
    const mode = css.search(/\[data-gr-a11y=["']?low-vision["']?\] a\[href\]\{/);
    const shield = css.search(/a\.gr-btn:not\(\.gr-btn-link\)\{[^}]*color:var\(--gr-btn-fg\)[^}]*\}/);

    assert.ok(mode > 0, 'правило ссылок режима не найдено');
    assert.ok(shield > 0, 'щита a.gr-btn нет — цвет ссылки ляжет на заливку кнопки');
    assert.ok(shield > mode, 'щит стоит раньше правила режима — при равной специфичности проиграет');

    const rule = css.slice(shield, css.indexOf('}', shield));

    assert.ok(rule.includes('text-decoration-line:none'), 'щит не снимает с кнопки подчёркивание режима');
    assert.ok(
      !rule.includes('text-decoration:'),
      'сокращённое text-decoration сбросило бы толщину линии соседей — только длинные свойства',
    );
  }
});

// --- Волна 8b: навигация и раскрытие ----------------------------------------

test('поведение раскрытия взято у платформы, а не у скрипта', () => {
  // Каждый из четырёх модулей опирается на элемент, который умеет
  // открываться сам: <details>, <dialog> и попап. Пропадёт селектор
  // состояния — модуль станет требовать JS, а это уже другая библиотека.
  const platform = [
    '.gr-accordion-item[open]',   // <details> — раскрытие и эксклюзивность
    '.gr-nav-toggle[open]',       // <details> — сворачивание шапки
    '.gr-modal[open]',            // <dialog> — showModal()
    '.gr-drawer[open]',           // <dialog> — он же, у края экрана
    ':popover-open',              // Popover API — закрытие по Esc и мимо
  ];

  for (const selector of platform) {
    assert.ok(ui.includes(selector), `нет опоры на платформу: ${selector}`);
  }
});

test('окно и ящик показываются только открытыми', () => {
  // У <dialog> display: none от UA-стиля. Безусловный display: flex
  // на классе показал бы окно прямо в потоке страницы, до вызова
  // showModal(), — и переопределить это в разметке было бы нечем.
  for (const selector of ['.gr-modal', '.gr-drawer']) {
    const at = ui.indexOf(`${selector}{`);
    const rule = ui.slice(at, ui.indexOf('}', at));

    assert.ok(at > 0, `нет правила ${selector}`);
    assert.ok(!/display:/.test(rule), `${selector} задаёт display вне состояния [open]`);
    assert.ok(
      ui.includes(`${selector}[open]{display:flex`),
      `${selector}[open] не переводится в flex — пояса не выстроятся в колонку`,
    );
  }
});

test('подложка окна и ящика взята из токена, а не написана цветом', () => {
  for (const selector of ['.gr-modal::backdrop', '.gr-drawer::backdrop']) {
    const at = ui.indexOf(`${selector}{`);

    assert.ok(at > 0, `нет правила ${selector}`);
    assert.ok(
      ui.slice(at, ui.indexOf('}', at)).includes('var(--gr-overlay)'),
      `${selector} затемняет страницу не токеном --gr-overlay`,
    );
  }
});

test('тело окна прокручивается, а шапка и подвал — нет', () => {
  const body = ui.slice(ui.indexOf('.gr-modal-body{'));
  const rule = body.slice(0, body.indexOf('}') + 1);

  assert.ok(rule.includes('overflow-y:var(--gr-modal-body-overflow, auto)'), 'тело окна не прокручивается');
  assert.ok(rule.includes('flex:1 1 auto'), 'тело окна не забирает остаток высоты');

  for (const belt of ['.gr-modal-header{', '.gr-modal-footer{']) {
    const at = ui.indexOf(belt);

    assert.ok(
      ui.slice(at, ui.indexOf('}', at)).includes('flex:none'),
      `${belt} сжимается вместе с телом`,
    );
  }
});

test('выпадающая панель позиционируется и без CSS anchor positioning', () => {
  // База — абсолютное положение в обёртке: так панель работает везде,
  // включая браузеры без anchor positioning. Привязка к якорю — надстройка
  // внутри @supports, и ни одного правила из неё за пределами блока быть
  // не должно.
  const base = ui.slice(ui.indexOf('.gr-dropdown{'), ui.indexOf('@supports(anchor-name'));

  assert.ok(base.includes('.gr-dropdown{position:relative'), 'обёртка дропдауна не relative');
  assert.ok(base.includes('.gr-dropdown-panel{position:absolute'), 'база панели не absolute');
  assert.ok(!base.includes('position-anchor'), 'привязка к якорю утекла из @supports');

  const supported = ui.slice(ui.indexOf('@supports(anchor-name: --gr-dropdown-anchor)'));

  assert.ok(supported.includes('position-anchor:--gr-dropdown-anchor'), 'нет привязки к якорю');
  assert.ok(supported.includes('position-try-fallbacks'), 'панель не переворачивается у края окна');
  assert.ok(supported.includes('anchor-scope'), 'имя якоря не ограничено обёрткой');
});

test('аккордеон раскрывается и там, где высоту анимировать нечем', () => {
  // Анимация целиком внутри @supports: interpolate-size поддерживает
  // пока не всякий движок, а раздел обязан открываться в любом.
  const at = ui.indexOf('@supports(interpolate-size: allow-keywords) and selector(::details-content)');

  assert.ok(at > 0, 'условие анимации раскрытия не найдено');

  const base = ui.slice(0, at);

  assert.ok(base.includes('.gr-accordion-panel{'), 'нет содержимого раздела вне @supports');
  assert.ok(!base.includes('::details-content'), 'скрытие содержимого утекло из @supports');
  assert.ok(!base.includes('interpolate-size'), 'interpolate-size объявлен вне @supports');
});

test('подсказка показывается с клавиатуры без единой строки скрипта', () => {
  assert.ok(
    ui.includes('.gr-tooltip-anchor:focus-within .gr-tooltip{'),
    'подсказка не появляется по фокусу — с клавиатуры её не увидеть',
  );

  // Скрытая display: none подсказка исчезает из дерева доступности,
  // и связь aria-describedby обрывается: элемент ссылается на то, чего нет.
  const at = ui.indexOf('.gr-tooltip{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(!/display:none/.test(rule), 'подсказка спрятана display: none');
  assert.ok(rule.includes('visibility:hidden'), 'подсказка спрятана не visibility');
  assert.ok(rule.includes('pointer-events:none'), 'подсказка перехватывает указатель');
});

test('панель вкладки прячет разметка, а не библиотека', () => {
  // Атрибут hidden убирает панель и с экрана, и из дерева доступности.
  // Правило .gr-tab-panel{display:none} убрало бы её только с экрана,
  // оставив в порядке обхода и в озвучке.
  const at = ui.indexOf('.gr-tab-panel{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(at > 0, 'нет правила .gr-tab-panel');
  assert.ok(!/display:none/.test(rule), 'панель вкладки скрывается правилом библиотеки');
});

test('активный пункт находится по aria-current, а не по классу', () => {
  // Тот же признак, по которому текущий раздел находит программа чтения
  // с экрана, красит его и на экране. Класс без атрибута подсветил бы
  // пункт только зрячему.
  for (const selector of [
    '.gr-nav-link[aria-current]',
    '.gr-breadcrumb [aria-current=page]',
    '.gr-page[aria-current]',
  ]) {
    assert.ok(ui.includes(selector), `нет подсветки текущего пункта: ${selector}`);
  }

  // У страницы в пагинации признаков два — заливка и вес шрифта:
  // ряд одинаковых цифр по одному оттенку читается плохо.
  const at = ui.indexOf('.gr-page[aria-current]{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('background-color:'), 'текущая страница не залита');
  assert.ok(rule.includes('font-weight:600'), 'текущая страница не выделена весом');
});

test('шапка сворачивается соседним селектором, а не содержимым <details>', () => {
  // Содержимое <details> скрывает сам браузер, и вернуть его на широком
  // экране без скрипта нельзя. Навигация поэтому лежит следующим соседом
  // переключателя, а медиазапрос отменяет сворачивание целиком.
  assert.ok(
    ui.includes('.gr-nav-toggle[open]~.gr-nav-collapse{display:flex}'),
    'меню не раскрывается по открытому переключателю',
  );

  const wide = ui.slice(ui.indexOf('@media(width >= 768px)'));

  assert.ok(wide.includes('.gr-nav-toggle{display:none}'), 'кнопка меню не убирается на широком экране');
  assert.ok(wide.includes('.gr-nav-collapse{display:flex'), 'навигация не возвращается в строку шапки');
});

test('компоненты 8b не привязаны к атрибутам темы', () => {
  // data-gr-theme и data-gr-a11y стоят на <html> — снаружи области .griffin.
  // Правило с таким селектором в scoped-сборке не совпало бы никогда,
  // поэтому тема доходит до компонентов только через токены.
  const components = ui.slice(ui.indexOf('.gr-accordion{'));

  assert.ok(!components.includes('[data-gr-theme'), 'компонент цепляется за атрибут темы');
  assert.ok(!components.includes('[data-gr-a11y'), 'компонент цепляется за атрибут режима');
});

test('движение снимается настройкой уменьшенной анимации', () => {
  // Модалка, ящик, подсказка, дропдаун и стрелка аккордеона двигаются;
  // у каждого должно быть правило под prefers-reduced-motion.
  const reduced = [...ui.matchAll(/@media\(prefers-reduced-motion: reduce\)\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
    .map((m) => m[1])
    .join('');

  for (const selector of [
    '.gr-modal',
    '.gr-drawer',
    '.gr-tooltip',
    '.gr-dropdown-panel',
    '.gr-accordion-trigger',
  ]) {
    assert.ok(reduced.includes(selector), `${selector} не снимает анимацию по настройке`);
  }
});

test('стрелки нарисованы currentcolor, без единой картинки', () => {
  // Тот же приём, что у стрелки .gr-select: два градиента вместо data-URI,
  // поэтому знак следует и теме, и состоянию элемента.
  const at = ui.indexOf('.gr-accordion-trigger::after{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(at > 0, 'нет стрелки у заголовка раздела');
  assert.ok(rule.includes('currentcolor'), 'стрелка раздела нарисована не currentcolor');
  assert.ok(!rule.includes('data:'), 'в стрелку раздела приехал data-URI');
  assert.ok(ui.includes('.gr-accordion-item[open]>.gr-accordion-trigger::after{rotate:180deg}'), 'стрелка не переворачивается');
});

test('у меню есть заголовок группы, разделитель и опасный пункт', () => {
  for (const selector of ['.gr-menu-header{', '.gr-menu-sep{', '.gr-menu-danger{', '.gr-menu-item{']) {
    assert.ok(ui.includes(selector), `нет части меню: ${selector}`);
  }

  // Разделитель ставится на <hr>: собственная граница элемента снимается,
  // линию рисует border-block-start, и её толщина следует токену.
  const at = ui.indexOf('.gr-menu-sep{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('border-block-start:var(--gr-border-width)'), 'линия разделителя не из токена');
});

// --- Волна 8b: разбор артефактов, найденных в браузере -----------------------

test('линия под рядом вкладок нарисована тенью, а не границей', () => {
  // Граница ряда лежит снаружи его содержимого, и чтобы линия активной
  // вкладки её перекрыла, вкладку приходилось подтягивать отрицательным
  // полем. Ряд прокручивается, всё вылезшее за край обрезается — из двух
  // пикселей акцентной линии был виден один.
  const at = ui.indexOf('.gr-tablist{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('box-shadow:inset 0 calc(-1*var(--gr-border-width))'), 'линия ряда не тень');
  assert.ok(!rule.includes('border-block-end:'), 'у ряда вкладок вернулась граница');

  const tabAt = ui.indexOf('.gr-tab{');
  const tab = ui.slice(tabAt, ui.indexOf('}', tabAt));

  assert.ok(!tab.includes('margin-block-end:'), 'вкладку снова подтянули отрицательным полем');
  assert.ok(tab.includes('border-block-end:calc(var(--gr-border-width)*2)'), 'у вкладки нет линии состояния');
});

test('окно и панель считают размеры в процентах, а не в vw', () => {
  // Единица vw включает ширину полосы прокрутки: окно «во всю ширину минус
  // поля» получалось шире видимой области и центрировалось со сдвигом
  // в половину полосы, а панель во всю ширину уезжала правым краем под неё.
  for (const selector of ['.gr-modal{', '.gr-modal-full{', '.gr-drawer{', '.gr-drawer-top,.gr-drawer-bottom{']) {
    const at = ui.indexOf(selector);

    assert.ok(at > 0, `нет правила ${selector}`);
    assert.ok(!/\dvw/.test(ui.slice(at, ui.indexOf('}', at))), `${selector} снова считает размер в vw`);
  }
});

test('верхняя и нижняя панели берут высоту по содержимому', () => {
  // У модального <dialog> UA-стиль ставит inset: 0 и margin: auto. При двух
  // заданных вылетах высота auto перестаёт считаться по содержимому: элемент
  // растягивается, а auto-поле забирает остаток, — панель занимала ровно
  // половину экрана и стояла полупустой.
  const at = ui.indexOf('.gr-drawer-top,.gr-drawer-bottom{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('block-size:auto'), 'высота панели снова задана жёстко');
  assert.ok(ui.includes('.gr-drawer-top{--gr-drawer-slide: -100%;inset-block:0 auto'), 'верхняя панель держится за оба вылета');
  assert.ok(ui.includes('.gr-drawer-bottom{--gr-drawer-slide: 100%;inset-block:auto 0'), 'нижняя панель держится за оба вылета');
});

test('направление выезда панели объявлено раньше сторон', () => {
  // --gr-drawer-slide со значением по умолчанию стояла в блоке анимации,
  // то есть ПОСЛЕ классов сторон и с той же специфичностью: панель начала
  // строки выезжала справа.
  const base = ui.indexOf('.gr-drawer{');
  const start = ui.indexOf('.gr-drawer-start{');

  assert.ok(base > 0 && start > base, 'порядок правил панели изменился');
  assert.ok(
    ui.slice(base, ui.indexOf('}', base)).includes('--gr-drawer-slide: 100%'),
    'у панели нет направления выезда по умолчанию',
  );
  assert.ok(
    ui.indexOf('--gr-drawer-slide: 100%', ui.indexOf('@supports(transition-behavior')) === -1,
    'направление выезда снова переопределяется в блоке анимации',
  );
});

test('обёртки списков не перебивают классы на самом <li>', () => {
  // Правило «.gr-menu > li» (0,1,1) перебивало .gr-menu-header и
  // .gr-menu-sep (0,1,0), поставленные на <li>: заголовок группы терял
  // отступы. :where() держит специфичность нулевой.
  for (const selector of [
    '.gr-menu>:where(li){',
    '.gr-nav>:where(li){',
    '.gr-tablist>:where(li){',
    '.gr-pagination>:where(li){',
  ]) {
    assert.ok(ui.includes(selector), `нет обнуления обёртки списка: ${selector}`);
  }

  assert.ok(!/\.gr-menu>li\{/.test(ui), 'обёртка меню снова со специфичностью класса');
});

test('всплывающие слои берут поверхность своего токена', () => {
  // «Выше страницы» в двух темах означает разное: в светлой это белый лист,
  // в тёмной — серый светлее фона. Одной ступенью surface-raised обе темы
  // не покрываются: в светлой она темнее страницы, и меню выглядело
  // серой плашкой на белом.
  for (const selector of ['.gr-menu{', '.gr-modal{', '.gr-drawer{']) {
    const at = ui.indexOf(selector);

    assert.ok(
      ui.slice(at, ui.indexOf('}', at)).includes('background-color:var(--gr-color-surface-overlay)'),
      `${selector} красится не поверхностью всплывающего слоя`,
    );
  }

  for (const [name, css] of [['ui', ui], ['core', core], ['utils', utils]]) {
    assert.ok(css.includes('--gr-color-surface-overlay:'), `нет токена поверхности в griffincss-${name}.css`);
  }

  // В светлой теме это самый светлый тон шкалы, в тёмной — на две ступени
  // светлее фона; проверяем, что тема переопределяет триплет, а не цвет.
  assert.ok(
    /\[data-gr-theme=dark\][^{]*\{[^}]*--gr-hsl-surface-overlay:/.test(ui),
    'тёмная тема не переопределяет поверхность всплывающего слоя',
  );
});

test('попап дропдауна привязан вылетами, а не областью', () => {
  // При раскладке по position-area поля панели уходят в выравнивание внутри
  // области: заданный отступ от кнопки съедался, панель прилипала вплотную.
  // Вылеты через anchor() считают зазор там же, где обычная панель.
  const at = ui.indexOf('@supports(anchor-name: --gr-dropdown-anchor)');
  const block = ui.slice(at, ui.indexOf('@supports', at + 10));

  assert.ok(at > 0, 'блок привязки к якорю не найден');
  assert.ok(block.includes('inset-block:calc(anchor(end) + var(--gr-ui-gap)*.5) auto'), 'нет зазора под кнопкой');
  assert.ok(block.includes('inset-inline:anchor(start) auto'), 'панель не выровнена по началу кнопки');
  assert.ok(!block.includes('position-area'), 'привязка снова через position-area');

  // margin: 0 обязателен и в базовом правиле: UA-стиль попапа ставит auto,
  // и автополя съедают отступ от кнопки.
  const baseAt = ui.indexOf('.gr-dropdown-panel[popover]{');

  assert.ok(ui.slice(baseAt, ui.indexOf('}', baseAt)).includes('margin:0'), 'у попапа остались автополя');
});

test('строение окна и панели переживает закрытие', () => {
  // Атрибут [open] снимается в первый же кадр close(), а переход по
  // display: allow-discrete держит окно на экране до конца анимации.
  // Всё, что оставлено в правиле [open], пропадает раньше самого окна:
  // объявленное там flex-direction: column превращало окно в строку —
  // пояса вставали в ряд, и окно меняло размеры прямо на исчезновении.
  for (const selector of ['.gr-modal', '.gr-drawer']) {
    const openAt = ui.indexOf(`${selector}[open]{`);
    const openRule = ui.slice(openAt, ui.indexOf('}', openAt));

    assert.ok(openAt > 0, `нет правила ${selector}[open]`);
    assert.equal(
      openRule.replace(`${selector}[open]{`, ''),
      'display:flex',
      `${selector}[open] задаёт не только видимость`,
    );

    const baseAt = ui.indexOf(`${selector}{`);
    const base = ui.slice(baseAt, ui.indexOf('}', baseAt));

    assert.ok(base.includes('flex-direction:column'), `${selector} теряет колонку при закрытии`);

    // position тоже в базовом правиле: модальному <dialog> его даёт UA-стиль
    // (fixed от :modal), но к концу перехода окно уже не модально —
    // containing block меняется на предка, и проценты в размерах
    // пересчитываются от него.
    assert.ok(base.includes('position:fixed'), `${selector} полагается на position от :modal`);
  }
});

test('раскрытие дропдауна по наведению работает и без указателя', () => {
  // Наведение — не единственный вход: на сенсорном экране его нет вовсе,
  // и панель обязана открываться по фокусу, иначе меню недоступно.
  assert.ok(
    /@media\(hover: hover\)\{\.gr-dropdown-hover:hover \.gr-dropdown-panel\{/.test(ui),
    'раскрытие по наведению вне @media (hover: hover) — на тач-экране залипнет',
  );
  assert.ok(
    ui.includes('.gr-dropdown-hover:focus-within .gr-dropdown-panel{'),
    'панель не открывается по фокусу — с клавиатуры и на телефоне меню недоступно',
  );

  // Скрыта visibility, а не display: скрытая через display панель
  // не участвовала бы в переходе и пропадала бы рывком.
  const at = ui.indexOf('.gr-dropdown-hover .gr-dropdown-panel{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('visibility:hidden'), 'панель спрятана не visibility');
  assert.ok(!rule.includes('display:none'), 'панель спрятана display: none');
  assert.ok(rule.includes('transition-delay:.25s'), 'нет задержки на закрытие');

  // Мостик через зазор: без него указатель, идущий от кнопки к меню,
  // пересекает пустое место и наведение прерывается.
  assert.ok(
    ui.includes('.gr-dropdown-hover .gr-dropdown-panel::before{content:""'),
    'нет мостика через зазор между кнопкой и панелью',
  );
});

test('скрытая подсказка не растягивает страницу вбок', () => {
  // visibility убирает подсказку с экрана и из дерева доступности, но место
  // в области прокрутки за ней остаётся: боковая подсказка у правого края
  // узкого экрана давала горизонтальную прокрутку всей страницы.
  const at = ui.indexOf('.gr-tooltip{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('content-visibility:hidden'), 'скрытая подсказка занимает место в раскладке');
  assert.ok(
    rule.includes('content-visibility var(--gr-transition) allow-discrete'),
    'переход по content-visibility не дискретный — появление пойдёт рывком',
  );

  for (const selector of [
    '.gr-tooltip-anchor:focus-within .gr-tooltip{',
    '.gr-tooltip-anchor:hover .gr-tooltip{',
  ]) {
    const showAt = ui.indexOf(selector);

    assert.ok(showAt > 0, `нет правила показа: ${selector}`);
    assert.ok(
      ui.slice(showAt, ui.indexOf('}', showAt)).includes('content-visibility:visible'),
      `${selector} не возвращает подсказку в раскладку`,
    );
  }
});

// --- Волна 8c: обратная связь и состояния ------------------------------------

test('вендорные псевдоэлементы объявлены каждый своим правилом', () => {
  // Неизвестный селектор в группе делает невалидной всю группу: WebKit,
  // встретив ::-moz-progress-bar рядом со своим псевдоэлементом, выбрасывает
  // правило целиком — и полоса не красится ни в одном браузере.
  const vendor = /::?-(webkit|moz)-[\w-]+/;

  for (const selector of parseSelectors(ui)) {
    if (!vendor.test(selector)) continue;

    assert.ok(
      !selector.includes(','),
      `вендорный псевдоэлемент в групповом селекторе: ${selector}`,
    );
  }
});

test('прогресс красит обе половины в обоих движках', () => {
  // Дорожка и заполнение рисуются разными псевдоэлементами, и у каждого
  // движка они свои: пропущенный — это некрашеная системная полоса
  // вместо компонента.
  for (const selector of [
    '.gr-progress::-webkit-progress-bar',
    '.gr-progress::-webkit-progress-value',
    '.gr-progress::-moz-progress-bar',
  ]) {
    assert.ok(ui.includes(`${selector}{`), `нет правила ${selector}`);
  }

  const at = ui.indexOf('.gr-progress{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('appearance:none'), 'системная отрисовка прогресса не снята');
  const valueAt = ui.indexOf('.gr-progress::-webkit-progress-value{');

  assert.ok(
    ui.slice(valueAt, ui.indexOf('}', valueAt)).includes('background-color:var(--gr-progress-fill)'),
    'заполнение красится не переменной статуса',
  );
});

test('у прогресса есть статусы и неопределённое состояние', () => {
  for (const status of ['success', 'warning', 'danger']) {
    assert.ok(ui.includes(`.gr-progress-${status}{`), `нет статуса .gr-progress-${status}`);
  }

  const at = ui.indexOf('.gr-progress-indeterminate{');

  assert.ok(at > 0, 'нет .gr-progress-indeterminate');
  assert.ok(
    ui.slice(at, ui.indexOf('}', at)).includes('animation:gr-progress-slide'),
    'неопределённый прогресс не бежит',
  );
  assert.ok(ui.includes('@keyframes gr-progress-slide{'), 'нет keyframe бегущей полосы');
});

test('шкала берёт цвет у платформы, а не у класса', () => {
  // <meter> сам вычисляет, попало ли значение в оптимальный диапазон,
  // из low/high/optimum. Класс-статус разошёлся бы с этим вычислением.
  for (const selector of [
    '.gr-meter::-webkit-meter-optimum-value',
    '.gr-meter::-webkit-meter-suboptimum-value',
    '.gr-meter::-webkit-meter-even-less-good-value',
    '.gr-meter:-moz-meter-optimum::-moz-meter-bar',
    '.gr-meter:-moz-meter-sub-optimum::-moz-meter-bar',
    '.gr-meter:-moz-meter-sub-sub-optimum::-moz-meter-bar',
  ]) {
    assert.ok(ui.includes(`${selector}{`), `нет правила ${selector}`);
  }

  assert.ok(!/\.gr-meter-(success|warning|danger)\{/.test(ui), 'у шкалы появились классы-статусы');

  // UA-стиль рисует части шкалы градиентом, а он лежит поверх цвета фона:
  // без снятого background-image заданный цвет оказывается под непрозрачной
  // картинкой, и шкала выглядит системной — ровно так это и было видно.
  for (const selector of [
    '.gr-meter::-webkit-meter-bar',
    '.gr-meter::-webkit-meter-optimum-value',
    '.gr-meter::-webkit-meter-suboptimum-value',
    '.gr-meter::-webkit-meter-even-less-good-value',
  ]) {
    const at = ui.indexOf(`${selector}{`);

    assert.ok(
      ui.slice(at, ui.indexOf('}', at)).includes('background-image:none'),
      `${selector} не снимает системный градиент — цвет останется под ним`,
    );
  }
});

test('подсветка наведения не гасит выбранное состояние', () => {
  // У правила с :hover специфичность заведомо выше, чем у правила состояния:
  // серая линия подсветки перекрывала акцентную линию выбранной вкладки,
  // а подложка наведения — подложку текущего пункта навигации. Оба признака
  // выбора обязаны стоять в :not() — специфичность от этого не растёт.
  for (const selector of [
    '.gr-tab:hover',
    '.gr-tabs-pills .gr-tab:hover',
    '.gr-nav-link:hover',
    '.gr-nav-underline .gr-nav-link:hover',
  ]) {
    const rule = parseSelectors(ui).find((s) => s.startsWith(`${selector}:not(`));

    assert.ok(rule, `нет правила подсветки для ${selector}`);
    assert.ok(
      /aria-selected|aria-current/.test(rule),
      `${selector} подсвечивает и выбранный элемент: ${rule}`,
    );
  }
});

test('кольцо спиннера крутит тот же keyframe, что и утилита', () => {
  // Имя одно — gr-spin, — а слои разные: разойдись определения, картинка
  // зависела бы от того, какой из двух файлов подключён.
  const uiFrames = ui.match(/@keyframes gr-spin\{[^}]*\}\}?/);
  const utilsFrames = utils.match(/@keyframes gr-spin\{[^}]*\}\}?/);

  assert.ok(uiFrames, 'в пакете компонентов нет @keyframes gr-spin');
  assert.ok(utilsFrames, 'в утилитах нет @keyframes gr-spin');
  assert.equal(uiFrames[0], utilsFrames[0], 'определения gr-spin разошлись между пакетами');

  const at = ui.indexOf('.gr-spinner{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('animation:gr-spin'), 'спиннер не вращается');
  assert.ok(rule.includes('border-radius:'), 'спиннер не круглый');
  assert.ok(ui.includes('.gr-spinner-sm{') && ui.includes('.gr-spinner-lg{'), 'нет размеров спиннера');
});

test('спиннер по настройке замедляется, а скелет замирает', () => {
  // Остановленный индикатор занятости сообщает «зависло» — ровно обратное
  // тому, зачем он поставлен. Заглушка же сообщает «здесь будет содержимое»
  // самим своим присутствием, и без мерцания это не теряется.
  const reduced = [...ui.matchAll(/@media\(prefers-reduced-motion: reduce\)\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
    .map((m) => m[1])
    .join('');

  const spinner = reduced.slice(reduced.indexOf('.gr-spinner{'));

  assert.ok(reduced.includes('.gr-spinner{'), 'спиннер не откликается на настройку');
  assert.ok(
    /\.gr-spinner\{animation-duration:/.test(spinner),
    'спиннеру не продлена длительность',
  );
  assert.ok(!/\.gr-spinner\{[^}]*animation:none/.test(reduced), 'спиннер остановлен совсем');
  assert.ok(/\.gr-skeleton\{animation:none\}/.test(reduced), 'мерцание заглушки не снимается');
});

test('заглушка красится оттенком, а не готовой поверхностью', () => {
  // Непрозрачный серый совпадёт с одной из подложек, на которых заглушка
  // может лежать, и станет невидимым — как это было с полосами таблицы.
  const at = ui.indexOf('.gr-skeleton{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('hsl(var(--gr-hsl-ink-0), 12%)'), 'заглушка залита готовым цветом');
  assert.ok(ui.includes('@keyframes gr-skeleton-pulse{'), 'нет keyframe мерцания');

  for (const selector of ['.gr-skeleton-text{', '.gr-skeleton-circle{']) {
    assert.ok(ui.includes(selector), `нет разновидности заглушки: ${selector}`);
  }
});

test('коробка заглушки даёт отступы сама', () => {
  // Фигуры, прижатые к краям блока, читаются не как заглушка, а как
  // сломанная вёрстка. Собственный padding у коробки означает, что в карточке
  // она встаёт вместо .gr-card-body — у самой .gr-card отступов нет.
  const at = ui.indexOf('.gr-skeleton-group{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(at > 0, 'нет .gr-skeleton-group');
  assert.ok(rule.includes('padding:var(--gr-gap)'), 'у коробки заглушки нет внутренних отступов');
  assert.ok(rule.includes('gap:var(--gr-ui-gap)'), 'фигуры в коробке слипаются');

  const stackAt = ui.indexOf('.gr-skeleton-stack{');
  const stack = ui.slice(stackAt, ui.indexOf('}', stackAt));

  assert.ok(stackAt > 0, 'нет .gr-skeleton-stack');
  assert.ok(stack.includes('min-inline-size:0'), 'колонка строк не сжимается на узком экране');

  // Шаг в колонке задаёт gap: собственные поля строк удвоили бы его.
  assert.ok(
    ui.includes('.gr-skeleton-stack .gr-skeleton-text{margin-block:0}'),
    'в колонке у строк остались собственные поля',
  );
});

test('регион тостов не закрывает страницу от щелчков', () => {
  // Регион растянут по краю экрана и лежит поверх всего. Не сними он с себя
  // указатель — прозрачная полоса перехватывала бы щелчки по странице.
  const at = ui.indexOf('.gr-toast-region{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(at > 0, 'нет .gr-toast-region');
  assert.ok(rule.includes('position:fixed'), 'регион не закреплён на экране');
  assert.ok(rule.includes('z-index:var(--gr-z-toast)'), 'регион не берёт слой из токена');
  assert.ok(rule.includes('pointer-events:none'), 'регион перехватывает указатель');

  const toastAt = ui.indexOf('.gr-toast{');

  assert.ok(
    ui.slice(toastAt, ui.indexOf('}', toastAt)).includes('pointer-events:auto'),
    'сам тост указатель не принимает — крестик и ссылки в нём мертвы',
  );
});

test('у региона тостов четыре позиции, и нижние копятся снизу вверх', () => {
  for (const corner of ['top-start', 'top-end', 'bottom-start', 'bottom-end']) {
    assert.ok(ui.includes(`.gr-toast-region-${corner}{`), `нет позиции .gr-toast-region-${corner}`);
  }

  // Новый тост вставляется в конец региона. У нижних углов это значит
  // «ближе к краю экрана»: без обратного порядка колонки свежее сообщение
  // уезжало бы вверх, а старое оставалось на виду.
  for (const corner of ['bottom-start', 'bottom-end']) {
    const at = ui.indexOf(`.gr-toast-region-${corner}{`);

    assert.ok(
      ui.slice(at, ui.indexOf('}', at)).includes('flex-direction:column-reverse'),
      `.gr-toast-region-${corner} копит тосты сверху вниз`,
    );
  }
});

test('тост появляется сам, без класса от скрипта', () => {
  // Узел вставлен скриптом и сразу нарисован в конечном виде: переход
  // с @starting-style — единственный способ показать его въезд, не требуя
  // от рантайма второго кадра и class="gr-toast-enter".
  assert.ok(/@starting-style\{[^}]*\.gr-toast\{/.test(ui), 'у тоста нет начального состояния');

  const at = ui.indexOf('.gr-toast{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(rule.includes('transition:'), 'тост появляется рывком');
  assert.ok(ui.includes('.gr-toast-leaving{'), 'нет состояния ухода — тост исчезнет мгновенно');
  assert.ok(ui.includes('.gr-toast-title{'), 'нет .gr-toast-title — слово статуса поставить некуда');

  for (const status of ['info', 'success', 'warning', 'danger']) {
    assert.ok(ui.includes(`.gr-toast-${status}{`), `нет статуса .gr-toast-${status}`);
  }
});

test('шаг находится по aria-current, а линия ведёт от него к следующему', () => {
  assert.ok(ui.includes('.gr-step[aria-current]'), 'текущий шаг ищется не по aria-current');
  assert.ok(ui.includes('.gr-step-done'), 'нет пройденного шага');

  for (const part of ['.gr-step-marker{', '.gr-step-label{', '.gr-step-note{']) {
    assert.ok(ui.includes(part), `нет части шага: ${part}`);
  }

  // Линия — хвост шага, ведущий к следующему: только у него длину считает
  // сам CSS. Хвост, растущий назад, упирался бы в границу своего блока
  // и не доставал бы до соседнего маркера, под которым висит текст
  // неизвестной высоты.
  assert.ok(ui.includes('.gr-step::after{'), 'линия шага не нарисована псевдоэлементом');
  assert.ok(
    /\.gr-steps>:last-child \.gr-step::after,\.gr-steps>\.gr-step:last-child::after\{content:none\}/.test(ui),
    'последний шаг тянет линию в пустоту',
  );
  assert.ok(ui.includes('.gr-steps-vertical{'), 'нет вертикального варианта');

  // В колонке длину хвоста задают оба вылета, а block-size: auto считает её
  // из них: линия дотягивается до следующего маркера при любой высоте
  // подписи. Заданная числом высота отвязала бы её от соседа.
  const at = ui.indexOf('.gr-steps-vertical .gr-step::after{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(at > 0, 'нет правила линии для вертикального ряда');
  assert.ok(
    rule.includes('inset-block:var(--gr-step-marker-size) calc(var(--gr-gap)*-1)'),
    'хвост в колонке не привязан к маркеру и к промежутку сразу',
  );
  assert.ok(rule.includes('block-size:auto'), 'высота хвоста в колонке задана жёстко');

  // Залит хвост только у пройденного: у текущего он ведёт к тому,
  // до чего ещё не дошли.
  const current = ui.indexOf('.gr-step[aria-current]{');

  assert.ok(
    !ui.slice(current, ui.indexOf('}', current)).includes('--gr-step-line'),
    'текущий шаг заливает линию, ведущую вперёд',
  );
});

test('одиночный маркер шага не схлопывается вне .gr-steps', () => {
  // --gr-step-marker-size объявлен на .gr-steps. Маркер, вынесенный
  // из списка — номер в заголовке карточки, счётчик в шапке, — брал
  // необъявленную переменную и схлопывался в ноль (полевой отчёт
  // по 0.23.1, Этап 40). У размера обязано быть запасное значение.
  const at = ui.indexOf('.gr-step-marker{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  assert.ok(at > 0, 'нет правила .gr-step-marker');
  assert.ok(rule.includes('inline-size:var(--gr-step-marker-size, 2rem)'), 'ширина маркера без запасного значения');
  assert.ok(rule.includes('block-size:var(--gr-step-marker-size, 2rem)'), 'высота маркера без запасного значения');
});

test('пустое состояние ограничивает ширину пояснения', () => {
  // Единственный текст на пустом экране, растянутый во всю ширину таблицы,
  // читается плохо: строка уходит за комфортные 60–70 знаков.
  const at = ui.indexOf('.gr-empty-text{');

  assert.ok(at > 0, 'нет .gr-empty-text');
  assert.ok(
    /max-inline-size:\d+ch/.test(ui.slice(at, ui.indexOf('}', at))),
    'ширина пояснения не ограничена по числу знаков',
  );

  for (const part of ['.gr-empty{', '.gr-empty-icon{', '.gr-empty-title{', '.gr-empty-actions{']) {
    assert.ok(ui.includes(part), `нет части пустого состояния: ${part}`);
  }
});

test('keyframes волны 8c объявлены вне области видимости', () => {
  // Имя анимации ищется глобально, префикс области к нему неприменим:
  // объявления обязаны стоять до первого правила области, иначе полоса,
  // кольцо и мерцание замрут в scoped-сборке.
  const scopeAt = scoped.indexOf(':where(.griffin)');

  assert.ok(scopeAt > 0, 'в сборке нет ни одного правила области .griffin');

  for (const name of ['gr-spin', 'gr-progress-slide', 'gr-skeleton-pulse']) {
    const at = scoped.indexOf(`@keyframes ${name}{`);

    assert.ok(at > 0, `нет @keyframes ${name} в scoped-сборке`);
    assert.ok(at < scopeAt, `@keyframes ${name} объявлен внутри области`);
  }
});

test('компоненты не хардкодят таблеточный радиус', () => {
  // 999px — «половина высоты», токеном --gr-radius такое не выражается,
  // а выпрямлять бейдж строгому стилю оси надо. Отсюда отдельная ручка.
  assert.ok(
    !/border-radius:\s*999px/.test(ui),
    'остался хардкод 999px — строгий стиль не сможет убрать таблетки',
  );
  assert.match(ui, /border-radius:\s*var\(--gr-radius-pill\)/);
});

// --- Структурные правила оси оформления --------------------------------------
//
// Здесь компилируется SCSS, а не читается артефакт: проверяется, как состав
// правил зависит от конфигурации $gr-styles, а собранный файл несёт ровно
// одну её версию.

const sass = require('node:module').createRequire(__filename)('sass');

function compileUi(source) {
  return sass.compileString(source, {
    loadPaths: [path.join(__dirname, '..', 'scss'), path.join(ROOT, 'node_modules')],
    style: 'expanded',
  }).css;
}

test('структурные правила стилей собираются по списку', () => {
  const all = compileUi("@use 'griffincss-ui';");

  assert.match(all, /\[data-gr-style=strict\] \.gr-card-header/);
  assert.match(all, /\[data-gr-style=compact\] \.gr-table/);
  assert.match(all, /\[data-gr-style=airy\] \.gr-card/);
});

test('незаказанный стиль не оставляет ни одного правила', () => {
  const only = compileUi(
    "@use 'griffincss-core/scss/style-config' with ($gr-styles: (strict));@use 'griffincss-ui';",
  );

  assert.match(only, /\[data-gr-style=strict\]/);
  assert.ok(!/\[data-gr-style=airy\]/.test(only), 'правила незаказанного стиля в сборке');
  assert.ok(!/\[data-gr-style=compact\]/.test(only), 'правила незаказанного стиля в сборке');
});

test('пустой список выключает структурные правила целиком', () => {
  const none = compileUi(
    "@use 'griffincss-core/scss/style-config' with ($gr-styles: ());@use 'griffincss-ui';",
  );

  assert.ok(!/\[data-gr-style=/.test(none), 'ось выключена, но правила остались');
});

test('scoped-сборка не получает ни одного правила оси', () => {
  // Селектор в scoped-сборке получает префикс :where(.griffin) и требует
  // носитель атрибута в области, а data-gr-style стоит на <html>. Правило
  // собралось бы, прошло бы все прочие проверки и молча не работало — то же
  // основание, по которому в модулях ui запрещены селекторы по data-gr-theme.
  assert.ok(
    !/\[data-gr-style/.test(scoped),
    'правило оси внутри области .griffin никогда не сработает',
  );
});

test('у каждого статуса своя пара «заливка + чернила»', () => {
  // Общий токен чернил на все статусы уже ломался: стоило оси оформления
  // перекрасить акцент под свою пастель, как чернила акцента уезжали
  // на зелёную и красную кнопки. Пара у каждого статуса — условие того,
  // что стиль может осветлить заливку, не спрашивая у соседей.
  for (const status of ['success', 'warning', 'danger', 'info']) {
    const rule = ui.match(new RegExp(`\\.gr-btn-${status}\\{[^}]*\\}`));

    assert.ok(rule, `нет правила .gr-btn-${status}`);
    assert.ok(
      rule[0].includes(`var(--gr-color-${status}-surface)`),
      `.gr-btn-${status} берёт заливку не из своего токена: ${rule[0]}`,
    );
    assert.ok(
      rule[0].includes(`var(--gr-color-on-${status})`),
      `.gr-btn-${status} берёт чернила из чужого токена: ${rule[0]}`,
    );
  }

  assert.ok(
    !/\.gr-btn-(success|danger|info)\{[^}]*--gr-btn-fg:\s*var\(--gr-color-on-accent\)/.test(ui),
    'статусная кнопка снова взяла чернила акцента',
  );
});

test('стрелка списка рисуется одним слоем, а не двумя половинами', () => {
  // .gr-select встречается в артефакте дважды: в общем блоке полей ввода
  // и в собственном, где рисуется стрелка. Нужен второй.
  const rule = [...ui.matchAll(/\.gr-select\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((r) => r.includes('background-image'));

  assert.equal(rule.length, 1, `правил со стрелкой найдено ${rule.length}`);

  // Две половины, стыкующиеся встык, округляются при растеризации
  // независимо друг от друга: на дробных координатах шов расходится
  // на полпикселя, и стрелка выглядит сломанной. У одной фигуры шва нет.
  const layers = (rule[0].match(/gradient\(/g) || []).length;

  assert.equal(layers, 1, `стрелка снова собрана из ${layers} слоёв: ${rule[0]}`);
  assert.match(rule[0], /conic-gradient/);
  assert.ok(
    !/linear-gradient/.test(rule[0]),
    'вернулись линейные половины — на дробных координатах их шов расходится',
  );

  // Цвет обязан остаться currentcolor: с ним стрелка следует теме
  // и состоянию :disabled, а зашитый цвет не следовал бы ни тому, ни другому.
  assert.match(rule[0], /currentcolor/);
});

// --- Этап 25: формы витрины --------------------------------------------------

test('принятое поле отмечается атрибутом, а не псевдоклассом', () => {
  // Ошибку и успех ставит одна и та же серверная проверка, поэтому и признак
  // у них парный: [aria-invalid="false"] рядом с [aria-invalid="true"].
  // :user-valid здесь не годится вовсе: браузер считает валидным любое
  // непустое поле без ограничений, и форма зеленела бы сама собой
  // по мере заполнения — превращаясь в светофор.
  for (const selector of [
    '.gr-input[aria-invalid=false]',
    '.gr-textarea[aria-invalid=false]',
    '.gr-select[aria-invalid=false]',
  ]) {
    assert.ok(ui.includes(selector), `нет правила успеха для ${selector}`);
  }

  const at = ui.indexOf('.gr-input[aria-invalid=false]');

  assert.ok(
    ui.slice(at, ui.indexOf('}', at)).includes('border-color:var(--gr-color-success)'),
    'принятое поле красится не цветом успеха',
  );
  assert.ok(!ui.includes(':user-valid'), ':user-valid вернулся — форма зеленеет сама собой');
});

test('подпись успеха — тот же приём, что и подпись ошибки', () => {
  // Цвет не единственный признак ни там, ни там: рядом с полем стоит текст,
  // который переживает и печать, и дальтонизм. Разойтись двум подписям
  // в кегле нельзя — они стоят в одном и том же месте формы.
  const ruleOf = (selector) => {
    const at = ui.indexOf(selector);

    assert.ok(at > 0, `нет правила ${selector}`);

    return ui.slice(at, ui.indexOf('}', at));
  };

  const error = ruleOf('.gr-error{');
  const success = ruleOf('.gr-success{');

  assert.ok(success.includes('color:var(--gr-color-success)'), 'подпись успеха берёт не тот токен');
  assert.equal(
    success.match(/font-size:([^;}]+)/)[1],
    error.match(/font-size:([^;}]+)/)[1],
    'кегль подписи успеха разошёлся с подписью ошибки',
  );
});

test('обязательность поля видна без единого класса в разметке', () => {
  // Обязательность объявляет атрибут required — платформа делает это сама.
  // Звёздочке остаётся показать её глазами, и раз атрибут уже стоит,
  // требовать ещё и класс значило бы держать два источника правды.
  assert.ok(
    ui.includes('.gr-field:has([required]) .gr-label::after'),
    'нет автоматической звёздочки .gr-field:has([required]) .gr-label::after',
  );
  assert.ok(
    ui.includes('.gr-required::after'),
    'нет ручной .gr-required — группе флажков автоматика не поможет',
  );

  const at = ui.indexOf('.gr-required::after');

  assert.ok(
    ui.slice(at, ui.indexOf('}', at)).includes('var(--gr-color-danger)'),
    'звёздочка обязательности красится не цветом статуса',
  );
});

test('ползунок красит дорожку и бегунок в обоих движках', () => {
  // У каждого движка свои псевдоэлементы, и пропущенный — это системный
  // ползунок вместо компонента. Группировать их нельзя: неизвестный селектор
  // в группе выбрасывает правило целиком (см. тест о вендорных
  // псевдоэлементах выше).
  for (const selector of [
    '.gr-range::-webkit-slider-runnable-track',
    '.gr-range::-webkit-slider-thumb',
    '.gr-range::-moz-range-track',
    '.gr-range::-moz-range-thumb',
    '.gr-range::-moz-range-progress',
  ]) {
    assert.ok(ui.includes(`${selector}{`), `нет правила ${selector}`);
    assert.ok(scoped.includes(`${selector}{`), `нет правила ${selector} в scoped-сборке`);
  }

  const at = ui.indexOf('.gr-range{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  // accent-color остаётся под псевдоэлементами: он один даёт правильный вид
  // там, где appearance: none ещё не применён.
  assert.ok(rule.includes('accent-color:var(--gr-color-accent)'), 'ползунок не берёт акцент платформы');
  assert.ok(!/block-size:\s*[\d.]/.test(rule), 'высота ползунка задана числом, а не ручкой');
});

test('размеры ползунка заданы ручками в rem, а не пикселями', () => {
  // Режим для слабовидящих поднимает кегль корня: пиксельная дорожка
  // осталась бы прежней, а поле рядом с ней выросло.
  const at = ui.indexOf('.gr-range{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  for (const knob of ['--gr-range-track', '--gr-range-thumb']) {
    const value = rule.match(new RegExp(`${knob}:([^;}]+)`));

    assert.ok(value, `нет ручки ${knob}`);
    assert.match(value[1], /rem/, `${knob} задана не в rem: ${value[1]}`);
  }

  const thumbAt = ui.indexOf('.gr-range::-webkit-slider-thumb{');

  assert.ok(
    ui.slice(thumbAt, ui.indexOf('}', thumbAt)).includes('var(--gr-range-thumb)'),
    'бегунок вебкита взял размер числом, а не ручкой',
  );
});

test('закраска ползунка приходит долей, а не значением элемента', () => {
  // У WebKit псевдоэлемента заполненной части нет вовсе: след рисует
  // градиент по --gr-progress, который пишет виджет слоя. У Firefox
  // заполнение своё и работает без скрипта — поэтому градиента там нет.
  const at = ui.indexOf('.gr-range{');
  const base = ui.slice(at, ui.indexOf('}', at));

  assert.match(base, /--gr-range-fill:\s*calc\(var\(--gr-progress, 0\)\s*\*\s*100%\)/);

  const trackAt = ui.indexOf('.gr-range::-webkit-slider-runnable-track{');
  const track = ui.slice(trackAt, ui.indexOf('}', trackAt));

  assert.ok(track.includes('var(--gr-range-fill)'), 'дорожка вебкита не красится долей');
  assert.ok(track.includes('var(--gr-color-accent)'), 'след нарисован не акцентом');
  assert.ok(ui.includes('.gr-range::-moz-range-progress{'), 'у Firefox отняли родное заполнение');

  // Направление — ручкой, а не парой правил на каждый градиент: иначе
  // правила пары перебили бы разворот в RTL своей специфичностью.
  assert.ok(base.includes('--gr-range-dir: to right'), 'направление заливки не вынесено в ручку');

  const rtl = ui.match(/\.gr-range:dir\(rtl\)[^{]*\{[^}]*\}/);

  assert.ok(rtl, 'нет разворота заливки в RTL');
  assert.ok(rtl[0].includes('--gr-range-dir: to left'), 'разворот в RTL меняет не ручку направления');
  assert.ok(rtl[0].includes('.gr-range-pair:dir(rtl)'), 'пара в RTL осталась неразвёрнутой');
  const gradients = [...ui.matchAll(/\.gr-range[^{}]*\{[^{}]*\}/g)]
    .map((m) => m[0])
    .filter((rule) => /linear-gradient\(to (right|left)/.test(rule));

  assert.deepEqual(gradients, [], 'градиент дорожки снова написан стороной, а не ручкой');
});

test('пара «от — до»: дорожка и отрезок — на обёртке, а не наложением', () => {
  // Наложением отрезок не собрать: дорожка полупрозрачна намеренно —
  // оттенок ложится на любую подложку, — и верхняя дорожка не закрыла бы
  // акцент нижней, а лишь притенила бы его.
  const ruleOf = (selector) => {
    const at = ui.indexOf(selector);

    assert.ok(at > 0, `нет правила ${selector}`);

    return ui.slice(at, ui.indexOf('}', at));
  };

  assert.ok(ruleOf('.gr-range-pair{').includes('display:grid'), 'ползунки пары не лежат в одной ячейке');

  const rail = ruleOf('.gr-range-pair::before{');

  assert.ok(rail.includes('block-size:var(--gr-range-track)'), 'общая дорожка не берёт толщину из ручки');
  assert.ok(rail.includes('hsl(var(--gr-hsl-ink-0), 12%)'), 'общая дорожка написана готовым цветом');
  assert.ok(
    rail.includes('var(--gr-range-from, 0)') && rail.includes('var(--gr-range-to, 0)'),
    'отрезок рисуется не по обеим границам',
  );
  assert.ok(rail.includes('var(--gr-color-accent)'), 'отрезок между ручками нарисован не акцентом');

  // Дорожки самих ползунков в паре не рисуют ничего — включая родное
  // заполнение Firefox: оно красило бы путь от начала шкалы.
  for (const part of ['::-webkit-slider-runnable-track', '::-moz-range-track', '::-moz-range-progress']) {
    assert.ok(
      ruleOf(`.gr-range-pair>.gr-range${part}{`).includes('background:none'),
      `дорожка ${part} в паре продолжает рисовать себя`,
    );
  }

  // Дорожка обёртки лежит под ползунками: без сквозных событий до ручек
  // не добраться, а с ними верхний ползунок забрал бы себе всю дорожку.
  assert.ok(ruleOf('.gr-range-pair>.gr-range{').includes('pointer-events:none'), 'события не отданы ручкам');

  for (const thumb of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
    assert.ok(
      ruleOf(`.gr-range-pair>.gr-range${thumb}{`).includes('pointer-events:auto'),
      `ручка ${thumb} не ловит указатель`,
    );
  }
});

// --- Этап 26: рейтинг --------------------------------------------------------

// Правила модуля одним куском: от якорного класса до конца его последнего
// правила. Резать по соседу в точке входа здесь нельзя — за _rating идёт
// _skeleton, но между ними может встать блок @media, и срез по чужому классу
// захватил бы его целиком.
function ratingRules(css) {
  const at = css.indexOf('.gr-rating{');

  assert.ok(at > 0, 'нет правила .gr-rating');

  const rules = [...css.slice(at).matchAll(/\.gr-rating[^{}]*\{[^{}]*\}/g)].map((m) => m[0]);

  assert.ok(rules.length >= 3, `правил рейтинга найдено ${rules.length}`);

  return rules.join('');
}

test('рейтинг рисуется знаком из переменной, а не иконкой', () => {
  // Иконочного набора у библиотеки нет и не будет — это записано в «чего
  // здесь не будет». Знак приходит переменной, и потребитель подставляет
  // глиф своего набора одной строкой на весь сайт.
  // Символ записан CSS-экранированием: литеральная звезда сделала бы
  // собранный файл не-ASCII, Sass приписал бы к нему BOM, и объявление
  // порядка слоёв перестало бы быть первой строкой (проверка 4 в check-dist).
  for (const [name, css] of [['ui', ui], ['core', core], ['utils', utils], ['scoped', scoped]]) {
    assert.ok(!/★/.test(css), `литеральная звезда в griffincss-${name}: Sass припишет к файлу BOM`);
  }

  assert.match(ui, /--gr-rating-symbol:\s*"\\2605"/, 'знак записан не CSS-экранированием');

  for (const [name, css] of [['ui', ui], ['core', core], ['utils', utils]]) {
    assert.ok(css.includes('--gr-rating-symbol:'), `нет токена знака в griffincss-${name}.css`);
    assert.ok(css.includes('--gr-color-rating:'), `нет токена цвета оценки в griffincss-${name}.css`);
  }

  const rules = ratingRules(ui);

  assert.ok(rules.includes('var(--gr-rating-symbol)'), 'знак подставлен не переменной');
  assert.ok(!rules.includes('url('), 'в рейтинг приехала картинка');
  assert.ok(!/2605/.test(rules), 'знак зашит в правило модуля мимо переменной');
});

test('рейтинг заливается долей значения, а не классом на каждую звезду', () => {
  // Дробная оценка — обычное дело: 4,5 из 5 обязаны рисоваться половиной
  // знака, а не округляться до класса. Классы .gr-rating-1…5 округляли бы.
  const rules = ratingRules(ui);

  assert.match(
    rules,
    /--gr-rating-fill:\s*calc\(var\(--gr-rating, 0\)\s*\/\s*5\s*\*\s*100%\)/,
    'доля заливки считается не из --gr-rating',
  );
  assert.ok(rules.includes('inline-size:var(--gr-rating-fill)'), 'залитый ряд не обрезан по доле');
  assert.ok(rules.includes('overflow:hidden'), 'залитый ряд ничем не обрезан');

  for (const step of [1, 2, 3, 4, 5]) {
    assert.ok(!ui.includes(`.gr-rating-${step}{`), `появился класс-ступень .gr-rating-${step}`);
  }
});

test('знаки рейтинга стоят без разрядки — иначе доля перестаёт быть линейной', () => {
  // Интервал между знаками сдвигает границу заливки на целое число
  // интервалов, и половина пятого знака перестаёт приходиться на 90 %
  // ширины: заливка уезжает тем сильнее, чем крупнее оценка.
  const rules = ratingRules(ui);

  assert.ok(!/letter-spacing/.test(rules), 'у рейтинга появилась разрядка');
  assert.ok(!/word-spacing/.test(rules), 'у рейтинга появился межсловный интервал');
});

test('заливка рейтинга начинается с начала строки, а не слева', () => {
  // Логический край разворачивается под dir="rtl" сам: правило на [dir]
  // модулю не нужно ни одного.
  const rules = ratingRules(ui);

  assert.ok(rules.includes('inset-inline-start:'), 'залитый ряд прижат не к логическому краю');
  assert.ok(!/[^-]left:/.test(rules), 'в рейтинге появился физический край');
  assert.ok(!/\[dir/.test(rules), 'рейтинг разворачивается правилом на [dir]');
});

test('цвета рейтинга — токен заливки и оттенок текста', () => {
  // Пустой знак приглушён прозрачностью самого ряда, а не готовым серым:
  // непрозрачный совпал бы с одной из подложек, на которых карточка товара
  // может лежать. Прозрачность на ::before, поэтому currentcolor остаётся
  // настоящим и перекрашенный рейтинг приглушает свой цвет.
  const rules = ratingRules(ui);

  assert.ok(rules.includes('color:var(--gr-rating-color, var(--gr-color-rating))'), 'залитый знак красится не токеном');
  assert.ok(
    /\.gr-rating::before\{[^}]*opacity:\.3/.test(rules),
    'пустой знак написан готовым цветом, а не приглушённым currentcolor',
  );
  assert.ok(
    /--gr-color-rating:\s*hsl\(var\(--gr-hsl-status-warning-surface\)\)/.test(ui),
    'токен оценки выведен не из поверхностного цвета предупреждения',
  );
});

test('поле счётчика умеет остаться без системных стрелок', () => {
  // Рядом с парой кнопок «минус — плюс» системные стрелки — второй орган
  // управления тем же числом, и стоят они вплотную к «плюсу». Убрать их
  // утилитами нельзя: это вендорные псевдоэлементы, поэтому у поля есть
  // класс — единственный способ дотянуться до них из разметки.
  assert.ok(ui.includes('.gr-input-no-spin{'), 'нет класса .gr-input-no-spin');

  const at = ui.indexOf('.gr-input-no-spin{');
  const rule = ui.slice(at, ui.indexOf('}', at));

  // Firefox стрелки прячет только так; WebKit и Blink — через свои
  // псевдоэлементы ниже.
  assert.ok(rule.includes('appearance:textfield'), 'у Firefox стрелки остались');

  for (const pseudo of ['::-webkit-outer-spin-button', '::-webkit-inner-spin-button']) {
    const selector = `.gr-input-no-spin${pseudo}{`;

    assert.ok(ui.includes(selector), `нет правила ${selector}`);
    assert.ok(scoped.includes(selector), `нет правила ${selector} в scoped-сборке`);

    const from = ui.indexOf(selector);

    assert.ok(
      ui.slice(from, ui.indexOf('}', from)).includes('appearance:none'),
      `${pseudo} не снят`,
    );
  }

  // Каждый псевдоэлемент — своим правилом, как у ползунка и полосы:
  // неизвестный селектор в группе выбрасывает её целиком.
  assert.ok(
    !/\.gr-input-no-spin::-webkit-outer-spin-button,/.test(ui),
    'вендорные псевдоэлементы снова собраны в группу',
  );

  // Стрелки прячутся только по классу: у обычного числового поля они
  // остаются единственным способом шагнуть мышью.
  assert.ok(
    !/\.gr-input::-webkit-(inner|outer)-spin-button/.test(ui),
    'стрелки сняты у всех числовых полей сразу',
  );
});

// --- Этап 45: края групп по видимым полям, состояния и модификаторы ----------

// Селектор видимого потомка группы: скрытое поле формы, узел с hidden,
// <template>, <script> и <datalist> края не считают. Так его сжимает Sass.
const VISIBLE = ':not([type=hidden],[hidden],template,script,datalist)';

test('края группы с аддонами считаются по видимым полям, прежние правила остаются запасным путём', () => {
  // Фидбек темы griffin (0.25.0, п. 1): полное значение составного поля
  // лежит в <input type="hidden"> последним ребёнком группы, а панель
  // живого поиска дописывается скриптом внутрь неё. По :last-child
  // скругление доставалось скрытому узлу, и видимый край группы
  // оставался прямым. Новые правила стоят ПОВЕРХ прежних, а не вместо:
  // в Chrome 99–110 и Firefox 97–112 форма `of S` неизвестна, правило
  // отбрасывается, и группа выглядит как раньше — мягкая деградация.
  const first = `.gr-input-group>:nth-child(1 of ${VISIBLE}){`;
  const last = `.gr-input-group>:nth-last-child(1 of ${VISIBLE}){`;

  for (const [selector, edge] of [[first, 'start'], [last, 'end']]) {
    const at = ui.indexOf(selector);

    assert.ok(at > 0, `нет правила ${selector}`);

    const rule = ui.slice(at, ui.indexOf('}', at));

    assert.ok(rule.includes(`border-start-${edge}-radius:var(--gr-radius)`), `у первого/последнего видимого нет скругления ${edge}`);
    assert.ok(rule.includes(`border-end-${edge}-radius:var(--gr-radius)`), `у первого/последнего видимого нет скругления ${edge}`);
    assert.ok(scoped.includes(selector), `нет правила ${selector} в scoped-сборке`);
  }

  // Первое видимое поле после скрытого не сдвигается на рамку: прежнее
  // `* + *` его задевает, и один сдвиг здесь обязан обнулиться.
  const at = ui.indexOf(first);

  assert.ok(ui.slice(at, ui.indexOf('}', at)).includes('margin-inline-start:0'), 'первое видимое поле после скрытого сдвинуто на рамку');

  // Запасной путь на месте.
  assert.ok(ui.includes('.gr-input-group>:first-child{'), 'прежнее правило :first-child снято — старые браузеры остались без скругления');
  assert.ok(ui.includes('.gr-input-group>:last-child{'), 'прежнее правило :last-child снято');
  assert.ok(ui.includes('.gr-input-group>*+*{'), 'прежний сдвиг на рамку снят');

  // Новые правила стоят позже прежних и потому побеждают при равенстве.
  assert.ok(ui.indexOf(first) > ui.indexOf('.gr-input-group>:first-child{'), 'правило по видимым стоит раньше запасного');
  assert.ok(ui.indexOf(last) > ui.indexOf('.gr-input-group>:last-child{'), 'правило по видимым стоит раньше запасного');
});

test('края сегментного переключателя считаются по ярлыкам, а не по любым потомкам', () => {
  // Фидбек, п. 2: <legend class="gr-sr-only"> — штатное имя <fieldset>,
  // и как первый потомок он отнимал у первого сегмента скругление
  // и левую рамку. Края — по label:first-of-type / label:last-of-type,
  // внутренняя рамка — только у сегмента, перед которым стоит другой.
  for (const edge of ['first', 'last']) {
    const selector = `.gr-segmented label:${edge}-of-type span{`;
    const from = ui.indexOf(selector);

    assert.ok(from > 0, `нет правила для ${edge}-of-type`);
    assert.ok(ui.slice(from, ui.indexOf('}', from)).includes('var(--gr-segmented-radius)'), `крайний сегмент ${edge}-of-type не скруглён`);
    assert.ok(!ui.includes(`.gr-segmented label:${edge}-child span{`), `край по-прежнему считается по ${edge}-child`);
  }

  const inner = ui.indexOf('.gr-segmented label~label span{');

  assert.ok(inner > 0, 'внутренняя рамка сегментов не привязана к соседству ярлыков');
  assert.ok(ui.slice(inner, ui.indexOf('}', inner)).includes('border-inline-start:var(--gr-border-width) solid'), 'внутренняя рамка не там');

  const all = ui.indexOf('.gr-segmented span{');

  assert.ok(!ui.slice(all, ui.indexOf('}', all)).includes('border-inline-start'), 'рамка стоит на каждом сегменте, и первому её приходится снимать');
});

test('у строки выбора два модификатора: по первой строке и строка с тумблером', () => {
  // Фидбек, п. 6: согласие в три строки и строка настроек «подпись —
  // тумблер». Композицией не собрать: утилиты флекса лежат в core
  // и проигрывают align-items и display компонента в ui при любой
  // специфичности, а .gr-w-full живёт в utils — пакет компонентов
  // обязан собираться и без него.
  const start = ui.indexOf('.gr-choice-start{');

  assert.ok(start > 0, 'нет .gr-choice-start');
  assert.ok(ui.slice(start, ui.indexOf('}', start)).includes('align-items:flex-start'), 'контрол не по первой строке');

  // Контрол сдвинут к середине первой строки: у строки 1,4em высоты
  // квадратик 1,15em стоял бы по верху.
  const shift = ui.indexOf('.gr-choice-start>input{');

  assert.ok(shift > 0, 'контрол в .gr-choice-start не сдвинут к первой строке');
  assert.ok(ui.slice(shift, ui.indexOf('}', shift)).includes('margin-block-start:.15em'), 'сдвиг контрола не тот');

  const row = ui.indexOf('.gr-choice-row{');

  assert.ok(row > 0, 'нет .gr-choice-row');

  const rule = ui.slice(row, ui.indexOf('}', row));

  assert.ok(rule.includes('display:flex'), 'строка с тумблером не блочный флекс');
  assert.ok(rule.includes('justify-content:space-between'), 'подпись и тумблер не разведены по краям');

  for (const name of ['.gr-choice-start', '.gr-choice-row']) {
    assert.ok(scoped.includes(`${name}{`), `нет ${name} в scoped-сборке`);
    assert.ok(!utils.includes(`${name}{`) && !core.includes(`${name}{`), `${name} утёк в чужой пакет`);
  }
});

test('состояние ошибки на обёртке поля красит вложенные контролы', () => {
  // Фидбек, п. 7: серверная проверка получает список полей и ставит
  // состояние на обёртку — так работает OpenCart (.form-group.has-error)
  // и большинство валидаторов. aria-invalid на контроле остаётся
  // источником для программы чтения с экрана; виджет validate ставит оба.
  for (const control of ['.gr-input', '.gr-textarea', '.gr-select', '.gr-file']) {
    const selector = `.gr-field[data-gr-state=error] ${control}`;
    const at = ui.indexOf(selector);

    assert.ok(at > 0, `нет правила ${selector}`);
    assert.ok(ui.slice(at, ui.indexOf('}', at)).includes('border-color:var(--gr-color-danger)'), `${control} в поле с ошибкой красится не цветом статуса`);
  }
});

test('цвет оценки — семантический токен темы, а не переменная компонента', () => {
  // Фидбек, п. 9: рядом со звёздами всё «предупреждающее» — полосы
  // распределения, значок у подписи, ввод оценки — выходило коричневым:
  // текстовый --gr-color-warning затемнён ради контраста. Токен
  // --gr-color-rating объявлен в теме на каждом носителе, и его читают
  // и ряд знаков, и всё, что изображает оценку. --gr-rating-color
  // остаётся переопределением на элементе, но в :root больше не стоит:
  // объявленный там, он резолвился бы один раз и не следовал бы теме
  // вложенной секции.
  for (const [name, css] of [['ui', ui], ['core', core], ['utils', utils]]) {
    assert.ok(/:root,\[data-gr-theme\],\[data-gr-a11y\]\{[^}]*--gr-color-rating:\s*hsl\(var\(--gr-hsl-status-warning-surface\)\)/.test(css), `нет --gr-color-rating на носителях темы в griffincss-${name}.css`);
    assert.ok(!/--gr-rating-color:/.test(css), `--gr-rating-color по-прежнему объявлен в griffincss-${name}.css`);
  }

  const rules = ratingRules(ui);

  assert.ok(rules.includes('color:var(--gr-rating-color, var(--gr-color-rating))'), 'ряд знаков читает не семантический токен');
});

test('пустое окно — плашка, а не полоска; состояние загрузки рисует кольцо', () => {
  // Фидбек, п. 3: окно открывается сразу, а содержимое приходит ajax'ом;
  // до ответа <dialog> пуст и рисуется полоской высотой в рамку. Минимальная
  // высота и состояние loading — здесь; плавный рост высоты — в слое (48d).
  const at = ui.indexOf('.gr-modal{');

  assert.ok(ui.slice(at, ui.indexOf('}', at)).includes('min-block-size:10rem'), 'у пустого окна нет минимальной высоты');

  const loading = ui.indexOf('.gr-modal[data-gr-state=loading]::before{');

  assert.ok(loading > 0, 'нет состояния загрузки');

  const rule = ui.slice(loading, ui.indexOf('}', loading));

  assert.ok(rule.includes('animation:gr-spin'), 'кольцо не крутится тем же keyframe, что .gr-spinner');
  assert.ok(rule.includes('border-block-start-color:var(--gr-color-accent)'), 'у кольца нет акцентной дуги');
  assert.ok(rule.includes('margin:auto'), 'кольцо не по центру окна');
  assert.ok(scoped.includes('.gr-modal[data-gr-state=loading]::before{'), 'нет состояния загрузки в scoped-сборке');

  // Вращение при уменьшенной анимации замедляется, но не снимается —
  // как у .gr-spinner: остановленное кольцо сообщает «зависло».
  assert.match(ui, /prefers-reduced-motion: reduce\)\{[^@]*\.gr-modal\[data-gr-state=loading\]::before\{animation-duration:2\.4s\}/, 'кольцо загрузки не замедлено при уменьшенной анимации');
});

// --- Этап 46: токены компонентов по списку темы, радиус контейнера ------------

// Правило по селектору целиком — от преамбулы до закрывающей скобки.
function ruleOf(css, selector) {
  const at = css.indexOf(selector);

  assert.ok(at >= 0, `нет правила ${selector}`);

  return css.slice(at, css.indexOf('}', at));
}

test('токены компонентов читаются с запасным значением и нигде не объявляются', () => {
  // Фидбек темы griffin (0.25.0, пп. 4 и 12): правило темы на структурном
  // ребёнке проигрывает слою ui всегда, и тема держала свои классы. Токен
  // читается через var(--gr-<name>-*, <прежний литерал>) и НЕ объявляется
  // на компоненте: объявленный на нём, он перебивал бы переопределение
  // на обёртке — а ради него всё и затевалось. Значения по умолчанию равны
  // прежним литералам, вид не меняется.
  const reads = [
    ['.gr-card{', 'background-color:var(--gr-card-bg, var(--gr-color-surface))'],
    ['.gr-card{', 'border:var(--gr-border-width) solid var(--gr-card-border, var(--gr-color-border))'],
    ['.gr-card{', 'border-radius:var(--gr-card-radius, var(--gr-radius-container, var(--gr-radius)))'],
    ['.gr-card-body{', 'padding:var(--gr-card-pad, var(--gr-gap))'],
    ['.gr-card-header,.gr-card-footer{', 'padding-inline:var(--gr-card-pad, var(--gr-gap))'],
    ['.gr-nav>:where(li){', 'padding:var(--gr-nav-item-pad, 0)'],
    ['.gr-nav-link{', 'border-radius:var(--gr-nav-link-radius, var(--gr-radius))'],
    ['.gr-modal-body{', 'overflow-y:var(--gr-modal-body-overflow, auto)'],
    ['.gr-tab{', 'padding-inline:var(--gr-tabs-tab-pad, var(--gr-control-padding-x))'],
    ['.gr-dropdown-panel{', 'min-inline-size:var(--gr-dropdown-min-width, max-content)'],
    ['.gr-dropdown-panel{', 'padding:var(--gr-dropdown-pad, 0)'],
    ['.gr-accordion-trigger{', 'padding-inline:var(--gr-accordion-summary-pad, var(--gr-gap))'],
  ];

  for (const [selector, declaration] of reads) {
    assert.ok(ruleOf(ui, selector).includes(declaration), `${selector} не читает «${declaration}»`);
    // В scoped-сборке префикс стоит у каждого селектора группы.
    const prefixed = selector.split(',').map((part) => `:where(.griffin) ${part}`).join(',');

    assert.ok(ruleOf(scoped, prefixed).includes(declaration), `${selector} в scoped-сборке не читает «${declaration}»`);
  }

  // Переход окна — тем же токеном во всех четырёх свойствах. Правило
  // с переходом лежит в @supports и находится по своему началу: первый
  // @supports в файле — у выдвижной панели.
  const modal = ruleOf(ui, '.gr-modal{opacity:0;translate:0 var(--gr-gap);transition:');

  assert.equal((modal.match(/var\(--gr-modal-transition, var\(--gr-transition\)\)/g) || []).length, 4, 'переход окна читает токен не во всех свойствах');

  for (const token of ['--gr-card-bg', '--gr-card-border', '--gr-card-radius', '--gr-card-pad', '--gr-nav-item-pad', '--gr-nav-link-radius', '--gr-modal-body-overflow', '--gr-modal-transition', '--gr-tabs-tab-pad', '--gr-dropdown-pad', '--gr-dropdown-min-width', '--gr-accordion-summary-pad', '--gr-radius-container']) {
    for (const [name, css] of [['ui', ui], ['core', core], ['utils', utils]]) {
      assert.ok(!new RegExp(`${token}\\s*:`).test(css), `${token} объявлен в griffincss-${name}.css — переопределение на обёртке проиграло бы`);
    }
  }
});

test('радиус контейнера читают карточка, окно, меню и сообщение; по умолчанию он равен --gr-radius', () => {
  // Фидбек, п. 18: правило «контейнер с отступом скруглён на radius + отступ»
  // теме нечем было выразить — один токен на контролы и контейнеры. Отдельный
  // токен без собственного объявления: fallback var(--gr-radius) считается
  // на самом элементе, поэтому островок стиля с --gr-radius: 0 получает
  // прямые углы и у карточек — объявление на :root резолвилось бы
  // один раз корневым значением. Умолчание = прежний вид во всех стратегиях.
  for (const selector of ['.gr-modal{', '.gr-menu{', '.gr-alert{']) {
    assert.ok(ruleOf(ui, selector).includes('border-radius:var(--gr-radius-container, var(--gr-radius))'), `${selector} не читает радиус контейнера`);
  }
});

test('карточка на сером — .gr-card-overlay: поверхность всплывающего слоя, обводка прежняя', () => {
  // Фидбек, п. 4: панели витрины стоят на сером фоне страницы и обязаны быть
  // белыми с волосяной обводкой — иначе сливаются с фоном. Вариант меняет
  // только фон: рамка у базовой карточки уже есть. .gr-card-raised не тронут.
  const rule = ruleOf(ui, '.gr-card-overlay{');

  assert.ok(rule.includes('background-color:var(--gr-color-surface-overlay)'), 'фон не поверхность всплывающего слоя');
  assert.ok(!rule.includes('border-color:transparent'), 'обводка снята — карточка сольётся с фоном');
  assert.ok(ruleOf(ui, '.gr-card-raised{').includes('box-shadow:var(--gr-shadow-md)'), '.gr-card-raised изменилась');
});
