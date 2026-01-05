/**
 * Módulo: Gerenciador de Estatísticas
 * Responsabilidade: Atualizar estatísticas de benefícios, crédito, débito e extrato
 *
 */

import { formatCurrencyDisplay } from "./currencyFormatter.js";

// Paleta mais vibrante (mantendo contraste no tema escuro)
const UI_COLORS = {
  INCOME: '#4ade80',
  EXPENSE: '#ff4d4d',
  LIMIT: '#ffd93d',
  AVAILABLE: '#1fc2c0'
};

/**
 * Classe para gerenciar todas as estatísticas da aplicação
 */
export class StatsManager {
  constructor(options) {
    this.stores = options.stores;
    this.elements = options.elements;
    this.getFilteredTransactions = options.getFilteredTransactions;

    // ==================================================
    // PERFORMANCE: Evitar recalcular extrato várias vezes
    // - updateAll() roda como um "lote" e atualiza extrato 1x
    // ==================================================
    this._suspendExtratoStats = false;
  }

  /**
   * Aplica cor de forma segura (evita exceptions quando elemento não existe)
   * @private
   */
  _applyInlineColor(element, color) {
    if (!element) return;
    element.style.color = color || '';
  }

  /**
   * Atualiza estatísticas de benefícios
   */
  updateBenefitStats() {
    try {
      const { benefitStore } = this.stores;
      const { statTotal, statUsed, statAvailable } = this.elements;

      const total = benefitStore.getTotalBalance();
      const used = benefitStore.getTotalUsed();
      const available = benefitStore.getTotalAvailable();

      if (statTotal) statTotal.textContent = formatCurrencyDisplay(total);
      if (statUsed) statUsed.textContent = formatCurrencyDisplay(used);
      if (statAvailable) statAvailable.textContent = formatCurrencyDisplay(available);

      this.updateExtratoStats();
    } catch (error) {
      console.error("❌ Erro ao atualizar estatísticas de benefícios:", error);
    }
  }

  /**
   * Atualiza estatísticas de cartões de crédito
   */
  updateCreditStats() {
    try {
      const { creditStore } = this.stores;
      const { creditStatTotal, creditStatAvailable, creditStatDue } = this.elements;

      const total = creditStore.getTotalLimit();
      const available = creditStore.getTotalAvailable();
      const used = creditStore.getTotalUsed();

      if (creditStatTotal) creditStatTotal.textContent = formatCurrencyDisplay(total);
      if (creditStatAvailable) creditStatAvailable.textContent = formatCurrencyDisplay(available);
      if (creditStatDue) creditStatDue.textContent = formatCurrencyDisplay(used);

      // Destaca Limite / Disponível / A pagar
      this._applyInlineColor(creditStatTotal, UI_COLORS.LIMIT);
      this._applyInlineColor(creditStatAvailable, UI_COLORS.AVAILABLE);
      this._applyInlineColor(creditStatDue, UI_COLORS.EXPENSE);

      this.updateExtratoStats();
    } catch (error) {
      console.error("❌ Erro ao atualizar estatísticas de crédito:", error);
    }
  }

  /**
   * Atualiza estatísticas de contas de débito
   */
  updateDebitStats() {
    try {
      const { debitStore } = this.stores;
      const { debitStatTotal } = this.elements;

      const total = debitStore.getTotalBalance();

      if (debitStatTotal) debitStatTotal.textContent = formatCurrencyDisplay(total);

      this.updateExtratoStats();
    } catch (error) {
      console.error("❌ Erro ao atualizar estatísticas de débito:", error);
    }
  }

  /**
   * Atualiza estatísticas do extrato
   * - Entradas: soma de transações tipo 'entrada' do período filtrado
   * - Saídas: soma de transações tipo 'saida' do período filtrado
   * - Saldo: mostra o saldo consolidado de todas as contas (débito + crédito disponível + benefício disponível)
   */
  updateExtratoStats() {
    try {
      // ------------
      // PERFORMANCE: em updateAll, atualiza 1x no final
      // ------------
      if (this._suspendExtratoStats) return;

      const { transactionStore, creditStore, benefitStore, debitStore } = this.stores;
      const { extratoStatEntradas, extratoStatSaidas, extratoStatSaldo } = this.elements;

      const transactions = this.getFilteredTransactions();

      // Calcula entradas e saídas do período filtrado
      // (preferência: um único loop para listas grandes)
      let entradas = 0;
      let saidas = 0;
      if (typeof transactionStore.getTotaisExtrato === 'function') {
        const totals = transactionStore.getTotaisExtrato(transactions);
        entradas = totals.entradas;
        saidas = totals.saidas;
      } else {
        entradas = transactionStore.getTotalEntradas(transactions);
        saidas = transactionStore.getTotalSaidas(transactions);
      }

      // Saldo consolidado: débito + crédito disponível + benefício disponível
      // Nota: as transações já afetam esses saldos, então não precisamos somar o extrato separadamente
      const debitoSaldo = debitStore.getTotalBalance();
      const creditoDisponivel = creditStore.getTotalAvailable();
      const beneficioDisponivel = benefitStore.getTotalAvailable();
      const saldoConsolidado = debitoSaldo + creditoDisponivel + beneficioDisponivel;

      if (extratoStatEntradas) extratoStatEntradas.textContent = formatCurrencyDisplay(entradas);
      if (extratoStatSaidas) extratoStatSaidas.textContent = formatCurrencyDisplay(saidas);

      if (extratoStatSaldo) {
        extratoStatSaldo.textContent = formatCurrencyDisplay(saldoConsolidado);
        extratoStatSaldo.title = `Débito/Dinheiro: ${formatCurrencyDisplay(debitoSaldo)} | Crédito Disponível: ${formatCurrencyDisplay(creditoDisponivel)} | Benefício Disponível: ${formatCurrencyDisplay(beneficioDisponivel)}`;

        // Colore o saldo baseado no valor
        if (saldoConsolidado > 0) {
          this._applyInlineColor(extratoStatSaldo, UI_COLORS.INCOME);
        } else if (saldoConsolidado < 0) {
          this._applyInlineColor(extratoStatSaldo, UI_COLORS.EXPENSE);
        } else {
          this._applyInlineColor(extratoStatSaldo, '');
        }
      }
    } catch (error) {
      console.error("❌ Erro ao atualizar estatísticas do extrato:", error);
    }
  }

  /**
   * Atualiza todas as estatísticas
   */
  updateAll() {
    // ==================================================
    // PERFORMANCE: Atualiza stats "em lote"
    // - Evita chamar updateExtratoStats 3x (benefício/crédito/débito)
    // ==================================================
    this._suspendExtratoStats = true;
    try {
      this.updateBenefitStats();
      this.updateCreditStats();
      this.updateDebitStats();
    } finally {
      this._suspendExtratoStats = false;
    }

    // Atualiza extrato somente uma vez
    this.updateExtratoStats();
  }
}
