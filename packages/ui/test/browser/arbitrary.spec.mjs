// Произвольные значения в документации — годный CSS.
//
// Рантайм утилит переносит значение из класса в правило как есть, и браузер
// молча отбрасывает объявление, которое не может разобрать: `calc(1rem+3px)`
// без пробелов вокруг `+` — это `1rem` и `+3px` без оператора, отступа нет.
// Образцы из <pre> доки отрисовывают вживую (nav.js), поэтому проверяются
// и они. Каждое значение сверяется со всеми свойствами своей строки таблицы
// рантайма (`Griffincss.utils._props`): `gr-p-` — `padding`, `gr-my-` —
// `margin-top` и `margin-bottom`.

import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';

const PAGES = readdirSync('docs').filter((name) => name.endsWith('.html'));

for (const name of PAGES) {
  test(`произвольные значения на ${name} — годный CSS`, async ({ page }) => {
    await page.goto(`/docs/${name}`, { waitUntil: 'networkidle' });

    const broken = await page.evaluate(() => {
      const utils = window.Griffincss && window.Griffincss.utils;
      const out = [];
      const seen = new Set();

      for (const el of document.querySelectorAll('[class*="["]')) {
        for (const cls of el.classList) {
          if (!cls.startsWith('gr-') || !cls.includes('[') || !cls.endsWith(']') || seen.has(cls)) continue;
          seen.add(cls);

          if (!utils) { out.push(`${cls}: рантайм утилит не подключён`); continue; }

          const value = utils.classValue(cls);

          if (value === null) { out.push(`${cls}: отвергнут рантаймом`); continue; }

          const prefix = Object.keys(utils._props).filter((p) => cls.startsWith(p)).sort((a, b) => b.length - a.length)[0];
          const props = utils._props[prefix].split(';').map((d) => d.slice(0, d.indexOf(':'))).filter((p) => !p.startsWith('--'));
          const bad = props.filter((p) => !CSS.supports(p, value));

          if (bad.length) out.push(`${cls}: не годится для ${bad.join(', ')}`);
        }
      }

      return out;
    });

    expect(broken).toEqual([]);
  });
}

// Рецепт «экран минус шапка» без арифметики: флекс-колонка отдаёт области
// остаток высоты, и прокручивается область, а не обёртка.
test('рецепт «экран минус шапка»: область занимает остаток высоты и прокручивается сама', async ({ page }) => {
  await page.goto('/docs/arbitrary-values.html', { waitUntil: 'networkidle' });

  const box = await page.locator('#rest-of-screen').evaluate((wrap) => {
    const [head, area] = wrap.children;

    return {
      rest: wrap.clientHeight - head.offsetHeight,
      area: area.offsetHeight,
      scrolls: area.scrollHeight > area.clientHeight,
    };
  });

  expect(box.area, 'область не заняла остаток высоты').toBe(box.rest);
  expect(box.scrolls, 'область не прокручивается сама').toBe(true);
});
