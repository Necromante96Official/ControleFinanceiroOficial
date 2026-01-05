/**
 * Módulo: Data Health - Normalização central
 * Responsabilidade: Roteador de normalização por storageKey.
 */

import { normalizeCategories } from './normalizeCategories.js';
import { normalizeBenefits } from './normalizeBenefits.js';
import { normalizeCreditCards } from './normalizeCreditCards.js';
import { normalizeDebitCards } from './normalizeDebitCards.js';
import { normalizeTransactions } from './normalizeTransactions.js';

/**
 * Normaliza itens de um store conforme o tipo (storageKey).
 * @param {string} storageKey
 * @param {unknown} rawItems
 * @returns {{ items: Array<object>, changed: boolean, issues: string[] }}
 */
export function normalizeStoreItems(storageKey, rawItems) {
  switch (storageKey) {
    case 'finance-control:categories':
      return normalizeCategories(rawItems);

    case 'finance-control:benefits':
      return normalizeBenefits(rawItems);

    case 'finance-control:credit-cards':
      return normalizeCreditCards(rawItems);

    case 'finance-control:debit-cards':
      return normalizeDebitCards(rawItems);

    case 'finance-control:transactions':
      return normalizeTransactions(rawItems);

    default:
      // ------------
      // Fallback genérico (não destrutivo)
      // ------------
      if (!Array.isArray(rawItems)) {
        return { items: [], changed: true, issues: [`${storageKey}: dados não eram um array`] };
      }

      return {
        items: rawItems.filter((x) => x && typeof x === 'object').map((x) => ({ ...x })),
        changed: rawItems.some((x) => !x || typeof x !== 'object'),
        issues: [],
      };
  }
}
