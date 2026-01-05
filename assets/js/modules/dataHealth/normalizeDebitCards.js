/**
 * Módulo: Data Health - Normalização de Débito
 * Responsabilidade: Garantir que contas de débito tenham valores numéricos válidos.
 */

import { parseMoneyToNumber, clampToZero, formatMoneyToFixedString } from '../moneyUtils.js';

/**
 * Normaliza contas/cartões de débito.
 * @param {unknown} rawItems
 * @returns {{ items: Array<object>, changed: boolean, issues: string[] }}
 */
export function normalizeDebitCards(rawItems) {
  const issues = [];

  if (!Array.isArray(rawItems)) {
    return { items: [], changed: true, issues: ['Débito: dados não eram um array'] };
  }

  let changed = false;
  const items = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      changed = true;
      issues.push('Débito: item inválido removido');
      continue;
    }

    const next = { ...raw };

    // ID (não forçar troca para não quebrar referências)
    if (!Number.isFinite(Number.parseInt(String(next.id), 10))) {
      next.id = next.id ?? null;
      changed = true;
      issues.push('Débito: item com id inválido mantido como null');
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

    // Saldo (compat: stores podem salvar como string "0.00")
    const balance = clampToZero(parseMoneyToNumber(next.balance));
    const nextBalance = formatMoneyToFixedString(balance);
    if (String(next.balance) !== nextBalance) {
      next.balance = nextBalance;
      changed = true;
    }

    // Cor/ícone
    if (typeof next.color !== 'string') {
      next.color = String(next.color ?? '');
      changed = true;
    }
    if (typeof next.icon !== 'string') {
      next.icon = String(next.icon ?? '💳');
      changed = true;
    }

    items.push(next);
  }

  return { items, changed, issues };
}
