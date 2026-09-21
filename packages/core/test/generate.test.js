'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupDom, el, cssSection, generatedCSS } = require('./helpers/dom');
const { normalizeCss, compileScss, layerBody } = require('./helpers/css');

// Генерирует CSS рантайма для одного контейнера и подставляет
// вместо хеш-класса имя `gr-l-hero` — чтобы сравнивать с миксином.
function runtimeCSS(attrs) {
  const container = el('div', attrs);
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  const cls = container.classList.items.filter((c) => c.startsWith('gr-l-'))[0];
  const layouts = cssSection(doc, 'Grid Layouts');
  const areas = cssSection(doc, 'Grid Areas');

  assert.ok(cls, 'контейнер получил класс раскладки');

  return (layouts + '\n' + areas).split(cls).join('gr-l-hero');
}

// Сравнение идёт с секциями рантайма, вырезанными изнутри слоя,
// поэтому миксин здесь вызывается без обёртки. Саму обёртку проверяет
// отдельный тест ниже.
function mixinCSS(call) {
  return compileScss("@use 'layout-mixins' as gr with ($gr-default-layer: false);\n" + call);
}

test('CSS одной раскладки соответствует эталону', () => {
  const expected = `
    .gr-l-hero {
      display: grid;
      grid-template-areas: "a a b b";
      grid-template-columns: var(--gr-l-cols, repeat(4, minmax(0, 1fr)));
      grid-template-rows: var(--gr-l-rows, repeat(1, auto));
    }
    .gr-l-hero > [class*="gr-area-"]:not(.gr-area-a):not(.gr-area-b) {
      display: none;
    }
    .gr-area-a { grid-area: a; }
    .gr-area-b { grid-area: b; }
  `;

  assert.equal(normalizeCss(runtimeCSS({ 'data-gr-layout': 'a2b2' })), normalizeCss(expected));
});

test('ряды разной длины паддятся точками', () => {
  const css = normalizeCss(runtimeCSS({ 'data-gr-layout': 'a2-b1' }));

  assert.ok(css.includes('grid-template-areas:"a a" "b ."'), css);
  assert.ok(css.includes('grid-template-columns:var(--gr-l-cols,repeat(2,minmax(0,1fr)))'), css);
  assert.ok(css.includes('grid-template-rows:var(--gr-l-rows,repeat(2,auto))'), css);
});

// Дефект ⑥: диапазоны строились арифметикой `-1px`, поэтому ломались
// на не-px единицах и оставляли щель на дробных ширинах.
test('медиа-диапазоны записаны range-синтаксисом без вычитания пикселя', () => {
  const css = normalizeCss(
    runtimeCSS({ 'data-gr-layout': 'a2b2', 'data-gr-layout-md': 'a1b3' }),
  );

  assert.ok(css.includes('@media (width<768px)'), css);
  assert.ok(css.includes('@media (width>=768px)'), css);
  assert.ok(!css.includes('767'), 'вычитание пикселя убрано');
  assert.ok(!css.includes('max-width'), 'префиксный синтаксис не используется');
});

test('три диапазона не пересекаются и не оставляют щелей', () => {
  const css = normalizeCss(
    runtimeCSS({
      'data-gr-layout': 'a1',
      'data-gr-layout-md': 'a1b1',
      'data-gr-layout-lg': 'a1b1c1',
    }),
  );

  assert.ok(css.includes('@media (width<768px)'), css);
  assert.ok(css.includes('@media (768px<=width<1024px)'), css);
  assert.ok(css.includes('@media (width>=1024px)'), css);
});

test('брейкпоинты в rem не ломают диапазоны', () => {
  const container = el('div', { 'data-gr-layout': 'a1', 'data-gr-layout-md': 'a1b1' });
  const { doc, griffin } = setupDom(el('body', {}, [container]), { '--gr-bp-md': '48rem' });

  griffin.init();

  const css = normalizeCss(cssSection(doc, 'Grid Layouts'));

  assert.ok(css.includes('@media (width<48rem)'), css);
  assert.ok(css.includes('@media (width>=48rem)'), css);
});

test('раскладка без базового варианта начинается со своего брейкпоинта', () => {
  const css = normalizeCss(runtimeCSS({ 'data-gr-layout-md': 'a1b1' }));

  assert.ok(css.includes('@media (width>=768px)'), css);
  assert.ok(!css.includes('width<768px'), css);
});

// 37b: ширины треков задаются в CSS, а не строкой раскладки. Строка
// остаётся про области — это её единственный довод; треки описывает
// свойство, которое видно в DevTools. Дорожки проверяются обе: правка
// одной из них развела бы `data-gr-layout` и `gr-grid-layout()`.
test('треки раскладки читаются из --gr-l-cols и --gr-l-rows', () => {
  const runtime = normalizeCss(runtimeCSS({ 'data-gr-layout': 'a2b2' }));
  const mixin = normalizeCss(mixinCSS("@include gr.gr-grid-layout('a2b2', $name: 'hero');"));

  for (const css of [runtime, mixin]) {
    assert.ok(css.includes('grid-template-columns:var(--gr-l-cols,repeat(4,minmax(0,1fr)))'), css);
    assert.ok(css.includes('grid-template-rows:var(--gr-l-rows,repeat(1,auto))'), css);
  }
});

// Дефект ⑤: компилтайм-миксин и рантайм должны давать один и тот же CSS.
test('миксин gr-grid-layout повторяет вывод рантайма: одна раскладка', () => {
  assert.equal(
    normalizeCss(runtimeCSS({ 'data-gr-layout': 'a2b2' })),
    normalizeCss(mixinCSS("@include gr.gr-grid-layout('a2b2', $name: 'hero');")),
  );
});

test('миксин gr-grid-layout повторяет вывод рантайма: адаптивный набор', () => {
  assert.equal(
    normalizeCss(runtimeCSS({ 'data-gr-layout': 'a2b2', 'data-gr-layout-md': 'a1b3' })),
    normalizeCss(mixinCSS("@include gr.gr-grid-layout('a2b2', $md: 'a1b3', $name: 'hero');")),
  );
});

test('миксин gr-grid-layout повторяет вывод рантайма: четыре диапазона', () => {
  assert.equal(
    normalizeCss(
      runtimeCSS({
        'data-gr-layout': 'a1',
        'data-gr-layout-sm': 'a1b1',
        'data-gr-layout-md': 'a2b1',
        'data-gr-layout-xl': 'a2b2-c4',
      }),
    ),
    normalizeCss(
      mixinCSS(
        "@include gr.gr-grid-layout('a1', $sm: 'a1b1', $md: 'a2b1', $xl: 'a2b2-c4', $name: 'hero');",
      ),
    ),
  );
});

test('миксин gr-grid-layout повторяет вывод рантайма: без базовой раскладки', () => {
  assert.equal(
    normalizeCss(runtimeCSS({ 'data-gr-layout-md': 'a1b1' })),
    normalizeCss(mixinCSS("@include gr.gr-grid-layout($md: 'a1b1', $name: 'hero');")),
  );
});

test('миксин требует имя раскладки', () => {
  assert.throws(() => mixinCSS("@include gr.gr-grid-layout('a2b2');"), /name/i);
});

test('миксин отвергает невалидную раскладку', () => {
  assert.throws(() => mixinCSS("@include gr.gr-grid-layout('a0b2', $name: 'hero');"), /Griffincss/);
  assert.throws(() => mixinCSS("@include gr.gr-grid-layout('3a', $name: 'hero');"), /Griffincss/);
});

// Этап 14: контейнерные раскладки. Требование то же, что и к оконным, —
// побайтовое совпадение миксина с рантаймом. Расхождение здесь означало бы
// две реализации одного формата, а не две записи одной.
test('миксин повторяет вывод рантайма: только контейнерная раскладка', () => {
  assert.equal(
    normalizeCss(runtimeCSS({ 'data-gr-layout-cmd': 'a1b1' })),
    normalizeCss(mixinCSS("@include gr.gr-grid-layout($cmd: 'a1b1', $name: 'hero');")),
  );
});

test('миксин повторяет вывод рантайма: база и контейнерная цепочка', () => {
  assert.equal(
    normalizeCss(
      runtimeCSS({
        'data-gr-layout': 'a1',
        'data-gr-layout-cmd': 'a1b1',
        'data-gr-layout-clg': 'a1b1c1',
      }),
    ),
    normalizeCss(
      mixinCSS("@include gr.gr-grid-layout('a1', $cmd: 'a1b1', $clg: 'a1b1c1', $name: 'hero');"),
    ),
  );
});

test('миксин повторяет вывод рантайма: оконная и контейнерная цепочки вместе', () => {
  assert.equal(
    normalizeCss(
      runtimeCSS({
        'data-gr-layout': 'a1',
        'data-gr-layout-md': 'a1b1',
        'data-gr-layout-cmd': 'a2b1',
        'data-gr-layout-cxl': 'a2b2-c4',
      }),
    ),
    normalizeCss(
      mixinCSS(
        "@include gr.gr-grid-layout('a1', $md: 'a1b1', $cmd: 'a2b1', $cxl: 'a2b2-c4', $name: 'hero');",
      ),
    ),
  );
});

test('миксин повторяет вывод рантайма: все четыре контейнерных диапазона', () => {
  assert.equal(
    normalizeCss(
      runtimeCSS({
        'data-gr-layout': 'a1',
        'data-gr-layout-csm': 'a1b1',
        'data-gr-layout-cmd': 'a2b1',
        'data-gr-layout-clg': 'a2b2',
        'data-gr-layout-cxl': 'a2b2-c4',
      }),
    ),
    normalizeCss(
      mixinCSS(
        "@include gr.gr-grid-layout('a1', $csm: 'a1b1', $cmd: 'a2b1', $clg: 'a2b2',"
        + " $cxl: 'a2b2-c4', $name: 'hero');",
      ),
    ),
  );
});

test('миксин без единой раскладки — ошибка, контейнерные параметры считаются', () => {
  assert.throws(() => mixinCSS("@include gr.gr-grid-layout($name: 'hero');"), /got no layouts/);
  assert.doesNotThrow(() => mixinCSS("@include gr.gr-grid-layout($cxl: 'a1', $name: 'hero');"));
});

// Этап 3: каскадные слои. Рантайм и статика лежат в griffincss.core,
// поэтому пользовательский CSS вне слоёв выигрывает без !important.
test('рантайм объявляет порядок слоёв и держит весь вывод в griffincss.core', () => {
  const container = el('div', { 'data-gr-layout': 'a2b2', 'data-gr-layout-md': 'a1b3' });
  const { doc, griffin } = setupDom(el('body', {}, [container]));

  griffin.init();

  const css = generatedCSS(doc);

  assert.ok(
    css.startsWith('@layer griffincss.reset, griffincss.tokens, griffincss.core, griffincss.ui, griffincss.utils, griffincss.style, griffincss.hidden;'),
    'порядок слоёв объявлен первой строкой: ' + css.slice(0, 80),
  );

  const inside = layerBody(css, 'griffincss.core');

  assert.ok(inside.includes('.gr-l-'), 'правила раскладок внутри слоя');
  assert.ok(inside.includes('gr-ready'), 'FOUC-защита внутри слоя');

  const outside = css.replace('@layer griffincss.core {' + inside + '}', '');

  assert.ok(!outside.includes('{'), 'вне слоя не осталось ни одного правила: ' + outside);
});

test('миксин по умолчанию оборачивает вывод в тот же слой, что и рантайм', () => {
  const css = normalizeCss(compileScss(
    "@use 'layout-mixins' as gr;\n@include gr.gr-grid-layout('a2b2', $name: 'hero');",
  ));

  assert.ok(css.startsWith('@layer griffincss.core{'), css.slice(0, 60));
  assert.ok(css.endsWith('}'), css.slice(-60));
});

test('обёртку слоя можно отключить конфигурацией модуля', () => {
  const css = normalizeCss(mixinCSS("@include gr.gr-grid-layout('a2b2', $name: 'hero');"));

  assert.ok(!css.includes('@layer'), css.slice(0, 60));
});

// Этап 9: буфер на слой. Рантайм утилит выдаёт свои правила в
// griffincss.utils, а ядро остаётся единственным владельцем <style>.
test('эмиттер раскладывает правила по слоям и не дублирует их', () => {
  const { doc, griffin } = setupDom(el('body', {}, []));

  assert.equal(griffin._emit('griffincss.utils', 'k1', '.a{color:red}'), true);
  assert.equal(griffin._emit('griffincss.utils', 'k1', '.a{color:red}'), false, 'повтор по тому же ключу');
  griffin._flush();

  const css = generatedCSS(doc);

  assert.ok(css.includes('@layer griffincss.utils {'), css.slice(0, 300));
  assert.equal(css.split('.a{color:red}').length - 1, 1, 'правило выдано ровно один раз');
});
