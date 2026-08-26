#!/usr/bin/env node
// Griffincss — демо-сервер с потоковой отдачей HTML.
// Статику отдаёт как есть, а страницы с маркером <!-- gr:chunk --> режет
// по нему и отправляет порциями с паузой: только так видно, как рантайм
// раскладывает контейнеры во время парсинга. Ноль зависимостей.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8800;
const delay = Number(process.env.CHUNK_DELAY) || 700;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, rel === '/' ? 'docs/stream.html' : rel);

  let body;

  try {
    body = await readFile(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }

  const type = TYPES[extname(file)] || 'application/octet-stream';
  const text = body.toString('utf8');

  // Кеш выключен: иначе второй заход отдаётся браузером мгновенно
  // и потоковой отдачи не видно.
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });

  if (type.startsWith('text/html') && text.includes('<!-- gr:chunk -->')) {
    const chunks = text.split('<!-- gr:chunk -->');

    for (let i = 0; i < chunks.length; i++) {
      res.write(chunks[i]);
      if (i < chunks.length - 1) await sleep(delay);
    }

    res.end();
    return;
  }

  res.end(body);
}).listen(port, () => {
  console.log(`Griffincss stream demo: http://localhost:${port}/docs/stream.html`);
  console.log(`Пауза между порциями: ${delay} мс (переопределяется CHUNK_DELAY)`);
});
