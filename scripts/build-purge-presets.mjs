#!/usr/bin/env node
// Griffincss — пресеты отсечения данными (фидбек CHU по 0.29.2, п. 6).
// Сайт, который отсекает CSS не на Node (PHP на хостинге), берёт список
// классов, которые ставят скрипты пакета ui, из его dist — рядом с CSS
// той же версии. Шаблон со звёздочкой (`gr-toast-*`) — как в --safelist.
// Источник один — PRESETS в packages/utils/bin/purge.mjs; тест
// purge-preset.test.js сверяет с ним и файл, и сам список — с src/.

import { writeFileSync } from 'node:fs';

import { PRESETS } from '../packages/utils/bin/purge.mjs';

writeFileSync(new URL('../packages/ui/dist/purge-presets.json', import.meta.url), `${JSON.stringify(PRESETS)}\n`);
