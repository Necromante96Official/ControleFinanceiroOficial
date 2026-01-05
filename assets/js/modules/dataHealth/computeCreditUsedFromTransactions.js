/**
 * Módulo: Data Health - Cálculo de usado do crédito
 * Responsabilidade: Recalcular o "used" por cartão a partir das transações.
 */

/**
 * Calcula o usado esperado do crédito por cartão.
 * Regras (compatíveis com TransactionManager):
 * - Saída no crédito (paymentMethod=credito) soma no used (sourceId = cartão)
 * - Entrada no crédito (paymentMethod=credito) subtrai do used (sourceId = cartão)
 * - Pagamento legado (paymentMethod=pagar-credito) subtrai do used (targetId = cartão)
 *
 * @param {Array<object>} transactions
 * @returns {Map<number, number>}
 */
export function computeCreditUsedFromTransactions(transactions) {
  const map = new Map();

  if (!Array.isArray(transactions)) return map;

  for (const t of transactions) {
    if (!t || typeof t !== 'object') continue;

    const method = t.paymentMethod || t.category;
    const type = t.type;
    const value = Number.parseFloat(t.value);

    if (!Number.isFinite(value) || value <= 0) continue;

    // ------------
    // Saída / Entrada no crédito (sourceId)
    // ------------
    if (method === 'credito') {
      const sourceId = Number.parseInt(String(t.sourceId), 10);
      if (!Number.isFinite(sourceId)) continue;

      const current = map.get(sourceId) ?? 0;

      if (type === 'saida') {
        map.set(sourceId, current + value);
      } else if (type === 'entrada') {
        map.set(sourceId, current - value);
      }

      continue;
    }

    // ------------
    // Pagamento legado (pagar-credito) reduz usado no targetId
    // ------------
    if (method === 'pagar-credito') {
      const targetId = Number.parseInt(String(t.targetId), 10);
      if (!Number.isFinite(targetId)) continue;

      const current = map.get(targetId) ?? 0;
      map.set(targetId, current - value);
    }
  }

  // ------------
  // Nunca deixar negativo
  // ------------
  for (const [id, used] of map.entries()) {
    map.set(id, Math.max(0, used));
  }

  return map;
}
