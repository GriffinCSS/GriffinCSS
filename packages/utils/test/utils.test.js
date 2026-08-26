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

test('адаптивные варианты есть у всех четырнадцати свойств спейсинга', () => {
  const props = ['m', 'p', 'mt', 'mr', 'mb', 'ml', 'pt', 'pr', 'pb', 'pl', 'mx', 'my', 'px', 'py'];

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
  for (const prop of ['px', 'py', 'pt', 'pr', 'pb', 'pl']) {
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

test('физические ml/mr остаются: их удаление — ломающее изменение', () => {
  assert.ok(utils.includes('.gr-ml-4{margin-left:1rem}'), '.gr-ml-4 исчез');
  assert.ok(utils.includes('.gr-mr-4{margin-right:1rem}'), '.gr-mr-4 исчез');
  assert.ok(utils.includes('.gr-pl-4{padding-left:1rem}'), '.gr-pl-4 исчез');
  assert.ok(utils.includes('.gr-pr-4{padding-right:1rem}'), '.gr-pr-4 исчез');
});

test('у логических отступов адаптивных вариантов нет — это плата за бюджет', () => {
  for (const prop of ['ms', 'me', 'ps', 'pe']) {
    assert.ok(
      !new RegExp(`\\.gr-${prop}-\\d+-(sm|md|lg|xl)\\{`).test(utils),
      `.gr-${prop}-*-<bp> вернулся: 240 селекторов бюджетом не обеспечены`,
    );
  }
});

// 13b: логическое выравнивание текста. Классы .gr-text-left/.gr-text-right
// остаются буквальными — их выбирают именно за буквальность, — а разворот
// по направлению письма даёт пара .gr-text-start / .gr-text-end.
test('выравнивание текста имеет логическую пару start/end', () => {
  assert.ok(utils.includes('.gr-text-start{text-align:start}'), 'нет .gr-text-start');
  assert.ok(utils.includes('.gr-text-end{text-align:end}'), 'нет .gr-text-end');
  assert.ok(utils.includes('.gr-text-left{text-align:left}'), '.gr-text-left обязан остаться физическим');
  assert.ok(utils.includes('.gr-text-right{text-align:right}'), '.gr-text-right обязан остаться физическим');

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

// 13b: привязка к краям. Осевые классы сворачиваются в логическую пару —
// обе стороны у них равны, поэтому направление письма ничего не меняет,
// а вывод становится короче. Односторонние остаются физическими: кнопка
// «закрыть» в углу окна обязана держаться угла, а не начала строки.
test('осевая привязка к краям объявляет логические оси', () => {
  assert.ok(utils.includes('.gr-inset-x-0{inset-inline:0}'), '.gr-inset-x-0 не переведён на inset-inline');
  assert.ok(utils.includes('.gr-inset-y-0{inset-block:0}'), '.gr-inset-y-0 не переведён на inset-block');
});

test('у привязки к краям есть логическая пара start/end', () => {
  assert.ok(utils.includes('.gr-start-0{inset-inline-start:0}'), 'нет .gr-start-0');
  assert.ok(utils.includes('.gr-end-0{inset-inline-end:0}'), 'нет .gr-end-0');
  assert.ok(utils.includes('.gr-start-auto{inset-inline-start:auto}'), 'нет .gr-start-auto');
  assert.ok(utils.includes('.gr-end-auto{inset-inline-end:auto}'), 'нет .gr-end-auto');

  assert.ok(utils.includes('.gr-left-0{left:0}'), '.gr-left-0 обязан остаться физическим');
  assert.ok(utils.includes('.gr-right-0{right:0}'), '.gr-right-0 обязан остаться физическим');
});

// 13b: границы. Осевые сворачиваются в border-inline/border-block —
// пара сторон с одинаковым значением, направление письма ей безразлично.
// Односторонние l/r остаются, логическую пару дают s/e.
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

  assert.ok(utils.includes('.gr-border-l{border-left:'), '.gr-border-l обязан остаться физическим');
  assert.ok(utils.includes('.gr-border-r{border-right:'), '.gr-border-r обязан остаться физическим');
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

test('логические отступы не получили и контейнерных вариантов', () => {
  for (const prop of ['ms', 'me', 'ps', 'pe']) {
    assert.ok(
      !new RegExp(`\\.gr-${prop}-\\d+-c(sm|md|lg|xl)\\{`).test(utils),
      `.gr-${prop}-* обзавёлся контейнерным вариантом — это те же 240 селекторов`,
    );
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
