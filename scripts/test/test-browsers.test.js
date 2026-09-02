'use strict';

// Сводка браузерного прогона строится по итоговой строке playwright,
// и разбор её обязан быть проверен отдельно: ошибка здесь молча превратит
// красный прогон в зелёную таблицу, а именно ради таблицы всё и затевалось.
// Формат взят из настоящих прогонов, а не выдуман по документации.

const test = require('node:test');
const assert = require('node:assert/strict');

let parseSummary;

test.before(async () => {
  ({ parseSummary } = await import('../test-browsers.mjs'));
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
