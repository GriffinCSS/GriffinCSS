// Griffincss — флаги terser, одним модулем (Этап 41).
//
// До этого они жили четырьмя копиями: три строки build:js в package.json
// пакетов и build-griffinjs.mjs. Теперь их читают и сборка — build-js.mjs
// для рантаймов пакетов, build-griffinjs.mjs для слоя, — и сверка
// происхождения dist (check-origin.mjs): она минифицирует src в памяти
// ровно этими опциями и сравнивает с dist побайтово. Читай она другой
// набор, сверяла бы не то.
//
// Сами флаги — Этапа 19: ecma 2020, три прохода compress с unsafe_arrows,
// mangle, без комментариев, ASCII-шапка /*! … */ одной строкой (её
// требует check-dist, проверка 13), карта кода рядом с файлом.

export const HOMEPAGE = 'https://gitverse.ru/BarneyScott/GriffinCSS';

// Подписи в шапке — по имени файла в dist. Всё, что собирает слой,
// подписано одинаково: griffinjs.js, griffinjs-core.js, griffinjs-<модуль>.js.
const TITLES = {
  'griffincss.js': 'Griffincss Core',
  'griffincss-theme.js': 'Griffincss Theme',
  'griffincss-ui.js': 'Griffincss UI',
  'griffincss-utils.js': 'Griffincss Utils',
};

export function titleOf(file) {
  if (file.startsWith('griffinjs')) return 'GriffinJS';
  if (!(file in TITLES)) throw new Error(`terser-options: у файла ${file} нет подписи в шапке`);

  return TITLES[file];
}

export const preamble = (file) => `/*! ${titleOf(file)} | MIT | ${HOMEPAGE} */`;

/**
 * Опции minify() для одного артефакта.
 *
 * @param {string} file — имя файла в dist: подпись в шапке и ссылка на карту.
 * @param {object} [sourceMap] — что добавить к описанию карты. Слой пишет
 *   filename (в карте появляется поле file), рантаймы пакетов — нет: так
 *   их собирал terser-CLI до этапа, и карты остались прежними.
 */
export function terserOptions(file, sourceMap = {}) {
  return {
    ecma: 2020,
    compress: { passes: 3, ecma: 2020, unsafe_arrows: true },
    mangle: true,
    format: { comments: false, preamble: preamble(file) },
    sourceMap: { url: `${file}.map`, ...sourceMap },
  };
}
