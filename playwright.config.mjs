// Griffincss — браузерные тесты слоя GriffinJS (Этап 21).
//
// Единственная новая devDependency проекта. Гоняет полигон
// docs/griffinjs-lab.html на трёх движках: снап, клавиатура и фокус
// в top layer на мок-DOM не проверяются, а именно они ломаются в одном
// движке из трёх.
//
// Статику отдаёт scripts/serve-stream.mjs: он уже умеет отдавать любой
// файл дерева, а порт берёт из PORT. Отдельного сервера ради тестов нет.
//
// Тесты читают packages/*/dist — те самые файлы, что лежат в репозитории
// и уходят пользователю. Пересборка перед прогоном не нужна и не делается
// намеренно: свежесть dist сторожит check-dist в основном гейте, а здесь
// проверяется опубликованное, а не то, что собралось бы сейчас.
//
// В `npm run check` не входит: гейт ставит зависимости через npm ci,
// а браузеры — отдельная загрузка (npx playwright install). В CI под них
// отведён свой job, по одному движку на ветку матрицы, — см.
// .gitverse/workflows/check.yaml. Локально — npm run test:browser.

import { defineConfig, devices } from '@playwright/test';

const PORT = 8877;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'packages/ui/test/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  // Firefox под нагрузкой трёх воркеров отвечает на click/press с задержкой
  // в десятки секунд; изолированно те же тесты проходят за секунды.
  // Таймаут — на весь тест, а не на ожидания внутри: expect() по-прежнему 5 с.
  timeout: 60000,
  reporter: 'list',
  // Забытый test.only на ветке молча сократил бы прогон до одного теста,
  // и гейт остался бы зелёным. Локально .only — рабочий инструмент.
  forbidOnly: CI,
  // Часть проверок ждёт конца прокрутки и анимации по времени (waitForTimeout
  // в slides, matrix, tables, reframe). На разделяемом раннере эти паузы
  // иногда не покрывают реальную задержку. Два повтора отделяют такой сбой
  // от настоящей регрессии: настоящая падает все три раза.
  retries: CI ? 2 : 0,
  // Один воркер: раннер площадки даёт два ядра на job, а движки в матрице
  // и так разведены по отдельным машинам. Три воркера на двух ядрах
  // возвращают ту самую задержку Firefox, ради которой поднят timeout.
  workers: CI ? 1 : undefined,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Только для упавших тестов и только в CI: разбирать сбой раннера
    // по одному лишь имени теста — гадание, а держать след каждого
    // из 360 зелёных прогонов незачем.
    trace: CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: 'node scripts/serve-stream.mjs',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/docs/index.html`,
    // Локально подхватывает уже поднятый демо-сервер, в CI поднимает свой:
    // на раннере чужого сервера на этом порту быть не может, а если он есть,
    // это не наш сервер и тесты должны падать, а не идти по нему.
    reuseExistingServer: !CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
