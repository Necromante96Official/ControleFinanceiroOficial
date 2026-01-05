/**
 * Módulo: Data Health - Normalização de Transações
 * Responsabilidade: Garantir que transações tenham formato mínimo e valores numéricos válidos.
 */

import { clampToZero } from '../moneyUtils.js';

/**
 * Normaliza transações.
 * @param {unknown} rawItems
 * @returns {{ items: Array<object>, changed: boolean, issues: string[] }}
 */
export function normalizeTransactions(rawItems) {
  const issues = [];

  if (!Array.isArray(rawItems)) {
    return { items: [], changed: true, issues: ['Transações: dados não eram um array'] };
  }

  let changed = false;
  const items = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      changed = true;
      issues.push('Transações: item inválido removido');
      continue;
    }

    const next = { ...raw };

    // ID (não forçar troca para não quebrar referências)
    if (!Number.isFinite(Number.parseInt(String(next.id), 10))) {
      next.id = next.id ?? null;
      changed = true;
      issues.push('Transações: item com id inválido mantido como null');
    }

    // Tipo (entrada/saida/transferencia)
    if (typeof next.type !== 'string') {
      next.type = String(next.type ?? '');
      changed = true;
    }

    // Método de pagamento (compatibilidade com legado: pode existir "category")
    if (typeof next.paymentMethod !== 'string' && typeof next.category === 'string') {
      next.paymentMethod = next.category;
      changed = true;
    }
    if (typeof next.paymentMethod !== 'string') {
      next.paymentMethod = String(next.paymentMethod ?? '');
      changed = true;
    }

    // Valor (transações usam number no store)
    const parsedValue = Number.parseFloat(next.value);
    const safeValue = clampToZero(Number.isFinite(parsedValue) ? parsedValue : 0);
    if (next.value !== safeValue) {
      next.value = safeValue;
      changed = true;
    }

    // IDs de origem/destino (podem ser null)
    if (next.sourceId !== null && next.sourceId !== undefined) {
      const sid = Number.parseInt(String(next.sourceId), 10);
      if (!Number.isFinite(sid)) {
        next.sourceId = null;
        changed = true;
      } else if (next.sourceId !== sid) {
        next.sourceId = sid;
        changed = true;
      }
    }

    if (next.targetId !== null && next.targetId !== undefined) {
      const tid = Number.parseInt(String(next.targetId), 10);
      if (!Number.isFinite(tid)) {
        next.targetId = null;
        changed = true;
      } else if (next.targetId !== tid) {
        next.targetId = tid;
        changed = true;
      }
    }

    // Metadata (evita quebra em acessos t?.metadata?.algo)
    if (next.metadata !== undefined && next.metadata !== null && typeof next.metadata !== 'object') {
      next.metadata = {};
      changed = true;
      issues.push('Transações: metadata inválida substituída por {}');
    }

    items.push(next);
  }

  return { items, changed, issues };
}
