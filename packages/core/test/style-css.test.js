'use strict';

// Инварианты оси оформления по скомпилированному SCSS: ручки объявлены
// и нейтральны в ядре, метрики считаются через множители, компоненты
// не хардкодят таблеточный радиус.

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileScss, topLevelBlocks, layerBody } = require('./helpers/css');

const CORE = layerBody(compileScss("@use 'griffincss-core';"), 'griffincss.core');

// Sass снимает кавычки в атрибутных селекторах: [data-gr-style="strict"]
// компилируется в [data-gr-style=strict]. Сравниваем в этом виде, а в тестах
// пишем читаемую форму с кавычками.
const norm = (text) => text.replace(/\s+/g, ' ').replace(/"/g, '').trim();

function blockBody(selector, css) {
  const found = topLevelBlocks(css).find((b) => norm(b.prelude) === norm(selector));
  return found ? found.body : '';
}

test('ядро объявляет три ручки оси с нейтральными значениями', () => {
  const root = blockBody(':root', CORE);

  assert.match(root, /--gr-density:\s*1\b/);
  assert.match(root, /--gr-elevation:\s*1\b/);
  assert.match(root, /--gr-radius-pill:\s*999px/);
});

test('зазоры и метрики контролов считаются через множитель плотности', () => {
  const root = blockBody(':root', CORE);

  assert.match(root, /--gr-gap:\s*calc\(0\.75rem \* var\(--gr-density\)\)/);
  assert.match(root, /--gr-ui-gap:\s*calc\(0\.5rem \* var\(--gr-density\)\)/);
  assert.match(root, /--gr-control-height:\s*calc\(2\.5rem \* var\(--gr-density\)\)/);
});

test('адаптивный шаг зазоров сохранился и тоже проходит через множитель', () => {
  const media = topLevelBlocks(CORE).find((b) => norm(b.prelude).includes('width >= 768px'));

  assert.ok(media, 'адаптивный шаг отступов исчез');
  assert.match(media.body, /--gr-gap:\s*calc\(1rem \* var\(--gr-density\)\)/);
});

test('тени умножаются и на плотность темы, и на высоту стиля', () => {
  const root = blockBody(':root', CORE);

  assert.match(
    root,
    /--gr-shadow-md:[^;]*calc\(10% \* var\(--gr-shadow-strength\) \* var\(--gr-elevation\)\)/,
  );
});

// --- Точка входа оси ---------------------------------------------------------

const sass = require('sass');
const path = require('node:path');

const SCSS_DIR = path.join(__dirname, '..', 'scss');

// Компиляция точки входа стилей с произвольной конфигурацией списка.
// null — конфигурация по умолчанию, то есть все три стиля.
function compileStyles(styles) {
  const config = styles === null
    ? ''
    : `@use 'style-config' with ($gr-styles: (${styles.join(', ')}));`;

  return sass.compileString(`${config}@use 'griffincss-styles';`, {
    loadPaths: [SCSS_DIR],
    style: 'expanded',
  }).css;
}

test('точка входа стилей объявляет полный порядок слоёв первой строкой', () => {
  const css = compileStyles(null);

  assert.ok(
    css.trimStart().startsWith(
      '@layer griffincss.reset, griffincss.core, griffincss.ui, griffincss.utils, griffincss.style;',
    ),
    'порядок слоёв не объявлен первым — файл, загрузившийся раньше прочих, задал бы другой',
  );
});

test('неизвестное имя в списке роняет сборку с внятной ошибкой', () => {
  assert.throws(
    () => compileStyles(['bootstrap']),
    /Griffincss: неизвестный стиль «bootstrap»/,
  );
});

// --- Общая часть: три ловушки наследования -----------------------------------
//
// var() внутри кастомного свойства подставляется на элементе, где свойство
// объявлено; вниз наследуется уже готовое значение. Островок с data-gr-style
// переопределил бы ручку и унаследовал бы результат предка — то есть
// не изменился бы вовсе. На <html> дефект незаметен: :root и [data-gr-style]
// там один элемент, и каскад складывает их.

const STYLES = layerBody(compileStyles(null), 'griffincss.style');

const carrierBlocks = topLevelBlocks(STYLES).filter((b) =>
  norm(b.prelude).includes('[data-gr-style]'),
);
const carrierBody = carrierBlocks.map((b) => b.body).join('\n');

test('слой griffincss.style непуст', () => {
  assert.ok(STYLES, 'слоя griffincss.style в выводе нет');
});

test('носитель оси пересчитывает семантические цвета', () => {
  assert.ok(carrierBlocks.length > 0, 'нет ни одного блока на [data-gr-style]');
  assert.match(carrierBody, /--gr-color-bg:\s*hsl\(var\(--gr-hsl-surface-0\)\)/);
  assert.match(carrierBody, /--gr-color-border:\s*hsl\(var\(--gr-hsl-border\)\)/);
});

test('носитель оси пересчитывает метрики плотности', () => {
  assert.match(carrierBody, /--gr-gap:\s*calc\(0\.75rem \* var\(--gr-density\)\)/);
  assert.match(carrierBody, /--gr-control-height:\s*calc\(2\.5rem \* var\(--gr-density\)\)/);
});

test('носитель оси пересчитывает тени', () => {
  assert.match(carrierBody, /--gr-shadow-md:[^;]*var\(--gr-elevation\)/);
});

test('адаптивный шаг зазоров действует и на носителе оси', () => {
  const media = topLevelBlocks(STYLES).find(
    (b) => norm(b.prelude).includes('width >= 768px') && b.body.includes('[data-gr-style]'),
  );

  assert.ok(media, 'на носителе оси зазоры застынут на мобильной ступени');
});

test('standard — валидное значение атрибута и возвращает ручки к базе', () => {
  const body = blockBody(':root[data-gr-style="standard"], [data-gr-style="standard"]', STYLES);

  assert.ok(body, 'стандартный островок внутри воздушной страницы не соберётся');
  assert.match(body, /--gr-density:\s*1\b/);
  assert.match(body, /--gr-radius:\s*0\.5rem/);
});

test('стандартный островок собирается даже с одним заказанным стилем', () => {
  const only = layerBody(compileStyles(['strict']), 'griffincss.style');

  assert.ok(
    only.includes('[data-gr-style=standard]'),
    'блок standard уехал под гейт — в сборке с одним стилем островок сломался бы',
  );
});

test('режим для слабовидящих перебивает ось оформления', () => {
  const prelude = topLevelBlocks(STYLES)
    .map((b) => norm(b.prelude))
    .find((p) => p.includes('[data-gr-a11y=low-vision]') && p.includes('[data-gr-style]'));

  assert.ok(
    prelude,
    'ось перебьёт режим доступности — компактный ужмёт интерфейс тому, кто просил крупнее',
  );

  const body = topLevelBlocks(STYLES)
    .filter((b) => norm(b.prelude).includes('[data-gr-a11y=low-vision]'))
    .map((b) => b.body)
    .join('\n');

  assert.match(body, /--gr-border-width:\s*2px/);

  // Плотность отменяется только у журнального стиля — единственного, кто
  // ужимает интерфейс. Общий блок написать нельзя: --gr-density: max(1,
  // var(--gr-density)) сослалось бы само на себя, а цикл CSS обнуляет
  // целиком, и плотность пропала бы вовсе.
  assert.ok(
    !/--gr-density:\s*max\(1,\s*var\(--gr-density\)\)/.test(STYLES),
    'самоссылка в --gr-density: цикл обнулит значение, плотность пропадёт',
  );

  const compactOff = topLevelBlocks(STYLES)
    .filter((b) => {
      const p = norm(b.prelude);
      return p.includes('[data-gr-a11y=low-vision]') && p.includes('[data-gr-style=compact]');
    })
    .map((b) => b.body)
    .join('\n');

  assert.match(compactOff, /--gr-density:\s*1\b/, 'журнальный стиль не разжимается в режиме доступности');
});

test('воздушный стиль не теряет простора в режиме доступности', () => {
  const airyOff = topLevelBlocks(STYLES)
    .filter((b) => {
      const p = norm(b.prelude);
      return p.includes('[data-gr-a11y=low-vision]') && p.includes('[data-gr-style=airy]');
    })
    .map((b) => b.body)
    .join('\n');

  assert.equal(
    airyOff,
    '',
    '«крупнее и просторнее» режиму доступности не противоречит — отменять тут нечего',
  );
});

test('стандартный островок возвращает ручки, но не цвет', () => {
  const body = blockBody(':root[data-gr-style="standard"], [data-gr-style="standard"]', STYLES);

  assert.match(body, /--gr-radius:\s*0\.5rem/);

  // Восстановить триплеты, сдвинутые стилем страницы, отсюда нечем: исходные
  // значения задала тема, и стиль их затёр. Это граница ответственности осей,
  // а не пробел — островку, которому нужен и цвет по умолчанию, ставится
  // и тема. Тест сторожит договорённость: попытка «вернуть» цвет здесь
  // означала бы дублирование значений темы в файле оси.
  assert.ok(
    !/--gr-hsl-/.test(body),
    'блок standard взялся за цвет — значения темы продублированы в файле оси',
  );
});

// --- Строгий стиль -----------------------------------------------------------

test('строгий стиль выпрямляет углы и глушит тени', () => {
  const body = blockBody(':root[data-gr-style="strict"], [data-gr-style="strict"]', STYLES);

  assert.ok(body, 'блока строгого стиля нет');
  assert.match(body, /--gr-radius:\s*0\.125rem/);
  assert.match(body, /--gr-radius-pill:\s*0\.25rem/);
  assert.match(body, /--gr-elevation:\s*0\.4/);
});

test('строгий стиль ссылается на якоря, а не на абсолютные цвета', () => {
  const body = blockBody(':root[data-gr-style="strict"], [data-gr-style="strict"]', STYLES);

  assert.match(body, /--gr-hsl-border:\s*var\(--gr-hsl-border-soft\)/);
  assert.match(body, /--gr-hsl-surface-1:\s*var\(--gr-hsl-surface-1-lifted\)/);
  assert.ok(
    !/--gr-hsl-surface-1:\s*\d/.test(body),
    'абсолютное значение поверх тёмной темы даст белую карточку на тёмной странице',
  );
});

test('сильная линия имеет собственный якорь', () => {
  const body = blockBody(':root[data-gr-style="strict"], [data-gr-style="strict"]', STYLES);

  assert.match(body, /--gr-hsl-border-strong:\s*var\(--gr-hsl-border-strong-soft\)/);
  assert.ok(
    !/--gr-hsl-border-strong:\s*var\(--gr-hsl-border\)/.test(body),
    'var() подставит уже сдвинутое значение — сильная линия растворится вместе со слабой',
  );
});

test('якоря стиля объявлены для обеих тем', () => {
  const light = blockBody(':root, [data-gr-theme="light"]', STYLES);
  const dark = blockBody('[data-gr-theme="dark"]', STYLES);

  assert.match(light, /--gr-hsl-surface-1-lifted:/);
  assert.match(dark, /--gr-hsl-surface-1-lifted:/);

  const system = topLevelBlocks(STYLES).find(
    (b) => norm(b.prelude) === '@media (prefers-color-scheme: dark)',
  );

  assert.ok(system, 'нет блока следования системной теме');
  assert.ok(system.body.includes(':root:not([data-gr-theme])'), system.body);
  assert.ok(system.body.includes('[data-gr-theme=auto]'), system.body);
});

test('строгий стиль статусных цветов не касается', () => {
  const body = blockBody(':root[data-gr-style="strict"], [data-gr-style="strict"]', STYLES);

  assert.ok(
    !/--gr-hsl-status-/.test(body),
    'строгость — про геометрию и линии, статусы в ней остаются базовыми',
  );
});

test('стили меняют заливку статуса, но не его текстовый цвет', () => {
  const airy = blockBody(':root[data-gr-style="airy"], [data-gr-style="airy"]', STYLES);

  // Заливке можно быть какой угодно — чернила на ней стиль задаёт свои.
  assert.match(airy, /--gr-hsl-status-danger-surface:\s*var\(--gr-hsl-status-danger-pastel\)/);
  assert.match(airy, /--gr-hsl-on-status-danger:\s*var\(--gr-hsl-on-status-danger-pastel\)/);

  // А текстовый цвет обязан остаться контрастным: «опасность» в тексте
  // на белом фоне пастельной быть не может.
  assert.ok(
    !/--gr-hsl-status-danger:\s/.test(airy),
    'воздушный стиль осветлил текстовый цвет опасности — сигнал в тексте перестанет читаться',
  );
  assert.ok(
    !/--gr-hsl-status-success:\s/.test(airy),
    'воздушный стиль осветлил текстовый цвет успеха',
  );
});

test('каждая пастельная заливка приходит со своими чернилами', () => {
  const light = blockBody(':root, [data-gr-theme="light"]', STYLES);

  for (const status of ['success', 'warning', 'danger', 'info']) {
    assert.match(
      light,
      new RegExp(`--gr-hsl-status-${status}-pastel:`),
      `нет пастельной заливки статуса ${status}`,
    );
    assert.match(
      light,
      new RegExp(`--gr-hsl-on-status-${status}-pastel:`),
      `у пастельной заливки ${status} нет своих чернил — подпись возьмётся от акцента`,
    );
  }
});

test('список $gr-styles определяет состав файла', () => {
  const only = layerBody(compileStyles(['strict']), 'griffincss.style');

  assert.ok(only.includes('[data-gr-style=strict]'), 'заказанный стиль отсутствует');
  assert.ok(!only.includes('[data-gr-style=airy]'), 'незаказанный стиль попал в вывод');
  assert.ok(!only.includes('[data-gr-style=compact]'), 'незаказанный стиль попал в вывод');
});

test('пустой список не даёт ни одного блока стиля', () => {
  const empty = layerBody(compileStyles([]), 'griffincss.style');

  assert.ok(!/\[data-gr-style=(airy|strict|compact)\]/.test(empty), empty);
});

// --- Журнальный стиль --------------------------------------------------------

test('журнальный стиль ужимает плотность, сохраняя малое скругление', () => {
  const body = blockBody(':root[data-gr-style="compact"], [data-gr-style="compact"]', STYLES);

  assert.ok(body, 'блока журнального стиля нет');
  assert.match(body, /--gr-density:\s*0\.75/);
  assert.match(body, /--gr-radius:\s*0\.1875rem/);
  assert.match(body, /--gr-leading-base:\s*1\.3/);
});

test('журнальный стиль уменьшает кегль процентом, а не rem', () => {
  const body = blockBody(':root[data-gr-style="compact"], [data-gr-style="compact"]', STYLES);

  // Процент считается от кегля, выбранного пользователем в настройках
  // браузера, поэтому стиль складывается с этой настройкой, а не отменяет её.
  assert.match(body, /font-size:\s*93\.75%/);

  // Кегль контролов отдельно не уменьшается: вся шкала в rem, и он сжимается
  // вместе со страницей. Уменьшить его здесь значило бы умножить дважды.
  assert.match(body, /--gr-control-font-size:\s*1rem/);
});

test('журнальный стиль делит со строгим поверхности, но не линии', () => {
  const body = blockBody(':root[data-gr-style="compact"], [data-gr-style="compact"]', STYLES);

  // Поверхности общие: оба стиля уводят фон к краю шкалы.
  assert.match(body, /--gr-hsl-surface-1:\s*var\(--gr-hsl-surface-1-lifted\)/);

  // А линии свои и заметнее базовых: полоса в журнальной вёрстке — рабочий
  // инструмент разбивки. Возьми он бледные линии строгого, разница между
  // двумя стилями свелась бы к кеглю.
  assert.match(body, /--gr-hsl-border:\s*var\(--gr-hsl-border-press\)/);
  assert.ok(
    !/--gr-hsl-border:\s*var\(--gr-hsl-border-soft\)/.test(body),
    'журнальный взял бледные линии строгого — стили станут неразличимы',
  );
});

test('линии журнального стиля контрастнее и строгих, и базовых', () => {
  const light = blockBody(':root, [data-gr-theme="light"]', STYLES);

  const press = light.match(/--gr-hsl-border-press:\s*0,\s*0%,\s*(\d+)%/);
  const soft = light.match(/--gr-hsl-border-soft:\s*0,\s*0%,\s*(\d+)%/);

  assert.ok(press && soft, 'якоря линий не найдены');

  // Меньше светлота — темнее линия на светлой теме. База темы — 82 %.
  assert.ok(
    Number(press[1]) < Number(soft[1]),
    `журнальная линия (${press[1]}%) бледнее строгой (${soft[1]}%)`,
  );
  assert.ok(
    Number(press[1]) < 82,
    `журнальная линия (${press[1]}%) не темнее базовой (82%)`,
  );
});

test('журнальный стиль приглушает цвета, а не только линии', () => {
  const body = blockBody(':root[data-gr-style="compact"], [data-gr-style="compact"]', STYLES);

  assert.match(body, /--gr-hsl-accent:\s*var\(--gr-hsl-accent-press\)/);
  assert.match(body, /--gr-hsl-status-danger:\s*var\(--gr-hsl-status-danger-press\)/);
});

test('режим для слабовидящих возвращает журнальному стилю кегль', () => {
  const root = blockBody('[data-gr-a11y="low-vision"][data-gr-style="compact"]', STYLES);
  const island = blockBody('[data-gr-a11y="low-vision"] [data-gr-style="compact"]', STYLES);

  // На одном элементе стиль перебил масштаб режима — восстанавливаем целиком.
  assert.match(root, /font-size:\s*calc\(100% \* var\(--gr-a11y-scale/);

  // Внутри страницы в режиме масштаб уже применён предком и наследуется —
  // островку достаточно не сжимать его повторно.
  assert.match(island, /font-size:\s*100%/);
});

test('системный контраст не отменяет журнальную плотность', () => {
  const media = topLevelBlocks(STYLES).find(
    (b) => norm(b.prelude) === '@media (prefers-contrast: more)',
  );

  assert.ok(media, 'нет блока системного контраста');
  assert.ok(
    !media.body.includes('font-size'),
    '«больше контраста» не означает «увеличь шрифт» — это разные потребности',
  );
  assert.ok(
    !/--gr-density/.test(media.body),
    'системная настройка контраста разжала интерфейс, хотя её просили только про линии',
  );
});

test('скругление журнального стиля не обнулено', () => {
  const body = blockBody(':root[data-gr-style="compact"], [data-gr-style="compact"]', STYLES);

  assert.ok(!/--gr-radius:\s*0[;\s]/.test(body), 'скругление «по минимуму», но есть');
});

// --- Воздушный стиль ---------------------------------------------------------

test('воздушный стиль крупно скругляет и оживляет отклик', () => {
  const body = blockBody(':root[data-gr-style="airy"], [data-gr-style="airy"]', STYLES);

  assert.ok(body, 'блока воздушного стиля нет');
  assert.match(body, /--gr-radius:\s*1rem/);
  assert.match(body, /--gr-density:\s*1\.15/);
  assert.match(body, /--gr-transition:[^;]*cubic-bezier/);
});

test('пастельный акцент приходит со своими чернилами', () => {
  const body = blockBody(':root[data-gr-style="airy"], [data-gr-style="airy"]', STYLES);

  assert.match(body, /--gr-hsl-accent:\s*var\(--gr-hsl-accent-soft\)/);
  assert.match(body, /--gr-hsl-on-accent:\s*var\(--gr-hsl-on-accent-soft\)/);
});

test('якоря воздушного стиля объявлены для обеих тем', () => {
  const light = blockBody(':root, [data-gr-theme="light"]', STYLES);
  const dark = blockBody('[data-gr-theme="dark"]', STYLES);

  assert.match(light, /--gr-hsl-accent-soft:/);
  assert.match(dark, /--gr-hsl-accent-soft:/);
});

test('якоря стиля попадают в файл только вместе со своим стилем', () => {
  const onlyStrict = layerBody(compileStyles(['strict']), 'griffincss.style');

  assert.ok(!onlyStrict.includes('--gr-hsl-accent-soft'), 'якоря незаказанного стиля в файле');
  assert.ok(onlyStrict.includes('--gr-hsl-border-soft'), 'якоря заказанного стиля пропали');
});

test('режим для слабовидящих возвращает контраст поверх любого стиля', () => {
  const body = topLevelBlocks(STYLES)
    .filter((b) => {
      const p = norm(b.prelude);
      return p.includes('[data-gr-a11y=low-vision]') && p.includes('[data-gr-style]');
    })
    .map((b) => b.body)
    .join('\n');

  assert.ok(body, 'нет блока отмены для носителя оси');

  // Линии — то, ради чего правка и делалась: строгий и журнальный уводят
  // --gr-hsl-border к своим якорям, а слой оси старше слоя ядра, поэтому
  // контрастный режим оставался с линиями стиля.
  assert.match(body, /--gr-hsl-border:\s*var\(--gr-hsl-ink-mid\)/);
  assert.match(body, /--gr-hsl-border-strong:\s*var\(--gr-hsl-ink-max\)/);

  // И не только линии: поверхности, чернила и акцент тоже уходят к якорям
  // контраста, иначе «контрастно» зависело бы от выбранного оформления.
  assert.match(body, /--gr-hsl-surface-0:\s*var\(--gr-hsl-surface-max\)/);
  assert.match(body, /--gr-hsl-ink-0:\s*var\(--gr-hsl-ink-max\)/);
  assert.match(body, /--gr-hsl-accent:\s*var\(--gr-hsl-accent-max\)/);

  assert.ok(
    !/--gr-hsl-border:\s*var\(--gr-hsl-border-(soft|press)\)/.test(body),
    'в блоке отмены осталась линия стиля',
  );
});

test('отмена режима доступности возвращает и чернила на акценте', () => {
  // Воздушный стиль переводит --gr-hsl-on-accent на тёмный on-accent-soft.
  // Блок отмены включает тот же миксин контраста, что и ядро, поэтому
  // чернила обязаны вернуться вместе с акцентом: иначе на airy в режиме
  // для слабовидящих главная кнопка — тёмное по тёмному (1,9 : 1).
  const body = topLevelBlocks(STYLES)
    .filter((b) => {
      const p = norm(b.prelude);
      return p.includes('[data-gr-a11y=low-vision]') && p.includes('[data-gr-style]');
    })
    .map((b) => b.body)
    .join('\n');

  assert.match(
    body,
    /--gr-hsl-on-accent:\s*var\(--gr-hsl-surface-max\)/,
    'отмена вернула акцент, но оставила чернила стиля — пара разъедется',
  );
});

test('отмена режима доступности не привязана к корню документа', () => {
  // Оба атрибута могут стоять на обычной секции. Привяжи отмену к :root —
  // и контрастный островок остался бы с линиями стиля, а журнальный
  // островок в режиме — со своим уменьшенным кеглем.
  const anchored = topLevelBlocks(STYLES)
    .map((b) => norm(b.prelude))
    .filter((p) => p.includes(':root[data-gr-a11y=low-vision]'));

  assert.deepEqual(anchored, [], `отмена привязана к корню: ${anchored.join(' | ')}`);
});

test('воздушный стиль подмешивает оттенок и в линии, а не только в поверхности', () => {
  const body = blockBody(':root[data-gr-style="airy"], [data-gr-style="airy"]', STYLES);

  assert.match(body, /--gr-hsl-border:\s*var\(--gr-hsl-border-tinted\)/);
  assert.match(body, /--gr-hsl-border-strong:\s*var\(--gr-hsl-border-strong-tinted\)/);
});

test('подмес в линиях слабее, чем механическая подстановка насыщенности поверхностей', () => {
  const light = blockBody(':root, [data-gr-theme="light"]', STYLES);

  const read = (name) => {
    const m = light.match(new RegExp(`--gr-hsl-${name}:\\s*(\\d+),\\s*(\\d+)%,\\s*(\\d+)%`));
    assert.ok(m, `якорь --gr-hsl-${name} не найден`);
    return { h: +m[1], s: +m[2], l: +m[3] };
  };

  // Воспринимаемая цветность ≈ S × (1 − |2L − 1|): одна и та же насыщенность
  // видна тем сильнее, чем ближе светлота к середине шкалы.
  const chroma = ({ s, l }) => (s / 100) * (1 - Math.abs((2 * l) / 100 - 1));

  const surface = read('surface-2-tinted');
  const border = read('border-tinted');
  const strong = read('border-strong-tinted');

  // Оттенок общий — иначе линия и фон принадлежали бы разным семьям.
  assert.equal(border.h, surface.h, 'у линии другой оттенок, чем у поверхности');
  assert.equal(strong.h, surface.h, 'у сильной линии другой оттенок');

  // Насыщенность у линий обязана быть ниже: при их светлоте та же цифра
  // дала бы втрое и вшестнадцатеро более цветной результат.
  assert.ok(border.s < surface.s, `линия насыщеннее поверхности: ${border.s}% ≥ ${surface.s}%`);
  assert.ok(strong.s < border.s, `сильная линия насыщеннее слабой: ${strong.s}% ≥ ${border.s}%`);

  // И итоговая цветность держится в том же порядке величины, что у фона:
  // тема остаётся нейтральной, а не становится синей.
  assert.ok(
    chroma(border) < chroma(surface) * 2.5,
    `линия слишком цветная: ${chroma(border).toFixed(3)} против ${chroma(surface).toFixed(3)} у фона`,
  );
  assert.ok(
    chroma(strong) < chroma(surface) * 2.5,
    `сильная линия слишком цветная: ${chroma(strong).toFixed(3)}`,
  );
});

test('воздушный стиль подмешивает оттенок и в утопленную поверхность', () => {
  const body = blockBody(':root[data-gr-style="airy"], [data-gr-style="airy"]', STYLES);

  assert.match(body, /--gr-hsl-surface-sunken:\s*var\(--gr-hsl-surface-sunken-tinted\)/);
});

test('подмес не меняет порядок ступеней поверхностей в обеих темах', () => {
  const read = (css, name) => {
    const m = css.match(new RegExp(`--gr-hsl-${name}:\\s*\\d+,\\s*\\d+%,\\s*(\\d+)%`));
    assert.ok(m, `якорь --gr-hsl-${name} не найден`);
    return +m[1];
  };

  // Светлая тема: surface-1 (96 %) → sunken (92 %) → surface-2 (89 %).
  // Подкрашенные ступени обязаны идти так же, иначе утопленная поверхность
  // окажется выше приподнятой и они поменяются ролями.
  const light = blockBody(':root, [data-gr-theme="light"]', STYLES);
  const lOne = read(light, 'surface-1-tinted');
  const lSunken = read(light, 'surface-sunken-tinted');
  const lTwo = read(light, 'surface-2-tinted');
  const lOverlay = read(light, 'surface-overlay-tinted');

  assert.ok(lOne > lSunken, `surface-1 (${lOne}%) не светлее утопленной (${lSunken}%)`);
  assert.ok(lSunken > lTwo, `утопленная (${lSunken}%) не светлее приподнятой (${lTwo}%)`);
  assert.ok(lOverlay > lOne, `всплывающая (${lOverlay}%) не выше карточки (${lOne}%)`);

  // Тёмная тема зеркальна: ступени растут вверх от фона, а утопленная уходит
  // ПОД него. Здесь эта проверка и понадобилась — первая редакция дала
  // утопленной ту же светлоту, что у фона страницы, и она перестала быть
  // утопленной.
  const dark = blockBody('[data-gr-theme="dark"]', STYLES);
  const dZero = read(dark, 'surface-0-tinted');
  const dOne = read(dark, 'surface-1-tinted');
  const dSunken = read(dark, 'surface-sunken-tinted');
  const dTwo = read(dark, 'surface-2-tinted');

  assert.ok(dSunken < dZero, `утопленная (${dSunken}%) не ниже фона страницы (${dZero}%)`);
  assert.ok(dOne > dZero, `карточка (${dOne}%) не выше фона (${dZero}%)`);
  assert.ok(dTwo > dOne, `приподнятая (${dTwo}%) не выше карточки (${dOne}%)`);
});

test('всплывающая поверхность тоже подмешана — иначе меню белый лист на цветной странице', () => {
  const body = blockBody(':root[data-gr-style="airy"], [data-gr-style="airy"]', STYLES);

  assert.match(body, /--gr-hsl-surface-overlay:\s*var\(--gr-hsl-surface-overlay-tinted\)/);
});

test('в воздушном стиле не осталось нейтральных поверхностей и линий', () => {
  const body = blockBody(':root[data-gr-style="airy"], [data-gr-style="airy"]', STYLES);

  // Каждая поверхность и каждая линия обязаны ссылаться на подкрашенный
  // якорь. Пропущенная ступень возвращает ровно тот дефект, ради которого
  // подмес и делался: серая деталь посреди подкрашенных соседей.
  for (const token of [
    'surface-0', 'surface-1', 'surface-2', 'surface-sunken', 'surface-overlay',
    'border', 'border-strong',
  ]) {
    assert.match(
      body,
      new RegExp(`--gr-hsl-${token}:\\s*var\\(--gr-hsl-`),
      `${token} остался нейтральным`,
    );
  }
});

// --- Таблица «Что стиль переводит в палитре» ----------------------------------
//
// docs/style-presets.html перечисляет руками, какой HSL-токен каждый стиль
// переводит и на какой якорь. Написанная руками таблица разошлась бы с кодом
// на первой же правке миксина — поэтому здесь она сверяется с собранным
// файлом оси в обе стороны: токен без строки и строка без токена одинаково
// роняют сборку. Генератора ради одной таблицы нет намеренно.

const fs = require('node:fs');

const STYLE_NAMES = ['airy', 'strict', 'compact'];

// Из сборки: стиль → (токен → якорь), только HSL-триплеты.
function paletteFromCss() {
  const out = new Map();

  for (const style of STYLE_NAMES) {
    const body = blockBody(`:root[data-gr-style="${style}"], [data-gr-style="${style}"]`, STYLES);

    assert.ok(body, `блока стиля ${style} нет`);

    for (const [, token, anchor] of body.matchAll(/(--gr-hsl-[\w-]+):\s*var\(--gr-hsl-([\w-]+)\)/g)) {
      if (!out.has(token)) out.set(token, {});

      out.get(token)[style] = anchor;
    }
  }

  return out;
}

// Из документации: та же карта, по строкам таблицы #style-palette.
function paletteFromDocs() {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'style-presets.html'), 'utf8');
  const table = html.match(/<table id="style-palette">([\s\S]*?)<\/table>/);

  assert.ok(table, 'в docs/style-presets.html нет таблицы #style-palette');

  const out = new Map();
  const cell = (text) => text.match(/<code>([\w-]+)<\/code>/)?.[1] ?? null;

  for (const [, row] of table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => m[1]);

    if (cells.length !== 4) continue;

    const token = cell(cells[0]);
    const entry = {};

    STYLE_NAMES.forEach((style, i) => {
      const anchor = cell(cells[i + 1]);

      if (anchor) entry[style] = anchor;
    });

    out.set(token, entry);
  }

  return out;
}

test('таблица «что стиль переводит в палитре» совпадает с миксинами gr-style-*', () => {
  const fromCss = paletteFromCss();
  const fromDocs = paletteFromDocs();

  assert.ok(fromCss.size >= 20, `в сборке оси нашлось всего ${fromCss.size} переведённых токенов`);

  const missing = [...fromCss.keys()].filter((token) => !fromDocs.has(token));
  const stale = [...fromDocs.keys()].filter((token) => !fromCss.has(token));

  assert.deepEqual(missing, [], `стиль переводит, а таблица не называет: ${missing.join(', ')}`);
  assert.deepEqual(stale, [], `таблица называет, а стиль не переводит: ${stale.join(', ')}`);

  for (const [token, byStyle] of fromCss) {
    assert.deepEqual(
      fromDocs.get(token),
      byStyle,
      `${token}: таблица говорит ${JSON.stringify(fromDocs.get(token))}, сборка — ${JSON.stringify(byStyle)}`,
    );
  }
});
