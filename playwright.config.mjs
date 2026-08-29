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
// В `npm run check` не входит: гейт CI ставит зависимости через npm ci,
// а браузеры — отдельная загрузка (npx playwright install). Запуск —
// npm run test:browser, локально и перед выпуском.

import { defineConfig, devices } from '@playwright/test';

const PORT = 8877;

export default defineConfig({
  testDir: 'packages/ui/test/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  // Firefox под нагрузкой трёх воркеров отвечает на click/press с задержкой
  // в десятки секунд; изолированно те же тесты проходят за секунды.
  // Таймаут — на весь тест, а не на ожидания внутри: expect() по-прежнему 5 с.
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: 'node scripts/serve-stream.mjs',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/docs/index.html`,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
