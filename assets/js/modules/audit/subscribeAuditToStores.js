/**
 * Módulo: Auditoria - Assinaturas
 * Responsabilidade: Assinar mudanças via StoreObserver e registrar auditoria
 */

import { observeStoreChanges } from '../storeObserver.js';
import {
  shouldSuppressTransactionCreate,
  shouldSuppressTransactionUpdate
} from './shouldSuppressTransactionAudit.js';

/**
 * @param {{ auditManager: any }} options
 * @returns {string[]} IDs dos observers
 */
export function subscribeAuditToStores(options) {
  const { auditManager } = options || {};
  if (!auditManager) return [];

  const ids = [];

  // Mapa simples de stores -> entidade
  const storeEntityMap = {
    'categories': 'categoria',
    'benefits': 'beneficio',
    'credit-cards': 'credito',
    'debit-cards': 'debito',
    'transactions': 'transacao'
  };

  Object.keys(storeEntityMap).forEach((storeName) => {
    const entityKey = storeEntityMap[storeName];

    const storeIds = observeStoreChanges(storeName, (evt) => {
      const event = evt?.event;
      const data = evt?.data || {};

      // ------------
      // Auditoria simples: apenas add/update/remove
      // ------------
      if (event !== 'add' && event !== 'update' && event !== 'remove') return;

      const item = data.item;

      // ------------
      // Regras especiais para transações (evitar duplicação)
      // ------------
      if (storeName === 'transactions') {
        if (event === 'add' && shouldSuppressTransactionCreate(item)) return;
        if (event === 'update' && shouldSuppressTransactionUpdate(data.oldItem, data.item)) return;
      }

      if (event === 'add') {
        auditManager.logEntityAction({ action: 'criou', entityKey, item });
      } else if (event === 'update') {
        auditManager.logEntityAction({ action: 'editou', entityKey, item });
      } else if (event === 'remove') {
        auditManager.logEntityAction({ action: 'removeu', entityKey, item });
      }
    }, { debounce: 0, priority: -10 });

    ids.push(...storeIds);
  });

  return ids;
}
