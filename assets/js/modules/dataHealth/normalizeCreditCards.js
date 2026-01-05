/**
 * Módulo: Data Health - Normalização de Crédito
 * Responsabilidade: Garantir que cartões de crédito tenham campos numéricos e flags válidos.
 */

import { parseMoneyToNumber, clampToZero, formatMoneyToFixedString } from '../moneyUtils.js';

/**
 * Normaliza cartões de crédito.
 * @param {unknown} rawItems
 * @returns {{ items: Array<object>, changed: boolean, issues: string[] }}
 */
export function normalizeCreditCards(rawItems) {
  const issues = [];

  if (!Array.isArray(rawItems)) {
    return { items: [], changed: true, issues: ['Crédito: dados não eram um array'] };
  }

  let changed = false;
  const items = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      changed = true;
      issues.push('Crédito: item inválido removido');
      continue;
    }

    const next = { ...raw };

    // ID (não forçar troca para não quebrar referências)
    if (!Number.isFinite(Number.parseInt(String(next.id), 10))) {
      next.id = next.id ?? null;
      changed = true;
      issues.push('Crédito: item com id inválido mantido como null');
    }

    // Nome
    if (typeof next.name !== 'string') {
      next.name = String(next.name ?? '').trim();
      changed = true;
    } else {
      const trimmed = next.name.trim();
      if (trimmed !== next.name) {
        next.name = trimmed;
        changed = true;
      }
    }

    // Limite / usado (compatível com strings e formatos antigos)
    const limit = clampToZero(parseMoneyToNumber(next.limit));
    const used = clampToZero(parseMoneyToNumber(next.used));

    const nextLimit = formatMoneyToFixedString(limit);
    const nextUsed = formatMoneyToFixedString(used);

    if (String(next.limit) !== nextLimit) {
      next.limit = nextLimit;
      changed = true;
    }
    if (String(next.used) !== nextUsed) {
      next.used = nextUsed;
      changed = true;
    }

    // Vencimento
    if (next.dueDay !== undefined && next.dueDay !== null && String(next.dueDay).trim() !== '') {
      const dueDay = Number.parseInt(String(next.dueDay), 10);
      if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
        next.dueDay = null;
        changed = true;
        issues.push('Crédito: dueDay inválido ajustado para null');
      } else if (next.dueDay !== dueDay) {
        next.dueDay = dueDay;
        changed = true;
      }
    }

    // Flags do ciclo (segurança)
    if (typeof next.paidForCurrentCycle !== 'boolean') {
      next.paidForCurrentCycle = Boolean(next.paidForCurrentCycle);
      changed = true;
    }

    items.push(next);
  }

  return { items, changed, issues };
}
