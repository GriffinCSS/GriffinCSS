'use strict';

// Утилиты сравнения CSS: нормализация и разбор верхнеуровневых блоков.

const path = require('node:path');
const sass = require('sass');

const SCSS_DIR = path.join(__dirname, '..', '..', 'scss');

// Приводит CSS к каноничному виду: без комментариев, пробелов и
// незначащих точек с запятой. Позволяет сравнивать вывод sass и рантайма.
function normalizeCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*(<=|>=|<|>)\s*/g, '$1')
    .replace(/\s*([{};,])\s*/g, '$1')
    .replace(/\s*:\s*/g, ':')
    .replace(/;\}/g, '}')
    // sass снимает кавычки в атрибутных селекторах — CSS эквивалентен
    .replace(/\[([\w-]+)([*^$~|]?=)"([^"]*)"\]/g, '[$1$2$3]')
    .trim();
}

// Компилирует SCSS-строку с доступом к модулям пакета grid.
function compileScss(source) {
  return sass.compileString(source, { loadPaths: [SCSS_DIR], style: 'expanded' }).css;
}

// Тело блока @layer <name> { ... } — со сбалансированными скобками.
// Пустая строка, если такого слоя в CSS нет.
function layerBody(css, name) {
  const open = css.indexOf('@layer ' + name + ' {');
  if (open === -1) return '';

  let depth = 0;

  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(css.indexOf('{', open) + 1, i);
    }
  }

  throw new Error('Griffincss test: незакрытый @layer ' + name);
}

// Тела нескольких слоёв подряд — для файлов, которые с Этапа 46 раскладывают
// вывод по двум слоям: токены в griffincss.tokens, остальное в своём.
function layersBody(css, names) {
  return names.map((name) => layerBody(css, name)).join('\n');
}

// Разбирает CSS на блоки верхнего уровня: [{ prelude, body }].
function topLevelBlocks(css) {
  const blocks = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let prelude = '';
  let body = '';

  for (const char of clean) {
    if (char === '{') {
      depth += 1;
      if (depth === 1) continue;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ prelude: prelude.trim(), body: body.trim() });
        prelude = '';
        body = '';
        continue;
      }
    }

    if (depth === 0) prelude += char;
    else body += char;
  }

  return blocks;
}

module.exports = { normalizeCss, compileScss, topLevelBlocks, layerBody, layersBody };
