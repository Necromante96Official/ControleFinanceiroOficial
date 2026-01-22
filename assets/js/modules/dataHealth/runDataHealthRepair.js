/**
 * Módulo: Data Health - Orquestrador de reparos
 * Responsabilidade: Executar reparos seguros após boot (quando há dados carregados).
 */

import { reconcileCreditUsed } from './reconcileCreditUsed.js';
import { reconcileDebitBalances } from './reconcileDebitBalances.js';
import { reconcileBenefitUsed } from './reconcileBenefitUsed.js';

/**
 * Executa reparos de saúde dos dados (seguros e sem risco alto de perda).
 * @param {{ categoryStore: any, benefitStore: any, creditStore: any, debitStore: any, transactionStore: any }} stores
 * @returns {{ creditUsed: { changed: boolean, fixes: Array<any> }, benefitUsed: { changed: boolean, fixes: Array<any> }, debitBalances: { changed: boolean, fixes: Array<any> } }}
 */
export function runDataHealthRepair(stores) {
  // ------------
  // Reparos que podem ser recalculados a partir do extrato
  // ------------
  const creditUsed = reconcileCreditUsed(stores);
  const benefitUsed = reconcileBenefitUsed(stores);

  // ------------
  // Reparos de formato/NaN
  // ------------
  const debitBalances = reconcileDebitBalances(stores);

  return { creditUsed, benefitUsed, debitBalances };
}
