// Рецепт «Секция на фоновом фото с затемнением» (docs/effects.html):
// белый текст обязан читаться над любым фото. Худший пиксель фото — белый,
// поэтому картинка подменяется белой, а контраст считается из вычисленных
// цвета и прозрачности слоёв: затемнение поверх белого, текст (со своей
// прозрачностью) поверх затемнения. Норма — AA, 4,5 : 1.

import { test, expect } from '@playwright/test';

const WHITE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='3'%3E%3Crect width='4' height='3' fill='%23fff'/%3E%3C/svg%3E";

for (const scheme of ['light', 'dark']) {
  test(`затемнение фото: белый текст ≥ 4,5 : 1 над белым пикселем, тема ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/docs/effects.html');

    const ratios = await page.evaluate((white) => {
      const heading = [...document.querySelectorAll('.demo-block h4')].find((h) => h.textContent === 'Горы ждут');
      const section = heading.closest('.gr-relative.gr-overflow-hidden');
      const photo = section.querySelector('img');
      const overlay = photo.nextElementSibling;

      photo.src = white;

      const rgba = (value) => {
        const [r, g, b, a = 1] = value.match(/[\d.]+/g).map(Number);

        return { r, g, b, a };
      };
      const over = (top, alpha, bottom) => ({
        r: top.r * alpha + bottom.r * (1 - alpha),
        g: top.g * alpha + bottom.g * (1 - alpha),
        b: top.b * alpha + bottom.b * (1 - alpha),
      });
      const luminance = ({ r, g, b }) => {
        const lin = (c) => {
          const s = Math.round(c) / 255;

          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };

        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const contrast = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

        return (hi + 0.05) / (lo + 0.05);
      };
      // Прозрачность элемента вместе с предками до секции: подзаголовок
      // с .gr-opacity-75 бледнее заголовка.
      const alphaOf = (el) => {
        let a = 1;

        for (let n = el; n && n !== section; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);

        return a;
      };

      const shade = rgba(getComputedStyle(overlay).backgroundColor);
      const backdrop = over(shade, shade.a * Number(getComputedStyle(overlay).opacity), { r: 255, g: 255, b: 255 });

      return [heading, heading.nextElementSibling].map((el) => {
        const ink = rgba(getComputedStyle(el).color);

        return { text: el.textContent, ratio: contrast(over(ink, ink.a * alphaOf(el), backdrop), backdrop) };
      });
    }, WHITE);

    for (const { text, ratio } of ratios) expect(ratio, text).toBeGreaterThanOrEqual(4.5);
  });
}
