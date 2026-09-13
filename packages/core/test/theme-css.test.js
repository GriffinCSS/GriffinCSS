'use strict';

// Инварианты темы по скомпилированному SCSS: набор токенов в светлой
// и тёмной темах совпадает, темы объявлены без привязки к :root,
// системная настройка действует только при отсутствии явного выбора.

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileScss, topLevelBlocks, layerBody } = require('./helpers/css');

// Весь вывод пакета лежит внутри @layer griffincss.core — разворачиваем слой,
// чтобы разбирать блоки темы как верхнеуровневые.
const CSS = layerBody(compileScss("@use 'griffincss-core';"), 'griffincss.core');

// Sass снимает кавычки в атрибутных селекторах: [data-gr-theme="dark"]
// компилируется в [data-gr-theme=dark]. Сравниваем в этом виде, а в тестах
// пишем читаемую форму с кавычками.
const norm = (text) => text.replace(/\s+/g, ' ').replace(/"/g, '').trim();

// Тело блока по точному селектору верхнего уровня.
function blockBody(selector, css = CSS) {
  const found = topLevelBlocks(css).find((b) => norm(b.prelude) === norm(selector));
  return found ? found.body : '';
}

// Тело блока @media по его преамбуле.
function mediaBody(query) {
  const found = topLevelBlocks(CSS).find((b) => norm(b.prelude) === norm(query));
  return found ? norm(found.body) : '';
}

// Имена кастомных свойств, объявленных в теле блока.
function customProps(body) {
  return new Set([...body.matchAll(/(--gr-[\w-]+)\s*:/g)].map((m) => m[1]));
}

test('тёмная тема переопределяет ровно тот же набор токенов, что светлая', () => {
  const light = customProps(blockBody('[data-gr-theme="light"]'));
  const dark = customProps(blockBody('[data-gr-theme="dark"]'));

  assert.ok(light.size > 20, `светлая тема почти пуста: ${light.size} токенов`);

  const onlyLight = [...light].filter((name) => !dark.has(name));
  const onlyDark = [...dark].filter((name) => !light.has(name));

  assert.deepEqual(onlyLight, [], 'токены светлой темы без пары в тёмной');
  assert.deepEqual(onlyDark, [], 'токены тёмной темы без пары в светлой');
});

test('базовый :root содержит все токены светлой темы', () => {
  const light = customProps(blockBody('[data-gr-theme="light"]'));
  const root = customProps(blockBody(':root'));

  const missing = [...light].filter((name) => !root.has(name));

  assert.deepEqual(missing, [], 'светлая тема не является базой :root');
});

test('темы объявлены без привязки к :root — работают на вложенной секции', () => {
  assert.ok(blockBody('[data-gr-theme="dark"]'), 'нет блока [data-gr-theme="dark"]');
  assert.ok(blockBody('[data-gr-theme="light"]'), 'нет блока [data-gr-theme="light"]');
  assert.ok(
    !CSS.includes(':root[data-gr-theme="dark"]'),
    'тёмная тема привязана к корню — тёмная секция внутри светлой страницы не соберётся',
  );
});

test('обе темы объявляют color-scheme', () => {
  assert.match(blockBody('[data-gr-theme="light"]'), /color-scheme:\s*light/);
  assert.match(blockBody('[data-gr-theme="dark"]'), /color-scheme:\s*dark/);
});

test('системная тёмная тема действует только без явного выбора', () => {
  const body = mediaBody('@media (prefers-color-scheme: dark)');

  assert.ok(body, 'нет блока @media (prefers-color-scheme: dark)');
  assert.ok(body.includes(':root:not([data-gr-theme])'), body);
  assert.ok(body.includes('[data-gr-theme=auto]'), body);
});

test('резолвленные --gr-color-* объявлены один раз — но на каждом носителе темы', () => {
  const occurrences = [...CSS.matchAll(/--gr-color-bg\s*:/g)].length;

  assert.equal(occurrences, 1, 'семантический цвет продублирован — темы должны менять только шкалу');

  // var() внутри кастомного свойства подставляется на элементе, где свойство
  // объявлено, и вниз наследуется уже готовый цвет. Объявление только в :root
  // означало бы, что секция с data-gr-theme меняет триплеты, но остаётся
  // прежнего цвета — ровно тот дефект, который этот тест сторожит.
  const selector = topLevelBlocks(CSS)
    .map((b) => norm(b.prelude))
    .find((prelude) => prelude.includes('[data-gr-theme]'));

  assert.ok(selector, 'блок резолвленных цветов не покрывает носителей темы');
  assert.ok(selector.includes(':root'), selector);
  assert.ok(selector.includes('[data-gr-a11y]'), selector);
});

test('контраст достаёт вложенную секцию с собственной темой', () => {
  const nested = topLevelBlocks(CSS)
    .map((b) => norm(b.prelude))
    .some((prelude) => prelude.includes('[data-gr-a11y=low-vision] [data-gr-theme]'));

  assert.ok(nested, 'остров с data-gr-theme внутри режима потеряет усиление контраста');
});

test('масштаб кегля не применяется к вложенным носителям темы', () => {
  const scaled = topLevelBlocks(CSS)
    .filter((b) => b.body.includes('font-size'))
    .map((b) => norm(b.prelude))
    .filter((prelude) => prelude.includes('data-gr-a11y'));

  assert.deepEqual(
    scaled,
    ['[data-gr-a11y=low-vision]'],
    'масштаб обязан стоять ровно на носителе атрибута — иначе он умножится дважды',
  );
});

test('у бренда есть якорь: акцент и ссылки выводятся из --gr-hsl-accent-base', () => {
  // Рецепт бренда через :root { --gr-hsl-accent: … } вне слоёв выигрывал
  // у блока режима для слабовидящих внутри слоя при любой специфичности —
  // режим переставал переводить акцент на accent-max (полевой отчёт
  // по 0.23.1, Этап 40). Якорь -base даёт бренду точку входа в ряд с -max
  // и -soft: производные токены ссылаются на него через var(), и какую
  // пару взять — решает ось, а не пользовательское объявление.
  for (const selector of [':root', '[data-gr-theme="light"]', '[data-gr-theme="dark"]']) {
    const body = blockBody(selector);

    assert.match(body, /--gr-hsl-accent-base:\s*\d+,\s*\d+%,\s*\d+%/, `${selector}: нет якоря accent-base`);
    assert.match(body, /--gr-hsl-accent-base-hover:\s*\d+,\s*\d+%,\s*\d+%/, `${selector}: нет якоря accent-base-hover`);

    for (const [token, anchor] of [
      ['accent', 'accent-base'],
      ['accent-hover', 'accent-base-hover'],
      ['link', 'accent-base'],
      ['link-hover', 'accent-base-hover'],
    ]) {
      assert.match(
        body,
        new RegExp(`--gr-hsl-${token}:\\s*var\\(--gr-hsl-${anchor}\\)`),
        `${selector}: --gr-hsl-${token} не выводится из якоря ${anchor}`,
      );
    }
  }

  // Фокус к бренду не привязан: это сигнал платформы, а не фирменный цвет.
  assert.ok(
    !/--gr-hsl-focus:\s*var\(--gr-hsl-accent-base/.test(blockBody(':root')),
    'кольцо фокуса привязано к бренду',
  );
});

// Контраст живёт в групповом селекторе — вместе с вложенными носителями темы.
const contrastBody = topLevelBlocks(CSS)
  .filter((b) => norm(b.prelude).includes('[data-gr-a11y=low-vision]'))
  .map((b) => b.body)
  .join('\n');

test('контраст ссылается на якоря темы, а не на собственные значения', () => {
  const body = contrastBody;

  assert.ok(body, 'нет блока [data-gr-a11y="low-vision"]');
  assert.match(body, /--gr-hsl-ink-0:\s*var\(--gr-hsl-ink-max\)/);
  assert.match(body, /--gr-hsl-surface-0:\s*var\(--gr-hsl-surface-max\)/);
  assert.ok(
    !/--gr-hsl-ink-0:\s*\d/.test(body),
    'контраст задал абсолютное значение — поверх тёмной темы получится белое на белом',
  );
});

test('режим двигает пару «заливка + чернила» акцента целиком', () => {
  // Ось, двигающая одну краску пары, обязана двигать и вторую. Раньше
  // контраст переводил --gr-hsl-accent на accent-max, а чернила на нём
  // не трогал: поверх воздушного стиля, где --gr-hsl-on-accent уже уехал
  // на тёмный on-accent-soft, главная кнопка получалась тёмным по тёмному
  // (1,9 : 1 — полевой отчёт по 0.23.1, Этап 40). Чернила переезжают
  // на surface-max: в светлой теме это белое на тёмном accent-max,
  // в тёмной — чёрное на светлом, обе стороны сходятся без третьего якоря.
  assert.match(
    contrastBody,
    /--gr-hsl-on-accent:\s*var\(--gr-hsl-surface-max\)/,
    'контраст перевёл акцент, но не чернила на нём — поверх стиля пара разъедется',
  );
});

test('режим для слабовидящих увеличивает кегль и интерлиньяж', () => {
  assert.match(contrastBody, /--gr-border-width:\s*2px/);

  // Блоков с этим селектором два — токены типографики и масштаб кегля
  // приезжают из разных файлов темы (_theme-tokens.scss и _theme-rules.scss),
  // потому что едут в разные сборки. Здесь важна сумма.
  const typography = topLevelBlocks(CSS)
    .filter((b) => norm(b.prelude) === norm('[data-gr-a11y="low-vision"]'))
    .map((b) => b.body)
    .join('\n');

  assert.match(typography, /font-size:\s*calc\(100% \* var\(--gr-a11y-scale/);
  assert.match(typography, /--gr-leading-base:\s*1\.7/);
});

test('системный prefers-contrast поднимает контраст, но не кегль', () => {
  const body = mediaBody('@media (prefers-contrast: more)');

  assert.ok(body, 'нет блока @media (prefers-contrast: more)');
  assert.ok(body.includes(':root:not([data-gr-a11y])'), body);
  assert.ok(
    !body.includes('font-size'),
    '«больше контраста» не означает «увеличь шрифт» — это разные потребности',
  );
});

test('data-gr-a11y="off" отключает и системный контраст', () => {
  const body = mediaBody('@media (prefers-contrast: more)');

  assert.ok(
    body.includes(':root:not([data-gr-a11y])'),
    'селектор обязан отпускать элемент с любым явным значением, включая off',
  );
});

test('в режиме для слабовидящих ссылки подчёркнуты и фокус видим', () => {
  assert.ok(blockBody('[data-gr-a11y="low-vision"] a[href]'), 'ссылки не подчёркнуты');
  assert.ok(
    blockBody('[data-gr-a11y="low-vision"] :focus-visible'),
    'нет усиленного кольца фокуса',
  );
});

// Ресет — отдельная точка входа и отдельный слой.
const RESET = layerBody(compileScss("@use 'griffincss-reset';"), 'griffincss.reset');

test('ресет отдаёт body фон и текст темы — иначе переключатель не перекрашивает страницу', () => {
  const body = blockBody('body', RESET);

  assert.ok(body, 'блок body в ресете не найден');
  assert.match(body, /background-color:\s*var\(--gr-color-bg,\s*Canvas\)/);
  assert.match(body, /color:\s*var\(--gr-color-text,\s*CanvasText\)/);
  assert.match(body, /line-height:\s*var\(--gr-leading-base,\s*1\.5\)/);
});

test('ресет остаётся без собственных токенов', () => {
  assert.ok(!RESET.includes(':root'), 'ресет объявил :root — токены живут в _tokens.scss');
});
