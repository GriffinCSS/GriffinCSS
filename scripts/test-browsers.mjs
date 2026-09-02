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
// Ноль зависимостей.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const BROWSERS = ['chromium', 'firefox', 'webkit'];

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

function run(browser) {
  return new Promise((resolve) => {
    const started = Date.now();
    // npx на Windows — это npx.cmd; без этого скрипт живёт только на unix,
    // а он затем и написан, чтобы прогон делали на разных системах.
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(npx, ['playwright', 'test', `--project=${browser}`], { cwd: root });

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

async function main() {
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

  console.log(`Платформа: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`Node ${process.version}, playwright ${require('@playwright/test/package.json').version}`);
  console.log('');

  const results = [];

  for (const browser of BROWSERS) {
    console.log(`--- ${browser} ---`);
    results.push(await run(browser));
    console.log('');
  }

  console.log('Сводка');
  for (const result of results) console.log(line(result));

  const bad = results.filter((r) => !(r.summary.ok && r.code === 0));

  console.log('');
  if (bad.length === 0) console.log('Все три движка зелёные.');
  else console.log(`Красных движков: ${bad.length} — ${bad.map((r) => r.browser).join(', ')}.`);

  process.exit(bad.length === 0 ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
