/**
 * Módulo: Armazenamento de Cartões de Débito / Dinheiro
 * Responsabilidade: Gerenciar estado dos cartões de débito (CRUD) com persistência em localStorage
 * Estende BaseStore para funcionalidades comuns
 */

import { BaseStore } from './baseStore.js';

const STORAGE_KEY = "finance-control:debit-cards";

export class DebitStore extends BaseStore {
  constructor(initialCards = []) {
    super(STORAGE_KEY, 'cards', initialCards);
  }

  /**
   * Calcula saldo total de todos os cartões de débito
   */
  getTotalBalance() {
    return this._items.reduce((total, card) => total + (Number(card.balance) || 0), 0);
  }

  // Métodos herdados de BaseStore:
  // - getAll()
  // - findById(id) / getById(id)
  // - add(payload)
  // - update(id, payload)
  // - remove(id)
  // - clear()
  // - count()
  // - isEmpty()
  // - setAll(items)
  // - reload()
}
