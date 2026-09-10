/*
  Измерения, по которым дашборд фильтруется. Шапка генерируется из этого
  списка, а не из вёрстки, поэтому вернуть или убрать фильтр — правка одной
  строки (D-13).

  `Роли` и `ФО` отсутствуют намеренно: колонок под них в выгрузке нет, а фильтр
  без источника хуже отсутствующего (D-13).
  `Сценарии` и `Триггеры` — одно измерение под именем «Триггеры» (D-14, V-21).
*/

export const DIMENSIONS = [
  {
    key: 'segment',
    title: 'Сегменты',
    allCaption: 'Все сегменты',
    values: (row) => [row.segment],
  },
  {
    key: 'trigger',
    title: 'Триггеры',
    allCaption: 'Все триггеры',
    values: (row) => row.operations ?? [],
  },
  {
    /* Появляется, только если конвертер разрешил (канал, триггер) → КП (data-model 3.2) */
    key: 'cp',
    title: 'КП',
    allCaption: 'Все КП',
    values: (row) => row.cps ?? [],
  },
  {
    key: 'product',
    title: 'Продукты',
    allCaption: 'Все продукты',
    values: (row) => row.products ?? [],
  },
  {
    key: 'domain',
    title: 'Области',
    allCaption: 'Все области',
    values: (row) => [row.domain],
  },
];

/* Измерение без значений в данных не выводится: фильтровать нечем */
export function availableDimensions(rows) {
  return DIMENSIONS.map((dimension) => {
    const values = new Set();
    for (const row of rows) {
      for (const value of dimension.values(row)) {
        if (value) values.add(value);
      }
    }
    return { ...dimension, options: [...values].sort((a, b) => a.localeCompare(b, 'ru')) };
  }).filter((dimension) => dimension.options.length > 0);
}

/* Табы каналов генерируются по уникальным значениям канала в данных (D-01) */
export function channelsOf(rows) {
  const channels = new Set();
  for (const row of rows) {
    if (row.channel) channels.add(row.channel);
  }
  return [...channels].sort((a, b) => a.localeCompare(b, 'ru'));
}
