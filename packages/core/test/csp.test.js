'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupDom, el, MockElement, generatedCSS } = require('./helpers/dom');

// Этап 30. Под строгой политикой style-src без 'unsafe-inline' браузер
// молча выбрасывает содержимое <style>, созданного скриптом: раскладки
// теряются, а ошибки в консоли нет — отлаживать нечего. Лечится тем,
// что рантайм переносит на свой <style> nonce со своего тега <script>.

const layout = () => el('body', {}, [el('div', { 'data-gr-layout': 'a1b1' }, [el('div'), el('div')])]);

test('nonce с тега скрипта уезжает на <style> рантайма', () => {
  const script = new MockElement('script', { nonce: 'r4nd0m' });
  const { doc, griffin } = setupDom(layout(), {}, { script });

  griffin._autoStart();

  assert.equal(doc.getElementById('griffincss-dynamic').nonce, 'r4nd0m');
});

test('без nonce на скрипте атрибут не появляется', () => {
  const script = new MockElement('script');
  const { doc, griffin } = setupDom(layout(), {}, { script });

  griffin._autoStart();

  assert.equal(doc.getElementById('griffincss-dynamic').hasAttribute('nonce'), false);
});

// data-auto="false": автостарт возвращается сразу, но тег скрипта он уже
// прочитал — иначе ручной init() ставил бы <style> без nonce.
test('nonce читается и при отключённом автостарте', () => {
  const script = new MockElement('script', { nonce: 'r4nd0m', 'data-auto': 'false' });
  const { doc, griffin } = setupDom(layout(), {}, { script });

  griffin._autoStart();
  assert.equal(doc.getElementById('griffincss-dynamic'), null, 'автостарт не сработал');

  griffin.init();

  assert.equal(doc.getElementById('griffincss-dynamic').nonce, 'r4nd0m');
});

// <img name="currentScript"> в разметке перекрывает свойство документа:
// атрибуты картинки — чужая разметка, а не флаги и nonce нашего тега.
test('currentScript, подменённый <img name>: ни флагов, ни nonce', () => {
  const img = new MockElement('img', { nonce: 'r4nd0m', 'data-auto': 'false' });
  const { doc, griffin } = setupDom(layout(), {}, { script: img });

  griffin._autoStart();

  const style = doc.getElementById('griffincss-dynamic');

  assert.ok(style, 'data-auto картинки остановил автостарт');
  assert.equal(style.hasAttribute('nonce'), false, 'nonce взят у картинки');
});

test('nonce не утекает в текст сгенерированного CSS', () => {
  const script = new MockElement('script', { nonce: 'r4nd0m' });
  const { doc, griffin } = setupDom(layout(), {}, { script });

  griffin._autoStart();

  assert.ok(!generatedCSS(doc).includes('r4nd0m'), generatedCSS(doc));
});

// Разметка из данных: чужой узел с id="griffincss-dynamic" — не наш лист.
// Рантайм, подключённый не синхронно в <head>, писал бы CSS текстом в него.
test('узел с id griffincss-dynamic, не <style>, — не лист рантайма: создаётся свой', () => {
  const foreign = new MockElement('div', { id: 'griffincss-dynamic' });
  const body = el('body', {}, [foreign, el('div', { 'data-gr-layout': 'a1b1' }, [el('div'), el('div')])]);
  const { doc, griffin } = setupDom(body);

  griffin.init();

  const sheets = doc.head.children.filter((n) => n.tagName === 'STYLE' && n.getAttribute('id') === 'griffincss-dynamic');

  assert.equal(foreign.textContent, '', 'CSS записан в чужой узел');
  assert.equal(sheets.length, 1, 'свой лист не создан');
  assert.ok(sheets[0].textContent.includes('@layer griffincss.core'), 'правила не в своём листе');
});

// Риск № 2 этапа: порядок каскада обязан остаться прежним. Сторож —
// на случай, если приёмник CSS когда-нибудь всё же переедет.
test('порядок каскада не изменился: <style> последний в <head>', () => {
  const script = new MockElement('script', { nonce: 'r4nd0m' });
  const { doc, griffin } = setupDom(layout(), {}, { script });

  doc.head.appendChild(new MockElement('link', { rel: 'stylesheet', href: 'griffincss-core.css' }));

  griffin._autoStart();

  const last = doc.head.children[doc.head.children.length - 1];

  assert.equal(last.id, 'griffincss-dynamic', 'лист рантайма идёт после листов документа');
  assert.ok(generatedCSS(doc).startsWith('@layer griffincss.reset,'), 'порядок слоёв объявлен первым');
  assert.ok(generatedCSS(doc).includes('@layer griffincss.core {'), 'правила остались в своём слое');
});
