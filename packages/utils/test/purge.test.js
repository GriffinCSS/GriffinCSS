'use strict';

// Отсечение неиспользуемого: scripts/purge.mjs оставляет в собранном CSS
// только правила, чьи классы встретились в разметке. Ошибка здесь стоит
// пропавшего стиля в проде, поэтому проверяется и то, что скрипт
// сохраняет (структурные правила, :root, @layer), и то, что он считает.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'purge.mjs');
const DOCS = path.join(ROOT, 'docs');
const UTILS_CSS = path.join(ROOT, 'packages', 'utils', 'dist', 'griffincss-utils.css');

// Абсолютный путь под Windows (`C:\…`) не специфер модуля: буква диска
// читается как протокол. Импорт идёт через file:-URL — так тест проходит
// на всех платформах.
const load = () => import(pathToFileURL(SCRIPT).href);

// Классы всех оставшихся селекторов: то, за что пользователь платит после
// отсечения. Берутся из разобранного дерева, а не из текста файла: точка
// в `@layer griffincss.utils` — не класс. Экранирование снимается,
// как это делает браузер.
function classesOf(nodes, found = new Set()) {
  for (const node of nodes) {
    if (node.type === 'at') classesOf(node.children, found);
    if (node.type !== 'rule') continue;

    for (const [, name] of node.selector.matchAll(/\.((?:\\.|[^\s.,:>+~()[\]{}'"])+)/g)) {
      found.add(name.replace(/\\(.)/g, '$1'));
    }
  }

  return found;
}

test('правило без классов сохраняется целиком', async () => {
  const { purge } = await load();
  const result = purge(':root{--gr-gap:1rem}html{margin:0}', new Set());

  assert.ok(result.css.includes(':root{--gr-gap:1rem}'), ':root выброшен: ' + result.css);
  assert.ok(result.css.includes('html{margin:0}'), 'правило по тегу выброшено: ' + result.css);
});

test('объявление порядка слоёв сохраняется', async () => {
  const { purge } = await load();
  const css = '@layer griffincss.reset, griffincss.utils;@layer griffincss.utils{.gr-p-4{padding:1rem}}';
  const result = purge(css, new Set());

  assert.ok(result.css.startsWith('@layer griffincss.reset, griffincss.utils;'), result.css);
});

test('неиспользованный класс выбрасывается', async () => {
  const { purge } = await load();
  const result = purge('.gr-p-4{padding:1rem}.gr-p-8{padding:2rem}', new Set(['gr-p-4']));

  assert.ok(result.css.includes('.gr-p-4{'), 'использованный класс пропал');
  assert.ok(!result.css.includes('.gr-p-8'), 'неиспользованный класс остался: ' + result.css);
});

test('из перечисления селекторов остаются только использованные', async () => {
  const { purge } = await load();
  const result = purge('.gr-p-4,.gr-p-8,.gr-p-12{padding:1rem}', new Set(['gr-p-4', 'gr-p-12']));

  assert.equal(result.css, '.gr-p-4,.gr-p-12{padding:1rem}');
});

test('селектор из двух классов требует обоих', async () => {
  const { purge } = await load();
  const result = purge('.gr-radius .gr-p-4{padding:1rem}', new Set(['gr-radius']));

  assert.equal(result.css, '');
});

test('пустой @media не остаётся', async () => {
  const { purge } = await load();
  const css = '@media(width >= 768px){.gr-p-8-md{padding:2rem}}';
  const result = purge(css, new Set(['gr-p-4']));

  assert.equal(result.css, '');
});

test('@media с уцелевшим правилом сохраняется вместе с ним', async () => {
  const { purge } = await load();
  const css = '@media(width >= 768px){.gr-p-8-md{padding:2rem}.gr-p-4-md{padding:1rem}}';
  const result = purge(css, new Set(['gr-p-4-md']));

  assert.equal(result.css, '@media(width >= 768px){.gr-p-4-md{padding:1rem}}');
});

test('экранированный в CSS класс матчится своим именем из разметки', async () => {
  const { purge } = await load();
  const result = purge('.gr-w-1\\/2{width:50%}', new Set(['gr-w-1/2']));

  assert.ok(result.css.includes('.gr-w-1\\/2'), 'дробный класс выброшен: ' + result.css);
});

test('safelist сохраняет класс, которого в разметке нет', async () => {
  const { purge } = await load();
  const css = '.gr-mt-4{margin-top:1rem}.gr-mt-8{margin-top:2rem}';
  const result = purge(css, new Set(), { safelist: ['gr-mt-*'] });

  assert.ok(result.css.includes('.gr-mt-4{'), 'шаблон safelist не сработал: ' + result.css);
  assert.ok(result.css.includes('.gr-mt-8{'), 'шаблон safelist не сработал: ' + result.css);
});

test('safelist без звёздочки — точное имя, а не префикс', async () => {
  const { purge } = await load();
  const result = purge('.gr-mt-4{margin-top:1rem}.gr-mt-40{margin-top:10rem}', new Set(), {
    safelist: ['gr-mt-4'],
  });

  assert.ok(result.css.includes('.gr-mt-4{'), result.css);
  assert.ok(!result.css.includes('.gr-mt-40'), 'точное имя захватило соседа: ' + result.css);
});

test('@keyframes остаётся, только если анимация использована', async () => {
  const { purge } = await load();
  const css = '@keyframes gr-spin{to{transform:rotate(360deg)}}.gr-spin{animation:gr-spin 1s linear infinite}.gr-fade{animation:gr-fade 1s}';

  const kept = purge(css, new Set(['gr-spin']));
  assert.ok(kept.css.includes('@keyframes gr-spin'), 'использованные кадры выброшены: ' + kept.css);

  const dropped = purge(css, new Set(['gr-fade']));
  assert.ok(!dropped.css.includes('@keyframes'), 'неиспользованные кадры остались: ' + dropped.css);
});

test('отчёт считает оставшиеся и выброшенные правила', async () => {
  const { purge } = await load();
  const result = purge('.gr-p-4{padding:1rem}.gr-p-8{padding:2rem}.gr-p-12{padding:3rem}', new Set(['gr-p-4']));

  assert.equal(result.kept, 1);
  assert.equal(result.dropped, 2);
});

test('классы берутся из атрибута class, а не из прозы', async () => {
  const { extractClasses } = await load();
  const found = extractClasses('<p>отступ задаётся классом gr-p-4</p><div class="gr-p-8 gr-mt-2"></div>');

  assert.deepEqual([...found].sort(), ['gr-mt-2', 'gr-p-8']);
});

test('классы берутся и из экранированного примера разметки', async () => {
  const { extractClasses } = await load();
  const found = extractClasses('<pre>&lt;div class="gr-p-4"&gt;</pre>');

  assert.deepEqual([...found], ['gr-p-4']);
});

test('в JSX и Vue читаются className и :class', async () => {
  const { extractClasses } = await load();
  const jsx = extractClasses('<div className="gr-p-4"><b :class="{\'gr-mt-2\': on}"/></div>', { js: true });

  assert.ok(jsx.has('gr-p-4'), 'className не прочитан');
  assert.ok(jsx.has('gr-mt-2'), ':class не прочитан');
});

test('в JS-файлах читаются строковые литералы, в HTML — нет', async () => {
  const { extractClasses } = await load();
  const source = "el.className = 'gr-mt-4';";

  assert.ok(extractClasses(source, { js: true }).has('gr-mt-4'), 'литерал в JS не прочитан');
  assert.ok(!extractClasses(source).has('gr-mt-4'), 'литерал прочитан там, где разметка');
});

test('прогон по докстранице оставляет только её классы и структуру', async () => {
  const { purge, extractClasses, parse } = await load();
  const css = fs.readFileSync(UTILS_CSS, 'utf8');
  const used = extractClasses(fs.readFileSync(path.join(DOCS, 'spacing.html'), 'utf8'));
  const result = purge(css, used);

  assert.ok(result.css.includes('@layer griffincss.reset,'), 'порядок слоёв потерян');
  assert.ok(result.css.includes(':root{'), ':root потерян');
  assert.ok(!/\{\s*\}/.test(result.css), 'остался пустой блок');
  assert.ok(result.css.length < css.length / 4, `отсечение почти ничего не убрало: ${result.css.length} из ${css.length}`);

  for (const cls of classesOf(parse(result.css))) {
    assert.ok(used.has(cls), `остался неиспользованный класс .${cls}`);
  }
});

test('скрипт печатает счётчики и отдаёт CSS в файл', async () => {
  const out = path.join(__dirname, '..', 'dist', 'purge-test-output.css');

  try {
    // Отчёт идёт в stderr: без --out поток stdout занят самим CSS.
    const run = spawnSync(
      process.execPath,
      [SCRIPT, '--css', UTILS_CSS, '--out', out, '--safelist', 'gr-sr-only', path.join(DOCS, 'spacing.html')],
      { encoding: 'utf8' },
    );

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);

    const report = run.stderr;

    assert.match(report, /правил оставлено \d+ из \d+, выброшено \d+/, 'счётчиков в отчёте нет: ' + report);
    assert.ok(fs.existsSync(out), 'файл не записан');

    const written = fs.readFileSync(out, 'utf8');

    assert.ok(written.includes('.gr-sr-only'), 'класс из safelist не сохранён');
    assert.ok(written.length > 0, 'записан пустой файл');
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('обход каталога знает серверные шаблоны, а явный файл берётся всегда', async () => {
  // Полевой отчёт по 0.23.1 (Этап 40): вёрстка панели жила в .py и в jinja-
  // шаблонах, и обход каталога их не видел — покупатель узнал об этом
  // по пропавшим стилям. Явно переданный файл при этом берётся с любым
  // расширением: список действует только при обходе каталога.
  const { collectFiles } = await load();
  const dir = fs.mkdtempSync(path.join(__dirname, '..', 'dist', 'purge-walk-'));

  try {
    fs.mkdirSync(path.join(dir, 'templates'));

    for (const name of ['views.py', 'templates/page.jinja2', 'templates/base.j2', 'templates/mail.django',
      'templates/list.tmpl', 'templates/item.gotmpl', 'templates/row.jinja', 'main.rs', 'notes.txt']) {
      fs.writeFileSync(path.join(dir, name), '');
    }

    const found = collectFiles(dir).map((file) => path.relative(dir, file)).sort();

    assert.deepEqual(found, [
      'main.rs', 'templates/base.j2', 'templates/item.gotmpl', 'templates/list.tmpl', 'templates/mail.django',
      'templates/page.jinja2', 'templates/row.jinja', 'views.py',
    ]);

    const explicit = collectFiles(path.join(dir, 'notes.txt'));

    assert.deepEqual(explicit, [path.join(dir, 'notes.txt')], 'явно переданный файл отброшен по расширению');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('в файлах с кодом на Python и Rust классы берутся и из строковых литералов', async () => {
  const { extractClasses, CODE_EXT } = await load();

  assert.ok(CODE_EXT.has('.py'), '.py не считается кодом — clsx-подобная склейка в Python не найдётся');
  assert.ok(CODE_EXT.has('.rs'), '.rs не считается кодом');

  const found = extractClasses("row_class = 'gr-p-4 gr-flex'\nhtml = f'<div class=\"gr-mt-2\">'", { js: true });

  assert.ok(found.has('gr-p-4') && found.has('gr-flex') && found.has('gr-mt-2'), [...found].join(' '));
});

// --- ось оформления (Этап 22) ------------------------------------------------
//
// Стилей четыре, странице нужен один. Правила `[data-gr-style="X"]` неотличимы
// от прочих по классам — класс в них как раз используемый, — поэтому ось
// проверяется отдельным множеством: значениями атрибута из разметки.

const AXIS = '[data-gr-style]{--gr-gap:1rem}[data-gr-style=compact] .gr-btn{padding:0}[data-gr-style=airy] .gr-btn{padding:2rem}';

test('ось оформления: правило чужого стиля выбрасывается, своего — остаётся', async () => {
  const { purge } = await load();
  const result = purge(AXIS, new Set(['gr-btn']), { styles: new Set(['compact']) });

  assert.ok(result.css.includes('[data-gr-style=compact]'), 'выброшен используемый стиль');
  assert.ok(!result.css.includes('[data-gr-style=airy]'), 'остался стиль, которого в разметке нет');
});

test('ось оформления: блок токенов остаётся, пока хоть один стиль используется', async () => {
  const { purge } = await load();
  const kept = purge(AXIS, new Set(['gr-btn']), { styles: new Set(['airy']) });

  assert.ok(kept.css.includes('[data-gr-style]{'), 'блок токенов выброшен при используемой оси');

  // Ось не встретилась вовсе — не нужны ни токены, ни правила стилей.
  const gone = purge(AXIS, new Set(['gr-btn']), { styles: new Set() });

  assert.ok(!gone.css.includes('data-gr-style'), 'ось осталась, хотя в разметке её нет: ' + gone.css);
  assert.ok(gone.css.length === 0 || !gone.css.includes('{}'), 'остался пустой блок');
});

test('ось оформления: значение из рантайма сохраняется через safelist', async () => {
  const { purge } = await load();
  const result = purge(AXIS, new Set(['gr-btn']), { styles: new Set(), safelist: ['airy'] });

  assert.ok(result.css.includes('[data-gr-style=airy]'), 'safelist не сохранил стиль');
  assert.ok(result.css.includes('[data-gr-style]{'), 'safelist не сохранил блок токенов');
  assert.ok(!result.css.includes('[data-gr-style=compact]'), 'safelist сохранил лишний стиль');
});

test('ось оформления: без сведений о разметке правила оси не трогаются', async () => {
  const { purge } = await load();
  const result = purge(AXIS, new Set(['gr-btn']));

  assert.ok(result.css.includes('[data-gr-style=airy]'), 'ось отсечена без данных о ней');
});

test('ось оформления: значение читается из атрибута разметки', async () => {
  const { extractStyles } = await load();
  const found = extractStyles('<html data-gr-style="compact"><div data-gr-style=airy></div>');

  assert.ok(found.has('compact'), 'значение в кавычках не найдено');
  assert.ok(found.has('airy'), 'значение без кавычек не найдено');
});

test('ось оформления: отчёт называет оставленные и выброшенные стили', async () => {
  const out = path.join(__dirname, '..', 'dist', 'purge-axis-output.css');
  const page = path.join(__dirname, '..', 'dist', 'purge-axis-page.html');
  const css = path.join(__dirname, '..', 'dist', 'purge-axis.css');

  try {
    fs.writeFileSync(page, '<html data-gr-style="compact"><button class="gr-btn">Кнопка</button></html>');
    fs.writeFileSync(css, AXIS);

    const run = spawnSync(process.execPath, [SCRIPT, '--css', css, '--out', out, page], { encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.match(run.stderr, /ось оформления/, 'об оси в отчёте ни слова: ' + run.stderr);
    assert.match(run.stderr, /compact/, 'оставленный стиль не назван: ' + run.stderr);
    assert.match(run.stderr, /airy/, 'выброшенный стиль не назван: ' + run.stderr);

    const written = fs.readFileSync(out, 'utf8');

    assert.ok(written.includes('[data-gr-style=compact]'), 'нужный стиль выброшен');
    assert.ok(!written.includes('[data-gr-style=airy]'), 'лишний стиль остался');
  } finally {
    for (const file of [out, page, css]) fs.rmSync(file, { force: true });
  }
});
