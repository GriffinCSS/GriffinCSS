'use strict';

// Экспорт токенов (Этап 34). Проверяется не «файл получился», а три вещи,
// каждая из которых ломается молча:
//
//   1. полнота — переменная :root без токена уезжает в никуда, и дизайнер
//      узнаёт об этом, когда её не окажется в Figma;
//   2. разложение по типам — цвет, размер и тень обязаны приехать типами
//      DTCG, иначе плагин Variables примет их за строки и создаст текстовые
//      переменные вместо цветовых;
//   3. три оси темы ложатся в плоский формат — это риск 3 плана, и он
//      проверяется здесь, ДО того как файл попадёт в пакет.
//
// Отдельно проверяется граница: в экспорте нет ни одного класса. Это экспорт
// переменных, а не библиотека компонентов, и путать их нельзя ни в файле,
// ни в тексте.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

let tokens;
let built;
let css;

test.before(async () => {
  tokens = await import('../build-tokens.mjs');
  built = tokens.tokensContent(root);
  css = fs.readFileSync(path.join(root, tokens.SOURCE), 'utf8');
});

const sets = () => JSON.parse(built);

test('каждая переменная :root собранного ядра присутствует в экспорте', () => {
  const declared = tokens.rootVariables(css);
  const json = sets();

  assert.ok(declared.size > 100, `переменных :root нашлось всего ${declared.size} — разбор сломан`);

  for (const [name, set] of tokens.SETS.map(({ name }) => [name, json[name]])) {
    const exported = new Set(Object.keys(set).filter((key) => !key.startsWith('$')));
    const missing = [...declared].filter((variable) => !exported.has(variable.replace(/^--gr-/, '')));

    assert.deepEqual(missing, [], `в наборе ${name} нет токенов для: ${missing.join(', ')}`);
  }
});

test('типы разложены: цвет, размер, тень', () => {
  const light = sets().light;

  assert.equal(light['color-bg'].$type, 'color');
  assert.match(light['color-bg'].$value, /^#[0-9a-f]{6}$/);

  assert.equal(light['radius'].$type, 'dimension');
  assert.equal(light['radius'].$value, '0.5rem');

  assert.equal(light['shadow-md'].$type, 'shadow');
  assert.ok(Array.isArray(light['shadow-md'].$value), 'тень из двух слоёв — массив');
  assert.equal(light['shadow-md'].$value[0].offsetY, '4px');
  assert.match(light['shadow-md'].$value[0].color, /^#[0-9a-f]{8}$/);

  assert.equal(light['z-modal'].$type, 'number');
  assert.equal(light['z-modal'].$value, 1100);

  assert.equal(light['font-sans'].$type, 'fontFamily');
  assert.deepEqual(light['font-sans'].$value, ['system-ui', '-apple-system', 'sans-serif']);
});

test('три оси темы дают три набора и различаются там, где обязаны', () => {
  const json = sets();

  assert.deepEqual(Object.keys(json).filter((key) => !key.startsWith('$')), ['light', 'dark', 'low-vision']);

  // Наборы одинаковы по составу: плоский формат не знает каскада, поэтому
  // «в тёмной теме этого токена нет» означало бы дырку, а не наследование.
  const keys = (name) => Object.keys(json[name]).filter((key) => !key.startsWith('$')).sort();

  assert.deepEqual(keys('dark'), keys('light'));
  assert.deepEqual(keys('low-vision'), keys('light'));

  // Фон страницы: светлая белая, тёмная почти чёрная.
  assert.equal(json.light['color-bg'].$value, '#ffffff');
  assert.notEqual(json.dark['color-bg'].$value, json.light['color-bg'].$value);

  // Режим для слабовидящих поднимает толщины и межстрочный интервал.
  assert.equal(json.light['border-width'].$value, '1px');
  assert.equal(json['low-vision']['border-width'].$value, '2px');
  assert.equal(json['low-vision']['leading-base'].$value, 1.7);

  // Тень в тёмной теме плотнее: множитель темы уже применён к альфа-каналу.
  assert.notEqual(json.dark['shadow-md'].$value[0].color, json.light['shadow-md'].$value[0].color);
});

test('перевод HSL в hex держится внутри разброса живых движков', () => {
  // Совпадения байт-в-байт со всеми тремя движками не бывает: на значениях,
  // попадающих ровно на половину младшего разряда, они расходятся друг
  // с другом на 1/255. Ниже — что реально вернул getComputedStyle
  // (Playwright 1.62, замер Этапа 34); экспорт обязан лежать между ними.
  const light = sets().light;

  // hsl(220, 80%, 50%): chromium и webkit — rgb(26, 93, 230), firefox — rgb(26, 94, 230)
  assert.equal(light['hsl-primary'].$value, '#1a5ee6');

  // hsl(0, 0%, 30%): chromium и firefox — 77, webkit — 76
  assert.equal(light['hsl-ink-mid'].$value, '#4d4d4d');

  // hsl(220, 100%, 35%): chromium и webkit — 59, firefox — 60
  assert.equal(light['hsl-accent-max'].$value, '#003cb3');

  // Здесь движки единодушны — расхождение означало бы ошибку, а не разброс.
  assert.equal(light['hsl-danger'].$value, '#e6271a');
  assert.equal(light['hsl-status-warning-surface'].$value, '#f59b14');
});

test('значения резолвнуты до конца: ни var(), ни calc() в выводе', () => {
  assert.doesNotMatch(built, /var\(--/);
  assert.doesNotMatch(built, /calc\(/);
});

test('адаптивный шаг зазора приезжает базовым значением, но второе значение названо', () => {
  // DTCG не знает медиазапросов. Экспортируется объявленная база — мобильная;
  // крупный шаг со средних экранов молчать не может: дизайнер разложил бы
  // макет рабочего стола по мобильной шкале и не узнал бы об этом ниоткуда.
  const { gap } = sets().light;

  assert.equal(gap.$value, '0.75rem');
  assert.match(gap.$description, /768px.*1rem/);

  // Условия, у которых есть свой набор, подписью не дублируются.
  assert.equal(sets().dark['color-bg'].$description, undefined);
});

test('в экспорте нет ни одного класса и ни одного компонента', () => {
  const json = sets();

  for (const { name } of tokens.SETS) {
    for (const key of Object.keys(json[name])) {
      assert.doesNotMatch(key, /^[.$]?gr-|^\./, `ключ ${key} похож на класс, а не на токен`);
    }
  }

  assert.doesNotMatch(built, /\.gr-/);
});

test('версия спецификации записана в самом файле', () => {
  const meta = sets().$extensions['ru.griffincss'];

  assert.equal(meta.format, 'DTCG');
  assert.ok(meta.spec.length > 0, 'редакция спецификации не названа');
  assert.equal(meta.source, tokens.SOURCE);
});

test('файл в dist не отстал от собранного CSS', () => {
  assert.equal(fs.readFileSync(path.join(root, tokens.TOKENS), 'utf8'), built);
});

test('переменная без токена роняет генерацию, а не уезжает молча', () => {
  // Объявлена только внутри медиазапроса: значения оттуда в плоский набор
  // не берутся, поэтому токена у неё не будет. Генерация обязана упасть
  // и назвать переменную, а не отдать файл с дыркой.
  const broken = `${css}@media print{:root{--gr-only-in-media:1px}}`;

  assert.throws(() => tokens.buildTokens(broken), /--gr-only-in-media/);
});
