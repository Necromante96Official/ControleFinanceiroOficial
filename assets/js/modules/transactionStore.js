/**
 * Transaction Store - Gerenciamento de Lançamentos (Extrato)
 *
 * Gerencia todas as transações (entradas e saídas) do sistema,
 * integrando com débito, crédito e benefícios.
 * Estende BaseStore para funcionalidades comuns de CRUD.
 *

 */

import { BaseStore } from './baseStore.js';
import * as dateUtils from './dateUtils.js';

const STORAGE_KEY = "finance-control:transactions";

export class TransactionStore extends BaseStore {
  constructor() {
    super(STORAGE_KEY, 'transactions', []);
    this._migrateLegacyFields();

    console.log(`📋 ${this._items.length} transação(ões) carregada(s)`);
  }

  /**
   * Migra campos legados de transações antigas
   * @private
   */
  _migrateLegacyFields() {
    let migrated = 0;

    this._items.forEach(transaction => {
      // Se tem 'category' mas não tem 'paymentMethod', migrar
      if (transaction.category && !transaction.paymentMethod) {
        transaction.paymentMethod = transaction.category;
        delete transaction.category; // Remove campo legado
        migrated++;
      }
    });

    if (migrated > 0) {
      console.log(`🔄 Migração: ${migrated} transação(ões) atualizadas (category → paymentMethod)`);
      this._saveToStorage();
    }
  }

  /**
   * Sobrescreve add() para adicionar campos específicos de transações
   * e manter ordenação por data
    * - Preserva TODOS os campos da transação (linkedTransactionId, metadata, etc.)
    * - Usa dateUtils para timestamps consistentes
    * - Campo 'category' é legado (preferir 'paymentMethod')
   */
  add(transaction) {
    const nextId = this._generateNextId();
    // CRÍTICO: linkedTransactionId, metadata, description, sourceName, targetName, originalValue
    const newTransaction = {
      ...transaction,
      id: nextId,
      name: transaction.name,
      type: transaction.type, // 'entrada' ou 'saida'
      categoryId: transaction.categoryId || null,
      categoryName: transaction.categoryName || '',
      categoryIcon: transaction.categoryIcon || '📝',
      categoryColor: transaction.categoryColor || '#1fc2c0',
      paymentMethod: transaction.paymentMethod,
      sourceId: transaction.sourceId,
      targetId: transaction.targetId || null,
      value: parseFloat(transaction.value) || 0,
      date: transaction.date || dateUtils.now(),
      createdAt: transaction.createdAt || dateUtils.now(),
      updatedAt: dateUtils.now()
    };

    // Adiciona no início (mais recente primeiro)
    this._items.unshift(newTransaction);
    this._saveToStorage();
    console.log("✨ Nova transação criada:", newTransaction);
    return newTransaction;
  }

  /**
   * Sobrescreve update() para adicionar log e updatedAt
   */
  update(id, updates) {
    const result = super.update(id, updates);
    if (result) {
      console.log("✏️ Transação atualizada:", result);
    }
    return result;
  }

  /**
   * Sobrescreve remove() para adicionar log
   */
  remove(id) {
    const removed = super.remove(id);
    if (removed) {
      console.log("🗑️ Transação removida:", removed);
    }
    return removed;
  }

  /**
   * Filtra transações por tipo
   * @param {string} type - 'entrada' ou 'saida'
   * @returns {Array} Lista filtrada
   */
  getByType(type) {
    return this._items.filter(t => t.type === type);
  }

  /**
   * Filtra transações por método de pagamento
    * Suporta dados legados (fallback de 'category')
   * @param {string} paymentMethod - 'debito', 'credito', 'beneficio', 'pagar-credito'
   * @returns {Array} Lista filtrada
   */
  getByCategory(paymentMethod) {
    // - Dados novos usam 'paymentMethod'
    // - Dados antigos usavam 'category'
    return this._items.filter(t => {
      // Método atual: paymentMethod
      const method = t.paymentMethod || t.category; // Fallback para dados legados

      // Comparação
      return method === paymentMethod;
    });
  }

  /**
   * Filtra transações por período
    * Usa dateUtils para normalização consistente e correta de timezone
   * @param {Date|string} startDate - Data inicial
   * @param {Date|string} endDate - Data final
   * @returns {Array} Lista filtrada
   */
  getByPeriod(startDate, endDate) {
    const start = dateUtils.startOfDay(startDate);
    const end = dateUtils.endOfDay(endDate);

    return this._items.filter(t => {
      // Normaliza a data da transação da mesma forma
      const transactionDate = dateUtils.normalizeDate(t.date);
      return transactionDate >= start && transactionDate <= end;
    });
  }

  /**
   * Obtém transações do mês atual
    * Usa dateUtils para cálculo consistente
   * @returns {Array} Lista de transações do mês
   */
  getCurrentMonth() {
    const start = dateUtils.startOfCurrentMonth();
    const end = dateUtils.endOfCurrentMonth();
    return this.getByPeriod(start, end);
  }

  /**
   * Calcula total de entradas
   * @param {Array} transactions - Lista de transações (opcional)
   * @returns {number} Total de entradas
   */
  getTotalEntradas(transactions = null) {
    const list = transactions || this._items;
    return list
      // Transferências não são "entrada real" no extrato (evita inflar estatísticas)
      .filter(t => t.type === 'entrada' && !(t?.metadata?.isTransfer))
      .reduce((sum, t) => sum + t.value, 0);
  }

  /**
   * Calcula total de saídas
   * @param {Array} transactions - Lista de transações (opcional)
   * @returns {number} Total de saídas
   */
  getTotalSaidas(transactions = null) {
    const list = transactions || this._items;
    return list
      // Transferências não são "saída real" no extrato (evita inflar estatísticas)
      .filter(t => t.type === 'saida' && !(t?.metadata?.isTransfer))
      .reduce((sum, t) => sum + t.value, 0);
  }

  /**
   * Calcula entradas e saídas do extrato em um único loop.
   * - Evita múltiplos filter/reduce em listas grandes.
   * - Mantém a regra de ignorar transferências nas estatísticas.
   * @param {Array|null} transactions
   * @returns {{ entradas: number, saidas: number }}
   */
  getTotaisExtrato(transactions = null) {
    const list = transactions || this._items;

    let entradas = 0;
    let saidas = 0;

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t) continue;
      if (t?.metadata?.isTransfer) continue;

      if (t.type === 'entrada') entradas += t.value;
      else if (t.type === 'saida') saidas += t.value;
    }

    return { entradas, saidas };
  }

  /**
   * Calcula saldo (entradas - saídas)
   * @param {Array} transactions - Lista de transações (opcional)
   * @returns {number} Saldo
   */
  getBalance(transactions = null) {
    const entradas = this.getTotalEntradas(transactions);
    const saidas = this.getTotalSaidas(transactions);
    return entradas - saidas;
  }

  /**
   * Sobrescreve clear() para adicionar log
   */
  clear() {
    super.clear();
    console.log("🗑️ Todas as transações foram removidas");
  }

  /**
   * Formata data para exibição
    * Inclui validação e fallback para datas inválidas
   * @param {string} isoDate - Data em formato ISO
   * @returns {string} Data formatada
   */
  static formatDate(isoDate) {
    // Validação: verificar se data foi fornecida
    if (!isoDate) {
      console.warn('⚠️ formatDate: data não fornecida');
      return 'Data inválida';
    }

    try {
      // Tentar formatar com dateUtils
      const formatted = dateUtils.formatDate(isoDate, false);

      // Verificar se retornou algo válido
      if (!formatted || formatted === 'Invalid Date' || formatted === 'NaN/NaN/NaN') {
        throw new Error('Formatação resultou em data inválida');
      }

      return formatted;
    } catch (error) {
      console.error('❌ Erro ao formatar data:', error, 'Data:', isoDate);

      // FALLBACK: Tentar converter para string legível
      try {
        const date = new Date(isoDate);
        if (!isNaN(date.getTime())) {
          // Data é válida, retornar formatação básica
          return date.toLocaleDateString('pt-BR');
        }
      } catch (fallbackError) {
        console.error('❌ Fallback de formatação também falhou:', fallbackError);
      }

      // Último recurso: retornar a string original
      return String(isoDate);
    }
  }

  /**
   * Formata data e hora para exibição
    * Inclui validação e fallback para datas inválidas
   * @param {string} isoDate - Data em formato ISO
   * @returns {string} Data e hora formatada
   */
  static formatDateTime(isoDate) {
    // Validação: verificar se data foi fornecida
    if (!isoDate) {
      console.warn('⚠️ formatDateTime: data não fornecida');
      return 'Data/hora inválida';
    }

    try {
      // Tentar formatar com dateUtils
      const formatted = dateUtils.formatDate(isoDate, true);

      // Verificar se retornou algo válido
      if (!formatted || formatted === 'Invalid Date' || formatted.includes('NaN')) {
        throw new Error('Formatação resultou em data/hora inválida');
      }

      return formatted;
    } catch (error) {
      console.error('❌ Erro ao formatar data/hora:', error, 'Data:', isoDate);

      // FALLBACK: Tentar converter para string legível
      try {
        const date = new Date(isoDate);
        if (!isNaN(date.getTime())) {
          // Data é válida, retornar formatação básica com hora
          return date.toLocaleString('pt-BR');
        }
      } catch (fallbackError) {
        console.error('❌ Fallback de formatação também falhou:', fallbackError);
      }

      // Último recurso: retornar a string original
      return String(isoDate);
    }
  }
}
