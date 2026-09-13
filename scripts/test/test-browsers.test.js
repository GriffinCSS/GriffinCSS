'use strict';

// Сводка браузерного прогона строится по итоговой строке playwright,
// и разбор её обязан быть проверен отдельно: ошибка здесь молча превратит
// красный прогон в зелёную таблицу, а именно ради таблицы всё и затевалось.
// Формат взят из настоящих прогонов, а не выдуман по документации.

const test = require('node:test');
const assert = require('node:assert/strict');

let parseSummary;
let report;
let parseReport;

test.before(async () => {
  ({ parseSummary, report, parseReport } = await import('../test-browsers.mjs'));
});

test('зелёный прогон: число тестов и длительность', () => {
  const out = parseSummary('  120 passed (2.7m)\n');

  assert.equal(out.passed, 120);
  assert.equal(out.failed, 0);
  assert.equal(out.duration, '2.7m');
  assert.equal(out.ok, true);
});

test('падение: считаются и упавшие, и прошедшие', () => {
  const out = parseSummary([
    '  1 failed',
    '    [chromium] › packages/ui/test/browser/slides.spec.mjs:91:1 › точки по страницам',
    '  119 passed (2.9m)',
  ].join('\n'));

  assert.equal(out.failed, 1);
  assert.equal(out.passed, 119);
  assert.equal(out.ok, false);
});

test('нестойкие и пропущенные не теряются', () => {
  const out = parseSummary('  2 flaky\n  3 skipped\n  115 passed (1m)\n');

  assert.equal(out.flaky, 2);
  assert.equal(out.skipped, 3);
  assert.equal(out.passed, 115);
  // Нестойкий тест в итоге прошёл: сам по себе он прогон не роняет.
  assert.equal(out.ok, true);
});

test('пустой или незнакомый вывод не выдаётся за успех', () => {
  // Движок мог не стартовать вовсе — тогда итоговой строки нет. Считать
  // такое зелёным опаснее, чем признать разбор неудавшимся.
  for (const text of ['', 'Error: browserType.launch: Executable does not exist']) {
    const out = parseSummary(text);

    assert.equal(out.parsed, false, `«${text.slice(0, 20)}» разобралось как сводка`);
    assert.equal(out.ok, false);
  }
});

test('секунды тоже читаются', () => {
  assert.equal(parseSummary('  4 passed (12.3s)').duration, '12.3s');
});


// --- сводка выпуска -------------------------------------------------------

// BROWSERS.md уезжает к потребителю вместе с выпуском, и гейт выпуска
// читает его же. Значит форма файла — предмет проверки, а не украшение:
// красный движок обязан быть виден словом, а версия — совпадать с выпуском.

const META = {
  version: '0.24.0',
  date: '2026-09-03',
  platform: 'Darwin 25.6.0 (arm64)',
  node: 'v22.11.0',
  playwright: '1.55.0',
};

const RESULT = (browser, version, text, code = 0) => ({
  browser,
  version,
  code,
  summary: parseSummary(text),
  seconds: 162,
});

test('сводка: версия библиотеки, платформа и таблица по движкам с их версиями', () => {
  const md = report([
    RESULT('chromium', '140.0.7339.16', '  120 passed (2.7m)'),
    RESULT('firefox', '141.0', '  120 passed (3.1m)'),
    RESULT('webkit', '26.0', '  120 passed (2.9m)'),
  ], META);

  assert.match(md, /Griffincss 0\.24\.0/);
  assert.match(md, /2026-09-03/);
  assert.match(md, /Darwin 25\.6\.0 \(arm64\)/);
  assert.match(md, /Node v22\.11\.0/);
  assert.match(md, /playwright 1\.55\.0/);

  // Версия каждого движка — то, чего в выводе прогона не было вовсе.
  assert.match(md, /\| chromium \| 140\.0\.7339\.16 \| зелено \| 120 \| 2\.7m \|/);
  assert.match(md, /\| firefox \| 141\.0 \|/);
  assert.match(md, /\| webkit \| 26\.0 \|/);

  // Оговорка о том, чем сводка не является, — в самом файле.
  assert.match(md, /ритуал/i);
});

test('красный движок в сводке виден словом, а не только числом', () => {
  const md = report([
    RESULT('chromium', '140.0.7339.16', '  120 passed (2.7m)'),
    RESULT('firefox', '141.0', '  1 failed\n  119 passed (3.1m)', 1),
    RESULT('webkit', null, 'Error: browserType.launch: Executable does not exist', 1),
  ], META);

  assert.match(md, /\| chromium \| [^|]+\| зелено \|/);
  assert.match(md, /\| firefox \| 141\.0 \| КРАСНО \|/);
  // Движок, который не стартовал: версии нет, и зелёным он не считается.
  assert.match(md, /\| webkit \| — \| КРАСНО \|/);
});

test('сводка читается обратно: версия выпуска и статус каждого движка', () => {
  const green = parseReport(report([
    RESULT('chromium', '140.0.7339.16', '  120 passed (2.7m)'),
    RESULT('firefox', '141.0', '  120 passed (3.1m)'),
    RESULT('webkit', '26.0', '  120 passed (2.9m)'),
  ], META));

  assert.equal(green.version, '0.24.0');
  assert.deepEqual(green.engines.map((e) => e.browser), ['chromium', 'firefox', 'webkit']);
  assert.equal(green.engines.every((e) => e.ok), true);

  const red = parseReport(report([RESULT('firefox', '141.0', '  1 failed\n  119 passed (3.1m)', 1)], META));

  assert.equal(red.engines[0].ok, false);

  // Не сводка вовсе — ни версии, ни движков; читаться это обязано как отказ.
  const none = parseReport('# Что-то другое\n\nтекст без таблицы\n');

  assert.equal(none.version, null);
  assert.deepEqual(none.engines, []);
});

test('ключи: --report с путём и без, --workers доезжает до playwright, опечатка — ошибка', async () => {
  const { parseArgs } = await import('../test-browsers.mjs');

  assert.deepEqual(parseArgs([]), { report: null, workers: null });
  assert.equal(parseArgs(['--report']).report, 'BROWSERS.md');
  assert.equal(parseArgs(['--report', 'out/run.md']).report, 'out/run.md');
  assert.equal(parseArgs(['--report=out/run.md']).report, 'out/run.md');
  assert.equal(parseArgs(['--workers', '2']).workers, '2');
  assert.equal(parseArgs(['--workers=2']).workers, '2');

  // Путь не съедает следующий ключ.
  assert.deepEqual(parseArgs(['--report', '--workers=2']), { report: 'BROWSERS.md', workers: '2' });

  assert.throws(() => parseArgs(['--reprot']), /неизвестный ключ/);
});
