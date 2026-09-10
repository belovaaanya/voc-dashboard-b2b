/*
  Измерения, по которым дашборд фильтруется. Шапка генерируется из этого
  списка, а не из вёрстки, поэтому вернуть или убрать фильтр — правка одной
  строки (D-13).

  `Роли` и `ФО` отсутствуют намеренно: колонок под них в выгрузке нет, а фильтр
  без источника хуже отсутствующего (D-13).
  `Сценарии` и `Триггеры` — одно измерение под именем «Триггеры» (D-14, V-21).

  `КП` и `Продукты` выводятся из триггера через справочник по паре
  (канал, триггер) — join только по триггеру дал бы неверный разрез
  (data-model §3.2). Значения внутри строки дедуплицируются: несколько
  триггеров одной оценки могут сойтись в один продукт (data-model §5.2).
*/

function viaReference(row, reference, field) {
  const mapping = reference?.operations?.[row.channel];
  if (!mapping) return [];
  const values = new Set();
  for (const trigger of row.operations ?? []) {
    const value = mapping[trigger]?.[field];
    if (value) values.add(value);
  }
  return [...values];
}

/* Канал не входит в DIMENSIONS: он выше фильтров, но подпись берёт так же (D-02) */
export const CHANNEL_DIMENSION = 'channel';

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
    key: 'cp',
    title: 'КП',
    allCaption: 'Все КП',
    values: (row, reference) => viaReference(row, reference, 'kp'),
  },
  {
    key: 'product',
    title: 'Продукты',
    allCaption: 'Все продукты',
    values: (row, reference) => viaReference(row, reference, 'product'),
  },
  {
    key: 'domain',
    title: 'Области',
    allCaption: 'Все области',
    values: (row) => [row.domain],
  },
];

/* Измерение без значений в данных не выводится: фильтровать нечем */
export function availableDimensions(rows, reference) {
  return DIMENSIONS.map((dimension) => {
    const values = new Set();
    for (const row of rows) {
      for (const value of dimension.values(row, reference)) {
        if (value) values.add(value);
      }
    }
    return { ...dimension, options: [...values].sort((a, b) => a.localeCompare(b, 'ru')) };
  }).filter((dimension) => dimension.options.length > 0);
}

/*
  Табы каналов генерируются по данным (D-01). Манифест несёт свой список
  каналов, но источником остаются сами оценки: канал без единой оценки
  показывать нечем
*/
export function channelsOf(rows) {
  const channels = new Set();
  for (const row of rows) {
    if (row.channel) channels.add(row.channel);
  }
  return [...channels].sort((a, b) => a.localeCompare(b, 'ru'));
}
