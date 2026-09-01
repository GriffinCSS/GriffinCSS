// Раскладки в документации: дорожка не бывает уже своего содержимого
// молча (Этап 37).
//
// С переходом на `minmax(0, 1fr)` доля перестала растягиваться под текст:
// строка `nav1main3` теперь и правда даёт четверть, а не «сколько попросит
// меню». Это верно, но оно перестало маскировать опечатки в самих строках —
// панель админки в docs/patterns.html описывала шестнадцать колонок вместо
// четырёх и до 0.22.0 выглядела прилично только благодаря растяжению.
//
// Проверка идёт на 1200 px: узкие дорожки на телефоне — свойство демонстраций
// с семью колонками, а не дефект, и ловить их здесь значило бы держать
// список исключений вместо инварианта.

import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';

const PAGES = readdirSync('docs').filter((name) => name.endsWith('.html'));

const LAYOUT = '[data-gr-layout], [data-gr-layout-sm], [data-gr-layout-md], [data-gr-layout-lg], [data-gr-layout-xl]';

test.use({ viewport: { width: 1200, height: 1000 } });

for (const name of PAGES) {
  test(`раскладки на ${name} вмещают своё содержимое`, async ({ page }) => {
    await page.goto(`/docs/${name}`, { waitUntil: 'networkidle' });

    const tight = await page.evaluate((selector) => {
      const out = [];

      for (const box of document.querySelectorAll(selector)) {
        for (const child of box.children) {
          const width = child.getBoundingClientRect().width;

          // Округление вверх плюс пиксель: субпиксельная ширина дорожки
          // не повод для отчёта.
          if (child.scrollWidth <= Math.ceil(width) + 1) continue;

          out.push(`${box.getAttribute('data-gr-layout') ?? ''} → .${child.className.split(' ')[0]}: дорожка ${Math.round(width)}px, содержимому нужно ${child.scrollWidth}px`);
        }
      }

      return out;
    }, LAYOUT);

    expect(tight, tight.join('\n')).toEqual([]);
  });
}
