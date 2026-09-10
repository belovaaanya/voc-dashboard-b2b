/**
 * Границы слайса, проверяемые по исходникам расчётных модулей.
 *
 * Каждая проверка отрицательная («в модулях этого нет»), поэтому у каждой есть
 * positive control: тот же матчер обязан срабатывать на заведомо ломаном
 * образце. Иначе «ничего не найдено» означает лишь то, что матчер не работает.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Модули этого слайса перечислены явно: соседние файлы в `site/js/` — чужие. */
const CALC_MODULES = [
  'period.js',
  'metrics.js',
  'breakdown.js',
  'impact.js',
  'sufficiency.js',
  'round.js',
];

const sourceOf = (module) =>
  readFileSync(new URL(`../site/js/${module}`, import.meta.url), 'utf8');

const FORMATTING = /toLocaleString|Intl\./;
const METHODOLOGY = /markEffect|mixEffect/;

test('AC-22 calc modules SHOULD leave string formatting to D-20', () => {
  for (const module of CALC_MODULES) {
    assert.equal(
      FORMATTING.test(sourceOf(module)),
      false,
      `${module}: форматирование строк — дело функции формата (D-20)`,
    );
  }

  assert.equal(
    FORMATTING.test("value.toLocaleString('ru-RU')"),
    true,
    'positive control: матчер обязан находить форматирование',
  );
});

test('AC-15 the impact methodology SHOULD live in impact.js only', () => {
  assert.equal(
    METHODOLOGY.test(sourceOf('impact.js')),
    true,
    'positive control: матчер обязан находить методику там, где она есть',
  );

  for (const module of CALC_MODULES.filter((name) => name !== 'impact.js')) {
    assert.equal(
      METHODOLOGY.test(sourceOf(module)),
      false,
      `${module}: методика D-10 обязана заменяться правкой одного файла`,
    );
  }
});

test('AC-20 sufficiency SHOULD mark its default threshold as a placeholder awaiting analytics', () => {
  const source = sourceOf('sufficiency.js');
  const marker = /ЗАГЛУШКА[^*]*`D-25`|`D-25`[^*]*ЗАГЛУШКА/i;

  assert.equal(marker.test(source), true, 'порог по умолчанию — заглушка, а не решение');
  assert.equal(
    marker.test('export const DEFAULT_PRECISION_THRESHOLD = 0.1;'),
    false,
    'positive control: матчер обязан не находить пометку там, где её нет',
  );
});

test('calc modules SHOULD depend only on each other', () => {
  const imports = /from '\.\/([^']+)'/g;

  for (const module of CALC_MODULES) {
    for (const [, dependency] of sourceOf(module).matchAll(imports)) {
      assert.ok(
        CALC_MODULES.includes(dependency),
        `${module} импортирует ${dependency} — файл другой сессии`,
      );
    }
  }
});
