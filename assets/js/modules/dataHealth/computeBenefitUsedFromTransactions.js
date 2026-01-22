/**
 * Módulo: Data Health - Cálculo de usado do benefício
 * Responsabilidade: Recalcular o "used" por benefício a partir das transações no ciclo atual.
 */

/**
 * Calcula o usado esperado dos benefícios a partir das transações.
 * Regras:
 * - Saída no benefício (paymentMethod=beneficio) soma no used (sourceId = benefício)
 * - Entrada no benefício (paymentMethod=beneficio) subtrai do used (sourceId = benefício)
 * - Filtra transações que ocorreram APÓS a última recarga do benefício (lastReloadDate).
 *
 * @param {Array<object>} transactions
 * @param {Array<object>} benefits
 * @returns {Map<number, number>}
 */
export function computeBenefitUsedFromTransactions(transactions, benefits) {
  const map = new Map();

  if (!Array.isArray(transactions) || !Array.isArray(benefits)) return map;

  // Criar mapa de recarga por benefício para busca rápida
  const reloadMap = new Map();
  benefits.forEach(b => {
    if (b && typeof b === 'object') {
      const id = Number.parseInt(String(b.id), 10);
      if (Number.isFinite(id)) {
        // Garantir que a data seja comparável (00:00:00 do dia local ou ISO)
        try {
          const d = b.lastReloadDate ? new Date(b.lastReloadDate) : new Date(0);
          d.setHours(0, 0, 0, 0);
          reloadMap.set(id, d.getTime());
        } catch {
          reloadMap.set(id, 0);
        }
      }
    }
  });

  for (const t of transactions) {
    if (!t || typeof t !== 'object') continue;

    const method = t.paymentMethod || t.category;
    const type = t.type;
    const value = Number.parseFloat(t.value);

    // Considerar apenas transações de benefício com valor válido
    if (method !== 'beneficio' || !Number.isFinite(value) || value <= 0) continue;

    const sourceId = Number.parseInt(String(t.sourceId), 10);
    if (!Number.isFinite(sourceId)) continue;

    // Verificar se a transação pertence ao ciclo atual (>= lastReloadDate)
    const lastReloadTime = reloadMap.get(sourceId);
    if (lastReloadTime === undefined) continue;

    try {
      const transDate = new Date(t.date || t.createdAt);
      transDate.setHours(0, 0, 0, 0);
      
      // Se a transação for anterior à última recarga, ela não conta para o "used" atual
      if (transDate.getTime() < lastReloadTime) continue;
    } catch {
      // Se houver erro na data, ignora a transação por segurança
      continue;
    }

    const current = map.get(sourceId) ?? 0;

    if (type === 'saida') {
      map.set(sourceId, current + value);
    } else if (type === 'entrada') {
      map.set(sourceId, current - value);
    }
  }

  return map;
}
