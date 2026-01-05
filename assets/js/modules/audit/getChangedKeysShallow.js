/**
 * Módulo: Auditoria - Diff Shallow
 * Responsabilidade: Identificar quais chaves mudaram entre dois objetos (shallow)
 */

/**
 * Retorna as chaves que mudaram (comparação rasa).
 * @param {Object} oldItem
 * @param {Object} newItem
 * @returns {string[]}
 */
export function getChangedKeysShallow(oldItem, newItem) {
  const oldObj = oldItem && typeof oldItem === 'object' ? oldItem : {};
  const newObj = newItem && typeof newItem === 'object' ? newItem : {};

  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changed = [];

  keys.forEach((key) => {
    if (oldObj[key] !== newObj[key]) {
      changed.push(key);
    }
  });

  return changed;
}
