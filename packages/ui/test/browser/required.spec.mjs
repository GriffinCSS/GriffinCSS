// Звёздочка обязательного поля (Этап 77). Она рисуется псевдоэлементом
// подписи, а содержимое ::after по вычислению имени (accname, шаг 2F)
// входит в имя поля: Chromium называл поле «Заголовок*», читалка
// произносила «Заголовок звёздочка». Обязательность поле и так сообщает
// атрибутом required — звёздочке нужна пустая альтернатива
// (`content: "*" / ""`). У ручной .gr-required (группа флажков) другого
// признака нет, и там звёздочка в имени остаётся.
//
// Имя — по дереву доступности самого движка: его отдаёт только CDP
// Chromium (Firefox — через Marionette, см. план). Что звёздочка
// по-прежнему нарисована, проверяется во всех трёх.

import { test, expect } from '@playwright/test';

const PAGE = '/required-fixture.html';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Обязательное поле</title>
<link rel="stylesheet" href="/packages/core/dist/griffincss-reset.css">
<link rel="stylesheet" href="/packages/core/dist/griffincss-core.css">
<link rel="stylesheet" href="/packages/ui/dist/griffincss-ui.css">
</head><body>
<div class="gr-field">
  <label class="gr-label" for="h">Заголовок</label>
  <input class="gr-input" id="h" required>
</div>
<div class="gr-field">
  <span class="gr-label" id="t">Текст</span>
  <div class="gr-input" contenteditable="true" role="textbox" aria-labelledby="t" aria-required="true"></div>
</div>
<fieldset class="gr-field">
  <legend class="gr-label gr-required">Каналы</legend>
  <label class="gr-choice"><input class="gr-checkbox" type="checkbox" name="c" value="sms"> SMS</label>
</fieldset>
</body></html>`;

async function open(page) {
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  }));
  await page.goto(PAGE);
}

// Своё поле (поверхность редактора, комбобокс на role) обязательность
// объявляет aria-required="true" — звёздочка от него та же, что от required.
test('звёздочка нарисована у поля с required, с aria-required="true" и у .gr-required', async ({ page }) => {
  await open(page);

  const stars = await page.evaluate(() => [...document.querySelectorAll('.gr-label')].map((label) => {
    const after = getComputedStyle(label, '::after');

    return { content: after.content, width: label.getBoundingClientRect().width };
  }));

  for (const star of stars) expect(star.content, JSON.stringify(stars)).toMatch(/^"\*"/);
});

test('звёздочка поля с required в имя поля не входит, у .gr-required — входит', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'дерево доступности движка отдаёт только CDP Chromium');

  await open(page);

  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const names = (role) => nodes.filter((node) => node.role?.value === role).map((node) => node.name?.value);

  expect(names('textbox')).toEqual(['Заголовок', 'Текст']);
  expect(names('group')).toEqual(['Каналы*']);
});
