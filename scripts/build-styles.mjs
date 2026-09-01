#!/usr/bin/env node
// Griffincss — однофайловые сборки оси оформления (Этап 23).
//
// griffincss-styles.css несёт все три стиля: для того, кто ещё выбирает,
// это правильное умолчание. Продукту нужен один, и тот, кто собирает
// из SCSS, отсекает лишнее списком $gr-styles. Тому, кто SCSS не компилирует
// — берёт файл с CDN или из dist/, — настроить список негде, поэтому те же
// три конфигурации собираются заранее.
//
// На выходе, всё в packages/core/dist/:
//   griffincss-style-airy.css, -strict.css, -compact.css
//
// Каждый файл — ЗАМЕНА griffincss-styles.css, а не добавка к нему:
// общая часть оси входит в него целиком. Подключать два таких файла
// разом бессмысленно — общая часть приедет дважды.
//
// Структурные правила компонентов ([data-gr-style] в griffincss-ui.css)
// эти файлы не трогают: они живут в другом пакете и настраиваются тем же
// списком при сборке ui из SCSS. Готовому griffincss-ui.css они стоят
// 115 Б brotli на все четыре стиля — отдельных сборок ui ради них
// не заводится.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as sass from 'sass';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scss = join(root, 'packages/core/scss');
const dist = join(root, 'packages/core/dist');

// Список — единственный источник правды о составе однофайловых сборок:
// его же читает check-dist, чтобы проверить каждый артефакт.
// standard сюда не входит: он и есть базовые значения :root, файла ему
// не нужно — ровно по той же причине, по которой его нет в $gr-styles.
export const STYLES = ['airy', 'strict', 'compact'];

export const styleFile = (name) => `packages/core/dist/griffincss-style-${name}.css`;

// Флаги те же, что у build:styles в packages/core: сжатый вывод без карты,
// завершающий перевод строки — как его пишет sass из командной строки.
function build(name) {
  const source = `@use 'style-config' with ($gr-styles: (${name}));@use 'griffincss-styles';`;
  const { css } = sass.compileString(source, { loadPaths: [scss], style: 'compressed' });
  const text = `${css}\n`;

  writeFileSync(join(root, styleFile(name)), text);

  return Buffer.byteLength(text);
}

function main() {
  mkdirSync(dist, { recursive: true });

  const sizes = STYLES.map((name) => [name, build(name)]);

  // Пустой вывод при успехе — как у остальной сборки.
  if (process.argv.includes('--verbose')) {
    for (const [name, bytes] of sizes) console.log(`build-styles: griffincss-style-${name}.css ${bytes} Б`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-styles.mjs')) {
  main();
}
