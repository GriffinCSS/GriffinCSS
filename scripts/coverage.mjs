#!/usr/bin/env node
// Griffincss — замер доли браузеров, поддерживающих возможности библиотеки.
//
// Библиотека стоит на каскадных слоях, контейнерных запросах, `:has()`
// и `@scope` (последний — только в сборках `-scoped`). Порог браузеров
// из-за этого выше, чем «последние версии Chrome и Safari», и он обязан
// быть названным решением с цифрой, датой и методом, а не умолчанием.
// Скрипт пересчитывает эту цифру одной командой, чтобы раздел
// о совместимости не устаревал молча.
//
// Постоянной зависимости нет намеренно: `browserslist` и данные
// `caniuse-lite` тянутся разово через `npx`. Цена — нужна сеть; поэтому
// без неё скрипт падает с внятным текстом, а не печатает пустую таблицу.
//
// Про российскую цифру. `caniuse-lite` атрибутирует по России не весь
// трафик: браузеры без версионной статистики — прежде всего
// Яндекс.Браузер — в его данные не попадают вовсе. Поэтому печатаются
// две цифры: сырая доля и доля от измеримого трафика. Одна сырая цифра
// врёт против самой библиотеки: читатель решит, что треть аудитории
// останется без стилей, хотя Яндекс.Браузер на Chromium и слои
// поддерживает.
//
// Ноль зависимостей.

import { spawnSync } from 'node:child_process';

// Регион замера. Кроме мира считается Россия: у проекта русскоязычная
// документация и русскоязычная аудитория, и разница между мировой
// и российской долей здесь принципиальная, а не косметическая.
const REGION = 'RU';
const REGION_TITLE = 'России';

// Возможности перечислены именами `caniuse`, а не словами: запрос
// `supports <feature>` берёт версии из тех же данных, по которым потом
// считается доля, — иначе таблица версий и таблица долей разошлись бы.
//
// Колонка «где» — не украшение: у `@scope` порог принципиально выше,
// и читателю важно, что он платит его только за сборки `-scoped`.
const FEATURES = [
  {
    id: 'css-cascade-layers',
    title: 'Каскадные слои',
    where: 'все сборки CSS',
  },
  {
    id: 'css-container-queries',
    title: 'Контейнерные запросы',
    where: 'utils (-c*), .gr-cq ядра, data-gr-layout-c* рантайма',
  },
  {
    id: 'css-has',
    title: ':has()',
    where: 'ui',
  },
  {
    id: 'css-cascade-scope',
    title: '@scope',
    where: 'только сборки -scoped',
  },
];

// Браузеры, версии которых попадают в таблицу. Мобильные варианты
// (ios_saf, and_chr) от своих настольных родителей по порогу не отличаются
// и только удлинили бы строку.
const DESKTOP = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  safari: 'Safari',
};

// Одна точка запуска: без неё «нет сети» выглядело бы как пустой вывод
// в четырёх разных местах.
function browserslist(args) {
  const run = spawnSync('npx', ['--yes', 'browserslist', ...args], {
    encoding: 'utf8',
    // npx печатает в stderr и прогресс установки, и настоящие ошибки:
    // разбираем сами, наружу отдаём только при провале.
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (run.error || run.status !== 0) {
    const reason = run.error ? run.error.message : (run.stderr || '').trim();

    console.error('Замер не выполнен: не удалось запустить browserslist.');
    console.error('');
    console.error('Постоянной зависимости у проекта нет — browserslist и данные');
    console.error('caniuse-lite тянутся разово через npx, и для этого нужна сеть.');
    console.error('Проверьте подключение и повторите: npm run coverage');
    console.error('');
    console.error(`Причина: ${reason || `npx завершился с кодом ${run.status}`}`);
    process.exit(1);
  }

  return run.stdout;
}

// «These browsers account for 95.3% of all users globally» — из строки
// нужна только цифра.
function share(args) {
  const out = browserslist(args);
  const match = out.match(/([\d.]+)%/);

  if (!match) {
    console.error('Замер не выполнен: browserslist ответил в незнакомом формате.');
    console.error(out.trim());
    process.exit(1);
  }

  return Number(match[1]);
}

// Минимальная поддерживающая версия каждого настольного браузера.
// Сравнение числовое по сегментам: «15.4» младше «15.10», а строковое
// сравнение решило бы наоборот.
function minVersions(feature) {
  const out = browserslist([`supports ${feature}`]);
  const found = new Map();

  for (const line of out.split('\n')) {
    const [name, version] = line.trim().split(' ');

    if (!DESKTOP[name] || !version) continue;

    // Диапазон «15.2-15.3» — берётся его нижняя граница.
    const low = version.split('-')[0];
    const parts = low.split('.').map(Number);

    if (parts.some(Number.isNaN)) continue;

    const previous = found.get(name);

    if (!previous || older(parts, previous.parts)) found.set(name, { text: low, parts });
  }

  return Object.keys(DESKTOP)
    .filter((name) => found.has(name))
    .map((name) => `${DESKTOP[name]} ${found.get(name).text}`);
}

function older(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;

    if (left !== right) return left < right;
  }

  return false;
}

// Формат числа — как во всём проекте: запятая вместо точки.
const percent = (value) => `${value.toFixed(1).replace('.', ',')} %`;

const pad = (text, width) => text + ' '.repeat(Math.max(0, width - [...text].length));

function main() {
  const today = new Date().toISOString().slice(0, 10);

  // Весь атрибутированный трафик региона: сумма долей браузеров, у которых
  // вообще есть версионная статистика по РФ. Без неё российскую цифру
  // нельзя читать — только цитировать неправильно.
  const attributed = share([`--coverage=${REGION}`, `> 0% in ${REGION}`]);

  const rows = FEATURES.map((feature) => ({
    ...feature,
    versions: minVersions(feature.id).join(' · '),
    world: share(['--coverage', `supports ${feature.id}`]),
    region: share([`--coverage=${REGION}`, `supports ${feature.id}`]),
  }));

  const columns = [
    ['Возможность', (row) => row.title],
    ['Минимальные версии', (row) => row.versions],
    ['В мире', (row) => percent(row.world)],
    [`В ${REGION_TITLE}, сырое`, (row) => percent(row.region)],
    [`В ${REGION_TITLE}, от измеримого`, (row) => percent((row.region / attributed) * 100)],
    ['Требуется для', (row) => row.where],
  ];

  const widths = columns.map(([title, cell]) =>
    Math.max([...title].length, ...rows.map((row) => [...cell(row)].length)));

  console.log(`Griffincss — доля браузеров, ${today}`);
  console.log('Метод: browserslist --coverage, данные caniuse-lite (тянутся npx разово)');
  console.log('');
  console.log(columns.map(([title], i) => pad(title, widths[i])).join('  '));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));

  for (const row of rows) {
    console.log(columns.map(([, cell], i) => pad(cell(row), widths[i])).join('  '));
  }

  console.log('');
  console.log(`Атрибутированный трафик ${REGION_TITLE}: ${percent(attributed)}.`);
  console.log('Остальное — браузеры без версионной статистики в caniuse-lite,');
  console.log('прежде всего Яндекс.Браузер, а он на Chromium и каскадные слои');
  console.log('поддерживает. Поэтому сырая российская цифра — нижняя граница,');
  console.log('а не оценка; читать нужно колонку «от измеримого».');
}

main();
