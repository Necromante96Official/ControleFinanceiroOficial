/**
 * Módulo: Data Health - Reparo do débito
 * Responsabilidade: Normalizar o saldo do débito quando houver formato inválido.
 */

import { parseMoneyToNumber, clampToZero, formatMoneyToFixedString } from '../moneyUtils.js';

/**
 * Ajusta o saldo do débito quando estiver inválido.
 * Observação: não recalcula por extrato (não é seguro sem saldo inicial histórico).
 * @param {{ debitStore: any }} stores
 * @returns {{ changed: boolean, fixes: Array<{ accountId: number, from: string, to: string }> }}
 */
export function reconcileDebitBalances(stores) {
  const fixes = [];

  if (!stores?.debitStore) {
    return { changed: false, fixes };
  }

  const accounts = stores.debitStore.getAll();
  let changed = false;

  for (const account of accounts) {
    if (!account || typeof account !== 'object') continue;

    const accountId = Number.parseInt(String(account.id), 10);
    if (!Number.isFinite(accountId)) continue;

    const currentRaw = account.balance;
    const current = clampToZero(parseMoneyToNumber(currentRaw));

    // Sempre persistir como string "0.00" (compat com o app)
    const next = formatMoneyToFixedString(current);

    if (String(currentRaw) === next) continue;

    const ok = stores.debitStore.update(accountId, { balance: next });
    if (ok) {
      changed = true;
      fixes.push({ accountId, from: String(currentRaw), to: next });
      console.log(`🛡️ DataHealth: débito ID ${accountId} saldo normalizado (${String(currentRaw)} → ${next})`);
    }
  }

  return { changed, fixes };
}
