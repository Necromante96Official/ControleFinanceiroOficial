/**
 * Módulo: Auditoria - Regras de Supressão (Transações)
 * Responsabilidade: Evitar spam de auditoria em ações técnicas (ex.: vínculo)
 */

import { getChangedKeysShallow } from './getChangedKeysShallow.js';

/**
 * Verifica se uma transação deve ser tratada como transferência.
 * @param {any} t
 * @returns {boolean}
 */
export function isTransferTransaction(t) {
  const type = t?.type;
  const method = t?.paymentMethod || t?.category;
  return type === 'transferencia' || method === 'transferencia' || !!t?.metadata?.isTransfer;
}

/**
 * Verifica se é transação de pagamento de fatura (vinculada).
 * @param {any} t
 * @returns {boolean}
 */
export function isLinkedInvoicePaymentTransaction(t) {
  return !!(t?.metadata?.linkedPayment === true || t?.categoryName === 'Pagamento de Fatura');
}

/**
 * Verifica se é pagamento legado (um lançamento) de fatura.
 * @param {any} t
 * @returns {boolean}
 */
export function isLegacyInvoicePaymentTransaction(t) {
  const method = t?.paymentMethod || t?.category;
  return method === 'pagar-credito';
}

/**
 * Supressão de auditoria para "criou" em transações que já terão "transferiu/pagou".
 * @param {any} t
 * @returns {boolean}
 */
export function shouldSuppressTransactionCreate(t) {
  return isTransferTransaction(t) || isLinkedInvoicePaymentTransaction(t) || isLegacyInvoicePaymentTransaction(t);
}

/**
 * Supressão de auditoria para "editou" quando a edição foi apenas o vínculo técnico.
 * @param {any} oldItem
 * @param {any} newItem
 * @returns {boolean}
 */
export function shouldSuppressTransactionUpdate(oldItem, newItem) {
  const changedKeys = getChangedKeysShallow(oldItem, newItem);
  if (!changedKeys.length) return true;

  // ------------
  // Vincular transações atualiza basicamente "linkedTransactionId".
  // Também pode haver "updatedAt".
  // ------------
  const allowed = new Set(['linkedTransactionId', 'updatedAt']);
  return changedKeys.every(k => allowed.has(k));
}
