// Скелет страницы docs/starter.html (Этап 48b): синхронно в <head> — только
// рантайм темы и рантайм раскладок, остальные рантаймы и слой — с defer.
// Проверяется то, что обещает страница рантайма: отложенные файлы стартуют
// сами при readyState «interactive», не дожидаясь DOMContentLoaded,
// раскладка сложена, консоль чистая — и слой ПОДНЯЛ виджет, а не только
// стартовал. Фидбек темы griffin по 0.26.0, п. 1 и 4: под defer старт
// в обёртке ядра обгонял defineWidget модулей того же файла, и
// `_started() === true` при нуле смонтированных виджетов проходил гейт.

import { test, expect } from '@playwright/test';

test('starter.html: два синхронных тега, три с defer, всё стартовало, консоль чистая', async ({ page }) => {
  const messages = [];

  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') messages.push(m.text()); });
  page.on('pageerror', (e) => messages.push(String(e)));

  await page.goto('/docs/starter.html');
  await page.waitForFunction(() => document.readyState === 'complete');

  const tags = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => ({
    file: s.getAttribute('src').split('/').pop(),
    defer: s.hasAttribute('defer'),
  })));

  expect(tags).toEqual([
    { file: 'griffincss-theme.js', defer: false },
    { file: 'griffincss.js', defer: false },
    { file: 'griffincss-ui.js', defer: true },
    { file: 'griffincss-utils.js', defer: true },
    { file: 'griffinjs.js', defer: true },
  ]);

  const state = await page.evaluate(() => {
    const dropdown = document.querySelector('[data-gr-dropdown]');

    return {
      theme: !!window.Griffincss.theme,
      ui: !!window.Griffincss.ui,
      utils: !!window.Griffincss.utils,
      layer: window.GriffinJS._started(),
      ready: document.querySelector('[data-gr-layout]').classList.contains('gr-ready'),
      display: getComputedStyle(document.querySelector('[data-gr-layout]')).display,
      // Виджет смонтирован, и его следы в разметке — те, что ставит
      // только скрипт: без него у <summary> нет aria-haspopup, у списка — role.
      widget: !!window.GriffinJS.instance(dropdown, 'dropdown'),
      haspopup: dropdown.querySelector('summary').getAttribute('aria-haspopup'),
      role: dropdown.querySelector('.gr-menu').getAttribute('role'),
    };
  });

  expect(state).toEqual({
    theme: true, ui: true, utils: true, layer: true, ready: true, display: 'grid',
    widget: true, haspopup: 'menu', role: 'menu',
  });
  expect(messages).toEqual([]);
});
