#!/usr/bin/env node
// Griffincss — экспорт переменных темы в формате DTCG (Этап 34).
//
// Отдаёт дизайнеру ровно то, ради чего берут Figma-кит: переменные — цвета,
// отступы, кегли, скругления, тени. Самого кита у библиотеки нет и не будет:
// он требует постоянного сопровождения, а этот файл генерируется сборкой
// и потому разойтись с исходником не может — в отличие от размеров в README,
// которые расходились трижды до Этапа 27.
//
// Источник — СОБРАННЫЙ griffincss-core.css, а не SCSS. Тот же принцип,
// что у остальных проверок проекта: артефакт — истина, интерполированные
// исходники — нет.
//
// В экспорт входят только переменные :root. Классов, компонентов и раскладок
// здесь нет и быть не может: это экспорт токенов, а не библиотека.
//
// Оси темы — три плоских набора: light, dark, low-vision. Плоских, потому что
// DTCG не знает ни каскада, ни медиазапросов: значение в наборе одно, и оно
// резолвится до конца — ни var(), ни calc() в вывод не попадает. Имя токена
// повторяет имя переменной без префикса, поэтому обратный путь всегда виден:
// токен «color-bg» — это --gr-color-bg.
//
// Ось оформления (data-gr-style) сюда не входит: она opt-in, а её сдвиги —
// ручки геометрии и часть палитры на якорях стиля — на две темы дали бы
// шесть наборов. Что стиль переводит, названо таблицей в docs/style-presets.html.
//
// Свежесть файла сторожит check-dist: он генерирует ожидаемое содержимое
// этой же функцией и сравнивает байт-в-байт.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE = 'packages/core/dist/griffincss-core.css';
export const TOKENS = 'packages/core/dist/design-tokens.json';

// Носители осей в собранном файле — точные строки селекторов минифицированного
// вывода. Разошлись с CSS — генератор падает и называет пропавший блок;
// молча собрать набор из половины темы он не может.
const BASE = ':root';
const SEMANTIC = ':root,[data-gr-theme],[data-gr-a11y]';
const DARK = '[data-gr-theme=dark]';
const A11Y_TYPOGRAPHY = '[data-gr-a11y=low-vision]';
const A11Y_CONTRAST = '[data-gr-a11y=low-vision],[data-gr-a11y=low-vision] [data-gr-theme]';

// Порядок слоёв в наборе — порядок каскада: база, переопределение оси,
// резолвленные семантические цвета последними, потому что они читают триплеты.
export const SETS = [
  {
    name: 'light',
    layers: [BASE, SEMANTIC],
    description: 'Светлая тема — база библиотеки. Соответствует <html> без атрибутов и <html data-gr-theme="light">.',
  },
  {
    name: 'dark',
    layers: [BASE, DARK, SEMANTIC],
    description: 'Тёмная тема. Соответствует <html data-gr-theme="dark">; та же тема приезжает по prefers-color-scheme.',
  },
  {
    name: 'low-vision',
    layers: [BASE, A11Y_TYPOGRAPHY, A11Y_CONTRAST, SEMANTIC],
    description: 'Режим для слабовидящих поверх светлой темы: <html data-gr-a11y="low-vision">. '
      + 'Ось независима от цветовой, поэтому «тёмная + для слабовидящих» собирается из dark и правил контраста.',
  },
];

// Редакция спецификации записана в файле сознательно: черновик DTCG ещё
// двигается, и через год по одному слову «DTCG» будет не понять, в каком
// диалекте записаны значения. Названы обе стороны — документ и форма записи.
const SPEC = {
  format: 'DTCG',
  spec: "Design Tokens Format Module, editors' draft",
  url: 'https://tr.designtokens.org/format/',
  dialect: 'значения строками: цвет — hex (#rrggbb или #rrggbbaa), размер — длина CSS (0.5rem, 16px)',
};

// --- разбор CSS -------------------------------------------------------------

// Объявления одного блока: только пользовательские свойства, значение — как есть.
// Точка с запятой внутри скобок и кавычек не разделяет: hsl(0, 0%, 0%) и
// содержимое --gr-rating-symbol обязаны доехать целиком.
function declarations(body) {
  const out = [];
  let depth = 0;
  let quote = '';
  let current = '';

  const push = () => {
    const text = current.trim();
    current = '';

    if (!text.startsWith('--')) return;

    const colon = text.indexOf(':');

    if (colon === -1) return;

    out.push([text.slice(0, colon).trim(), text.slice(colon + 1).trim()]);
  };

  for (const character of body) {
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }

    if (character === '"' || character === "'") quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ';' && depth === 0) {
      push();
      continue;
    }

    current += character;
  }

  push();

  return out;
}

// Обход правил собранного файла. Возвращает каждое правило вместе с условиями
// действующих над ним @-правил: @layer условием не считается — им обёрнут весь
// файл, а @media, @container и @supports считаются.
//
// Условия нужны в обе стороны. Значения набора берутся только из безусловных
// блоков: плоский формат не выражает «при такой-то ширине». Но и молчать
// о том, что у переменной есть второе значение, нельзя — см. conditionalNotes.
function walk(css) {
  const blocks = [];
  const conditions = [];
  let index = 0;
  let head = '';

  while (index < css.length) {
    const character = css[index];

    if (character === ';') {
      head = '';
      index += 1;
      continue;
    }

    if (character === '}') {
      conditions.pop();
      head = '';
      index += 1;
      continue;
    }

    if (character !== '{') {
      head += character;
      index += 1;
      continue;
    }

    const selector = head.trim().split(/[;}]/).pop().trim();
    head = '';
    index += 1;

    if (selector.startsWith('@')) {
      conditions.push(selector.startsWith('@layer') ? null : selector);
      continue;
    }

    const end = css.indexOf('}', index);
    const body = css.slice(index, end === -1 ? css.length : end);

    blocks.push({ selector, declared: declarations(body), conditions: conditions.filter(Boolean) });
    index = end === -1 ? css.length : end + 1;
  }

  return blocks;
}

const onRoot = (selector) => selector.split(',').some((part) => part.trim().startsWith(':root'));

// Переменные, объявленные на :root в любом виде, включая условные блоки.
// Именно этот перечень обязан покрываться экспортом целиком.
export function rootVariables(css) {
  const names = new Set();

  for (const { selector, declared } of walk(css)) {
    if (!onRoot(selector)) continue;

    for (const [name] of declared) names.add(name);
  }

  return names;
}

// Условия, у которых в экспорте есть СВОЙ набор: их значения уже приехали
// отдельной осью, и подписывать их вторым значением незачем.
const COVERED = [/prefers-color-scheme/, /prefers-contrast/];

// Второе значение переменной, действующее при условии, которому набора
// не досталось: адаптивный шаг зазоров и гашение теней на печати.
//
// Дизайнер, взявший из экспорта 0,75rem, разложил бы макет рабочего стола
// по мобильной шкале и не узнал бы об этом ниоткуда. Плоский формат условия
// не выражает — значит, оно обязано быть сказано словами.
function conditionalNotes(css) {
  const notes = new Map();

  for (const { selector, declared, conditions } of walk(css)) {
    if (!onRoot(selector) || conditions.length === 0) continue;
    if (conditions.some((condition) => COVERED.some((pattern) => pattern.test(condition)))) continue;

    for (const [name, value] of declared) {
      notes.set(name, [...(notes.get(name) ?? []), [conditions.join(' '), value]]);
    }
  }

  return notes;
}

// --- резолвинг значений -----------------------------------------------------

// Подстановка var(). Фолбэк поддержан, хотя в :root его сегодня нет:
// без него первая же переменная с фолбэком развалила бы сборку молча.
function substitute(value, table, trail = []) {
  const start = value.indexOf('var(');

  if (start === -1) return value;

  let depth = 0;
  let end = start;

  for (; end < value.length; end += 1) {
    if (value[end] === '(') depth += 1;
    else if (value[end] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  const inner = value.slice(start + 4, end);
  const comma = inner.indexOf(',');
  const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
  const fallback = comma === -1 ? null : inner.slice(comma + 1).trim();

  if (trail.includes(name)) {
    throw new Error(`build-tokens: круговая ссылка на ${name} (${trail.join(' → ')})`);
  }

  let replacement;

  if (table.has(name)) replacement = substitute(table.get(name), table, [...trail, name]);
  else if (fallback !== null) replacement = substitute(fallback, table, [...trail, name]);
  else throw new Error(`build-tokens: переменная ${name} не объявлена на :root — подставить нечего`);

  return substitute(value.slice(0, start) + replacement + value.slice(end + 1), table, trail);
}

const round = (number) => Number(number.toFixed(4));

// Вычисление calc(). Умножение и деление — всё, что встречается в токенах
// библиотеки: множители плотности, теней и оси оформления. Сложение сюда
// не попадает, и притворяться, что попадает, незачем: незнакомая операция
// роняет сборку, а не отдаёт неверное число.
function evaluate(expression) {
  const parts = expression.split(/\s*([*/])\s*/);
  let unit = '';
  let result = null;

  for (let index = 0; index < parts.length; index += 2) {
    const match = parts[index].trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);

    if (!match) throw new Error(`build-tokens: в calc() не число: ${parts[index]} (${expression})`);

    const number = Number(match[1]);
    const own = match[2];
    const operator = parts[index - 1];

    if (own) {
      if (unit && unit !== own) throw new Error(`build-tokens: две единицы в одном calc(): ${expression}`);
      if (operator === '/') throw new Error(`build-tokens: деление на величину с единицей: ${expression}`);
      unit = own;
    }

    if (result === null) result = number;
    else if (operator === '*') result *= number;
    else if (operator === '/') result /= number;
    else throw new Error(`build-tokens: незнакомая операция в calc(): ${expression}`);
  }

  return `${round(result)}${unit}`;
}

function resolveCalc(value) {
  let out = value;
  let guard = 0;

  // Изнутри наружу: во внутренних скобках уже нет своих скобок.
  while (out.includes('calc(')) {
    const next = out.replace(/calc\(([^()]*)\)/, (_, expression) => evaluate(expression));

    if (next === out || (guard += 1) > 20) throw new Error(`build-tokens: calc() не вычислился: ${value}`);

    out = next;
  }

  return out;
}

const resolve = (value, table) => resolveCalc(substitute(value, table)).trim();

// --- цвет -------------------------------------------------------------------

// Канал 0…1 в две шестнадцатеричные цифры. toFixed перед округлением —
// не косметика: 0.5 - 0.4 в двоичной плавающей точке даёт 0.09999999999999998,
// и 25,4999… округлилось бы вниз там, где все три движка дают 26. Ошибка
// на единицу в младшем разряде цвета — ровно тот тихий неверный ответ,
// который экспорт обязан не порождать.
const hex = (number) => Math.round(Number((number * 255).toFixed(6))).toString(16).padStart(2, '0');

// HSL → hex по нормативному алгоритму CSS Color 4 (§ hsl-to-rgb). Библиотека
// держит палитру триплетами ради var(), а Figma Variables принимает цвет,
// а не три числа, — перевод неизбежен.
//
// Совпадения байт-в-байт со всеми движками не существует: на значениях,
// попадающих ровно на половину младшего разряда, Chrome, Firefox и WebKit
// расходятся между собой на 1/255 (проверено на живых движках, Этап 34).
// Экспорт держится внутри этого разброса, а не выбирает себе движок.
function hslToHex(h, s, l, alpha) {
  const saturation = s / 100;
  const lightness = l / 100;
  const hue = ((h % 360) + 360) % 360;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => {
    const k = (n + hue / 30) % 12;

    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const base = `#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`;

  return alpha === undefined || alpha >= 1 ? base : base + hex(alpha);
}

const NUMBER = String.raw`-?\d*\.?\d+`;
const HSL_TRIPLET = new RegExp(`^(${NUMBER}),\\s*(${NUMBER})%,\\s*(${NUMBER})%$`);
const HSL_CALL = new RegExp(`^hsla?\\(\\s*(${NUMBER})(?:deg)?,\\s*(${NUMBER})%,\\s*(${NUMBER})%(?:,\\s*(${NUMBER})(%?))?\\s*\\)$`);

function toColor(value) {
  const triplet = value.match(HSL_TRIPLET);

  if (triplet) return hslToHex(...triplet.slice(1, 4).map(Number));

  const call = value.match(HSL_CALL);

  if (call) {
    const [h, s, l, a, percent] = call.slice(1);

    return hslToHex(Number(h), Number(s), Number(l), a === undefined ? undefined : Number(a) / (percent ? 100 : 1));
  }

  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value.toLowerCase();

  return null;
}

// --- разбор составных значений ----------------------------------------------

// Разбиение по разделителю верхнего уровня: запятые и пробелы внутри hsl()
// к делению не относятся.
function split(value, separator) {
  const out = [];
  let depth = 0;
  let current = '';

  for (const character of value) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;

    const boundary = depth === 0 && (separator === ',' ? character === ',' : /\s/.test(character));

    if (boundary) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) out.push(current.trim());

  return out;
}

const LENGTH = new RegExp(`^${NUMBER}(px|rem|em)?$`);
const length = (value) => (value === '0' ? '0px' : value);

// Один слой тени: [inset] <x> <y> [blur] [spread] <color>.
function shadowLayer(layer) {
  const parts = split(layer, ' ');
  const inset = parts[0] === 'inset';
  const geometry = inset ? parts.slice(1) : parts;
  const color = toColor(geometry[geometry.length - 1]);
  const lengths = geometry.slice(0, -1);

  if (!color || lengths.length < 2 || lengths.length > 4 || !lengths.every((part) => LENGTH.test(part))) return null;

  const [offsetX, offsetY, blur = '0', spread = '0'] = lengths;

  return {
    ...(inset ? { inset: true } : {}),
    offsetX: length(offsetX),
    offsetY: length(offsetY),
    blur: length(blur),
    spread: length(spread),
    color,
  };
}

// Именованные функции плавности — теми же кривыми, что и в CSS.
const EASINGS = new Map([
  ['linear', [0, 0, 1, 1]],
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-in', [0.42, 0, 1, 1]],
  ['ease-out', [0, 0, 0.58, 1]],
  ['ease-in-out', [0.42, 0, 0.58, 1]],
]);

const DURATION = new RegExp(`^(${NUMBER})(m?s)$`);
const ms = (value) => {
  const [, number, unit] = value.match(DURATION);

  return `${round(unit === 's' ? Number(number) * 1000 : Number(number))}ms`;
};

// Строка CSS в текст: значение --gr-rating-symbol записано экранированием,
// потому что собранный файл обязан остаться ASCII (проверка 4 в check-dist).
const unquote = (value) => value
  .slice(1, -1)
  .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

// --- типы DTCG --------------------------------------------------------------

// Тип выводится из ЗНАЧЕНИЯ, а не из имени: новая переменная получает
// разложение сама, без правки списка. Порядок правил значим — триплет HSL
// и стек шрифтов оба выглядят как список через запятую.
function classify(value) {
  const color = toColor(value);

  if (color) return { $type: 'color', $value: color };

  const layers = split(value, ',').map(shadowLayer);

  if (layers.length > 0 && layers.every(Boolean)) {
    return { $type: 'shadow', $value: layers.length === 1 ? layers[0] : layers };
  }

  if (new RegExp(`^${NUMBER}(px|rem|em)$`).test(value)) return { $type: 'dimension', $value: value };

  if (new RegExp(`^${NUMBER}$`).test(value)) return { $type: 'number', $value: Number(value) };

  if (DURATION.test(value)) return { $type: 'duration', $value: ms(value) };

  const timed = split(value, ' ');

  if (timed.length === 2 && DURATION.test(timed[0]) && EASINGS.has(timed[1])) {
    return {
      $type: 'transition',
      $value: { duration: ms(timed[0]), delay: '0ms', timingFunction: EASINGS.get(timed[1]) },
    };
  }

  const families = split(value, ',');

  // Ведущий дефис разрешён: -apple-system — обычное имя семейства.
  if (families.length > 1 && families.every((family) => /^(["'].*["']|-?[A-Za-z_][\w -]*)$/.test(family))) {
    return { $type: 'fontFamily', $value: families.map((family) => (/^["']/.test(family) ? unquote(family) : family)) };
  }

  // Ключевые слова и строки типом DTCG не выражаются: «normal» — не размер,
  // а знак рейтинга — не цвет. Врать типом хуже, чем оставить его пустым:
  // плагин пропустит такой токен, а подмена превратилась бы в тихий
  // неверный ответ. Значение при этом отдаётся как есть — переменная в файле
  // присутствует, и полнота экспорта не нарушается.
  return { $value: /^["']/.test(value) ? unquote(value) : value };
}

// --- сборка -----------------------------------------------------------------

export function buildTokens(css, version) {
  const blocks = new Map();

  // Значения — только из безусловных блоков.
  for (const { selector, declared, conditions } of walk(css)) {
    if (conditions.length > 0) continue;

    blocks.set(selector, [...(blocks.get(selector) ?? []), ...declared]);
  }

  const declaredOnRoot = rootVariables(css);
  const notes = conditionalNotes(css);
  const out = {
    $description: 'Переменные темы Griffincss в формате DTCG. Это экспорт токенов, а не библиотека компонентов: '
      + 'классов, макетов и готовых элементов здесь нет. Figma-кита у библиотеки не было и не будет — '
      + 'кит требует сопровождения, а этот файл генерируется сборкой из собранного CSS.',
    $extensions: {
      'ru.griffincss': {
        ...SPEC,
        library: 'griffincss',
        version,
        source: SOURCE,
        generator: 'scripts/build-tokens.mjs',
        variables: 'имя токена — имя переменной CSS без префикса: «color-bg» это --gr-color-bg',
        excluded: 'ось оформления data-gr-style: она opt-in и двигает ручки геометрии и часть палитры на своих якорях — таблица в docs/style-presets.html',
      },
    },
  };

  for (const { name, layers, description } of SETS) {
    const table = new Map();

    for (const selector of layers) {
      if (!blocks.has(selector)) throw new Error(`build-tokens: блок «${selector}» не найден в ${SOURCE}`);

      for (const [variable, value] of blocks.get(selector)) table.set(variable, value);
    }

    const set = { $description: description };

    for (const variable of table.keys()) {
      const token = classify(resolve(table.get(variable), table));
      const conditional = notes.get(variable) ?? [];

      if (conditional.length > 0) {
        token.$description = conditional
          .map(([condition, value]) => `При «${condition}» значение другое: ${resolve(value, table)}.`)
          .join(' ') + ' Плоский формат условия не выражает — значение выше действует вне его.';
      }

      set[variable.replace(/^--gr-/, '')] = token;
    }

    const missing = [...declaredOnRoot].filter((variable) => !(variable.replace(/^--gr-/, '') in set));

    if (missing.length > 0) {
      throw new Error(
        `build-tokens: переменные :root без токена в наборе ${name}: ${missing.join(', ')}. `
        + 'Объявлены только внутри условного блока? Плоский формат такого не выражает — решение принимается вручную.',
      );
    }

    out[name] = set;
  }

  return out;
}

// Ожидаемое содержимое файла из текущего dist. Тем же вызовом пользуется
// check-dist, чтобы сравнить с лежащим на диске байт-в-байт.
export function tokensContent(base = root) {
  const css = readFileSync(join(base, SOURCE), 'utf8');
  const { version } = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));

  return `${JSON.stringify(buildTokens(css, version), null, 2)}\n`;
}

function main() {
  const content = tokensContent();

  writeFileSync(join(root, TOKENS), content);

  // Пустой вывод при успехе — как у остальной сборки.
  if (process.argv.includes('--verbose')) {
    const sets = SETS.length;

    console.log(`build-tokens: ${TOKENS} — ${sets} набора, ${Buffer.byteLength(content)} Б`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-tokens.mjs')) {
  main();
}
