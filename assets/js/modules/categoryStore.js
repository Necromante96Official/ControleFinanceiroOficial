/**
 * Módulo: Armazenamento de Categorias
 * Responsabilidade: Gerenciar estado das categorias (CRUD) com persistência em localStorage
 * Estende BaseStore para funcionalidades comuns
 */

import { BaseStore } from './baseStore.js';

const STORAGE_KEY = "finance-control:categories";

export class CategoryStore extends BaseStore {
  constructor(initialCategories = []) {
    super(STORAGE_KEY, 'categories', initialCategories);
  }

  /**
   * Sobrescreve getAll para retornar categorias ordenadas alfabeticamente
   * @returns {Array} Categorias ordenadas por nome
   */
  getAll() {
    const categories = [...this._items];
    return categories.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }

  // Métodos herdados de BaseStore:
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
