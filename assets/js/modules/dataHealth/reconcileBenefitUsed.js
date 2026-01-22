/**
 * Módulo: Data Health - Reparo dos benefícios
 * Responsabilidade: Ajustar o "used" e "available" dos benefícios quando inconsistentes com o extrato.
 */

import { parseMoneyToNumber, clampToZero, formatMoneyToFixedString } from '../moneyUtils.js';
import { computeBenefitUsedFromTransactions } from './computeBenefitUsedFromTransactions.js';

/**
 * Reconciliar o used dos benefícios a partir das transações.
 * @param {{ benefitStore: any, transactionStore: any }} stores
 * @returns {{ changed: boolean, fixes: Array<{ id: number, name: string, usedFrom: number, usedTo: number, availableFrom: number, availableTo: number }> }}
 */
export function reconcileBenefitUsed(stores) {
  const fixes = [];

  if (!stores?.benefitStore || !stores?.transactionStore) {
    return { changed: false, fixes };
  }

  const benefits = stores.benefitStore.getAll();
  const transactions = stores.transactionStore.getAll();

  const expectedUsedMap = computeBenefitUsedFromTransactions(transactions, benefits);

  let changed = false;

  for (const benefit of benefits) {
    if (!benefit || typeof benefit !== 'object') continue;

    const id = Number.parseInt(String(benefit.id), 10);
    if (!Number.isFinite(id)) continue;

    const reconciledUsed = clampToZero(expectedUsedMap.get(id) ?? 0);
    const currentUsed = clampToZero(parseMoneyToNumber(benefit.used));
    const currentAvailable = clampToZero(parseMoneyToNumber(benefit.available));

    // ------------
    // Evitar mexer por ruído de centavos
    // ------------
    const diffUsed = Math.abs(reconciledUsed - currentUsed);
    if (diffUsed < 0.01) continue;

    // Calcular novo available baseado na diferença de used
    // Se usei MAIS do que o registrado (reconciledUsed > currentUsed), o saldo disponível deve DIMINUIR.
    // Se usei MENOS do que o registrado (reconciledUsed < currentUsed), o saldo disponível deve AUMENTAR.
    const usedDelta = currentUsed - reconciledUsed;
    const reconciledAvailable = clampToZero(currentAvailable + usedDelta);

    const ok = stores.benefitStore.update(id, {
      used: reconciledUsed,
      available: reconciledAvailable,
    });

    if (ok) {
      changed = true;
      fixes.push({
        id,
        name: benefit.name,
        usedFrom: currentUsed,
        usedTo: reconciledUsed,
        availableFrom: currentAvailable,
        availableTo: reconciledAvailable
      });
      console.log(`🛡️ DataHealth: benefício "${benefit.name}" (ID ${id}) corrigido:`);
      console.log(`   - Usado: ${formatMoneyToFixedString(currentUsed)} → ${formatMoneyToFixedString(reconciledUsed)}`);
      console.log(`   - Livre: ${formatMoneyToFixedString(currentAvailable)} → ${formatMoneyToFixedString(reconciledAvailable)}`);
    }
  }

  return { changed, fixes };
}
