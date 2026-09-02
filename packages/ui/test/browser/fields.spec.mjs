// Полигон полей GriffinJS (Этап 38): два файла слоя на одной странице —
// griffinjs.js и griffinjs-fields.js — правильный сценарий, и он обязан
// работать. Второй прогон блокирует бандл полей: каждое поле остаётся
// рабочим на одной платформе — база без скрипта, условие приёмки.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const LAB = '/docs/griffinjs-fields-lab.html';
const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

// Виджеты полного griffinjs.js — как на основном полигоне; поля идут
// после них, потому что второй файл регистрируется вторым.
const LAYER = ['track', 'slider', 'gallery', 'parallax', 'megamenu', 'dropdown', 'tooltip', 'dialog', 'combobox', 'range', 'sortable'];
const FIELDS = ['mask', 'phone', 'datetime', 'file', 'rating', 'otp', 'counter', 'validate'];

function watch(page) {
  const errors = [];

  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  return errors;
}

test('оба файла слоя на одной странице: одно ядро, все виджеты, консоль чистая', async ({ page }) => {
  const errors = watch(page);

  await page.goto(LAB);

  await expect(page.locator('#gr-lab-status')).toHaveText(`GriffinJS v${VERSION}`);
  await expect(page.locator('#gr-lab-fields')).toHaveText(`поля: ${FIELDS.join(', ')}`);
  expect(await page.evaluate(() => Object.keys(window.GriffinJS.widgets))).toEqual([...LAYER, ...FIELDS]);
  expect(errors).toEqual([]);
});

test('без griffinjs-fields.js полигон остаётся рабочей страницей, старый слой на месте', async ({ page }) => {
  const errors = watch(page);

  await page.route('**/griffinjs-fields.js', (route) => route.abort());
  await page.goto(LAB);

  expect(await page.evaluate(() => Object.keys(window.GriffinJS.widgets))).toEqual(LAYER);
  await expect(page.locator('#gr-lab-fields')).toHaveText('griffinjs-fields.js не подключён');

  // База без скрипта: маска не надета, поле принимает что угодно,
  // а проверяет его pattern платформы.
  const phone = page.locator('#gr-lab-mask-phone');

  await phone.pressSequentially('abc');
  expect(await phone.inputValue()).toBe('abc');
  expect(await phone.evaluate((el) => el.validity.patternMismatch)).toBe(true);
  expect(await phone.getAttribute('placeholder')).toBeNull();

  // База без скрипта: список кодов и поле tel — обе части платформенные.
  const code = page.locator('#gr-lab-phone-code');

  await expect(code.locator('option')).toHaveCount(3);
  await expect(code.locator('option').first()).toHaveText('RU +7');
  await code.selectOption('+375');
  expect(await code.inputValue()).toBe('+375');
  expect(await page.locator('#gr-lab-phone-table-code option').count()).toBe(0);

  // База без скрипта: нативное поле даты, как сегодня.
  const date = page.locator('#gr-lab-date');

  await date.click();
  expect(await date.getAttribute('type')).toBe('date');
  expect(await date.inputValue()).toBe('2026-09-01');

  // База без скрипта: файловое поле выбирает несколько файлов, списка нет.
  const file = page.locator('#gr-lab-file');

  await file.setInputFiles([{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') }, { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('bb') }]);
  expect(await file.evaluate((el) => el.files.length)).toBe(2);
  expect(await page.locator('.gr-file-list').count()).toBe(0);

  // База без скрипта: радиокнопки видны и выбираются, ряд знаков молчит.
  const rating = page.locator('#gr-lab-rating');

  await expect(rating).not.toHaveAttribute('data-gr-state', /.*/);
  await expect(rating.locator('input[value="3"]')).toBeVisible();
  await rating.locator('input[value="3"]').check();
  expect(await rating.locator('.gr-rating').evaluate((el) => el.style.getPropertyValue('--gr-rating'))).toBe('');

  // База без скрипта: ячейки кода заполняются вручную, фокус сам не ходит.
  const cell = page.locator('#gr-lab-otp input').first();

  await cell.click();
  await page.keyboard.type('12');
  expect(await cell.inputValue()).toBe('1');
  await expect(cell).toBeFocused();

  // База без скрипта: форму проверяет браузер, сводки нет.
  await page.locator('#gr-lab-v-submit').click();
  expect(await page.locator('.gr-validate').count()).toBe(0);
  expect(await page.evaluate(() => document.getElementById('gr-lab-validate').checkValidity())).toBe(false);

  // База без скрипта: maxlength ограничивает и без счётчика.
  const area = page.locator('#gr-lab-counter');

  await area.fill('а'.repeat(60));
  expect(await area.inputValue()).toHaveLength(40);
  expect(await page.locator('.gr-counter').count()).toBe(0);

  // Заблокированный самим тестом файл Chromium записывает как ошибку загрузки.
  expect(errors.filter((text) => !/ERR_FAILED|griffinjs-fields\.js/.test(text))).toEqual([]);
});

test('без обоих файлов слоя страница остаётся страницей', async ({ page }) => {
  const errors = watch(page);

  await page.route('**/griffinjs*.js', (route) => route.abort());
  await page.goto(LAB);

  expect(await page.evaluate(() => typeof window.GriffinJS)).toBe('undefined');
  await expect(page.locator('#gr-lab-status')).toHaveText('griffinjs.js не подключён');
  expect(errors.filter((text) => !/ERR_FAILED|griffinjs/.test(text))).toEqual([]);
});

const caret = (locator) => locator.evaluate((el) => [el.selectionStart, el.selectionEnd]);

test('маска: литералы подставляются, каретка встаёт за введённым знаком в каждом движке', async ({ page }) => {
  await page.goto(LAB);

  const phone = page.locator('#gr-lab-mask-phone');

  await expect(phone).toHaveAttribute('placeholder', '+7 (___) ___-__-__');
  await expect(phone).toHaveAttribute('inputmode', 'numeric');
  await expect(phone).toHaveAttribute('data-gr-state', 'empty');

  await phone.click();
  await page.keyboard.type('912');
  expect(await phone.inputValue()).toBe('+7 (912');
  expect(await caret(phone)).toEqual([7, 7]);

  // Литералы «) » приходят вместе со следующей цифрой, каретка — за ней.
  await page.keyboard.type('3');
  expect(await phone.inputValue()).toBe('+7 (912) 3');
  expect(await caret(phone)).toEqual([10, 10]);

  // Буква в цифровом слоте отброшена, каретка на месте.
  await page.keyboard.type('x');
  expect(await phone.inputValue()).toBe('+7 (912) 3');
  expect(await caret(phone)).toEqual([10, 10]);

  // Backspace через литералы снимает знак, а не скобку.
  await page.keyboard.press('Backspace');
  expect(await phone.inputValue()).toBe('+7 (912');
  await page.keyboard.press('Backspace');
  expect(await phone.inputValue()).toBe('+7 (91');
  expect(await caret(phone)).toEqual([6, 6]);

  // Ввод в середину: каретка между «9» и «1», знак встаёт туда, хвост сдвигается.
  await phone.evaluate((el) => el.setSelectionRange(5, 5));
  await page.keyboard.type('0');
  expect(await phone.inputValue()).toBe('+7 (901');
  expect(await caret(phone)).toEqual([6, 6]);

  await phone.evaluate((el) => el.setSelectionRange(99, 99));
  await page.keyboard.type('2345678');
  expect(await phone.inputValue()).toBe('+7 (901) 234-56-78');
  await expect(phone).toHaveAttribute('data-gr-state', 'complete');
  expect(await phone.evaluate((el) => el.validity.valid)).toBe(true);
});

test('маска: события input и change приходят по одному разу на правку и на уход фокуса', async ({ page }) => {
  await page.goto(LAB);

  const time = page.locator('#gr-lab-mask-time');

  expect(await time.inputValue()).toBe('14:30');

  await page.evaluate(() => {
    window.__seen = { input: 0, change: 0 };
    const el = document.getElementById('gr-lab-mask-time');

    el.addEventListener('input', () => { window.__seen.input += 1; });
    el.addEventListener('change', () => { window.__seen.change += 1; });
  });

  await time.click();
  await time.evaluate((el) => el.setSelectionRange(0, 5));
  await page.keyboard.type('0915');
  expect(await time.inputValue()).toBe('09:15');

  // Уход фокуса — ровно один change; повторный уход без правки — ни одного.
  await page.locator('#gr-lab-mask-plate').focus();
  await time.focus();
  await page.locator('#gr-lab-mask-plate').focus();

  expect(await page.evaluate(() => window.__seen)).toEqual({ input: 4, change: 1 });
});

test('маска: вставка полного номера с литералами и буквенные слоты в верхнем регистре', async ({ page }) => {
  await page.goto(LAB);

  const phone = page.locator('#gr-lab-mask-phone');
  const plate = page.locator('#gr-lab-mask-plate');

  // Вставка целой строки одним beforeinput — как из буфера; путь
  // с dataTransfer проверен на мок-DOM, здесь важен прогон по маске
  // с литералами внутри текста.
  await phone.click();
  await page.keyboard.insertText('+7 (999) 111-22-33');
  expect(await phone.inputValue()).toBe('+7 (999) 111-22-33');

  await plate.click();
  await page.keyboard.type('а123вс77');
  expect(await plate.inputValue()).toBe('А 123 ВС-77');

  // Хвост после ? необязателен: без него маска уже полна.
  await plate.fill('');
  await page.keyboard.type('к777кк');
  await expect(plate).toHaveAttribute('data-gr-state', 'complete');
});

test('телефон: подписи из Intl в языке страницы, смена кода меняет маску, вставка с плюсом выбирает страну', async ({ page }) => {
  await page.goto(LAB);

  const code = page.locator('#gr-lab-phone-code');
  const phone = page.locator('#gr-lab-phone');

  await expect(code.locator('option')).toHaveText(['🇷🇺 Россия +7', '🇧🇾 Беларусь +375', '🇺🇦 Украина +380']);
  await expect(phone).toHaveAttribute('placeholder', '(___) ___-__-__');

  await phone.click();
  await page.keyboard.type('9123456789');
  expect(await phone.inputValue()).toBe('(912) 345-67-89');

  // Ширина: списку — не больше двух пятых группы, номеру — остальное.
  const [selectW, inputW] = await page.evaluate(() => [document.getElementById('gr-lab-phone-code').getBoundingClientRect().width, document.getElementById('gr-lab-phone').getBoundingClientRect().width]);

  expect(inputW).toBeGreaterThan(selectW);

  await code.selectOption('+375');
  expect(await phone.inputValue()).toBe('(91) 234-56-78');
  await expect(phone).toHaveAttribute('placeholder', '(__) ___-__-__');
  expect(await page.evaluate(() => window.GriffinJS.instance(document.getElementById('gr-lab-phone-group'), 'phone').value())).toBe('+375912345678');

  // Вставка полного номера с плюсом: страна по коду, остаток в маску.
  await phone.click();
  await phone.evaluate((el) => {
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });

    e.clipboardData.setData('text', '+380 (67) 123-45-67');
    el.dispatchEvent(e);
  });
  expect(await code.inputValue()).toBe('+380');
  expect(await phone.inputValue()).toBe('(67) 123-45-67');
});

test('телефон: пустой список заполняется из таблицы по алфавиту языка страницы; восьмёрка становится +7', async ({ page }) => {
  await page.goto(LAB);

  const code = page.locator('#gr-lab-phone-table-code');
  const number = page.locator('#gr-lab-phone-table');

  // Казахстан из таблицы несёт префикс «8»: одиннадцатый знак его снимает.
  await number.click();
  await page.keyboard.type('89123456789');
  expect(await number.inputValue()).toBe('(912) 345-67-89');
  const options = code.locator('option');

  expect(await options.count()).toBeGreaterThan(50);
  await expect(options.first()).toHaveText(/^🇦/);
  expect(await code.inputValue()).toBe('+7');
  expect(await code.locator('option:checked').getAttribute('data-gr-iso')).toBe('KZ');

  // Порядок задаёт имя в языке страницы, а не флаг перед ним.
  const names = (await options.allTextContents()).map((text) => text.replace(/^\S+ /, '').replace(/ \+\d+$/, ''));

  expect(names[0]).toBe('Австралия');
  expect(names.slice().sort(new Intl.Collator('ru').compare)).toEqual(names);
  await expect(page.locator('#gr-lab-phone-table')).toHaveAttribute('placeholder', '(___) ___-__-__');
});

test('дата: тач-событие разметку не трогает, указатель мыши подменяет тип и заводит спутник в ISO', async ({ page }) => {
  await page.goto(LAB);

  const date = page.locator('#gr-lab-date');

  await page.dispatchEvent('#gr-lab-date', 'pointerdown', { pointerType: 'touch', bubbles: true });
  expect(await date.getAttribute('type')).toBe('date');
  expect(await page.locator('#gr-lab-date + input[hidden]').count()).toBe(0);

  // Подмена типа отложена виджетом на тик после нажатия — ждём её.
  await date.click();
  await expect(date).toHaveAttribute('type', 'text');
  expect(await date.inputValue()).toBe('01.09.2026');
  await expect(date).toHaveAttribute('placeholder', '__.__.____');
  expect(await date.getAttribute('name')).toBeNull();

  const companion = page.locator('#gr-lab-date + input[hidden]');

  await expect(companion).toHaveAttribute('type', 'date');
  await expect(companion).toHaveAttribute('name', 'from');
  expect(await companion.inputValue()).toBe('2026-09-01');

  // Форма отправляет ISO под прежним именем.
  expect(await page.evaluate(() => new FormData(document.getElementById('gr-lab-datetime-form')).get('from'))).toBe('2026-09-01');

  // Панель открыта щелчком; выбор дня пишет текст и ISO, закрывает панель.
  const panel = page.locator('.gr-datetime-panel');

  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'dialog');
  await expect(date).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.locator('.gr-datetime-title')).toHaveText(/сентябрь/i);
  expect(await panel.locator('.gr-datetime-year').inputValue()).toBe('2026');
  await expect(panel.locator('[aria-selected="true"]')).toHaveText('1');

  // Год — списком в шапке: смена листает сетку, панель остаётся открытой.
  await panel.locator('.gr-datetime-year').selectOption('2026');
  await expect(panel).toBeVisible();

  await panel.locator('[data-gr-date="2026-09-20"]').click();
  expect(await date.inputValue()).toBe('20.09.2026');
  expect(await companion.inputValue()).toBe('2026-09-20');
  await expect(panel).toBeHidden();
  await expect(date).toBeFocused();

  // Уход фокуса возвращает нативный тип, имя и ISO: значок календаря
  // и подсказка платформы снова на месте.
  await page.locator('#gr-lab-time').focus();
  await expect(date).toHaveAttribute('type', 'date');
  expect(await date.inputValue()).toBe('2026-09-20');
  expect(await date.getAttribute('name')).toBe('from');
  expect(await page.locator('#gr-lab-date + input[hidden]').count()).toBe(0);

  // И снова подменяется указателем мыши.
  await date.click();
  await expect(date).toHaveAttribute('type', 'text');
  expect(await date.inputValue()).toBe('20.09.2026');
});

test('дата: клавиатура ходит по сетке через aria-activedescendant, границы проверяет виджет', async ({ page }) => {
  await page.goto(LAB);

  const date = page.locator('#gr-lab-date');
  const panel = page.locator('.gr-datetime-panel');

  await date.click();
  await expect(panel).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await expect(date).toHaveAttribute('aria-activedescendant', /2026-09-08$/);
  await expect(panel.locator('[data-gr-state="active"]')).toHaveText('8');

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageDown');
  await expect(panel.locator('.gr-datetime-title')).toHaveText(/октябрь/i);

  await page.keyboard.press('Enter');
  expect(await date.inputValue()).toBe('09.10.2026');
  await expect(panel).toBeHidden();
  await expect(date).not.toHaveAttribute('aria-activedescendant', /.*/);

  // Esc закрывает, фокус на месте.
  await page.keyboard.press('ArrowDown');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(date).toBeFocused();

  // Плата за текстовое поле: min/max проверяет виджет. Сообщение
  // о границах — платформенное, о невозможной дате — своё.
  const validity = () => date.evaluate((el) => [el.validity.valid, el.validationMessage]);

  await date.fill('');
  await page.keyboard.type('31022026');
  expect(await validity()).toEqual([false, 'Такой даты нет']);
  await expect(date).toHaveAttribute('aria-invalid', 'true');

  await date.fill('');
  await page.keyboard.type('01012020');
  expect(await page.locator('#gr-lab-date + input[hidden]').inputValue()).toBe('2020-01-01');

  const [valid, message] = await validity();

  expect(valid).toBe(false);
  expect(message.length).toBeGreaterThan(0);

  await date.fill('');
  await page.keyboard.type('15092026');
  expect(await validity()).toEqual([true, '']);
});

test('время остаётся нативным полем, дата-время — маска по локали и время в панели', async ({ page }) => {
  await page.goto(LAB);

  const time = page.locator('#gr-lab-time');
  const both = page.locator('#gr-lab-datetime');

  // Время виджет не трогает: щелчок не подменяет тип, панели нет —
  // выбор часов и минут у платформы встроен в само поле.
  await time.click();
  await page.waitForTimeout(50);
  expect(await time.getAttribute('type')).toBe('time');
  expect(await time.inputValue()).toBe('14:30');
  expect(await page.locator('.gr-datetime-panel').count()).toBe(0);
  expect(await page.locator('#gr-lab-time + input[hidden]').count()).toBe(0);

  await both.click();
  await expect(both).toHaveAttribute('placeholder', /^__\.__\.____.+__:__$/);

  // Панелей на странице уже две — у времени и у даты-времени; берём открытую.
  const panel = page.locator('.gr-datetime-panel[data-gr-state="open"]');

  await expect(panel).toBeVisible();

  // У даты-времени в панели есть время: смена пишет ISO вместе с датой,
  // фокус в поле времени панель не закрывает.
  const clock = panel.locator('.gr-datetime-clock-input');

  await expect(clock).toHaveAttribute('type', 'time');
  await clock.fill('18:45');
  await expect(panel).toBeVisible();
  expect(await page.locator('#gr-lab-datetime + input[hidden]').inputValue()).toMatch(/T18:45$/);

  // Выбор дня из панели при фокусе в поле времени: панель закрывается,
  // фокус уходит из поля, и оно возвращается к нативному типу с ISO.
  await panel.locator('[data-gr-date="2026-09-20"]').click();
  await expect(both).toHaveAttribute('type', 'datetime-local');
  expect(await both.inputValue()).toBe('2026-09-20T18:45');
});

test('файловое поле: список выбранного, удаление одного переписывает input.files, append копит', async ({ page }) => {
  await page.goto(LAB);

  const file = page.locator('#gr-lab-file');
  const list = page.locator('#gr-lab-file + .gr-file-list');

  await expect(list).toHaveAttribute('aria-live', 'polite');
  await file.setInputFiles([
    { name: 'отчёт.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2048) },
    { name: 'фото.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(3 * 1024 * 1024) },
  ]);

  await expect(list.locator('.gr-file-name')).toHaveText(['отчёт.pdf', 'фото.jpg']);
  await expect(list.locator('.gr-file-size')).toHaveText(['2 кБ', '3 МБ']);

  const remove = list.locator('.gr-file-remove').first();

  await expect(remove).toHaveAttribute('aria-label', 'Убрать отчёт.pdf');
  await remove.click();

  expect(await file.evaluate((el) => Array.from(el.files).map((f) => f.name))).toEqual(['фото.jpg']);
  await expect(list.locator('.gr-file-name')).toHaveText(['фото.jpg']);
  await expect(list.locator('.gr-file-remove')).toBeFocused();

  // Повторный выбор заменяет; с append — добавляет.
  await file.setInputFiles([{ name: 'c.txt', mimeType: 'text/plain', buffer: Buffer.from('c') }]);
  await expect(list.locator('.gr-file-name')).toHaveText(['c.txt']);

  const append = page.locator('#gr-lab-file-append');

  await append.setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('a') }]);
  await append.setInputFiles([{ name: 'b.png', mimeType: 'image/png', buffer: Buffer.from('b') }]);
  expect(await append.evaluate((el) => Array.from(el.files).map((f) => f.name))).toEqual(['a.png', 'b.png']);
  await expect(page.locator('#gr-lab-file-append + .gr-file-list .gr-file-name')).toHaveText(['a.png', 'b.png']);
});

test('файловое поле: зона перетаскивания принимает файлы и подсвечивается', async ({ page, browserName }) => {
  await page.goto(LAB);

  const zone = page.locator('#gr-lab-file-drop');
  const input = page.locator('#gr-lab-file-drop-input');

  // Без скрипта обёртка — кнопка выбора; со скриптом поле внутри остаётся полем.
  await input.setInputFiles([{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') }]);
  await expect(zone.locator('.gr-file-name')).toHaveText(['a.txt']);

  // Сброс файла — DataTransfer с файлом собрать можно только в Chromium.
  if (browserName !== 'chromium') return;

  const dt = await page.evaluateHandle(() => {
    const t = new DataTransfer();

    t.items.add(new File(['b'], 'b.txt', { type: 'text/plain' }));

    return t;
  });

  await zone.dispatchEvent('dragover', { dataTransfer: dt });
  await expect(zone).toHaveAttribute('data-gr-state', 'over');
  await zone.dispatchEvent('drop', { dataTransfer: dt });
  await expect(zone).not.toHaveAttribute('data-gr-state', /.*/);
  expect(await input.evaluate((el) => Array.from(el.files).map((f) => f.name))).toEqual(['a.txt', 'b.txt']);
  await expect(zone.locator('.gr-file-name')).toHaveText(['a.txt', 'b.txt']);
});

test('ввод оценки: щелчок по знаку выбирает, клавиатура ходит по группе, наведение показывает под указателем', async ({ page }) => {
  await page.goto(LAB);

  const rating = page.locator('#gr-lab-rating');
  const display = rating.locator('.gr-rating');
  const value = () => display.evaluate((el) => el.style.getPropertyValue('--gr-rating'));

  await expect(rating).toHaveAttribute('data-gr-state', 'ready');
  expect(await value()).toBe('0');

  // Подписи лежат поверх ряда знаков: щелчок по третьему знаку — выбор «3».
  // Координаты — после прокрутки к стенду: мышь бьёт по окну, а не по странице.
  await rating.scrollIntoViewIfNeeded();

  const box = await display.boundingBox();

  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(rating.locator('input[value="3"]')).toBeChecked();
  expect(await value()).toBe('3');
  await expect(display).toHaveAttribute('aria-label', '3 из 5');

  // Сама радиокнопка на экране не рисуется: прозрачна и растянута на колонку.
  expect(await rating.locator('input[value="3"]').evaluate((el) => [getComputedStyle(el).opacity, Math.round(el.getBoundingClientRect().height) > 20])).toEqual(['0', true]);

  // Наведение мышью — оценка под указателем, уход возвращает выбранную.
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  expect(await value()).toBe('5');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 80);
  expect(await value()).toBe('3');

  // Клавиатура — платформенная группа радиокнопок.
  await rating.locator('input[value="3"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(rating.locator('input[value="4"]')).toBeChecked();
  expect(await value()).toBe('4');
  await expect(display).toHaveAttribute('aria-label', '4 из 5');
});

test('одноразовый код: фокус идёт по ячейкам, Backspace возвращает, вставка раскладывает код', async ({ page, browserName }) => {
  await page.goto(LAB);

  const cells = page.locator('#gr-lab-otp input');
  const root = page.locator('#gr-lab-otp');

  await cells.nth(0).click();
  await page.keyboard.type('12');
  await expect(cells.nth(2)).toBeFocused();
  expect(await cells.evaluateAll((els) => els.map((el) => el.value).join(''))).toBe('12');
  await expect(root).toHaveAttribute('data-gr-state', 'partial');

  await page.keyboard.press('Backspace');
  await expect(cells.nth(1)).toBeFocused();
  expect(await cells.nth(1).inputValue()).toBe('');

  // Буква в цифровую ячейку не принимается.
  await page.keyboard.type('x');
  expect(await cells.nth(1).inputValue()).toBe('');
  await expect(cells.nth(1)).toBeFocused();

  // Вставка из буфера в первую ячейку — как её шлёт браузер, событием paste.
  await cells.nth(0).click();
  await cells.nth(0).evaluate((el) => {
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });

    e.clipboardData.setData('text', 'Код: 65 43 21');
    el.dispatchEvent(e);
  });
  expect(await cells.evaluateAll((els) => els.map((el) => el.value).join(''))).toBe('654321');
  await expect(root).toHaveAttribute('data-gr-state', 'complete');
  await expect(page.locator('#gr-lab-otp-out')).toHaveText('Код: 654321');
  await expect(cells.nth(5)).toBeFocused();

  // Целый код одним beforeinput — как из автозаполнения. Так его вставляет
  // только инструмент Chromium: Firefox переставляет фокус после вставки,
  // WebKit шлёт знаки по одному, и оба пути ниже уже проверены.
  if (browserName === 'chromium') {
    await cells.nth(0).click();
    await page.keyboard.insertText('112233');
    expect(await cells.evaluateAll((els) => els.map((el) => el.value).join(''))).toBe('112233');
    await expect(cells.nth(5)).toBeFocused();
  }

  // Набор поверх заполненной ячейки заменяет знак, а не упирается в maxlength.
  const before = await cells.evaluateAll((els) => els.map((el) => el.value).join(''));

  await cells.nth(2).click();
  await page.keyboard.type('9');
  expect(await cells.evaluateAll((els) => els.map((el) => el.value).join(''))).toBe(before.slice(0, 2) + '9' + before.slice(3));
});

test('сводка ошибок: после отправки список ссылками с сообщениями платформы, фокус на первой', async ({ page }) => {
  await page.goto(LAB);

  const form = page.locator('#gr-lab-validate');
  const box = form.locator('.gr-validate');

  await expect(box).toBeHidden();
  await expect(form).toHaveAttribute('novalidate', '');

  await page.locator('#gr-lab-v-submit').click();
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute('role', 'alert');

  const links = box.locator('a');

  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveText(/^Имя: .+/);
  await expect(links.nth(1)).toHaveText(/^Почта: .+/);
  await expect(links.nth(2)).toHaveText(/^Тема: .+/);
  await expect(links.nth(0)).toBeFocused();
  await expect(page.locator('#gr-lab-v-mail')).toHaveAttribute('aria-invalid', 'true');

  // Ссылка ведёт к полю.
  await links.nth(1).click();
  await expect(page.locator('#gr-lab-v-mail')).toBeFocused();

  // Исправленное поле теряет пометку сразу; список — по следующей отправке.
  await page.keyboard.type('a@b.cd');
  await expect(page.locator('#gr-lab-v-mail')).not.toHaveAttribute('aria-invalid', /.*/);
  await expect(links).toHaveCount(3);

  await page.locator('#gr-lab-v-submit').click();
  await expect(links).toHaveCount(2);

  await page.locator('#gr-lab-v-name').fill('Ян');
  await page.locator('#gr-lab-v-kind').selectOption('bug');
  await page.locator('#gr-lab-v-submit').click();
  await expect(box).toBeHidden();
});

test('счётчик: остаток в подписи, порог и предел состояниями', async ({ page }) => {
  await page.goto(LAB);

  const area = page.locator('#gr-lab-counter');
  const out = page.locator('#gr-lab-counter + .gr-counter');

  await expect(out).toHaveText('40');
  await expect(out).toHaveAttribute('aria-live', 'polite');
  await expect(area).toHaveAttribute('aria-describedby', await out.getAttribute('id'));

  await area.pressSequentially('Привет');
  await expect(out).toHaveText('34');
  await expect(out).toHaveAttribute('data-gr-state', 'ok');

  await area.fill('а'.repeat(32));
  await expect(out).toHaveText('8');
  await expect(out).toHaveAttribute('data-gr-state', 'near');

  await area.fill('а'.repeat(40));
  await expect(out).toHaveText('0');
  await expect(out).toHaveAttribute('data-gr-state', 'full');
});
