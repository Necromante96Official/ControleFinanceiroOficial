/**
 * Módulo: Data Health - Reparo do crédito
 * Responsabilidade: Ajustar o "used" do crédito quando estiver inconsistente.
 */

import { parseMoneyToNumber, clampToZero, formatMoneyToFixedString } from '../moneyUtils.js';
import { computeCreditUsedFromTransactions } from './computeCreditUsedFromTransactions.js';

/**
 * Reconciliar o used do crédito a partir das transações.
 * @param {{ creditStore: any, transactionStore: any }} stores
 * @returns {{ changed: boolean, fixes: Array<{ cardId: number, from: number, to: number }> }}
 */
export function reconcileCreditUsed(stores) {
  const fixes = [];

  if (!stores?.creditStore || !stores?.transactionStore) {
    return { changed: false, fixes };
  }

  const cards = stores.creditStore.getAll();
  const transactions = stores.transactionStore.getAll();

  const expectedMap = computeCreditUsedFromTransactions(transactions);

  let changed = false;

  for (const card of cards) {
    if (!card || typeof card !== 'object') continue;

    const cardId = Number.parseInt(String(card.id), 10);
    if (!Number.isFinite(cardId)) continue;

    const expected = clampToZero(expectedMap.get(cardId) ?? 0);
    const current = clampToZero(parseMoneyToNumber(card.used));

    // ------------
    // Evitar mexer por ruído de centavos
    // ------------
    const diff = Math.abs(expected - current);
    if (diff < 0.01) continue;

    const ok = stores.creditStore.update(cardId, {
      used: formatMoneyToFixedString(expected),
    });

    if (ok) {
      changed = true;
      fixes.push({ cardId, from: current, to: expected });
      console.log(`🛡️ DataHealth: crédito ID ${cardId} usado corrigido (${formatMoneyToFixedString(current)} → ${formatMoneyToFixedString(expected)})`);
    }
  }

  return { changed, fixes };
}
