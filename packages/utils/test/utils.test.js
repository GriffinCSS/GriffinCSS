'use strict';

// Инварианты пакета утилит, проверяемые по собранному CSS: шкала спейсинга,
// единый синтаксис адаптивности, экранирование дробей, положение @keyframes
// в scoped-сборке. check-dist.mjs следит за структурой артефакта в целом,
// здесь — за содержимым конкретных модулей.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const utils = fs.readFileSync(path.join(DIST, 'griffincss-utils.css'), 'utf8');
const scoped = fs.readFileSync(path.join(DIST, 'griffincss-utils-scoped.css'), 'utf8');

const SPACING_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16];

// Sass в сжатом режиме сохраняет пробел в значении кастомного свойства
// (--gr-p: 1rem) — значение записывается как есть. Сверять объявления
// удобнее по варианту без пробела.
const packed = utils.replace(/--([\w-]+):\s+/g, '--$1:');

test('шкала спейсинга — ровно двенадцать разреженных ступеней', () => {
  const found = [...utils.matchAll(/\.gr-m-(\d+)\{/g)].map((m) => Number(m[1]));

  assert.deepEqual([...new Set(found)].sort((a, b) => a - b), SPACING_STEPS);
});

test('убранные ступени спейсинга не возвращаются ни у одного свойства', () => {
  for (const step of [9, 11, 13, 14, 15]) {
    for (const prop of ['m', 'p', 'mt', 'px', 'py']) {
      assert.ok(
        !utils.includes(`.gr-${prop}-${step}{`),
        `.gr-${prop}-${step} должен был исчезнуть вместе со ступенью ${step}`,
      );
    }
  }
});

test('адаптивность — только суффиксом, префиксной формы не осталось', () => {
  assert.ok(!/\.gr-(sm|md|lg|xl)\\:/.test(utils), 'найден префиксный класс вида .gr-md\\:p-4');
  assert.ok(utils.includes('.gr-p-8-md{'), 'суффиксный .gr-p-8-md отсутствует');
  assert.ok(utils.includes('.gr-mx-auto-lg{'), 'авто-маржины тоже должны иметь суффикс');
});

test('адаптивные варианты есть у всех свойств спейсинга', () => {
  const props = ['m', 'p', 'mt', 'mb', 'pt', 'pb', 'ms', 'me', 'ps', 'pe', 'mx', 'my', 'px', 'py'];

  for (const prop of props) {
    for (const bp of ['sm', 'md', 'lg', 'xl']) {
      assert.ok(utils.includes(`.gr-${prop}-4-${bp}{`), `нет .gr-${prop}-4-${bp}`);
    }
  }
});

test('у радиусов адаптивных вариантов нет', () => {
  assert.ok(!/\.gr-radius-\d+-(sm|md|lg|xl)\{/.test(utils), 'адаптивный класс радиуса вернулся');
  assert.ok(!utils.includes('.gr-radius-full-md{'), 'адаптивный .gr-radius-full вернулся');
  assert.ok(utils.includes('.gr-radius-8{'), 'базовые ступени радиуса должны остаться');
});

test('дробные ширины экранированы в селекторе', () => {
  for (const fraction of ['1\\/2', '1\\/3', '2\\/3', '1\\/4', '3\\/4']) {
    assert.ok(utils.includes(`.gr-w-${fraction}{`), `нет .gr-w-${fraction}`);
  }
});

test('граница видна без класса цвета, а класс цвета её перекрашивает', () => {
  assert.ok(
    utils.includes('.gr-border{border:var(--gr-border-width, 1px) solid var(--gr-color-border)}'),
    'нет базовой границы',
  );

  const geometry = utils.indexOf('.gr-border{');
  const colour = utils.indexOf('.gr-border-primary{');

  assert.ok(colour > geometry, 'модуль цветов обязан идти после модуля границ');
});

test('@keyframes в scoped-сборке лежат вне области видимости', () => {
  assert.ok(scoped.includes('@keyframes gr-spin'), 'keyframes не попали в scoped-сборку');
  assert.ok(
    scoped.indexOf('@keyframes gr-spin') < scoped.indexOf('@scope'),
    'внутри @scope правило @keyframes недействительно',
  );
});

test('переходы и вращение считаются с настройкой уменьшенной анимации', () => {
  assert.ok(utils.includes('prefers-reduced-motion: reduce'), 'нет блока для reduce');
  assert.ok(utils.includes('prefers-reduced-motion: no-preference'), 'плавная прокрутка должна быть под no-preference');
});

test('sr-only использует clip-path, а не устаревший clip', () => {
  assert.ok(utils.includes('clip-path:inset(50%)'), 'нет clip-path');
  assert.ok(!/[^-]clip:rect/.test(utils), 'устаревший clip: rect() вернулся');
});

test('семантические утилиты цвета есть и ссылаются на токены темы', () => {
  const expected = [
    ['.gr-bg-page{', '--gr-color-bg'],
    ['.gr-bg-surface{', '--gr-color-surface'],
    ['.gr-bg-raised{', '--gr-color-surface-raised'],
    ['.gr-bg-sunken{', '--gr-color-surface-sunken'],
    ['.gr-bg-accent{', '--gr-color-accent'],
    ['.gr-text-ink{', '--gr-color-text'],
    ['.gr-text-ink-secondary{', '--gr-color-text-secondary'],
    ['.gr-text-ink-muted{', '--gr-color-text-muted'],
    ['.gr-text-ink-disabled{', '--gr-color-text-disabled'],
    ['.gr-text-accent{', '--gr-color-accent'],
    ['.gr-text-on-accent{', '--gr-color-on-accent'],
    ['.gr-text-link{', '--gr-color-link'],
    ['.gr-border-subtle{', '--gr-color-border'],
    ['.gr-border-strong{', '--gr-color-border-strong'],
  ];

  for (const [selector, token] of expected) {
    const at = utils.indexOf(selector);
    assert.ok(at !== -1, `нет класса ${selector.slice(0, -1)}`);
    assert.ok(
      utils.slice(at, at + 120).includes(token),
      `${selector.slice(0, -1)} не ссылается на ${token}`,
    );
  }
});

test('литеральные цветовые утилиты остались литеральными', () => {
  assert.ok(
    utils.includes('.gr-bg-white{background-color:hsl(var(--gr-hsl-white))}'),
    '.gr-bg-white обязан оставаться белым в любой теме',
  );
});

test('базовая ширина границы берётся из токена, явные ширины — нет', () => {
  assert.ok(
    utils.includes('.gr-border{border:var(--gr-border-width, 1px) solid var(--gr-color-border)}'),
    'базовая граница не следует за режимом для слабовидящих',
  );
  assert.ok(utils.includes('.gr-border-2{border:2px solid'), 'явная ширина не должна зависеть от режима');
});

// 9a: зазор каскада скруглений и padding обязаны быть одним значением —
// иначе .gr-p-* и .gr-radius молча спорят за padding, и дети получают
// радиус, посчитанный не от того отступа, который виден на экране.
test('равномерный .gr-p-* объявляет --gr-p и выводит padding из него', () => {
  assert.ok(packed.includes('.gr-p-4{--gr-p:1rem;padding:var(--gr-p)}'), 'зазор и padding обязаны быть одним значением');
});

test('осевые и односторонние отступы --gr-p не трогают', () => {
  for (const prop of ['px', 'py', 'pt', 'pb', 'ps', 'pe']) {
    const rule = utils.match(new RegExp(`\\.gr-${prop}-4\\{[^}]*\\}`))[0];

    assert.ok(!rule.includes('--gr-p'), `${prop}: асимметричный отступ каскаду скруглений не годится`);
  }
});

test('обрезка прокрутки берёт радиус из опубликованной переменной', () => {
  // Полосу прокрутки Blink рисует прямоугольником и по border-radius
  // не обрезает: у скруглённого блока с overflow: auto углы срезаются ровно
  // там, где появилась полоса. clip-path режет всю отрисовку элемента,
  // полосу включительно, а радиус берёт у .gr-radius* через --gr-r.
  assert.ok(
    utils.includes('.gr-scroll-clip{clip-path:inset(0 round var(--gr-r, 0))}'),
    'нет .gr-scroll-clip или радиус берётся не из --gr-r',
  );

  // Фолбэк ноль обязателен: с фолбэком на --gr-radius утилита скругляла бы
  // блок, который скруглять не просили.
  assert.ok(
    !/\.gr-scroll-clip\{[^}]*var\(--gr-r, var\(/.test(utils),
    'фолбэк радиуса подставляет чужое значение вместо нуля',
  );
});

// 13a: логические отступы. Пакет ui уже раскладывается по padding-inline,
// пакет utils двигал те же компоненты физическими margin-left/right —
// компонент в RTL разворачивался, а утилита, которой его двигают, нет.
test('осевые отступы объявляют одно логическое свойство, а не пару физических', () => {
  assert.ok(utils.includes('.gr-mx-4{margin-inline:1rem}'), '.gr-mx-4 не переведён на margin-inline');
  assert.ok(utils.includes('.gr-px-4{padding-inline:1rem}'), '.gr-px-4 не переведён на padding-inline');
  assert.ok(utils.includes('.gr-mx-auto{margin-inline:auto}'), '.gr-mx-auto не переведён на margin-inline');

  for (const prop of ['mx', 'px']) {
    const rule = utils.match(new RegExp(`\\.gr-${prop}-4\\{[^}]*\\}`))[0];

    assert.ok(!/-(left|right)/.test(rule), `${prop}: физическая пара свойств вернулась`);
  }
});

test('логические отступы start/end есть у margin и padding', () => {
  const logical = [
    ['ms', 'margin-inline-start'],
    ['me', 'margin-inline-end'],
    ['ps', 'padding-inline-start'],
    ['pe', 'padding-inline-end'],
  ];

  for (const [prop, decl] of logical) {
    assert.ok(utils.includes(`.gr-${prop}-4{${decl}:1rem}`), `нет .gr-${prop}-4 на ${decl}`);
    assert.ok(utils.includes(`.gr-${prop}-0{${decl}:0rem}`), `нет нулевой ступени .gr-${prop}-0`);
  }
});

// Этап 36: единственное запланированное ломающее изменение проведено.
// Физические односторонние классы сняты; замену даёт логическая пара,
// адаптивная по всей шкале. Постоянный инвариант держит и check-dist.
test('физических односторонних отступов не осталось', () => {
  for (const prop of ['ml', 'mr', 'pl', 'pr']) {
    assert.ok(
      !new RegExp(`\\.gr-${prop}-(?:\\d|auto)`).test(utils),
      `.gr-${prop}-* вернулся: физические отступы удалены Этапом 36`,
    );
  }
});

// Этап 36: адаптивные варианты добавлены. Без них снятие физических классов
// забрало бы у потребителя односторонний отступ от брейкпоинта, а не перевело
// его на логический. Шкала обязана совпадать с физической ступень в ступень.
test('логические отступы имеют адаптивные варианты по всей шкале', () => {
  for (const prop of ['ms', 'me', 'ps', 'pe']) {
    for (const step of SPACING_STEPS) {
      for (const bp of ['sm', 'md', 'lg', 'xl']) {
        assert.ok(utils.includes(`.gr-${prop}-${step}-${bp}{`), `нет .gr-${prop}-${step}-${bp}`);
      }
    }
  }

  assert.ok(utils.includes('.gr-ms-auto-md{'), 'нет адаптивного .gr-ms-auto');
  assert.ok(utils.includes('.gr-me-auto-lg{'), 'нет адаптивного .gr-me-auto');
});

// 13b → 36b: выравнивание текста только логическое. Пара
// .gr-text-start / .gr-text-end разворачивается по направлению письма;
// физические .gr-text-left / .gr-text-right удалены Этапом 36.
test('выравнивание текста имеет логическую пару start/end', () => {
  assert.ok(utils.includes('.gr-text-start{text-align:start}'), 'нет .gr-text-start');
  assert.ok(utils.includes('.gr-text-end{text-align:end}'), 'нет .gr-text-end');
  assert.ok(!utils.includes('.gr-text-left'), '.gr-text-left вернулся: физическое выравнивание удалено Этапом 36');
  assert.ok(!utils.includes('.gr-text-right'), '.gr-text-right вернулся: физическое выравнивание удалено Этапом 36');

  for (const bp of ['sm', 'md', 'lg', 'xl']) {
    assert.ok(utils.includes(`.gr-text-start-${bp}{text-align:start}`), `нет .gr-text-start-${bp}`);
    assert.ok(utils.includes(`.gr-text-end-${bp}{text-align:end}`), `нет .gr-text-end-${bp}`);
  }
});

// Маркерный отступ списка в RTL лежит справа, и padding-left его не снимал:
// .gr-list-none в RTL оставлял слева пустую колонку, а маркеры — на месте.
test('.gr-list-none снимает маркерный отступ с той стороны, где он есть', () => {
  const rule = utils.match(/\.gr-list-none\{[^}]*\}/)[0];

  assert.ok(rule.includes('padding-inline-start:0'), 'нет padding-inline-start');
  assert.ok(!rule.includes('padding-left'), 'физический padding-left вернулся');
});

// 13b → 36b: привязка к краям. Осевые классы сворачиваются в логическую
// пару — обе стороны у них равны, поэтому направление письма ничего
// не меняет, а вывод становится короче. Односторонние left/right удалены
// Этапом 36 вместе с остальными физическими; привязку к строке дают
// start/end, верх и низ остаются top/bottom — блочная ось в RTL
// не разворачивается.
test('осевая привязка к краям объявляет логические оси', () => {
  assert.ok(utils.includes('.gr-inset-x-0{inset-inline:0}'), '.gr-inset-x-0 не переведён на inset-inline');
  assert.ok(utils.includes('.gr-inset-y-0{inset-block:0}'), '.gr-inset-y-0 не переведён на inset-block');
});

test('у привязки к краям есть логическая пара start/end', () => {
  assert.ok(utils.includes('.gr-start-0{inset-inline-start:0}'), 'нет .gr-start-0');
  assert.ok(utils.includes('.gr-end-0{inset-inline-end:0}'), 'нет .gr-end-0');
  assert.ok(utils.includes('.gr-start-auto{inset-inline-start:auto}'), 'нет .gr-start-auto');
  assert.ok(utils.includes('.gr-end-auto{inset-inline-end:auto}'), 'нет .gr-end-auto');

  assert.ok(!/\.gr-left-(?:0|auto)/.test(utils), '.gr-left-* вернулся: физическая привязка удалена Этапом 36');
  assert.ok(!/\.gr-right-(?:0|auto)/.test(utils), '.gr-right-* вернулся: физическая привязка удалена Этапом 36');
});

// 13b → 36b: границы. Осевые сворачиваются в border-inline/border-block —
// пара сторон с одинаковым значением, направление письма ей безразлично.
// Односторонние стороны — только логические s/e; физические l/r удалены
// Этапом 36 (t/b остаются: блочная ось не разворачивается).
test('осевые границы объявляют логическую ось одним свойством', () => {
  const width = 'var(--gr-border-width, 1px) solid var(--gr-color-border)';

  assert.ok(utils.includes(`.gr-border-x{border-inline:${width}}`), '.gr-border-x не переведён на border-inline');
  assert.ok(utils.includes(`.gr-border-y{border-block:${width}}`), '.gr-border-y не переведён на border-block');
  assert.ok(utils.includes('.gr-border-x-0{border-inline:0}'), 'нет .gr-border-x-0 на border-inline');
  assert.ok(utils.includes('.gr-border-y-4{border-block:4px solid'), 'нет .gr-border-y-4 на border-block');
});

test('у границ по сторонам есть логическая пара s/e', () => {
  for (const [key, prop] of [['s', 'border-inline-start'], ['e', 'border-inline-end']]) {
    assert.ok(utils.includes(`.gr-border-${key}{${prop}:var(--gr-border-width, 1px) solid`), `нет .gr-border-${key}`);
    assert.ok(utils.includes(`.gr-border-${key}-0{${prop}:0}`), `нет .gr-border-${key}-0`);
    assert.ok(utils.includes(`.gr-border-${key}-2{${prop}:2px solid`), `нет .gr-border-${key}-2`);
  }

  assert.ok(!utils.includes('.gr-border-l{'), '.gr-border-l вернулся: физические стороны границ удалены Этапом 36');
  assert.ok(!utils.includes('.gr-border-r{'), '.gr-border-r вернулся: физические стороны границ удалены Этапом 36');
  assert.ok(!/\.gr-border-[lr]-\d/.test(utils), 'ширины физических сторон границ вернулись');
});

// Этап 14: контейнерные варианты. Суффикс отличается от оконного одной
// буквой, шкала общая, а перечень модулей ограничен — за него платит
// каждый, кто подключает готовый файл.

// Прелюдию @container sass не разбирает и переносит как есть, тогда как
// в @media пробелы вокруг оператора он снимает. Сравниваем в общем виде.
const squeezed = utils.replace(/\s+/g, '');

test('контейнерные варианты живут внутри @container, а не @media', () => {
  const containers = [...squeezed.matchAll(/@container([^{]+)\{/g)].map((m) => m[1]);

  assert.ok(containers.length > 0, '@container в собранном файле не найден');

  for (const query of containers) {
    assert.match(query, /^\(width>=\d+px\)$/, `запрос не в range-синтаксисе: ${query}`);
  }
});

test('шкала контейнерных запросов — та же карта брейкпоинтов', () => {
  const inMedia = new Set([...squeezed.matchAll(/@media\(width>=(\d+px)\)/g)].map((m) => m[1]));
  const inContainer = new Set([...squeezed.matchAll(/@container\(width>=(\d+px)\)/g)].map((m) => m[1]));

  assert.deepEqual([...inContainer].sort(), [...inMedia].sort());
});

test('контейнерные варианты есть у отступов, размеров, типографики и видимости', () => {
  for (const name of ['gr-p-4-cmd', 'gr-my-8-csm', 'gr-w-full-cxl', 'gr-text-lg-clg', 'gr-hidden-csm']) {
    assert.ok(utils.includes(`.${name}{`), `контейнерный класс .${name} отсутствует`);
  }
});

test('остальные модули контейнерных вариантов не получили', () => {
  for (const name of ['gr-absolute', 'gr-shadow-md', 'gr-border-2', 'gr-opacity-50', 'gr-radius-4']) {
    for (const bp of ['csm', 'cmd', 'clg', 'cxl']) {
      assert.ok(
        !utils.includes(`.${name}-${bp}{`),
        `.${name}-${bp} — контейнерный вариант вне согласованного перечня модулей`,
      );
    }
  }
});

test('контейнерные варианты приехали к логическим отступам вместе с оконными', () => {
  for (const prop of ['ms', 'me', 'ps', 'pe']) {
    for (const bp of ['csm', 'cmd', 'clg', 'cxl']) {
      assert.ok(utils.includes(`.gr-${prop}-4-${bp}{`), `нет .gr-${prop}-4-${bp}`);
    }
  }
});

test('scoped-сборка несёт те же контейнерные варианты', () => {
  assert.ok(scoped.includes('.gr-p-4-cmd'), 'контейнерные варианты не доехали до scoped-сборки');
});

// Относительные размеры: шаг в пикселях от текущего размера. Инвариант держит
// связку с базовой шкалой в точке отсчёта 16px — .gr-text-rel-sm обязан давать
// там ровно те же 14px, что и .gr-text-sm, иначе набор теряет смысл.
test('относительные размеры — шаг в px от текущего размера', () => {
  const steps = [
    ['xs', '-', '4px'],
    ['sm', '-', '2px'],
    ['lg', '+', '2px'],
    ['xl', '+', '4px'],
    ['2xl', '+', '6px'],
    ['3xl', '+', '8px'],
  ];

  for (const [name, sign, delta] of steps) {
    assert.ok(
      utils.includes(`.gr-text-rel-${name}{font-size:calc(1em ${sign} ${delta})}`),
      `нет .gr-text-rel-${name} со значением calc(1em ${sign} ${delta})`,
    );
  }
});

test('при родителе 16px четыре ступени совпадают с базовой шкалой', () => {
  const pairs = [
    ['xs', -4, '.75'],
    ['sm', -2, '.875'],
    ['lg', 2, '1.125'],
    ['xl', 4, '1.25'],
  ];

  for (const [name, delta, rem] of pairs) {
    assert.ok(
      utils.includes(`.gr-text-${name}{font-size:${rem}rem}`),
      `.gr-text-${name} сдвинулся — сверка с относительной ступенью больше не верна`,
    );
    assert.equal(
      16 + delta,
      Number(rem) * 16,
      `.gr-text-rel-${name} перестал попадать в .gr-text-${name} при родителе 16px`,
    );
  }
});

test('ступени base у относительных размеров нет', () => {
  assert.ok(
    !utils.includes('.gr-text-rel-base{'),
    'класс, не меняющий размер, не нужен — его роль играет отсутствие класса',
  );
});

test('относительная шкала обрывается на 3xl', () => {
  for (const name of ['4xl', '5xl', '6xl']) {
    assert.ok(
      !utils.includes(`.gr-text-rel-${name}{`),
      `.gr-text-rel-${name} — это уже отдельный заголовок, а не подстройка блока`,
    );
  }
});

test('у относительных размеров нет ни адаптивных, ни контейнерных вариантов', () => {
  assert.ok(
    !/\.gr-text-rel-[a-z0-9]+-c?(sm|md|lg|xl)\{/.test(utils),
    'размер здесь задаёт вложенность, а не ширина окна или контейнера',
  );
});

test('scoped-сборка несёт относительные размеры', () => {
  assert.ok(
    scoped.includes('.gr-text-rel-sm{font-size:calc(1em - 2px)}'),
    'относительные размеры не доехали до scoped-сборки',
  );
});

// Этап 32: утилиты спроса — трансформации, фильтры, градиенты.
//
// Три группы добавлены БЕЗ адаптивных и контейнерных вариантов. Довод
// и прецедент те же, что у логических отступов выше: эффект наведения
// не меняется от ширины окна, а множитель девять съел бы весь бюджет
// утилит целиком. Инвариант держится тестом, потому что «-md» дописывается
// к группе одной строкой @each и незаметно проходит ревью.
const DEMAND_GROUPS = [
  'scale', 'rotate', 'translate-x', 'translate-y', 'hover',
  'blur', 'grayscale', 'brightness', 'contrast', 'saturate',
  'gradient-to', 'from', 'via', 'to',
].join('|');

test('модули спроса доехали до обеих сборок утилит', () => {
  for (const [css, build] of [[utils, 'обычной'], [scoped, 'scoped']]) {
    assert.ok(css.includes('.gr-scale-105{'), `трансформаций нет в ${build} сборке`);
    assert.ok(css.includes('.gr-blur-2{'), `фильтров нет в ${build} сборке`);
    assert.ok(css.includes('.gr-gradient-to-r{'), `градиентов нет в ${build} сборке`);
  }
});

test('у групп спроса нет ни адаптивных, ни контейнерных суффиксов', () => {
  const suffixed = new RegExp(`\\.gr-(?:${DEMAND_GROUPS})-[\\w-]*-c?(?:sm|md|lg|xl)\\{`, 'g');
  const found = [...utils.matchAll(suffixed)].map((m) => m[0]);

  assert.deepEqual(
    found,
    [],
    'суффикс брейкпоинта у групп спроса запрещён: с ним группа растёт примерно вдевятеро',
  );
});

// Вырезает блоки @media (hover: hover) целиком, считая скобки: внутри
// лежат обычные правила, и regex по строке на них не годится.
function withoutHoverMedia(css) {
  const open = '@media(hover: hover){';
  let out = css;

  for (;;) {
    const at = out.indexOf(open);
    if (at === -1) return out;

    let depth = 0;
    let i = at + open.length - 1;

    for (; i < out.length; i += 1) {
      if (out[i] === '{') depth += 1;
      else if (out[i] === '}' && (depth -= 1) === 0) break;
    }

    out = out.slice(0, at) + out.slice(i + 1);
  }
}

test('наведение в утилитах объявлено только под (hover: hover)', () => {
  assert.ok(utils.includes('@media(hover: hover){'), 'блока (hover: hover) в утилитах нет вовсе');

  const outside = withoutHoverMedia(utils);

  assert.ok(
    !outside.includes(':hover'),
    'наведение вне (hover: hover) залипает после касания на сенсорном экране',
  );
});

test('трансформация складывается из раздельных свойств, а не из transform', () => {
  assert.ok(utils.includes('.gr-scale-105{scale:1.05}'), 'нет .gr-scale-105 на свойстве scale');
  assert.ok(utils.includes('.gr-rotate-6{rotate:6deg}'), 'нет .gr-rotate-6 на свойстве rotate');
  assert.ok(utils.includes('.gr-rotate--6{rotate:-6deg}'), 'нет поворота в обратную сторону');

  const group = new RegExp('\\.gr-(?:scale|rotate|translate-[xy]|hover)-[\\w-]*\\{[^}]*transform:');

  assert.ok(!group.test(utils), 'общее свойство transform затирает соседние классы группы');
});

// Обе оси сдвига пишутся в одно свойство translate, поэтому значение идёт
// настраиваемыми свойствами. Ноль по соседней оси обязателен: --gr-tx
// наследуется, и вложенный .gr-translate-y-1 без сброса уехал бы вбок
// вслед за предком.
test('сдвиг по осям складывается, а не затирается', () => {
  assert.ok(
    packed.includes('.gr-translate-x-2{--gr-tx:0.5rem;--gr-ty:0;translate:var(--gr-tx) var(--gr-ty)}'),
    'нет .gr-translate-x-2 со сбросом соседней оси',
  );
  assert.ok(
    packed.includes('.gr-translate-y--2{--gr-tx:0;--gr-ty:-0.5rem;translate:var(--gr-tx) var(--gr-ty)}'),
    'нет .gr-translate-y--2 со сбросом соседней оси',
  );
});

test('подъём по наведению идёт через ось сдвига, а не поверх неё', () => {
  assert.ok(
    packed.includes('.gr-hover-lift{--gr-tx:0;--gr-ty:0;translate:var(--gr-tx) var(--gr-ty)}'),
    '.gr-hover-lift не подключён к собирающему свойству translate',
  );
  assert.ok(
    packed.includes('.gr-hover-lift:hover{--gr-ty:-0.25rem}'),
    'подъём обязан двигать только свою ось, иначе теряется горизонтальный сдвиг',
  );
});

test('фильтры собираются одним правилом и не затирают друг друга', () => {
  assert.ok(packed.includes('.gr-blur-2{--gr-blur:4px}'), 'нет .gr-blur-2 на --gr-blur');
  assert.ok(packed.includes('.gr-grayscale-100{--gr-grayscale:1}'), 'нет .gr-grayscale-100');

  const filter = packed.match(/\{--gr-blur:0;[^}]*filter:blur\(var\(--gr-blur\)\)[^}]*\}/);

  assert.ok(filter, 'нет собирающего правила filter со сбросом наследуемых значений');
  assert.ok(
    packed.indexOf(filter[0]) < packed.indexOf('.gr-blur-2{'),
    'сброс обязан идти до классов-значений',
  );
});

// Пустая карта ступеней не выводит ни классов, ни своей функции
// в собирающем правиле: контраст и насыщенность включаются
// переопределением карты и по умолчанию не стоят ни байта.
test('невыведенная группа фильтров не оставляет следа в собирающем правиле', () => {
  const filter = packed.match(/filter:blur\(var\(--gr-blur\)\)[^};]*/)[0];

  for (const fn of ['contrast', 'saturate']) {
    assert.ok(!filter.includes(`${fn}(`), `${fn} в значении есть, а классов нет — байты впустую`);
    assert.ok(!utils.includes(`.gr-${fn}-`), `.gr-${fn}-* выведен при пустой карте`);
  }
});

test('градиент берёт цвет из тех же переменных, что и цветовые утилиты', () => {
  assert.ok(packed.includes('.gr-from-primary{--gr-from:hsl(var(--gr-hsl-primary))}'), 'нет .gr-from-primary');
  assert.ok(packed.includes('.gr-to-danger{--gr-to:hsl(var(--gr-hsl-danger))}'), 'нет .gr-to-danger');
  assert.ok(packed.includes('.gr-via-success{--gr-via:hsl(var(--gr-hsl-success)),}'), 'нет .gr-via-success');

  // Своей палитры у группы нет: каждый цвет градиента обязан приходить
  // из переменной --gr-hsl-*, которой красятся .gr-bg-* и .gr-text-*.
  for (const rule of packed.match(/\.gr-(?:from|via|to)-[\w-]+\{[^}]*\}/g) || []) {
    assert.match(rule, /hsl\(var\(--gr-hsl-[\w-]+\)\)/, `свой цвет мимо палитры: ${rule}`);
  }
});

// Средняя точка вставляется в тот же linear-gradient, а не заводит второй:
// незаданная --gr-via подставляется пустотой через фолбэк var(--gr-via, ),
// поэтому за две точки не платят те, кому хватает двух.
test('средняя точка градиента вставляется в набор, а не отдельным правилом', () => {
  const collector = packed.match(/\{--gr-from:transparent;--gr-via:initial;--gr-to:transparent;background-image:linear-gradient\(var\(--gr-gradient-dir\), var\(--gr-from\), var\(--gr-via, \) var\(--gr-to\)\)\}/);

  assert.ok(collector, 'нет собирающего правила градиента со сбросом трёх точек');
  assert.ok(
    packed.indexOf(collector[0]) < packed.indexOf('.gr-from-primary{'),
    'сброс обязан идти до классов-цветов, иначе они не доживут до каскада',
  );
});

test('атрибутных селекторов в утилитах нет', () => {
  // [class*=gr-blur] поймал бы чужие классы потребителя и не пережил бы
  // отсечение неиспользуемого: перечень селекторов только явный.
  assert.ok(!/\[class[*^~|$]?=/.test(utils), 'атрибутный селектор по имени класса в утилитах');
});
