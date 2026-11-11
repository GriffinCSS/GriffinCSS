'use strict';

// Отсечение неиспользуемого: bin/purge.mjs оставляет в собранном CSS
// только правила, чьи классы встретились в разметке. Ошибка здесь стоит
// пропавшего стиля в проде, поэтому проверяется и то, что скрипт
// сохраняет (структурные правила, :root, @layer), и то, что он считает.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..', '..');
const SCRIPT = path.join(__dirname, '..', 'bin', 'purge.mjs');
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

// Фидбек темы griffin по 0.26.0, п. 7: крошки `<ol class="gr-breadcrumb"><li>`
// без .gr-breadcrumb-item теряли выравнивание и разделитель — класс
// внутри :where(li, .gr-breadcrumb-item) читался как обязательный для
// всего правила, хотя альтернатива li подходила всегда.
test('класс внутри :where()/:is() — альтернатива: правило живо, пока подходит хоть одна', async () => {
  const { purge } = await load();
  const css = '.gr-breadcrumb>:where(li,.gr-breadcrumb-item){display:flex}'
    + '.gr-breadcrumb>:where(li,.gr-breadcrumb-item)+:where(li,.gr-breadcrumb-item)::before{content:"/"}'
    + '.gr-nav :is(.gr-nav-link,.gr-nav-btn){color:red}'
    + '.gr-x:where(.gr-x-a,.gr-x-b){color:red}';
  const result = purge(css, new Set(['gr-breadcrumb', 'gr-nav', 'gr-x']));

  assert.ok(result.css.includes('.gr-breadcrumb>:where(li,.gr-breadcrumb-item){'), 'пункты крошек выброшены: ' + result.css);
  assert.ok(result.css.includes('::before{content:"/"}'), 'разделитель крошек выброшен: ' + result.css);
  assert.ok(!result.css.includes('.gr-nav :is('), 'ни одна альтернатива не встречена, а правило осталось: ' + result.css);
  assert.ok(!result.css.includes('.gr-x:where('), 'ни одна альтернатива не встречена, а правило осталось: ' + result.css);
});

test('класс внутри :not() не обязателен, внутри :has() — альтернатива, вложенность разбирается', async () => {
  const { purge } = await load();
  const css = '.gr-btn:not(.gr-btn-ghost){color:red}'
    + '.gr-field:has(.gr-input,.gr-select){color:red}'
    + '.gr-field:has(.gr-nope){color:red}'
    + '.gr-menu :is(li,:where(.gr-nope,.gr-menu-item)){color:red}'
    + '.gr-menu :is(.gr-nope,:where(.gr-nope2,.gr-nope3)){color:red}';
  const result = purge(css, new Set(['gr-btn', 'gr-field', 'gr-input', 'gr-menu', 'gr-menu-item']));

  assert.ok(result.css.includes('.gr-btn:not(.gr-btn-ghost){'), 'отсутствие класса в :not() делает правило шире, а не мёртвым: ' + result.css);
  assert.ok(result.css.includes('.gr-field:has(.gr-input,.gr-select){'), ':has() с встреченной альтернативой выброшен: ' + result.css);
  assert.ok(!result.css.includes('.gr-field:has(.gr-nope)'), ':has() без единой альтернативы остался: ' + result.css);
  assert.ok(result.css.includes('.gr-menu :is(li,'), 'вложенный список с живой альтернативой выброшен: ' + result.css);
  assert.ok(!result.css.includes('.gr-menu :is(.gr-nope,'), 'вложенный список без живых альтернатив остался: ' + result.css);
});

test('пустой @media не остаётся', async () => {
  const { purge } = await load();
  const css = '@media(width >= 768px){.gr-p-8-md{padding:2rem}}';
  const result = purge(css, new Set(['gr-p-4']));

  assert.equal(result.css, '');
});

test('@starting-style разбирается как вложенный блок, а не переносится целиком', async () => {
  const { purge } = await load();
  const css = '@starting-style{.gr-toast{opacity:0}.gr-modal[open]{opacity:0}}';
  const result = purge(css, new Set(['gr-modal']));

  assert.equal(result.css, '@starting-style{.gr-modal[open]{opacity:0}}');
  assert.equal(purge(css, new Set()).css, '', 'пустой @starting-style остался');
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

// --- CSS темы и приложения (фидбек CHU по 0.29.2, Этап 76) -------------------
//
// Тесты выше идут по `dist` библиотеки: он без комментариев, валиден, имена
// в нём строчные. CSS темы и приложения бывает любым — и отсечение обязано
// решать о нём так же, как браузер: правило живо или мертво до отсечения
// ровно так же, как после.

const S = (...names) => new Set(names);

test('незакрытый комментарий не зацикливает разбор', () => {
  // Бесконечный цикл роняет сборку, а не тест: проверка — в дочернем
  // процессе с таймаутом и малой кучей.
  const code = `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then(({ purge }) => {
    const set = new Set(['gr-a']);
    const out = [purge('.gr-a{color:red} /* x', set), purge('@media print{.gr-a{color:red} /* x}', set)];
    process.stdout.write(JSON.stringify(out.map(({ css, kept, dropped }) => ({ css, kept, dropped }))));
  });`;
  const run = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', code], { encoding: 'utf8', timeout: 5000 });

  assert.equal(run.signal, null, 'разбор не завершился за 5 с');
  assert.equal(run.status, 0, 'разбор упал: ' + run.stderr.slice(0, 300));
  assert.deepEqual(JSON.parse(run.stdout), [
    { css: '.gr-a{color:red}', kept: 1, dropped: 0 },
    { css: '@media print{.gr-a{color:red}}', kept: 1, dropped: 0 },
  ]);
});

test('комментарий перед at-правилом не делает его селектором', async () => {
  const { purge } = await load();
  const result = purge('/* см. SPEC.md */\n@media print{.gr-a{color:red}}', S('gr-a'));

  assert.deepEqual([result.css, result.kept, result.dropped], ['@media print{.gr-a{color:red}}', 1, 0]);
});

test('запятая и точка в комментарии не режут селектор и не дают класса', async () => {
  const { purge } = await load();

  // Обрывок «/* шапка,» в выводе открывал бы комментарий, который
  // не закрыт, — браузер потерял бы всё до следующего «*/».
  assert.equal(purge('/* шапка, подвал */\n.x,.gr-a{color:red}', S('gr-a')).css, '.gr-a{color:red}');
  assert.equal(
    purge('.gr-b{color:red}/* a, .b */.gr-a{color:red}', S('gr-a', 'gr-b')).css,
    '.gr-b{color:red}.gr-a{color:red}',
  );
  assert.equal(purge('/* порядок */@layer a,b;.gr-a{color:red}', S('gr-a')).css, '@layer a,b;.gr-a{color:red}');
});

test('комментарий внутри селектора и прелюдии — не текст правила, но граница токенов', async () => {
  const { purge } = await load();

  // Вплотную между знаками браузер видит на месте комментария границу
  // токенов: ни пробел (это комбинатор), ни склейка её не передают —
  // передаёт пустой комментарий.
  assert.equal(purge('.gr-a/* c */.gr-b{color:red}', S('gr-a', 'gr-b')).css, '.gr-a/**/.gr-b{color:red}');
  assert.equal(purge('.gr-a/* c */.gr-b{color:red}', S('gr-a')).css, '', 'класс за комментарием не потребован');
  assert.equal(purge('@media/* c */print{.gr-a{color:red}}', S('gr-a')).css, '@media/**/print{.gr-a{color:red}}');
  // `.a/**/b` в браузере — два слова без пробела, правило негодно; пробел
  // сделал бы его живым правилом для `b` внутри `.a`.
  assert.equal(purge('.a/**/b{color:red}', S('a')).css, '.a/**/b{color:red}');
  // `and/**/(` — слово и скобка; склейка дала бы функцию `and(` и `not all`.
  assert.equal(
    purge('@media screen and/**/(min-width:1px){.m{color:red}}', S('m')).css,
    '@media screen and/**/(min-width:1px){.m{color:red}}',
  );
  // Рядом с пробелом комментарий просто уходит.
  assert.equal(purge('.a /* c */.b{color:red}', S('a', 'b')).css, '.a .b{color:red}');
});

test('опустевший блок именованного слоя остаётся объявлением — порядок слоёв прежний', async () => {
  const { purge } = await load();

  // Порядок слоёв задаёт первое появление имени: без объявления base
  // встал бы после top, и красный перебил бы синий.
  assert.equal(
    purge('@layer base{.u{color:green}}@layer top{.c{color:blue}}@layer base{.c{color:red}}', S('c')).css,
    '@layer base;@layer top{.c{color:blue}}@layer base{.c{color:red}}',
  );
  assert.equal(purge('@layer a{@layer b{.u{color:red}}}', S()).css, '@layer a{@layer b;}', 'вложенный слой');
  assert.equal(
    purge('@layer anim{@keyframes x{to{opacity:0}}}@layer top{.c{color:blue}}@layer anim{.c{color:red}}', S('c')).css,
    '@layer anim;@layer top{.c{color:blue}}@layer anim{.c{color:red}}',
    'слой, опустевший на втором проходе — без @keyframes',
  );
  // Пустой комментарий вместо пробела после `@layer` имени не прячет
  // (ревью CHU, п. 28): для браузера `@layer/**/base` — `@layer base`.
  assert.equal(
    purge('@layer/**/base{.u{color:green}}@layer top{.c{color:blue}}@layer base{.c{color:red}}', S('c')).css,
    '@layer base;@layer top{.c{color:blue}}@layer base{.c{color:red}}',
  );
  assert.equal(
    purge('@layer/**/base,top;@layer base{.u{color:green}}@layer top{.c{color:blue}}', S('c')).css,
    '@layer/**/base,top;@layer top{.c{color:blue}}',
  );
  // Безымянный слой своего места в порядке у других не держит.
  assert.equal(purge('@layer{.u{color:red}}.c{color:blue}', S('c')).css, '.c{color:blue}');
  // Место уже задано объявлением выше — как в каждом файле библиотеки:
  // блок уходит, байтов за повтор нет.
  assert.equal(
    purge('@layer base, top;@layer base{.u{color:green}}@layer top{.c{color:blue}}', S('c')).css,
    '@layer base, top;@layer top{.c{color:blue}}',
  );
});

test('лишняя «;» вне правила — начало следующего правила, как в браузере', async () => {
  const { purge } = await load();
  const css = '.a{color:green};.u{color:green}.d{color:blue}';

  // В браузере «;.u{…}» — негодное правило, а .d синий; отсечённое .u
  // не должно отдать «;» правилу .d.
  assert.equal(purge(css, S('a', 'd')).css, '.a{color:green}.d{color:blue}');
  // Правило с «;» в селекторе браузер не применяет целиком, какие бы
  // классы ни встретились, — оно уходит, вид не меняется.
  assert.equal(purge(css, S('a', 'u', 'd')).css, '.a{color:green}.d{color:blue}');
  // Весь список негоден: часть без «;» не оживает, когда часть с ней ушла.
  assert.equal(purge('.a{color:green};.u,.v{color:red}', S('a', 'v')).css, '.a{color:green}');
});

test('точка в строке атрибута — не класс', async () => {
  const { purge } = await load();

  assert.equal(
    purge('a[href$=".pdf"]{color:red}a[href$="x"]{color:blue}', S()).css,
    'a[href$=".pdf"]{color:red}a[href$="x"]{color:blue}',
  );
  assert.equal(purge('[data-x="a.b"] .gr-a{color:red}', S()).css, '', 'класс вне скобок по-прежнему обязателен');
});

test('функциональные псевдоклассы и animation — без учёта регистра', async () => {
  const { purge } = await load();

  assert.equal(purge('p:NOT(.featured){margin:0}', S()).css, 'p:NOT(.featured){margin:0}');
  assert.equal(purge('.x:IS(li,.a){color:red}', S('x')).css, '.x:IS(li,.a){color:red}');
  assert.ok(
    purge('@keyframes spin{to{rotate:1turn}}.a{ANIMATION:spin 1s}', S('a')).css.includes('@keyframes spin'),
    'используемые кадры выброшены',
  );
});

test('экранирование в селекторе — как у браузера', async () => {
  const { purge } = await load();

  // `\31 0` — кодовая точка «1» и пробел-ограничитель, затем «0»: класс `10`.
  assert.equal(purge('.\\31 0{color:red}', S('10')).css, '.\\31 0{color:red}');
  assert.equal(purge('.\\31 0{color:red}', S('31')).css, '');
  // `\,` — знак имени, а не разделитель списка: иначе вывод красил бы все <b>.
  assert.equal(purge('.a\\,b{color:red}', S()).css, '');
  assert.equal(purge('.a\\,b{color:red}', S('a,b')).css, '.a\\,b{color:red}');
  assert.equal(purge('.x:is(.a\\),li){color:red}', S('x')).css, '.x:is(.a\\),li){color:red}', 'экранированная скобка');
});

test('разметка: все классы экранированного примера, имена не из ASCII и с любыми знаками', async () => {
  const { extractClasses } = await load();

  assert.deepEqual([...extractClasses('<pre>&lt;p class=&quot;gr-p-4 gr-m-2&quot;&gt;</pre>')].sort(), ['gr-m-2', 'gr-p-4']);
  assert.ok(extractClasses('<p class="кнопка">').has('кнопка'), 'имя кириллицей');
  assert.ok(extractClasses('<b :class="{\'кнопка\': on}"/>').has('кнопка'), 'имя кириллицей в выражении');

  const found = extractClasses('<p class="md:gr-a -foo gr-b!">');

  for (const name of ['md:gr-a', '-foo', 'gr-b!']) assert.ok(found.has(name), `${name} не найден: ${[...found].join(' ')}`);
});

// --- ревью CHU этапа 76: пп. 17, 19–22 --------------------------------------

test('класс перед id — свой класс: имя класса — только знаки имени', async () => {
  const { purge } = await load();

  // `.a#b` — класс `a` и id `b`, а не класс `a#b`.
  assert.equal(purge('.a#b{color:red}', S('a')).css, '.a#b{color:red}');
});

test('экранированные `{` и `"` в селекторе не открывают блок и строку', async () => {
  const { purge } = await load();

  // Иначе блок или строка съедали и соседнее правило.
  assert.equal(purge('.a\\{b{color:red}.c{color:blue}', S('c')).css, '.c{color:blue}');
  assert.equal(purge('.a\\{b{color:red}.c{color:blue}', S('a{b', 'c')).css, '.a\\{b{color:red}.c{color:blue}');
  assert.equal(purge('.a\\"b{color:red}.c{color:blue}', S('c')).css, '.c{color:blue}');
});

test('`:is(` внутри строки атрибута — не псевдокласс', async () => {
  const { purge } = await load();

  assert.equal(purge('a[title=":is(.x)"]{color:red}', S()).css, 'a[title=":is(.x)"]{color:red}');
  // Альтернатива из одного атрибута — живая: так звёздочка обязательного
  // поля (`.gr-field:has([required])`) уходила из отсечённого CSS.
  assert.equal(
    purge('.gr-field:has([required]) .gr-label{color:red}', S('gr-field', 'gr-label')).css,
    '.gr-field:has([required]) .gr-label{color:red}',
  );
});

test('значение class делится только пробелами ASCII, как в HTML', async () => {
  const { extractClasses } = await load();

  // Неразрывный пробел (знак, не `&nbsp;`) — часть имени: браузер видит
  // один класс `a\a0 b`.
  assert.ok(extractClasses('<p class="a\u00a0b">').has('a\u00a0b'), 'класс с неразрывным пробелом разрезан');
});

test('цена разбора линейна: тысячи слоёв и лишних «;»', () => {
  // Опустевший слой искал своё имя перебором всех уцелевших соседей,
  // а каждая лишняя «;» заново резала и чистила прелюдию от её начала —
  // 8 000 пар слоёв стоили 15 с. Здесь — вдвое больше, с запасом в таймауте.
  const code = `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then(({ purge }) => {
    let layers = '';
    const used = new Set();
    for (let i = 0; i < 16000; i++) {
      layers += '@layer k' + i + '{.k' + i + '{color:red}}@layer e' + i + '{.u{color:red}}';
      used.add('k' + i);
    }
    const a = purge(layers, used);
    const b = purge('/* x */' + 'a;'.repeat(65536) + '.c{color:red}', new Set(['c']));
    process.stdout.write(JSON.stringify([a.kept, a.css.includes('@layer e15999;'), b.css]));
  });`;
  const run = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 10000 });

  assert.equal(run.signal, null, 'разбор не уложился в 10 с');
  assert.equal(run.status, 0, 'разбор упал: ' + run.stderr.slice(0, 300));
  assert.deepEqual(JSON.parse(run.stdout), [16000, true, '']);
});

test('вложенность функциональных псевдоклассов глубже предела — внятная ошибка, а не переполнение стека', async () => {
  // Ревью CHU, п. 30: разбор рекурсивен по вложенности `:is(`, и 2 000
  // уровней роняли отсечение RangeError без места. Обычная глубина —
  // как прежде.
  const { purge } = await load();
  const deep = (n) => `.x${':is('.repeat(n)}li${')'.repeat(n)}{color:red}`;

  assert.equal(purge(deep(32), S('x')).css, deep(32));
  assert.throws(() => purge(deep(2000), S('x')), /вложенность/);
  // Место — начало селектора правила, а не самая внутренняя часть
  // (ревью CHU, п. 32); `:not()` вглубь не разбирается и не назван.
  assert.throws(() => purge(deep(65), S('x')), (error) => {
    assert.match(error.message, /«\.x:is\(:is\(/, 'в ошибке нет начала селектора: ' + error.message);
    assert.ok(!error.message.includes(':not('), 'ошибка называет :not(): ' + error.message);
    return true;
  });
});

// --- команда пакета (фидбек CHU по 0.29.2, п. 6) ----------------------------
//
// Скрипт едет в пакете griffincss-utils командой griffincss-purge: у того,
// кто поставил библиотеку из npm, `npm run purge` нет — он есть только
// в клоне репозитория.

test('без --css скрипт берёт CSS своего пакета, а не текущего каталога', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'griffincss-purge-'));

  try {
    fs.writeFileSync(path.join(dir, 'page.html'), '<div class="gr-p-4"></div>');

    const run = spawnSync(process.execPath, [SCRIPT, 'page.html'], { cwd: dir, encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.ok(run.stdout.includes('.gr-p-4{'), 'класс со страницы не найден в выводе: ' + run.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// npm кладёт в node_modules/.bin ссылку на файл: process.argv[1] — путь
// ссылки, а не модуля, и проверка «модуль запущен, а не импортирован»
// обязана это знать — иначе команда молча ничего не делает.
test('команда работает по ссылке из .bin', {
  skip: process.platform === 'win32' && 'npm под Windows ставит обёртку .cmd, которая зовёт сам файл',
}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'griffincss-purge-'));

  try {
    const link = path.join(dir, 'griffincss-purge');

    fs.symlinkSync(SCRIPT, link);
    fs.writeFileSync(path.join(dir, 'page.html'), '<div class="gr-p-4"></div>');

    const run = spawnSync(process.execPath, [link, 'page.html'], { cwd: dir, encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.match(run.stderr, /правил оставлено \d+/, 'по ссылке скрипт не запустился');
    assert.ok(run.stdout.includes('.gr-p-4{'), 'класс со страницы не найден в выводе');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Ревью CHU, п. 29: проекту с одними компонентами `npx -p griffincss-utils`
// ставит последнюю версию утилит, а пресет ui — список классов, которые
// ставят скрипты ui своей версии. Пресет идёт за установленными
// компонентами: из griffincss-ui/dist/purge-presets.json проекта.
test('пресет ui берётся из griffincss-ui проекта, если он там есть', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'griffincss-preset-'));

  try {
    const ui = path.join(dir, 'node_modules', 'griffincss-ui');

    fs.mkdirSync(path.join(ui, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ui, 'package.json'), JSON.stringify({
      name: 'griffincss-ui',
      version: '9.9.9',
      exports: { './dist/*': './dist/*', './package.json': './package.json' },
    }));
    fs.writeFileSync(path.join(ui, 'dist', 'purge-presets.json'), JSON.stringify({ ui: ['gr-only-in-project'] }));
    fs.writeFileSync(path.join(dir, 'ui.css'), '.gr-only-in-project{color:red}.gr-toast{color:blue}');
    fs.writeFileSync(path.join(dir, 'page.html'), '<p></p>');

    const run = spawnSync(process.execPath, [SCRIPT, '--css', 'ui.css', '--preset', 'ui', 'page.html'], { cwd: dir, encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.ok(run.stdout.includes('.gr-only-in-project{'), 'пресет взят не из проекта: ' + run.stdout);
    assert.ok(!run.stdout.includes('.gr-toast{'), 'остался класс встроенного пресета');
    assert.match(run.stderr, /node_modules[\\/]griffincss-ui[\\/]dist[\\/]purge-presets\.json, griffincss-ui 9\.9\.9/, 'отчёт не называет, откуда пресет: ' + run.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Ревью OcapiCMS к 0.30.0, п. 1: разрешение модулей от текущего каталога
// идёт и в node_modules выше по дереву — чужой griffincss-ui подменял пресет
// молча. Пресет идёт за версией отсекаемого CSS: первым — purge-presets.json
// рядом с файлом из --css (та же dist, что griffincss-ui.css и griffinjs.css),
// затем griffincss-ui проекта, затем встроенный.
test('пресет ui — сперва purge-presets.json рядом с отсекаемым CSS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'griffincss-preset-'));

  try {
    const parent = path.join(dir, 'node_modules', 'griffincss-ui');
    const shop = path.join(dir, 'shop');

    fs.mkdirSync(path.join(parent, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'package.json'), JSON.stringify({
      name: 'griffincss-ui', version: '0.31.0', exports: { './dist/*': './dist/*', './package.json': './package.json' },
    }));
    fs.writeFileSync(path.join(parent, 'dist', 'purge-presets.json'), JSON.stringify({ ui: ['gr-only-from-parent'] }));

    fs.mkdirSync(path.join(shop, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(shop, 'vendor', 'griffinjs.css'), '.gr-only-from-parent{color:red}.gr-toast{color:blue}.gr-card{color:green}');
    fs.writeFileSync(path.join(shop, 'vendor', 'purge-presets.json'), JSON.stringify({ ui: ['gr-toast'] }));
    fs.writeFileSync(path.join(shop, 'page.html'), '<div class="gr-card"></div>');

    const run = spawnSync(process.execPath, [SCRIPT, '--preset', 'ui', '--css', 'vendor/griffinjs.css', 'page.html'], { cwd: shop, encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.ok(run.stdout.includes('.gr-toast{'), 'пресет взят не из файла рядом с CSS: ' + run.stdout);
    assert.ok(!run.stdout.includes('.gr-only-from-parent{'), 'пресет взят из griffincss-ui выше по дереву');
    assert.match(run.stderr, /vendor[\\/]purge-presets\.json/, 'отчёт не называет файл рядом с CSS: ' + run.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Ревью OcapiCMS к 0.30.0, п. 2: слова между пробелами в значении class
// на шаблонах (Twig, JSX) — и обрывки вроде `{{` и `th-total{%`. Отсечению
// они не мешают — с классом из CSS не совпадут, — но счётчик найденного
// перестал быть диагностикой: отчёт называет, сколько из них — классы CSS.
test('отчёт называет, сколько найденных имён — классы отсекаемого CSS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'griffincss-purge-'));

  try {
    fs.writeFileSync(path.join(dir, 'x.css'), '.gr-card{color:red}.gr-total{color:blue}.gr-unused{color:green}');
    fs.writeFileSync(path.join(dir, 'page.twig'), "<div class=\"gr-total{% if final %} gr-card{% endif %} {{ cls|default('') }}\"></div>");

    const run = spawnSync(process.execPath, [SCRIPT, '--css', 'x.css', 'page.twig'], { cwd: dir, encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.match(run.stderr, /из них классов этого CSS: 2\b/, 'счётчик классов CSS: ' + run.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Ревью OcapiCMS к 0.30.0, п. 4: на macOS рабочий каталог приходит в NFD
// (так имя хранит файловая система), а путь из аргумента, набранный
// руками, — в NFC; общая часть путей обрывалась на первой «й», и отчёт
// печатал рабочий, но длинный обход. Только на APFS: она к нормализации
// имён нечувствительна, а на ext4 NFC и NFD — разные имена.
test('отчёт называет файл пресета коротким путём и при разной нормализации путей', {
  skip: process.platform !== 'darwin' && 'нечувствительна к нормализации имён только APFS',
}, () => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'griffincss-nfd-'));

  try {
    const stored = path.join(base, 'Сайты'.normalize('NFD'));

    fs.mkdirSync(path.join(stored, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(stored, 'vendor', 'ui.css'), '.gr-toast{color:red}');
    fs.writeFileSync(path.join(stored, 'vendor', 'purge-presets.json'), JSON.stringify({ ui: ['gr-toast'] }));
    fs.writeFileSync(path.join(stored, 'page.html'), '<p></p>');

    const typed = path.join(base, 'Сайты'.normalize('NFC'), 'vendor', 'ui.css');
    const run = spawnSync(process.execPath, [SCRIPT, '--preset', 'ui', '--css', typed, 'page.html'], { cwd: stored, encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.match(run.stderr, /пресет ui \(vendor[\\/]purge-presets\.json\)/, 'путь к пресету в обход: ' + run.stderr);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// Ревью CHU, п. 36: CSS перенесён без purge-presets.json, griffincss-ui
// в каталоге нет — разрешение модулей, как у require, поднимается выше
// по дереву (в монорепозитории так находится корневой node_modules)
// и может найти чужой griffincss-ui. Отчёт печатает путь найденного файла,
// а не «проекта»: откуда список, видно сразу.
test('пресет из griffincss-ui выше по дереву — отчёт печатает путь найденного файла', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'griffincss-preset-'));

  try {
    const parent = path.join(dir, 'node_modules', 'griffincss-ui');
    const shop = path.join(dir, 'shop');

    fs.mkdirSync(path.join(parent, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'package.json'), JSON.stringify({
      name: 'griffincss-ui', version: '9.9.9', exports: { './dist/*': './dist/*', './package.json': './package.json' },
    }));
    fs.writeFileSync(path.join(parent, 'dist', 'purge-presets.json'), JSON.stringify({ ui: ['gr-only-from-parent'] }));
    fs.mkdirSync(path.join(shop, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(shop, 'vendor', 'griffinjs.css'), '.gr-only-from-parent{color:red}');
    fs.writeFileSync(path.join(shop, 'page.html'), '<p></p>');

    const run = spawnSync(process.execPath, [SCRIPT, '--css', 'vendor/griffinjs.css', '--preset', 'ui', 'page.html'], { cwd: shop, encoding: 'utf8' });

    assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
    assert.match(run.stderr, /пресет ui \(\.\.[\\/]node_modules[\\/]griffincss-ui[\\/]dist[\\/]purge-presets\.json, griffincss-ui 9\.9\.9\)/, 'путь не напечатан: ' + run.stderr);
    assert.ok(!run.stderr.includes('проекта'), 'отчёт называет чужой griffincss-ui пакетом проекта');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- CSS темы и приложения: разбор как у браузера, продолжение --------------
//
// Каждый вход ниже браузер читает иначе, чем отсечение 0.30.0, и вид страницы
// после отсечения расходился с исходным. Ожидание — то, что применяет браузер.

test('цена снятия комментариев линейна: десятки тысяч комментариев в одной прелюдии', () => {
  // Последний выведенный знак читался из растущей строки: каждый комментарий
  // стоил длины собранного, прелюдия — квадрат их числа (65 536 — около 2 с).
  const code = `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then(({ purge }) => {
    const n = 131072;
    const x = new Set(['x']);
    const out = [
      purge('a/**/;'.repeat(n) + '.x{}', x),
      purge('.x' + '/**/.x'.repeat(n) + '{}', x),
      purge('@layer ' + 'a/**/,'.repeat(n) + 'b;', x),
    ];
    process.stdout.write(JSON.stringify(out.map(({ css, kept, dropped }) => [css.length, kept, dropped])));
  });`;
  const run = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 4000 });

  assert.equal(run.signal, null, 'снятие комментариев не уложилось в 4 с');
  assert.equal(run.status, 0, 'разбор упал: ' + run.stderr.slice(0, 300));
  assert.deepEqual(JSON.parse(run.stdout), [[0, 0, 1], [2 + 6 * 131072 + 2, 1, 0], [7 + 6 * 131072 + 2, 0, 0]]);
});

test('опустевший блок слоя: имя с экранированной запятой — одно имя, объявление закрыто', async () => {
  const { purge } = await load();

  // Для браузера `@layer a\,b {…}` — один слой `a,b`. Деление по голой
  // запятой давало объявление `@layer a\;` — экранированная `;` его
  // не закрывала, и правило за ним становилось блоком слоя.
  assert.equal(purge('@layer a\\,b{.u{color:green}}.c{color:red}', S('c')).css, '@layer a\\,b;.c{color:red}');
});

test('блок слоя со списком имён браузер отбрасывает — опустевший уходит без следа и порядка не задаёт', async () => {
  const { purge } = await load();

  // Блок объявляет одно имя: `@layer a, b {…}` негоден целиком. Объявление
  // `@layer a;` из него поставило бы `a` раньше `b`, и синий проиграл бы.
  assert.equal(
    purge('@layer a, b{.u{color:green}}@layer b{.c{color:red}}@layer a{.c{color:blue}}', S('c')).css,
    '@layer b{.c{color:red}}@layer a{.c{color:blue}}',
  );
  // Уцелевший негодный блок остаётся как есть (браузер его и так не видит),
  // но имён не объявляет: опустевший `@layer b` держит место `b` объявлением.
  assert.equal(
    purge('@layer a, b{.c{color:green}}@layer b{.u{color:red}}@layer a{.c{color:blue}}@layer b{.c{color:red}}', S('c')).css,
    '@layer a, b{.c{color:green}}@layer b;@layer a{.c{color:blue}}@layer b{.c{color:red}}',
  );
});

test('`@layer` с неразрывным пробелом — неизвестное браузеру at-правило, а не слой', async () => {
  const { purge } = await load();

  assert.equal(
    purge('@layer a{.u{color:green}}@layer b{.c{color:red}}@layer a{.c{color:blue}}', S('c')).css,
    '@layer b{.c{color:red}}@layer a{.c{color:blue}}',
  );
});

test('блок слоя со строкой вместо имени негоден — опустевший уходит, а не открывает строку', async () => {
  const { purge } = await load();

  assert.equal(purge('@layer "a,b"{.u{color:green}}.c{color:red}', S('c')).css, '.c{color:red}');
  assert.equal(purge('@layer "a"{.u{color:green}}.c{color:red}', S('c')).css, '.c{color:red}');
});

test('имя кадров и свойство animation — с экранированием, как у браузера', async () => {
  const { purge } = await load();
  const frames = '@keyframes foo{from,to{color:rgb(255,0,0)}}';

  for (const rule of ['.a{animation:\\66 oo 1s infinite paused}', '.a{\\61nimation:foo 1s infinite paused}', '.a{animation-name:\\66 oo}']) {
    assert.equal(purge(frames + rule, S('a')).css, frames + rule, rule);
  }

  // Экранировано имя самих кадров.
  assert.equal(purge('@keyframes \\66 oo{to{color:red}}.a{animation:foo 1s}', S('a')).css, '@keyframes \\66 oo{to{color:red}}.a{animation:foo 1s}');
  // Чужие кадры по-прежнему уходят.
  assert.equal(purge('@keyframes bar{to{color:red}}.a{animation:\\66 oo 1s}', S('a')).css, '.a{animation:\\66 oo 1s}');
});

test('экранирование по коду перед `\\r\\n` забирает весь перевод строки, как после предобработки браузера', async () => {
  const { purge } = await load();
  const css = '.a\\31\r\n0{color:red}';

  assert.equal(purge(css, S('a10')).css, css, 'класс a10 выброшен');
  assert.equal(purge(css, S('a1')).css, '', 'класс прочитан как a1');
});

test('края селектора и прелюдии — только пробелы CSS: неразрывный пробел — знак имени', async () => {
  const { purge } = await load();

  // `.a<U+00A0>` — класс `a<U+00A0>`, а не `a`.
  assert.equal(purge('.a {color:red}', S('a')).css, '');
  assert.equal(purge('.a {color:red}', S('a ')).css, '.a {color:red}');
  // `<U+00A0>.a` — элемент `<U+00A0>` с классом `a`: селектор не теряет тег.
  assert.equal(purge(' .a{color:red}', S('a')).css, ' .a{color:red}');
  // `<U+00A0>@layer a {…}` — правило с негодным селектором, а не блок слоя:
  // объявления `@layer a;` из него нет, порядок `b, a` прежний.
  const layered = ' @layer a{.u{color:red}}@layer b{.c{color:red}}@layer a{.c{color:blue}}';

  assert.equal(purge(layered, S('c')).css, layered);
  // Экранированный пробел в конце селектора — часть имени: обрезка его
  // не снимает, иначе `\` экранировал бы `{`.
  assert.equal(purge('.a\\ {color:red}', S('a ')).css, '.a\\ {color:red}');
});

test('ось оформления: значение в селекторе — с экранированием', async () => {
  const { purge } = await load();
  const result = purge('[data-gr-style="\\61 iry"] .x{color:red}', S('x'), { styles: S('airy') });

  assert.equal(result.css, '[data-gr-style="\\61 iry"] .x{color:red}');
  assert.deepEqual(result.styles, { kept: ['airy'], dropped: [] });
});

test('ось оформления решает судьбу правила только там, где отсечение судит точно', async () => {
  const { purge, extractStyles } = await load();
  const xy = S('x', 'y');
  const kept = (css, styles) => assert.equal(purge(css, xy, { styles }).css, css, `${css} при стилях [${[...styles]}]`);

  // Начало, конец, подстрока, префикс до `-`, флаги — не точное имя.
  kept('[data-gr-style^="ai"] .x{color:red}', S('airy'));
  kept('[data-gr-style$="ry"] .x{color:red}', S('airy'));
  kept('[data-gr-style*="ir"] .x{color:red}', S('airy'));
  kept('[data-gr-style|="airy"] .x{color:red}', S('airy-x'));
  kept('[data-gr-style="airy" i] .x{color:red}', S('airy'));
  kept('[data-gr-style="airy" s] .x{color:red}', S('airy'));
  // Пустое значение и значение с пробелом.
  kept('[data-gr-style=""] .x{color:red}', extractStyles('<div data-gr-style="">'));
  kept('[data-gr-style="airy compact"] .x{color:red}', S('airy', 'compact'));
  // Под :not() ось — условие отсутствия.
  kept('.x:not([data-gr-style="airy"]){color:red}', S('compact'));
  kept('.x:not([data-gr-style]){color:red}', S());
  // В :is(), :where(), :has() правило живёт и другой альтернативой.
  kept('.x:is([data-gr-style="airy"],.y){color:red}', S('compact'));
  kept('.x:where([data-gr-style="airy"],.y){color:red}', S('compact'));
  kept('.x:has([data-gr-style="airy"],.y){color:red}', S('compact'));
  // Внутри строки чужого атрибута — не ось.
  kept('[title="[data-gr-style=zz]"] .x{color:red}', S('compact'));
  // `~=` разметка и так делит по пробелам.
  kept('[data-gr-style~="airy"] .x{color:red}', S('airy'));

  // Точные формы по-прежнему отсекают: имя атрибута — без учёта регистра
  // и с пробелами в скобках, единственная альтернатива — тоже условие.
  const both = '[data-gr-style] .x{color:red}[DATA-GR-STYLE=airy] .y{color:blue}';

  assert.equal(purge(both, xy, { styles: S('airy') }).css, both);
  assert.equal(purge('[ data-gr-style = "airy" ] .y{color:blue}', xy, { styles: S('compact') }).css, '');
  assert.deepEqual(purge('[ data-gr-style = "airy" ] .y{color:blue}', xy, { styles: S('compact') }).styles, { kept: [], dropped: ['airy'] });
  assert.equal(purge(':where([data-gr-style=airy]) .x{color:red}', xy, { styles: S('compact') }).css, '');
  assert.equal(purge(':where([data-gr-style=airy]) .x{color:red}', xy, { styles: S('airy') }).css, ':where([data-gr-style=airy]) .x{color:red}');
  assert.equal(purge('[data-gr-style~=airy] .x{color:red}', xy, { styles: S('compact') }).css, '');
});

test('ось оформления: безымянный блок нужен, пока в разметке есть хоть одно значение оси', async () => {
  const { purge, extractStyles } = await load();

  // Стиль страницы в этом CSS не объявлен — браузер применяет `[data-gr-style]`
  // к любому значению.
  assert.equal(purge('[data-gr-style] .x{color:red}', S('x'), { styles: S('airy') }).css, '[data-gr-style] .x{color:red}');
  // Объявлен только во вложенном правиле.
  const nested = '[data-gr-style] .x{color:red}.a{[data-gr-style=airy] &{color:blue}}';

  assert.equal(purge(nested, S('x', 'a'), { styles: S('airy') }).css, nested);

  // Пустое значение — тоже значение оси.
  for (const page of ['<div data-gr-style="">', "<div data-gr-style=''>", '<div data-gr-style=" ">']) {
    assert.ok(extractStyles(page).has(''), page);
    assert.equal(purge('[data-gr-style] .x{color:red}', S('x'), { styles: extractStyles(page) }).css, '[data-gr-style] .x{color:red}', page);
  }

  // Оси в разметке нет — блок уходит, как раньше.
  assert.equal(purge('[data-gr-style] .x{color:red}', S('x'), { styles: extractStyles('<div class="x">') }).css, '');
});

test('имя кадров из var() отсечение не видит — такие кадры остаются', async () => {
  const { purge } = await load();
  const k = '@keyframes k{to{color:red}}';

  for (const rule of ['.a{animation:var(--k)}', '.a{animation-name:var(--k)}', '.a{animation:var(--d) linear var(--k)}', '.a{animation:spin 1s,var(--k)}']) {
    assert.equal(purge(rule + k, S('a')).css, rule + k, rule);
  }

  // Имя кадров названо явно — переменная его не заменит: чужие кадры уходят.
  assert.equal(
    purge('.a{animation:spin var(--d)}@keyframes spin{to{color:red}}@keyframes other{to{color:blue}}', S('a')).css,
    '.a{animation:spin var(--d)}@keyframes spin{to{color:red}}',
  );
});

test('строковое имя кадров берётся целиком', async () => {
  const { purge } = await load();

  for (const name of ['"a b"', '"a,b"', "'a b'", '"ab"']) {
    const css = `@keyframes ${name}{to{color:red}}.x{animation:${name} 1s}`;

    assert.equal(purge(css, S('x')).css, css, name);
  }

  // Имя `a` — не кадры `"a b"`.
  assert.equal(purge('@keyframes "a b"{to{color:red}}.x{animation:a 1s}', S('x')).css, '.x{animation:a 1s}');
});

test('отчёт об оси: стиль разметки не объявлен в CSS — не «в разметке нет data-gr-style»', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'griffincss-axis-'));

  try {
    const css = path.join(dir, 'axis.css');
    const out = path.join(dir, 'out.css');

    fs.writeFileSync(css, AXIS);

    for (const [file, mark] of [['strict.html', 'data-gr-style="strict"'], ['empty.html', 'data-gr-style=""']]) {
      const page = path.join(dir, file);

      fs.writeFileSync(page, `<html ${mark}><button class="gr-btn">Кнопка</button></html>`);

      const run = spawnSync(process.execPath, [SCRIPT, '--css', css, '--out', out, page], { encoding: 'utf8' });

      assert.equal(run.status, 0, 'скрипт завершился с ошибкой: ' + run.stderr);
      assert.ok(fs.readFileSync(out, 'utf8').includes('[data-gr-style]{'), `${file}: блок токенов выброшен`);
      assert.doesNotMatch(run.stderr, /в разметке нет data-gr-style/, `${file}: ${run.stderr}`);
      assert.doesNotMatch(run.stderr, /укажите в --safelist/, `${file}: совет о safelist при атрибуте в разметке`);
      assert.match(run.stderr, /ось оформления — оставлено: ни одного/, `${file}: ${run.stderr}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('селектор по атрибуту с лишним словом после значения разбирается линейно', () => {
  // Значение без кавычек и флаг делили одни знаки: на `[title=a…a b c]`
  // перебор делений стоил квадрат длины (64 КБ — 40 с).
  const code = `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then(({ purge }) => {
    const a = 'a'.repeat(65536);
    const out = [
      purge('[title=' + a + ' b c] .x{}', new Set(['x']), { styles: new Set() }),
      purge('[data-gr-style=' + a + ' b c] .x{}', new Set(['x']), { styles: new Set() }),
    ];
    process.stdout.write(JSON.stringify(out.map(({ kept, dropped }) => [kept, dropped])));
  });`;
  const run = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 4000 });

  assert.equal(run.signal, null, 'разбор селектора не уложился в 4 с');
  assert.equal(run.status, 0, 'разбор упал: ' + run.stderr.slice(0, 300));
  assert.deepEqual(JSON.parse(run.stdout), [[1, 0], [1, 0]]);
});

test('пустое имя в списке @layer делает негодным всё объявление, как у браузера', async () => {
  const { purge } = await load();
  const rest = '@layer a{.u{color:green}}@layer b{.c{color:red}}@layer a{.c{color:blue}}';

  // Объявление браузер отбрасывает, место `a` задаёт первый блок — опустевший,
  // он остаётся объявлением, и порядок прежний: `a, b`.
  for (const statement of ['@layer a,,b;', '@layer a,;', '@layer ,a;']) {
    assert.equal(purge(statement + rest, S('c')).css, `${statement}@layer a;@layer b{.c{color:red}}@layer a{.c{color:blue}}`, statement);
  }
});

test('имя кадров из if() и других функций подстановки — кадры остаются; `;` в скобках не конец объявления', async () => {
  const { purge } = await load();
  const fade = '@keyframes fade{from,to{color:red}}';

  for (const rule of [
    '.a{animation-name:if(style(--x:1):k;else:fade);animation-duration:1s}',
    '.a{animation:1s random-item(--x,fade,spin)}',
  ]) {
    assert.equal(purge(rule + fade, S('a')).css, rule + fade, rule);
  }

  // Функции времени и математика имени не подставляют: чужие кадры уходят.
  assert.equal(
    purge('.a{animation:spin calc(1s*2) cubic-bezier(.2,0,0,1) steps(4,end)}@keyframes spin{to{color:red}}' + fade, S('a')).css,
    '.a{animation:spin calc(1s*2) cubic-bezier(.2,0,0,1) steps(4,end)}@keyframes spin{to{color:red}}',
  );
  assert.equal(purge('.a{animation:1s linear(0,1) infinite}' + fade, S('a')).css, '.a{animation:1s linear(0,1) infinite}');
});

test('все функции математики CSS Values 4 имени кадров не подставляют', async () => {
  const { purge } = await load();
  const fade = '@keyframes fade{to{color:red}}';
  const math = ['calc', 'min', 'max', 'clamp', 'round', 'mod', 'rem', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'sqrt', 'hypot', 'log', 'exp', 'abs', 'sign'];

  // Имя анимации — не объявленные кадры: подстановки нет, чужие кадры уходят.
  for (const name of math) {
    const rule = `.a{animation:spni 1s ${name.toUpperCase()}(1)}`;

    assert.equal(purge(rule + fade, S('a')).css, rule, name);
  }
});
