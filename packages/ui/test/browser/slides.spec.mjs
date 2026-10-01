// Семейство прокрутки на полигоне: слайдер с точками и автоплеем,
// галерея с превью, лайтбокс на <dialog> — в трёх движках.

import { test, expect } from '@playwright/test';

const LAB = '/docs/griffinjs-lab.html';

// Полигон без плавной прокрутки (её включает ресет ядра): плавный подъезд
// страницы к элементу при focus() перебивает в Firefox плавную прокрутку
// дорожки, и замер scrollLeft ловит обрыв анимации. Поведение виджетов
// от этого не зависит.
async function open(page) {
  await page.goto(LAB);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
}

test('слайдер: точки построены, щелчок по точке листает, наведение держит автоплей', async ({ page }) => {
  await open(page);

  const slider = page.locator('#gr-lab-slider');

  await expect(slider).toHaveAttribute('data-gr-state', 'playing');
  await expect(slider.locator('.gr-slider-dot')).toHaveCount(3);
  await expect(slider.locator('[data-gr-pause]')).toHaveCount(1);

  await slider.locator('.gr-slider-dot').nth(2).click();
  await expect(slider.locator('.gr-slider-dot').nth(2)).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => slider.evaluate((el) => window.GriffinJS.instance(el, 'slider').track.physical(
    window.GriffinJS.instance(el, 'slider').track.index))).toBe(2);

  // Щелчок по точке оставил фокус внутри — фокус тоже держит паузу,
  // поэтому сперва уводится фокус, потом проверяется наведение.
  await page.evaluate(() => document.activeElement.blur());
  await page.mouse.move(0, 0);
  await expect(slider).toHaveAttribute('data-gr-state', 'playing');
  await slider.hover();
  await expect(slider).toHaveAttribute('data-gr-state', 'paused');
  await page.mouse.move(0, 0);
  await expect(slider).toHaveAttribute('data-gr-state', 'playing');
});

test('галерея: превью ведёт дорожку и получает aria-current', async ({ page }) => {
  await open(page);

  const gallery = page.locator('#gr-lab-gallery');
  const thumbs = gallery.locator('.gr-gallery-thumbs > button');

  await expect(thumbs.nth(0)).toHaveAttribute('aria-current', 'true');
  await thumbs.nth(1).click();
  await expect(thumbs.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(gallery.locator('.gr-track > *').nth(1)).toHaveAttribute('aria-current', 'true');
});

test('лайтбокс: открывается по щелчку, стрелка листает, Esc закрывает и убирает окно', async ({ page }) => {
  await open(page);
  await page.locator('#gr-lab-lightbox-2').click();

  const dialog = page.locator('dialog.gr-lightbox');

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('2 / 2');
  await expect(dialog.locator('.gr-lightbox-item:not([data-gr-clone]) .gr-lightbox-caption').nth(1)).toHaveText('Второй кадр');

  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('1 / 2');

  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.gr-lightbox')).toHaveCount(0);
  await expect(page.locator('#gr-lab-lightbox-2')).toBeFocused();
});

// Клоны краёв цикла — декорация на время доезда: плеер в клоне не грузится.
// Группа из трёх видео грузит три плеера, а не пять (два клона краёв).
test('лайтбокс: группа из трёх видео грузит три плеера, клоны краёв — без src; цикл листает', async ({ page }) => {
  const players = [];

  page.on('request', (r) => { if (/fragments\/player-\d\.html/.test(r.url())) players.push(r.url()); });
  await page.goto('/docs/griffinjs-slides.html');
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());
  await page.locator('a[data-gr-src="fragments/player-1.html"]').click();

  const dialog = page.locator('dialog.gr-lightbox');

  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('1 / 3');
  await expect.poll(() => players.length, 'плееров загружено не три: клоны краёв грузят свои').toBe(3);
  await expect(dialog.locator('[data-gr-clone] iframe[src]'), 'клон краёв грузит плеер').toHaveCount(0);

  // Цикл работает и без медиа в клонах: назад с первого — на последний.
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('3 / 3');
  expect(players.length, 'лишние загрузки плеера').toBe(3);
});

// <object> и <embed> — тоже медиа: клон с data или src поднял бы плеер
// второй раз, как фрейм. Каждый адрес загружается ровно один раз.
test('слайдер с циклом: клоны краёв не грузят <object> и <embed>', async ({ page }) => {
  const loads = [];

  page.on('request', (r) => { if (/[?&][oe]=\d/.test(r.url())) loads.push(new URL(r.url()).search); });
  await open(page);
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());
  await page.evaluate(() => {
    const slides = [1, 2, 3].map((n) => `<div><object data="fragments/player-1.html?o=${n}" type="text/html" width="100" height="50"></object>`
      + `<embed src="fragments/player-1.html?e=${n}" type="text/html" width="100" height="50"></div>`).join('');

    document.body.insertAdjacentHTML('beforeend', `<div id="objects" class="gr-slider" data-gr-slider="loop" style="width:600px"><div class="gr-track">${slides}</div></div>`);
  });

  await expect(page.locator('#objects [data-gr-clone]').first(), 'клоны не построены').toBeAttached();
  await expect.poll(() => loads.length).toBe(6);
  await page.waitForTimeout(500);
  expect(loads.sort(), 'клоны краёв загрузили своё').toEqual(['?e=1', '?e=2', '?e=3', '?o=1', '?o=2', '?o=3']);
});

// Окно с последней миниатюры: дорожка в x = 0, клон последнего — перед
// первым. Движок ставил окно на этот клон и уходил с него только после
// события прокрутки — WebKit его не присылал, и видимый кадр был inert,
// а «←» ехал через всю ленту.
test('лайтбокс: окно с последней миниатюры — на настоящем кадре, «←» — один шаг', async ({ page }) => {
  await page.goto('/docs/griffinjs-slides.html');
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());
  await page.locator('a[data-gr-lightbox="promo"]').nth(2).click();

  const dialog = page.locator('dialog.gr-lightbox');
  const current = dialog.locator('.gr-lightbox-item[aria-current]');
  // Сдвиг текущего кадра от левого края окна дорожки: 0 — он и виден.
  const offset = () => current.evaluate((el) => Math.round(el.getBoundingClientRect().left - el.parentElement.getBoundingClientRect().left));

  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('3 / 3');
  await page.waitForTimeout(400);
  expect(await offset(), 'видно не текущий кадр: окно стоит на клоне').toBe(0);
  expect(await current.evaluate((el) => el.hasAttribute('inert') || el.hasAttribute('data-gr-clone'))).toBe(false);

  const before = await dialog.locator('.gr-track').evaluate((el) => el.scrollLeft);

  await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('2 / 3');
  await expect.poll(offset).toBe(0);

  const width = await current.evaluate((el) => el.getBoundingClientRect().width);
  const after = await dialog.locator('.gr-track').evaluate((el) => el.scrollLeft);

  expect(Math.round(before - after), '«←» проехал не один кадр').toBe(Math.round(width));
});

// Дорожка окна строится после showModal(): у закрытого <dialog> раскладки
// нет, и первый замер давал нулевые смещения. В Firefox второе окно
// после закрытия первого читало по ним прокрутку и уезжало на соседний кадр.
test('лайтбокс: второе окно после закрытия первого открывается на своём кадре', async ({ page }) => {
  await page.goto('/docs/griffinjs-slides.html');
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());

  const dialog = page.locator('dialog.gr-lightbox');
  const promo = page.locator('a[data-gr-lightbox="promo"]');

  await promo.nth(0).click();
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('1 / 3');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await promo.nth(1).click();
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('2 / 3');
  // Окно на уезд, будь он: проверяется, что кадр не сменился сам.
  await page.waitForTimeout(400);
  await expect(dialog.locator('.gr-lightbox-counter'), 'окно уехало на соседний кадр').toHaveText('2 / 3');
});

// Документацию открывают и с диска: у страницы и её файлов origin
// непрозрачный, своё — по протоколу file:. Кадры-заглушки демо и картинки
// по относительному адресу обязаны открываться и так.
test('лайтбокс с диска: видео-превью открывают заглушки плееров, группа картинок — окно', async ({ page }) => {
  await page.goto(new URL('../../../../docs/griffinjs-slides.html', import.meta.url).href);
  await page.waitForFunction(() => window.GriffinJS && window.GriffinJS._started());

  await page.locator('a[data-gr-src="fragments/player-2.html"]').click();

  const dialog = page.locator('dialog.gr-lightbox');

  await expect(dialog.locator('.gr-lightbox-counter'), 'окно с диска не открылось').toHaveText('2 / 3');
  await expect(page.frameLocator('dialog.gr-lightbox .gr-lightbox-item:not([data-gr-clone]) iframe >> nth=1').locator('p')).toContainText('VK Видео');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.locator('a[data-gr-lightbox="promo"]').nth(1).click();
  await expect(dialog.locator('.gr-lightbox-counter')).toHaveText('2 / 3');
});

test('страница «Слайды»: все виджеты поднимаются, консоль чистая, без скрипта органы управления скрыты', async ({ page }) => {
  const errors = [];

  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/docs/griffinjs-slides.html');

  await expect(page.locator('[data-gr-slider][data-gr-state]')).toHaveCount(await page.locator('[data-gr-slider]').count());
  await expect(page.locator('[data-gr-gallery] .gr-gallery-thumbs > [aria-current="true"]')).toHaveCount(2);
  expect(errors).toEqual([]);

  // Без скрипта: кнопки и точки слайдеров не видны, дорожки остаются.
  await page.route('**/griffinjs.js', (route) => route.abort());
  await page.goto('/docs/griffinjs-slides.html');
  await expect(page.locator('.gr-slider-prev').first()).toBeHidden();
  await expect(page.locator('.gr-track').first()).toBeVisible();
});

// Следующую команду жмут, когда дорожка остановилась, а не когда доехала:
// движок scroll отклоняет команду, пока идёт его плавная прокрутка, и снимает
// moving только по scrollend. Между «scrollLeft у края» и scrollend есть окно,
// и под нагрузкой полного прогона щелчок попадал в него — «вперёд» пропадал,
// индекс оставался 2. Отказ задуман (быстрые нажатия не уводят индекс
// от дорожки), поэтому тест ждёт то, что выставляет сам виджет: moving.
test('несколько в ряд: точки по страницам, последняя доезжает до конца, rewind возвращает к началу', async ({ page }) => {
  await open(page);

  const slider = page.locator('#gr-lab-pages');
  const dots = slider.locator('.gr-slider-dot');
  const state = () => slider.evaluate((el) => {
    const t = window.GriffinJS.instance(el, 'slider').track;
    const track = el.querySelector('.gr-track');
    return { index: t.index, perView: t.perView, last: t.last, pages: t.pages, moving: t.moving,
      atEnd: Math.abs(track.scrollLeft + track.clientWidth - track.scrollWidth) <= 1 };
  });

  expect(await state()).toMatchObject({ perView: 3, last: 2, pages: 2 });
  await expect(dots).toHaveCount(2);

  await dots.nth(1).click();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect.poll(async () => { const s = await state(); return s.atEnd && !s.moving; }).toBe(true);
  expect((await state()).index).toBe(2);

  await slider.locator('[data-gr-next]').click();
  await expect.poll(async () => (await state()).index).toBe(0);
  await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');
});

test('постранично: свайп на середину страницы снапится к её началу, а не к произвольному слайду', async ({ page }) => {
  await page.goto(LAB);

  const slider = page.locator('#gr-lab-pages');
  const snaps = await slider.locator('.gr-track > *').evaluateAll((els) => els.map((e) => getComputedStyle(e).scrollSnapAlign));

  expect(snaps).toEqual(['start', 'none', 'none', 'none', 'end']);

  // Прокрутка «пальцем» на второй слайд: без страничного снапа дорожка
  // осталась бы на нём, точки указали бы мимо.
  await slider.locator('.gr-track').evaluate((el) => {
    el.scrollTo({ left: el.children[1].offsetLeft - el.offsetLeft + 5, behavior: 'auto' });
  });

  const rest = () => slider.locator('.gr-track').evaluate((el) => ({
    left: Math.round(el.scrollLeft),
    end: Math.round(el.scrollWidth - el.clientWidth),
    index: window.GriffinJS.instance(el.parentElement, 'slider').track.index,
  }));

  // Дорожка, индекс и точка сходятся не одновременно, и мерить их тремя
  // снимками подряд нельзя: WebKit на пути к концу проходит через нулевую
  // позицию, замер «дорожка снапнута» ловит её раньше времени, индекс
  // после этого уезжает на 2 — и ожидание aria-current на первой точке
  // висит до таймаута. Поэтому согласие трёх величин проверяется одним
  // опросом: щели между замерами просто нет.
  await expect.poll(async () => {
    const r = await rest();

    if (r.left !== 0 && r.left !== r.end) return `дорожка между страницами (${r.left})`;

    const dot = await slider.locator('.gr-slider-dot').nth(r.index === 0 ? 0 : 1).getAttribute('aria-current');

    return `${r.index}:${dot}`;
  }).toMatch(/^(0|2):true$/);
});

test('страницы с остатком на странице «Слайды»: вперёд-вперёд-назад-назад-назад по кнопкам', async ({ page }) => {
  await page.goto('/docs/griffinjs-slides.html');

  const slider = page.locator('[aria-label="Шаг на страницу"]');
  const track = slider.locator('.gr-track');
  const info = () => track.evaluate((el) => {
    const t = window.GriffinJS.instance(el.parentElement, 'slider').track;
    const offsets = [...el.children].map((c) => Math.round(c.offsetLeft - el.offsetLeft));
    return { index: t.index, moving: t.moving, left: Math.round(el.scrollLeft), at: offsets.indexOf(Math.round(el.scrollLeft)), end: Math.round(el.scrollWidth - el.clientWidth) };
  });
  const dot = (k) => expect(slider.locator('.gr-slider-dot').nth(k)).toHaveAttribute('aria-current', 'true');
  // Шаг засчитан, когда дорожка и доехала, и остановилась: следующую кнопку
  // движок иначе отклонит (см. тест «несколько в ряд»).
  const settled = async (index, at) => {
    await expect.poll(async () => {
      const s = await info();

      return s.index === index && (at === 'end' ? s.left === s.end : s.at === at) && !s.moving;
    }, { timeout: 3000 }).toBe(true);
  };

  await slider.scrollIntoViewIfNeeded();
  await slider.locator('[data-gr-next]').click(); await settled(2, 2); await dot(1);
  await slider.locator('[data-gr-next]').click(); await settled(3, 'end'); await dot(2);
  await slider.locator('[data-gr-prev]').click(); await settled(2, 2); await dot(1);
  await slider.locator('[data-gr-prev]').click(); await settled(0, 0); await dot(0);
  await slider.locator('[data-gr-prev]').click(); await settled(3, 'end'); await dot(2);
});

test('быстрые нажатия: принимается меньше команд, чем нажатий, а индекс, дорожка и точки сходятся', async ({ page }) => {
  await page.goto(LAB);

  for (const sel of ['#gr-lab-loop', '#gr-lab-pages']) {
    const slider = page.locator(sel);
    const next = slider.locator('[data-gr-next]');

    await slider.scrollIntoViewIfNeeded();
    await slider.evaluate((el) => { window.__accepted = 0; el.addEventListener('griffin:change', () => { window.__accepted += 1; }); });
    for (let i = 0; i < 4; i++) { await next.click({ force: true }); await page.waitForTimeout(40); }

    const info = () => slider.evaluate((el) => {
      const t = window.GriffinJS.instance(el, 'slider').track;
      const track = el.querySelector('.gr-track');
      const real = [...track.children].filter((c) => !c.hasAttribute('data-gr-clone'));
      const target = real[t.physical(t.index)].offsetLeft - track.offsetLeft;
      const end = track.scrollWidth - track.clientWidth;
      return { accepted: window.__accepted, page: t.pageOf(t.index), moving: t.moving, atTarget: Math.abs(track.scrollLeft - target) <= 1 || Math.abs(track.scrollLeft - end) <= 1 };
    });

    await expect.poll(async () => (await info()).moving, { timeout: 4000 }).toBe(false);
    await expect.poll(async () => (await info()).atTarget, { timeout: 4000 }).toBe(true);

    const s = await info();

    expect(s.accepted).toBeGreaterThanOrEqual(1);
    expect(s.accepted).toBeLessThan(4);
    await expect(slider.locator('.gr-slider-dot').nth(s.page)).toHaveAttribute('aria-current', 'true');
  }
});

test('свайп: индекс и точка переключаются до остановки прокрутки', async ({ page }) => {
  await page.goto(LAB);

  const slider = page.locator('#gr-lab-slider');
  const track = slider.locator('.gr-track');

  await slider.scrollIntoViewIfNeeded();
  await track.evaluate((el) => {
    window.__t = { change: null, end: null };
    el.addEventListener('griffin:change', () => { if (window.__t.change === null) window.__t.change = performance.now(); });
    el.addEventListener('scrollend', () => { if (window.__t.end === null) window.__t.end = performance.now(); });
    // «Палец» отпустили на 0.7 слайда: браузер сам доснапит ко второму.
    const real = [...el.children].filter((c) => !c.hasAttribute('data-gr-clone'));
    el.scrollTo({ left: real[0].offsetLeft - el.offsetLeft + (real[1].offsetLeft - real[0].offsetLeft) * 0.7, behavior: 'auto' });
  });

  await expect.poll(() => track.evaluate((el) => window.GriffinJS.instance(el.parentElement, 'slider').track.index), { timeout: 3000 }).toBe(1);
  await expect(slider.locator('.gr-slider-dot').nth(1)).toHaveAttribute('aria-current', 'true');

  const t = await track.evaluate(() => window.__t);
  if (t.end !== null) expect(t.change).toBeLessThanOrEqual(t.end);
});

// «Лента без скрипта» на странице «Слайды»: слайды своей ширины — модификатор
// .gr-track-auto. Без него flex-basis: 100% базового правила дорожки
// растягивал каждую «историю» на всю ширину (654 × 654 px на 1280), а утилиты
// ширины на слайде этой основе проигрывают. Скрипт снят: раздел — о странице
// без griffinjs.js.
for (const width of [1280, 390]) {
  test(`лента без скрипта, ${width} px: истории — круги в ряд, теги — по ширине текста, обе дорожки листаются`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/griffinjs.js', (route) => route.abort());
    await page.goto('/docs/griffinjs-slides.html');

    const stories = await page.locator('.gr-track[aria-label="Истории"]').evaluate((track) => {
      const box = track.getBoundingClientRect();
      const frames = [...track.children].map((item) => {
        const frame = item.querySelector('.gr-avatar').getBoundingClientRect();

        return {
          w: frame.width,
          h: frame.height,
          radius: parseFloat(getComputedStyle(item.querySelector('.gr-avatar')).borderTopLeftRadius),
          inside: item.getBoundingClientRect().left >= box.left - 0.5 && item.getBoundingClientRect().right <= box.right + 0.5,
        };
      });

      return { frames, visible: frames.filter((f) => f.inside).length, scrollable: track.scrollWidth > track.clientWidth + 1 };
    });

    expect(stories.visible).toBeGreaterThanOrEqual(3);
    for (const f of stories.frames) {
      expect(Math.abs(f.w - f.h)).toBeLessThanOrEqual(0.5);
      expect(f.radius).toBeGreaterThanOrEqual(f.w / 2);
    }
    expect(stories.scrollable).toBe(true);

    // Ширина тега — его текст плюс поля и рамка: ни растяжения на дорожку,
    // ни сжатия (лишнее уходит в прокрутку).
    const tags = await page.locator('.gr-track[aria-label="Популярные запросы"]').evaluate((track) => {
      const items = [...track.children].map((tag) => {
        const cs = getComputedStyle(tag);
        const range = document.createRange();

        range.selectNodeContents(tag);

        return {
          width: tag.getBoundingClientRect().width,
          content: range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
            + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth),
        };
      });

      return { items, scrollable: track.scrollWidth > track.clientWidth + 1 };
    });

    expect(tags.items.length).toBeGreaterThanOrEqual(6);
    for (const t of tags.items) expect(Math.abs(t.width - t.content)).toBeLessThanOrEqual(1);
    expect(tags.scrollable).toBe(true);
  });
}

// «Одна разметка: столбик в узком гнезде, лента в широком» — раздел «Дорожка»
// и тот же пример на странице контейнерных запросов. Пороги столбика и доли
// обязаны стыковаться: .gr-track-stack-csm снимает столбик с 640 px гнезда,
// и если доля слайда начинается только с 768 (.gr-track-3-cmd), между ними
// лента идёт по одному слайду во всю ширину — ровно так демо и выглядело
// на окнах 1180–1366 px (колонка доков 654–762 px). Колонка доков уже 640 px —
// широкое гнездо честно становится столбиком.
const ONE_MARKUP = [
  ['/docs/griffinjs-slides.html', 'Похожие товары, узкая колонка', 'Похожие товары, широкая колонка'],
  ['/docs/container-queries.html', 'Подборка в боковой колонке', 'Подборка в содержимом'],
];

for (const [url, narrowLabel, wideLabel] of ONE_MARKUP) for (const width of [1024, 1280, 1440]) {
  test(`лента «одна разметка» ${url.split('/').pop()}, окно ${width} px: в ленте не бывает одного слайда во всю ширину`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);

    const probe = (label) => page.locator(`.gr-track[aria-label="${label}"]`).evaluate((track) => {
      const box = track.getBoundingClientRect();
      const inside = [...track.children].filter((s) => {
        const r = s.getBoundingClientRect();

        return r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
      });

      return { width: box.width, column: getComputedStyle(track).flexDirection === 'column', visible: inside.length };
    });

    const narrow = await probe(narrowLabel);
    const wide = await probe(wideLabel);

    expect(narrow.column).toBe(true);
    if (wide.width < 640) expect(wide.column).toBe(true);
    else {
      expect(wide.column).toBe(false);
      expect(wide.visible).toBe(wide.width < 768 ? 2 : 3);
    }
  });
}
