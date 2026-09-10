/* Один помощник построения узлов на весь дашборд: блоки пишутся параллельно, и своя копия в каждом расходится. */

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/* Пропускает отсутствующие узлы: часть карточки не рисуется вовсе — нет плана, нет дельты */
export function appendAll(parent, ...nodes) {
  for (const node of nodes) {
    if (node) parent.append(node);
  }
  return parent;
}
