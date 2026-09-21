// Закрытие <details> с состоянием closing (Этап 48d) на трёх движках:
// мегаменю и дропдаун полигона. Виджет ставит data-gr-state="closing",
// держит open до конца перехода темы на панели (transitionend) и снимает
// его затем — во всех браузерах, без развилки по ::details-content.
//
// Почему без развилки — измерено здесь же, последним тестом: Firefox 153
// поддерживает ::details-content и transition-behavior: allow-discrete,
// но при снятии open переводит content-visibility в hidden в том же кадре,
// и переход темы на ::details-content не начинается; Chromium и WebKit
// анимируют. Путь «нативно там, где признаки есть» оставлял бы Firefox
// без анимации — решение владельца 2026-09-21: состояние ставится везде,
// у темы одно правило.
//
// Без переходов темы (CSS слоя их не задаёт) закрытие идёт по таймауту
// --gr-transition + 50 мс — это тоже проверяется.

import { test, expect } from '@playwright/test';

const LAB = '/docs/griffinjs-lab.html';

// Переход темы на закрытие — 150 мс: заметно для замера, коротко для теста.
const THEME = `
  .gr-megamenu-panel, .gr-dropdown-panel { transition: opacity 0.15s linear; }
  .gr-megamenu-item[data-gr-state="closing"] > .gr-megamenu-panel,
  .gr-dropdown[data-gr-state="closing"] > .gr-dropdown-panel { opacity: 0; }
`;

// Рецепт «на платформе», которого библиотека не берёт: переход
// на ::details-content. Нужен только замеру в последнем тесте.
const THEME_PLATFORM = `
  .gr-megamenu-item::details-content {
    opacity: 0;
    transition: opacity 0.15s linear, content-visibility 0.15s allow-discrete;
  }
  .gr-megamenu-item[open]::details-content { opacity: 1; }
`;

async function open(page, theme = '') {
  await page.goto(LAB);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' + theme });
}

async function openFirst(page) {
  const item = page.locator('#gr-lab-megamenu details.gr-megamenu-item').first();

  await item.locator('summary').focus();
  await page.keyboard.press('ArrowDown');
  await expect(item).toHaveJSProperty('open', true);

  return item;
}

test('мегаменю: Esc ставит closing, панель уходит переходом темы, open снимается по его концу', async ({ page }) => {
  await open(page, THEME);

  const item = await openFirst(page);
  const panel = item.locator('.gr-megamenu-panel');

  // Замер в одном evaluate: состояние и open сразу после Esc, затем
  // прозрачность на середине перехода и итог.
  const trace = await page.evaluate(() => new Promise((resolve) => {
    const details = document.querySelector('#gr-lab-megamenu details.gr-megamenu-item');
    const panel = details.querySelector('.gr-megamenu-panel');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });

    document.activeElement.dispatchEvent(escape);

    const at = { state: details.getAttribute('data-gr-state'), open: details.open };

    setTimeout(() => {
      at.midOpacity = parseFloat(getComputedStyle(panel).opacity);
      at.midOpen = details.open;

      setTimeout(() => resolve(Object.assign(at, { endOpen: details.open, endState: details.getAttribute('data-gr-state') })), 250);
    }, 70);
  }));

  expect(trace.state).toBe('closing');
  expect(trace.open).toBe(true);
  expect(trace.midOpen, 'open снят раньше конца перехода').toBe(true);
  expect(trace.midOpacity, `на середине перехода панель не в движении: ${JSON.stringify(trace)}`).toBeLessThan(1);
  expect(trace.midOpacity).toBeGreaterThan(0);
  expect(trace.endOpen).toBe(false);
  expect(trace.endState).toBeNull();
  await expect(panel).toBeHidden();
});

test('дропдаун: щелчок по кнопке открытого <details> идёт через closing; open → closing → ready', async ({ page }) => {
  await open(page, THEME);

  const root = page.locator('#gr-lab-dd-details');
  const summary = root.locator('summary');

  await summary.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await summary.click();
  await expect(root).toHaveJSProperty('open', true);
  await expect(root).toHaveAttribute('data-gr-state', 'open');

  await page.evaluate(() => {
    const root = document.getElementById('gr-lab-dd-details');
    const seen = [];
    const mo = new MutationObserver(() => seen.push(root.getAttribute('data-gr-state')));

    mo.observe(root, { attributes: true, attributeFilter: ['data-gr-state'] });
    window.__grSeen = seen;
  });

  await summary.click();

  await expect(root).toHaveAttribute('data-gr-state', 'closing');
  await expect(root).toHaveJSProperty('open', true);
  await expect(root).toHaveJSProperty('open', false, { timeout: 2000 });
  await expect(root).toHaveAttribute('data-gr-state', 'ready');

  expect(await page.evaluate(() => window.__grSeen)).toEqual(['closing', 'ready']);
});

test('дропдаун: второй щелчок во время закрытия отменяет его — панель остаётся', async ({ page }) => {
  await open(page, THEME);

  const root = page.locator('#gr-lab-dd-details');
  const summary = root.locator('summary');

  await summary.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await summary.click();
  await expect(root).toHaveJSProperty('open', true);

  const trace = await page.evaluate(() => {
    const root = document.getElementById('gr-lab-dd-details');
    const summary = root.querySelector('summary');
    const click = () => summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    click();
    const closing = root.getAttribute('data-gr-state');
    click();

    return { closing, after: root.getAttribute('data-gr-state'), open: root.open };
  });

  expect(trace.closing).toBe('closing');
  expect(trace.after).toBe('open');
  expect(trace.open).toBe(true);

  // Отменённое закрытие не догоняет по таймауту.
  await page.waitForTimeout(400);
  await expect(root).toHaveJSProperty('open', true);
  await expect(root).toHaveAttribute('data-gr-state', 'open');
});

test('без переходов темы закрытие идёт по таймауту --gr-transition + 50 мс', async ({ page }) => {
  await open(page);

  const root = page.locator('#gr-lab-dd-details');

  await root.locator('summary').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await root.locator('summary').click();
  await expect(root).toHaveJSProperty('open', true);

  const trace = await page.evaluate(() => new Promise((resolve) => {
    const root = document.getElementById('gr-lab-dd-details');
    const token = getComputedStyle(root.querySelector('.gr-dropdown-panel')).getPropertyValue('--gr-transition');
    const started = performance.now();

    root.querySelector('summary').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const state = root.getAttribute('data-gr-state');
    const tick = () => {
      if (root.open) return requestAnimationFrame(tick);

      resolve({ state, token: token.trim(), elapsed: performance.now() - started });
    };

    tick();
  }));

  expect(trace.state).toBe('closing');
  expect(trace.token).toMatch(/^0\.2s/);
  // 200 + 50 мс таймаута; верхняя граница — с запасом на кадры.
  expect(trace.elapsed).toBeGreaterThanOrEqual(240);
  expect(trace.elapsed).toBeLessThan(700);
});

// Измеренный факт, на котором стоит решение «closing везде»: Firefox
// (153 на 2026-09-21) поддерживает оба признака, но переход темы
// на ::details-content при закрытии не начинается — прозрачность
// и content-visibility меняются в том же кадре. Chromium и WebKit
// анимируют. Виджет здесь ни при чём: замер идёт на голом <details>
// вне полосы, без скрипта. Упадёт, когда Firefox начнёт анимировать, —
// тогда развилку можно обсуждать заново.
test('Firefox: платформа закрывает ::details-content без перехода — основание решения «closing везде»', async ({ page, browserName }) => {
  test.skip(browserName !== 'firefox', 'замер только для Firefox');

  await open(page, THEME_PLATFORM);

  const trace = await page.evaluate(() => new Promise((resolve) => {
    const supports = CSS.supports('selector(::details-content)') && CSS.supports('transition-behavior: allow-discrete');
    const details = document.createElement('details');

    details.className = 'gr-megamenu-item';
    details.innerHTML = '<summary>Проба</summary><div class="gr-megamenu-panel">Панель</div>';
    document.body.appendChild(details);
    details.open = true;

    const content = () => getComputedStyle(details, '::details-content');

    // Переход появления должен закончиться до закрытия.
    setTimeout(() => {
      const opened = parseFloat(content().opacity);

      details.open = false;

      setTimeout(() => {
        resolve({ supports, opened, midOpacity: parseFloat(content().opacity), midShown: content().contentVisibility !== 'hidden' });
        details.remove();
      }, 70);
    }, 300);
  }));

  expect(trace.supports).toBe(true);
  expect(trace.opened).toBe(1);
  expect(trace.midOpacity, `Firefox начал анимировать закрытие ::details-content — развилку можно обсуждать заново: ${JSON.stringify(trace)}`).toBe(0);
  expect(trace.midShown).toBe(false);
});
