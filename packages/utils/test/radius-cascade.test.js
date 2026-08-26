'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  setupDom,
  el,
  generatedCSS,
  loadUtilsRuntime,
  MockMutationObserver,
} = require('../../core/test/helpers/dom');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Наблюдатель, заведённый вызовом fn. Берём разницу, а не последний в
// списке: ядро в этом же окружении заводит свой наблюдатель парсинга,
// и тест обязан смотреть именно на наблюдатель утилит.
function observerFrom(fn) {
  const before = MockMutationObserver.instances.length;

  fn();

  const created = MockMutationObserver.instances.slice(before);

  assert.equal(created.length, 1, 'ожидался ровно один новый наблюдатель, а не ' + created.length);

  return created[0];
}

// Ставит документ, прогоняет ядро и каскад скруглений, возвращает
// сгенерированный CSS. Ядро нужно потому, что эмиттер и хеш живут в нём.
function setup(body) {
  const { doc, griffin } = setupDom(body);
  const utils = loadUtilsRuntime();

  griffin.init();
  utils.radiusCascade(doc);

  return { doc, utils, css: generatedCSS(doc) };
}

test('вложенный контейнер получает выражение, а не посчитанное число', () => {
  const inner = el('div', { class: 'gr-radius', style: '--gr-p: 8px' });
  const outer = el('div', { class: 'gr-radius gr-radius-12', style: '--gr-p: 12px' }, [inner]);
  const { css } = setup(el('body', {}, [outer]));

  assert.ok(
    css.includes('--gr-r:max(0px,calc(3rem - 12px))'),
    'арифметику обязан считать CSS, а не рантайм: ' + css.slice(0, 400),
  );
  assert.ok(!css.includes('36px'), 'рантайм не должен разрешать единицы сам');
});

test('третий уровень накапливает зазоры предков', () => {
  const l3 = el('div', { class: 'gr-radius', style: '--gr-p: 6px' });
  const l2 = el('div', { class: 'gr-radius', style: '--gr-p: 8px' }, [l3]);
  const l1 = el('div', { class: 'gr-radius gr-radius-12', style: '--gr-p: 12px' }, [l2]);
  const { css } = setup(el('body', {}, [l1]));

  assert.ok(css.includes('--gr-r:max(0px,calc(max(0px,calc(3rem - 12px)) - 8px))'), css.slice(0, 600));
});

test('явный радиус на вложенном контейнере рантайм не трогает', () => {
  const inner = el('div', { class: 'gr-radius gr-radius-6', style: '--gr-p: 8px' });
  const outer = el('div', { class: 'gr-radius gr-radius-12', style: '--gr-p: 12px' }, [inner]);

  setup(el('body', {}, [outer]));

  assert.ok(
    !inner.classList.items.some((c) => c.startsWith('gr-r-')),
    'явное значение сильнее выведенного',
  );
});

test('зазор из класса .gr-p-* читается наравне с инлайновым', () => {
  const inner = el('div', { class: 'gr-radius gr-p-2' });
  const outer = el('div', { class: 'gr-radius gr-radius-8 gr-p-4' }, [inner]);
  const { css } = setup(el('body', {}, [outer]));

  assert.ok(css.includes('--gr-r:max(0px,calc(2rem - 1rem))'), css.slice(0, 400));
});

test('одинаковая форма вложенности даёт один класс и одно правило', () => {
  const pair = () =>
    el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [
      el('div', { class: 'gr-radius' }),
    ]);
  const { css } = setup(el('body', {}, [pair(), pair()]));

  assert.equal(css.split('--gr-r:max(0px,calc(2rem - 8px))').length - 1, 1);
});

test('противоречие зазора и отступа даёт предупреждение', () => {
  const warnings = [];
  const original = console.warn;

  console.warn = (m) => warnings.push(m);

  try {
    setup(el('body', {}, [el('div', { class: 'gr-radius gr-radius-8 gr-p-4', style: '--gr-p: 16px' })]));
  } finally {
    console.warn = original;
  }

  assert.equal(warnings.length, 1, 'ожидалось ровно одно предупреждение');
  assert.match(warnings[0], /^Griffincss: /);
});

test('контейнер без вложенности рантайм не трогает вовсе', () => {
  const outer = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [el('span')]);
  const { css } = setup(el('body', {}, [outer]));

  assert.ok(!css.includes('--gr-r:max'), 'глубина 1 покрыта статическим CSS');
});

// === Поток и динамика ===

test('поток: вложенный контейнер получает радиус в момент появления', () => {
  const body = el('body');
  const script = el('script');
  const { doc } = setupDom(body, {}, { readyState: 'loading', script });
  const utils = loadUtilsRuntime();
  const observer = observerFrom(() => utils._autoStart());

  const outer = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' });

  body.appendChild(outer);
  observer.fireAdded([outer]);

  const inner = el('div', { class: 'gr-radius' });

  outer.appendChild(inner);
  observer.fireAdded([inner]);

  assert.match(inner.className, /gr-r-/, 'класс навешен до DOMContentLoaded');
  assert.ok(generatedCSS(doc).includes('--gr-r:max(0px,calc(2rem - 8px))'), generatedCSS(doc));
});

test('поток: наблюдатель парсинга отключается на DOMContentLoaded', () => {
  const body = el('body');
  const script = el('script');
  const { doc } = setupDom(body, {}, { readyState: 'loading', script });
  const utils = loadUtilsRuntime();
  const observer = observerFrom(() => utils._autoStart());

  doc.fire('DOMContentLoaded');

  assert.ok(observer.disconnected, 'наблюдатель парсинга живёт только до конца разбора');
});

test('поток отключается data-stream="false"', () => {
  const body = el('body');
  const script = el('script', { 'data-stream': 'false' });
  const { doc } = setupDom(body, {}, { readyState: 'loading', script });
  const utils = loadUtilsRuntime();
  const before = MockMutationObserver.instances.length;

  utils._autoStart();

  assert.equal(
    MockMutationObserver.instances.length,
    before,
    'наблюдатель парсинга не заводился',
  );

  const outer = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [
    el('div', { class: 'gr-radius' }),
  ]);

  body.appendChild(outer);
  doc.fire('DOMContentLoaded');

  assert.ok(generatedCSS(doc).includes('--gr-r:max(0px,calc(2rem - 8px))'), 'финальный проход всё равно был');
});

test('observe достраивает поддерево, вставленное после загрузки', async () => {
  const root = el('div');
  const { doc } = setupDom(el('body', {}, [root]));
  const utils = loadUtilsRuntime();
  const observer = observerFrom(() => utils.observe(root));

  const outer = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [
    el('div', { class: 'gr-radius' }),
  ]);

  root.appendChild(outer);
  observer.fireAdded([outer]);

  await sleep(60);

  assert.ok(generatedCSS(doc).includes('--gr-r:max(0px,calc(2rem - 8px))'), generatedCSS(doc));
});

test('серия вставок даёт одну перерисовку', async () => {
  const root = el('div');
  const { doc } = setupDom(el('body', {}, [root]));
  const utils = loadUtilsRuntime();
  const observer = observerFrom(() => utils.observe(root));

  for (let i = 0; i < 5; i += 1) {
    const added = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [
      el('div', { class: 'gr-radius' }),
    ]);

    root.appendChild(added);
    observer.fireAdded([added]);
  }

  await sleep(60);

  const css = generatedCSS(doc);

  assert.equal(css.split('--gr-r:max(0px,calc(2rem - 8px))').length - 1, 1, 'правило одно на все пять');
  assert.equal(root.children.filter((c) => c.children[0].className.includes('gr-r-')).length, 5);
});

test('stop снимает наблюдение', async () => {
  const root = el('div');
  const { doc } = setupDom(el('body', {}, [root]));
  const utils = loadUtilsRuntime();
  const observer = observerFrom(() => utils.observe(root));

  utils.stop();

  assert.ok(observer.disconnected, 'наблюдатель отключён');

  const added = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [
    el('div', { class: 'gr-radius' }),
  ]);

  root.appendChild(added);
  observer.fireAdded([added]);

  await sleep(60);

  assert.ok(!generatedCSS(doc).includes('--gr-r:max'), 'после stop рантайм молчит');
});

test('перенос поддерева к другому предку снимает прежний класс', () => {
  const inner = el('div', { class: 'gr-radius' });
  const from = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [inner]);
  const to = el('div', { class: 'gr-radius gr-radius-12', style: '--gr-p: 12px' });
  const { doc, utils } = setup(el('body', {}, [from, to]));

  const derived = (node) => node.classList.items.filter((c) => /^gr-r-/.test(c));

  assert.equal(derived(inner).length, 1, 'до переноса — один выведенный класс');

  inner.remove();
  to.appendChild(inner);
  utils.radiusCascade(doc);

  assert.equal(derived(inner).length, 1, 'после переноса — тоже один: ' + derived(inner).join(' '));
  assert.ok(
    generatedCSS(doc).includes('--gr-r:max(0px,calc(3rem - 12px))'),
    'радиус пересчитан от нового предка',
  );
});

test('явный радиус, появившийся позже, снимает выведенный класс', () => {
  const inner = el('div', { class: 'gr-radius' });
  const outer = el('div', { class: 'gr-radius gr-radius-8', style: '--gr-p: 8px' }, [inner]);
  const { doc, utils } = setup(el('body', {}, [outer]));

  assert.match(inner.className, /gr-r-/);

  inner.classList.add('gr-radius-6');
  utils.radiusCascade(doc);

  assert.ok(
    !inner.classList.items.some((c) => /^gr-r-/.test(c)),
    'выведенное значение уступает появившемуся явному: ' + inner.className,
  );
});

test('повторный проход не повторяет предупреждение', () => {
  const warnings = [];
  const original = console.warn;

  console.warn = (m) => warnings.push(m);

  try {
    const { doc, utils } = setup(
      el('body', {}, [el('div', { class: 'gr-radius gr-radius-8 gr-p-4', style: '--gr-p: 16px' })]),
    );

    utils.radiusCascade(doc);
    utils.radiusCascade(doc);
  } finally {
    console.warn = original;
  }

  assert.equal(warnings.length, 1, 'предупреждение об одном и том же — один раз: ' + warnings.length);
});
