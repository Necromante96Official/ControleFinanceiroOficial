/**
 * Módulo: Armazenamento de Cartões de Crédito
 * Responsabilidade: Gerenciar estado dos cartões de crédito (CRUD + vencimento + ciclos) com persistência em localStorage
 * Estende BaseStore para funcionalidades comuns
 *

 *                  - Novo campo `currentBillingCycleStart` para rastrear início do ciclo atual
 *                  - Novo campo `paidForCurrentCycle` para indicar se a fatura do ciclo foi paga
 *                  - Novos gastos após pagamento são considerados do PRÓXIMO ciclo
 *                  - Notificações inteligentes baseadas no ciclo real

 *                  Não reutilizar referências antigas de objetos

 */

import { BaseStore } from './baseStore.js';
import * as dateUtils from './dateUtils.js';
import { clampToZero, parseMoneyToNumber, formatMoneyToFixedString } from './moneyUtils.js';

const STORAGE_KEY = "finance-control:credit-cards";

export class CreditStore extends BaseStore {
  constructor(initialCards = []) {
    super(STORAGE_KEY, 'cards', initialCards);
    // ==================================================
    // MIGRAÇÃO / COMPATIBILIDADE
    // - Corrige valores antigos (ex.: "0,00" / "R$ 0,00")
    // - Evita falsos positivos de "fatura pendente"
    // ==================================================
    this._migrateCreditCardFields();
  }

  /**
   * Garante consistência dos campos numéricos (limit/used/dueDay).
   * @private
   */
  _migrateCreditCardFields() {
    let changed = false;

    this._items.forEach((card) => {
      if (!card) return;

      // ------------
      // Normalizar valores monetários
      // ------------
      const limit = clampToZero(parseMoneyToNumber(card.limit));
      const used = clampToZero(parseMoneyToNumber(card.used));

      // Mantém compatibilidade: stores costumam persistir como string "1200.00"
      const nextLimit = formatMoneyToFixedString(limit);
      const nextUsed = formatMoneyToFixedString(used);

      if (String(card.limit) !== nextLimit) {
        card.limit = nextLimit;
        changed = true;
      }

      if (String(card.used) !== nextUsed) {
        card.used = nextUsed;
        changed = true;
      }

      // ------------
      // Normalizar vencimento
      // ------------
      if (card.dueDay !== undefined && card.dueDay !== null) {
        const dueDay = Number.parseInt(String(card.dueDay), 10);
        if (Number.isFinite(dueDay) && card.dueDay !== dueDay) {
          card.dueDay = dueDay;
          changed = true;
        }
      }
    });

    if (changed) {
      this._saveToStorage();
      console.log('🔄 CreditStore: migração de campos aplicada');
    }
  }

  /**
   * Sobrescreve setAll() para garantir compatibilidade com dados importados.
   * @param {Array} items
   */
  setAll(items) {
    super.setAll(items);
    this._migrateCreditCardFields();
  }

  /**
   * Sobrescreve reload() para garantir migração em dados já existentes.
   * @returns {boolean}
   */
  reload() {
    const ok = super.reload();
    if (ok) {
      this._migrateCreditCardFields();
    }
    return ok;
  }

  /**
   * Sobrescreve add() para adicionar campos específicos de cartões de crédito

   */
  add(cardPayload) {
    const nextId = this._generateNextId();

    // Remove id do payload para evitar sobrescrever nextId
    const { id, ...cleanPayload } = cardPayload;

    const now = dateUtils.now();
    const newCard = {
      id: nextId,
      ...cleanPayload,
      used: 0,
      lastPaymentDate: null,
      currentBillingCycleStart: now, // Início do ciclo atual
      paidForCurrentCycle: false,    // Se a fatura do ciclo atual foi paga
      createdAt: now,
    };

    this._items.push(newCard);
    this._saveToStorage();
    return newCard;
  }

  /**
   * Calcula limite total de todos os cartões
   */
  getTotalLimit() {
    return this._items.reduce((total, card) => total + clampToZero(parseMoneyToNumber(card.limit)), 0);
  }

  /**
   * Calcula valor total usado de todos os cartões
   */
  getTotalUsed() {
    return this._items.reduce((total, card) => total + clampToZero(parseMoneyToNumber(card.used)), 0);
  }

  /**
   * Calcula valor total disponível de todos os cartões
   */
  getTotalAvailable() {
    return this.getTotalLimit() - this.getTotalUsed();
  }

  /**
   * Calcula a próxima data de vencimento de um cartão
   * @private
   * @param {Object} card - Cartão com propriedade dueDay
   * @returns {Object|null} { dueDate, daysUntilDue, isForNextCycle } ou null se não tiver dueDay
   *

   *         Se a fatura do ciclo atual foi paga, calcula para o PRÓXIMO ciclo

   */
  _calculateDueDate(card) {
    if (!card || !card.dueDay) return null;

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const isPaidForCurrentCycle = card.paidForCurrentCycle || false;

    // Normaliza vencimento (compat com string)
    const dueDay = Number.parseInt(String(card.dueDay), 10);
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) return null;

    // Determina o mês alvo (atual ou próximo)
    let targetMonth = currentMonth;
    let targetYear = currentYear;

    // Se o vencimento já passou neste mês OU a fatura do ciclo já foi paga,
    // considerar o próximo mês
    if (dueDay < currentDay || isPaidForCurrentCycle) {
      targetMonth = currentMonth + 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
      }
    }

    // Se a fatura foi paga E estamos no mesmo mês, avançar mais um mês
    // (novos gastos são do ciclo do mês seguinte)
    if (isPaidForCurrentCycle && dueDay >= currentDay) {
      targetMonth = currentMonth + 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
      }
    }

    // Calcula o último dia do mês alvo para evitar datas inválidas
    // Ex: new Date(2025, 2, 0) retorna 28 de fevereiro de 2025
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

    // Usa o menor entre dueDay e o último dia do mês
    const safeDay = Math.min(dueDay, lastDayOfMonth);

    const dueDate = new Date(targetYear, targetMonth, safeDay);

    // Calcula dias até o vencimento
    const diffTime = dueDate.getTime() - today.getTime();
    const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      dueDate,
      daysUntilDue,
      originalDueDay: dueDay,
      adjustedDueDay: safeDay,
      isForNextCycle: isPaidForCurrentCycle
    };
  }

  /**
   * Retorna o próximo vencimento (cartão com vencimento mais próximo)
   */
  getNextDueDate() {
    if (this._items.length === 0) return null;

    let nearestCard = null;
    let nearestDays = Infinity;

    this._items.forEach((card) => {
      const dueInfo = this._calculateDueDate(card);
      if (!dueInfo) return;

      if (dueInfo.daysUntilDue < nearestDays && dueInfo.daysUntilDue >= 0) {
        nearestDays = dueInfo.daysUntilDue;
        nearestCard = {
          ...card,
          dueDate: dueInfo.dueDate,
          daysUntilDue: dueInfo.daysUntilDue
        };
      }
    });

    return nearestCard;
  }

  /**
   * Verifica se o cartão está próximo do vencimento (7 dias ou menos)

   *         Se a fatura foi paga e só há gastos do próximo ciclo, retorna false
   */
  isNearDueDate(card, daysThreshold = 7) {
    // (os gastos atuais são do PRÓXIMO ciclo)
    if (card.paidForCurrentCycle) {
      return false;
    }

    // Se não tem nada usado, não há fatura pendente
    const used = clampToZero(parseMoneyToNumber(card.used));
    if (used <= 0) {
      return false;
    }

    const dueInfo = this._calculateDueDate(card);
    if (!dueInfo) return false;

    return dueInfo.daysUntilDue <= daysThreshold && dueInfo.daysUntilDue >= 0;
  }

  /**
   * Verifica se há fatura pendente para o ciclo atual

   * @param {Object} card - Cartão a verificar
   * @returns {boolean} true se há fatura pendente no ciclo atual
   */
  hasPendingInvoice(card) {
    // Se a fatura do ciclo atual já foi paga, não há pendência
    if (card.paidForCurrentCycle) {
      return false;
    }

    // Se não tem nada usado, não há fatura
    const used = clampToZero(parseMoneyToNumber(card.used));
    if (used <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Retorna informações detalhadas sobre o ciclo de fatura atual

   * @param {Object} card - Cartão a verificar
   * @returns {Object} Informações do ciclo
   */
  getBillingCycleInfo(card) {
    const dueInfo = this._calculateDueDate(card);
    const used = clampToZero(parseMoneyToNumber(card?.used));

    return {
      isPaidForCurrentCycle: card.paidForCurrentCycle || false,
      currentCycleStart: card.currentBillingCycleStart || card.createdAt,
      lastPaymentDate: card.lastPaymentDate,
      currentUsed: used,
      dueInfo: dueInfo,
      // Se pagou e ainda tem gastos, eles são do próximo ciclo
      hasNextCycleExpenses: (card.paidForCurrentCycle || false) && used > 0
    };
  }

  /**
   * Retorna dias até o vencimento do cartão
   */
  getDaysUntilDue(card) {
    const dueInfo = this._calculateDueDate(card);
    return dueInfo ? dueInfo.daysUntilDue : null;
  }

  /**
   * Registra pagamento do cartão (zera o usado e marca ciclo como pago)

   */
  registerPayment(cardId) {
    const card = this.findById(cardId);
    if (!card) return null;

    const now = dateUtils.now();

    this.update(cardId, {
      used: 0,
      lastPaymentDate: now,
      paidForCurrentCycle: true,  // Marca que a fatura do ciclo foi paga
      currentBillingCycleStart: now, // Inicia novo ciclo
    });

    console.log(`💳 Pagamento registrado para cartão ${card.name}:`);
    console.log(`   📅 Data do pagamento: ${now}`);
    console.log(`   ✅ Ciclo atual marcado como PAGO`);
    console.log(`   🔄 Novo ciclo iniciado`);

    return card;
  }

  /**
   * Reinicia o ciclo de fatura (chamado quando o mês vira)

   * @param {number} cardId - ID do cartão
   */
  resetBillingCycle(cardId) {
    const card = this.findById(cardId);
    if (!card) return null;

    this.update(cardId, {
      paidForCurrentCycle: false,
      currentBillingCycleStart: dateUtils.now(),
    });

    console.log(`🔄 Ciclo de fatura reiniciado para cartão ${card.name}`);
    return card;
  }

  /**
   * Verifica e reinicia ciclos de fatura automaticamente

   */
  processMonthlyReset() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    let resetCount = 0;

    this._items.forEach(card => {
      if (!card.currentBillingCycleStart) return;

      const cycleStart = new Date(card.currentBillingCycleStart);
      const cycleMonth = cycleStart.getMonth();
      const cycleYear = cycleStart.getFullYear();

      // Se o ciclo começou em um mês anterior, e há vencimento configurado
      if (card.dueDay && (cycleYear < currentYear || (cycleYear === currentYear && cycleMonth < currentMonth))) {
        // Se o dia de vencimento já passou neste mês, reinicia o ciclo
        if (today.getDate() >= card.dueDay) {
          this.resetBillingCycle(card.id);
          resetCount++;
        }
      }
    });

    if (resetCount > 0) {
      console.log(`🔄 ${resetCount} ciclo(s) de fatura reiniciado(s) automaticamente`);
    }

    return resetCount;
  }

  /**
   * Adiciona gasto ao cartão
   * @returns {Object} { success, card?, error?, available? }
   *

   */
  addExpense(cardId, amount) {
    const card = this.findById(cardId);
    if (!card) {
      return { success: false, error: 'Cartão não encontrado' };
    }

    const currentUsed = card.used || 0;
    const available = (card.limit || 0) - currentUsed;

    if (amount > available) {
      return {
        success: false,
        error: 'Limite insuficiente',
        available,
        requested: amount
      };
    }

    const newUsed = currentUsed + amount;
    // Se a fatura foi paga e está gastando de novo, os gastos são do PRÓXIMO ciclo
    // O flag paidForCurrentCycle só é resetado quando o mês vira (processMonthlyReset)
    this.update(cardId, { used: newUsed });

    const updatedCard = this.findById(cardId);
    if (card.paidForCurrentCycle) {
      console.log(`💳 Gasto de R$ ${formatMoneyToFixedString(amount)} adicionado ao ${card.name} (ciclo já pago - gasto do próximo ciclo)`);
    }

    return {
      success: true,
      card: updatedCard,
      newUsed,
      available: (card.limit || 0) - newUsed,
      isNextCycleExpense: card.paidForCurrentCycle || false
    };
  }

  // clear() é herdado de BaseStore
}
