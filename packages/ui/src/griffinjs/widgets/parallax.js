/*
 * GriffinJS — параллакс: прогресс положения блока на экране.
 *
 *   <section data-gr-parallax>…</section>
 *
 * Скрипт пишет на блок только --gr-progress: 0 — верхний край вошёл снизу,
 * 1 — нижний край ушёл вверх. Эффект — открытый набор в CSS:
 *
 *   .hero-bg { translate: 0 calc(var(--gr-progress, 0.5) * -40px); }
 *
 * а не перечень эффектов в скрипте. Там, где есть scroll-driven animations,
 * тот же CSS позже отдаётся платформе без смены разметки. Без скрипта
 * прогресса нет, и запасное значение в var() оставляет блок на месте.
 */
(function (G) {
  'use strict';

  G.defineWidget('parallax', { needs: ['motion'] }, function (el) {
    var source = G.motion.viewport(el);

    return {
      el: el,
      update: source.update,
      destroy: source.destroy
    };
  });
})(typeof window !== 'undefined' && window.GriffinJS ? window.GriffinJS : require('../core/griffinjs-core.js'));
