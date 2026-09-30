// Класс пропорции у картинки и фрейма с атрибутами width и height.
//
// CMS выводит у картинки оба атрибута всегда, код вставки плеера — тоже:
// браузер заранее резервирует место. Атрибут height становится высотой
// элемента, а aspect-ratio действует, только когда одна из сторон auto, —
// поэтому .gr-aspect-* сам ставит block-size: auto. Утилиты высоты стоят
// в файле позже и побеждают порядком: .gr-h-full .gr-aspect-square —
// высота родителя, ширина из пропорции. Картинку без класса пропорции
// (ряд логотипов с одним height) правило не трогает.

import { test, expect } from '@playwright/test';

const PAGE = '/aspect-fixture.html';

// 900 × 1200 — портретный кадр, пропорции 3 : 4.
const PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='1200'%3E%3Crect width='900' height='1200' fill='%23888'/%3E%3C/svg%3E";

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Пропорции</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/utils/dist/griffincss-utils.css">
</head><body>
<div style="width: 608px"><picture><img id="photo" class="gr-w-full gr-aspect-portrait gr-object-cover" width="900" height="1200" src="${PHOTO}" alt=""></picture></div>
<div style="width: 608px"><iframe id="player" class="gr-w-full gr-aspect-video" width="560" height="315" src="about:blank" title="Плеер"></iframe></div>
<div style="width: 600px; height: 200px"><div id="square" class="gr-h-full gr-aspect-square"></div></div>
<div class="gr-flex"><img id="logo" height="32" src="${PHOTO}" alt=""></div>
</body></html>`;

async function boxes(page) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }));
  await page.goto(PAGE);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));

  return page.evaluate(() => Object.fromEntries(['photo', 'player', 'square', 'logo'].map((id) => {
    const r = document.getElementById(id).getBoundingClientRect();

    return [id, { w: Math.round(r.width), h: Math.round(r.height) }];
  })));
}

test('класс пропорции гасит высоту из атрибута: картинка 3 : 4 и плеер 16 : 9 во всю ширину', async ({ page }) => {
  const b = await boxes(page);

  expect(b.photo, 'картинка 900 × 1200 с .gr-w-full .gr-aspect-portrait').toEqual({ w: 608, h: 811 });
  expect(b.player, 'плеер 560 × 315 с .gr-w-full .gr-aspect-video').toEqual({ w: 608, h: 342 });
});

test('утилита высоты сильнее класса пропорции; картинку без класса пропорции правило не трогает', async ({ page }) => {
  const b = await boxes(page);

  expect(b.square, '.gr-h-full .gr-aspect-square в родителе 200 px').toEqual({ w: 200, h: 200 });
  expect(b.logo, 'логотип с height="32"').toEqual({ w: 24, h: 32 });
});
