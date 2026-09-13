#!/usr/bin/env node
// Griffincss — браузерный прогон на трёх движках одной командой.
//
// Почему локально, а не в гейте. Раннер площадки не может забрать движки
// с cdn.playwright.dev: наружу по IPv6 маршрута нет, а загрузчик playwright
// ходит именно туда и системный резолвер при этом не спрашивает. Проверено
// тремя прогонами: порядок адресов в dns.lookup он игнорирует, sysctl
// в контейнере запрещён (/proc/sys только для чтения), а запись в /etc/hosts
// его не касается — при выдаче ровно одного адреса IPv4 он всё равно шёл
// на IPv6. Управлять там нечем, поэтому межбраузерная проверка — ритуал
// перед выпуском, а не гейт.
//
// Движки не ставятся молча: полтерабайта трафика в год из одного «npm test»
// не вырастет, но 500 МБ за один запуск — решение того, кто запускает.
// Нет движка — печатается команда и код возврата 1.
//
// Прогон идёт по одному движку за раз, а не всеми сразу: так время и статус
// видны по каждому отдельно, а это и есть то, ради чего сводка нужна.
//
// Ключ --report пишет результат в BROWSERS.md (путь переопределяется:
// --report=путь). Файл уезжает к потребителю вместе с выпуском, и гейт
// release-publish читает его же: нет сводки за эту версию или в ней красный
// движок — выпуска не будет. Ключ --workers N доезжает до playwright:
// на машине, где памяти в обрез, три воркера уходят в swap и возвращают
// красное там, где код ни при чём.
//
// ЧЕГО СВОДКА НЕ ДОКАЗЫВАЕТ. Файл собирается локально, и написать его руками
// — минута работы. Это фиксация ритуала в артефакте, а не подпись: гейт
// проверяет, что прогон за версию есть и он зелёный, а не что он был.
// Обещать здесь больше нечего, пока движки не забирает CI.
//
// Ноль зависимостей.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const BROWSERS = ['chromium', 'firefox', 'webkit'];

const REPORT = '--report';
const DEFAULT_REPORT = 'BROWSERS.md';

// Число воркеров playwright. Своего значения у скрипта нет — ключ просто
// доезжает до playwright. Нужен он на машине, где памяти в обрез: три
// воркера уходят в swap, клики отвечают через десятки секунд, и прогон
// возвращает красное там, где код ни при чём. Сводка обязана отражать
// состояние кода, а не занятость машины.
const WORKERS = '--workers';

// Разбор итоговой строки playwright. Отдельная функция, а не regexp по месту:
// на ней стоит вывод про успех прогона, и она проверяется тестом.
//
// `parsed: false` — не то же самое, что «ноль тестов»: итоговой строки нет,
// когда движок не стартовал вовсе. Такое обязано читаться как провал.
export function parseSummary(text) {
  const num = (re) => {
    const found = String(text).match(re);

    return found ? Number(found[1]) : 0;
  };

  const passed = String(text).match(/(\d+) passed(?: \(([^)]+)\))?/);
  const failed = num(/(\d+) failed/);
  const didNotRun = num(/(\d+) did not run/);
  const parsed = Boolean(passed) || failed > 0;

  return {
    parsed,
    passed: passed ? Number(passed[1]) : 0,
    failed,
    // Нестойкий тест в итоге прошёл — прогон он не роняет, но молчать о нём
    // нельзя: он же завтра станет настоящим падением.
    flaky: num(/(\d+) flaky/),
    skipped: num(/(\d+) skipped/),
    didNotRun,
    duration: passed && passed[2] ? passed[2] : null,
    ok: parsed && failed === 0 && didNotRun === 0,
  };
}

// Строка таблицы: движок, его версия, статус словом, тесты, время.
function row({ browser, version, code, summary, seconds }) {
  const good = summary.ok && code === 0;
  const tests = summary.parsed
    ? `${summary.passed}${summary.failed ? ` + ${summary.failed} упало` : ''}${summary.flaky ? ` + ${summary.flaky} нестойких` : ''}`
    : 'не отчитался';

  return `| ${browser} | ${version || '—'} | ${good ? 'зелено' : 'КРАСНО'} | ${tests} | ${summary.duration ?? `${seconds}s`} |`;
}

// Сводка прогона в Markdown. Чистая функция: файл уезжает наружу и читается
// гейтом выпуска, поэтому его форма проверяется тестом, а не глазами.
export function report(results, meta) {
  const red = results.filter((r) => !(r.summary.ok && r.code === 0));

  return [
    '# Браузерный прогон',
    '',
    `Griffincss ${meta.version} · ${meta.date}`,
    '',
    `- платформа: ${meta.platform}`,
    `- Node ${meta.node}, playwright ${meta.playwright}`,
    '',
    '| Движок | Версия | Статус | Тестов | Время |',
    '| --- | --- | --- | --- | --- |',
    ...results.map(row),
    '',
    red.length === 0 ? 'Все движки зелёные.' : `Красных движков: ${red.length} — ${red.map((r) => r.browser).join(', ')}.`,
    '',
    'Сводка собрана локально командой `npm run test:browser:all -- --report`:',
    'движки библиотека забирает руками, потому что раннер площадки до них',
    'не дотягивается. Написать такой файл руками — минута работы, поэтому',
    'он **фиксация ритуала, а не подпись**: гейт выпуска проверяет, что прогон',
    'за эту версию есть и он зелёный, а не то, что он действительно был.',
    '',
  ].join('\n');
}

// Чтение сводки — обратная сторона той же формы, и живёт рядом с ней:
// разъехаться они могут только вместе. Гейт выпуска зовёт эту функцию.
export function parseReport(text) {
  const head = String(text).match(/^Griffincss\s+(\S+)(?:\s+·\s+(\d{4}-\d{2}-\d{2}))?/m) || [];
  const version = head[1] || null;
  const date = head[2] || null;
  const engines = [];
  const rows = /^\|\s*([a-z][a-z0-9-]*)\s*\|([^|]*)\|\s*(зелено|КРАСНО)\s*\|/gm;
  let found;

  while ((found = rows.exec(String(text))) !== null) {
    engines.push({ browser: found[1], version: found[2].trim(), ok: found[3] === 'зелено' });
  }

  return { version, date, engines };
}

// Версия движка — то, чего в выводе прогона нет вовсе. Цена — один запуск
// браузера на движок, и он всё равно запускается.
async function version(name) {
  const playwright = await import('@playwright/test');

  try {
    const browser = await playwright[name].launch();
    const value = browser.version();

    await browser.close();

    return value;
  } catch {
    return null;
  }
}

async function missing() {
  const playwright = await import('@playwright/test');
  const absent = [];

  for (const name of BROWSERS) {
    let exe = null;

    try {
      exe = playwright[name].executablePath();
    } catch {
      // Сборки движка под эту платформу нет вовсе — считаем отсутствующим.
    }

    if (!exe || !existsSync(exe)) absent.push(name);
  }

  return absent;
}

function run(browser, workers) {
  return new Promise((resolve) => {
    const started = Date.now();
    // npx на Windows — это npx.cmd; без этого скрипт живёт только на unix,
    // а он затем и написан, чтобы прогон делали на разных системах.
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = ['playwright', 'test', `--project=${browser}`];

    if (workers) args.push(`--workers=${workers}`);

    const child = spawn(npx, args, { cwd: root });

    let out = '';

    // Вывод и копится, и сразу показывается: прогон идёт минутами,
    // и молчащий терминал на это время — плохая замена прогрессу.
    child.stdout.on('data', (chunk) => { out += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { out += chunk; process.stderr.write(chunk); });

    child.on('error', (error) => {
      console.error(`Не удалось запустить ${npx}: ${error.message}`);
      resolve({ browser, code: 1, summary: parseSummary(''), seconds: 0 });
    });

    child.on('close', (code) => resolve({
      browser,
      code,
      summary: parseSummary(out),
      seconds: Math.round((Date.now() - started) / 1000),
    }));
  });
}

function line({ browser, code, summary, seconds }) {
  const parts = [];

  if (!summary.parsed) parts.push('сводки нет — движок не отчитался');
  else {
    parts.push(`${summary.passed} прошло`);
    if (summary.failed) parts.push(`${summary.failed} упало`);
    if (summary.flaky) parts.push(`${summary.flaky} нестойких`);
    if (summary.skipped) parts.push(`${summary.skipped} пропущено`);
  }

  const good = summary.ok && code === 0;

  return `  ${browser.padEnd(9)} ${good ? 'зелено' : 'КРАСНО'}  ${parts.join(', ')}, ${summary.duration ?? `${seconds}s`}`;
}

// Ключ --report [путь]: без него поведение прежнее — печать в терминал.
// Ключ --workers N доезжает до playwright как есть.
export function parseArgs(argv) {
  const options = { report: null, workers: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === REPORT) options.report = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : DEFAULT_REPORT;
    else if (arg.startsWith(`${REPORT}=`)) options.report = arg.slice(REPORT.length + 1) || DEFAULT_REPORT;
    else if (arg === WORKERS) options.workers = argv[++i] || null;
    else if (arg.startsWith(`${WORKERS}=`)) options.workers = arg.slice(WORKERS.length + 1) || null;
    else throw new Error(`неизвестный ключ ${arg}`);
  }

  return options;
}

async function main(argv) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (e) {
    console.error(`test-browsers: ${e.message}`);
    console.error(`test-browsers: ключи — ${REPORT} [путь], ${WORKERS} N`);
    process.exit(2);
  }

  const absent = await missing();

  if (absent.length > 0) {
    console.error(`Не установлены движки: ${absent.join(', ')}.`);
    console.error('');
    console.error('Поставить (три движка весят около 500 МБ):');
    console.error(`  npx playwright install ${absent.join(' ')}`);
    console.error('');
    console.error('Скрипт не ставит их сам: это трафик и место на диске,');
    console.error('и решение об этом принимает тот, кто запускает.');
    process.exit(1);
  }

  const meta = {
    version: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    date: new Date().toISOString().slice(0, 10),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    node: process.version,
    playwright: require('@playwright/test/package.json').version,
  };

  // Версии движков снимаются до прогона: аудит просит именно их, а вывод
  // playwright их не печатает.
  const engines = {};

  for (const browser of BROWSERS) engines[browser] = await version(browser);

  console.log(`Платформа: ${meta.platform}`);
  console.log(`Node ${meta.node}, playwright ${meta.playwright}`);
  console.log(`Движки: ${BROWSERS.map((b) => `${b} ${engines[b] || '—'}`).join(', ')}`);
  console.log('');

  const results = [];

  for (const browser of BROWSERS) {
    console.log(`--- ${browser} ---`);
    results.push({ ...(await run(browser, options.workers)), version: engines[browser] });
    console.log('');
  }

  console.log('Сводка');
  for (const result of results) console.log(line(result));

  if (options.report) {
    const file = path.resolve(root, options.report);

    writeFileSync(file, report(results, meta));
    console.log('');
    console.log(`Сводка записана: ${path.relative(root, file) || file}`);
  }

  const bad = results.filter((r) => !(r.summary.ok && r.code === 0));

  console.log('');
  if (bad.length === 0) console.log('Все три движка зелёные.');
  else console.log(`Красных движков: ${bad.length} — ${bad.map((r) => r.browser).join(', ')}.`);

  process.exit(bad.length === 0 ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main(process.argv.slice(2));
