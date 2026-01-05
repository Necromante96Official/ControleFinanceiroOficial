/**
 * Módulo: Gerenciador de Limpeza de Dados
 * Responsabilidade: Gerenciar o modal e ações de limpeza de dados
 */

import { dispatchToast } from './toastManager.js';

/**
 * Classe para gerenciar limpeza de dados
 */
export class ClearDataManager {
  constructor(options) {
    this.stores = options.stores;
    this.elements = options.elements;
    this.confirmationModal = options.confirmationModal;
    this.gridRenderer = options.gridRenderer;
    this.statsManager = options.statsManager;
    this._isRefreshing = false; // Flag para evitar múltiplos refreshes
  }

  /**
   * Inicializa os event listeners do modal de limpeza
   */
  init() {
    const {
      clearDataBtn,
      closeModalBtn,
      cancelClearBtn,
      clearAllBtn,
      clearCategoriesBtn,
      clearBenefitsBtn,
      clearCreditBtn,
      clearDebitBtn,
      clearTransactionsBtn,
      clearModal,
    } = this.elements;

    if (clearDataBtn) clearDataBtn.addEventListener("click", () => this.openModal());
    if (closeModalBtn) closeModalBtn.addEventListener("click", () => this.closeModal());
    if (cancelClearBtn) cancelClearBtn.addEventListener("click", () => this.closeModal());
    if (clearAllBtn) clearAllBtn.addEventListener("click", () => this.clearAllData());
    if (clearCategoriesBtn) clearCategoriesBtn.addEventListener("click", () => this.clearCategoriesData());
    if (clearBenefitsBtn) clearBenefitsBtn.addEventListener("click", () => this.clearBenefitsData());
    if (clearCreditBtn) clearCreditBtn.addEventListener("click", () => this.clearCreditData());
    if (clearDebitBtn) clearDebitBtn.addEventListener("click", () => this.clearDebitData());
    if (clearTransactionsBtn) clearTransactionsBtn.addEventListener("click", () => this.clearTransactionsData());

    // Fechar modal ao clicar no overlay
    if (clearModal) {
      const overlay = clearModal.querySelector(".modal__overlay");
      if (overlay) overlay.addEventListener("click", () => this.closeModal());
    }
  }

  /**
   * Abre o modal de limpeza
   */
  openModal() {
    const { clearModal } = this.elements;
    if (clearModal) {
      clearModal.classList.add("is-open");
      clearModal.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Fecha o modal de limpeza
   */
  closeModal() {
    const { clearModal } = this.elements;
    if (clearModal) {
      clearModal.classList.remove("is-open");
      clearModal.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Atualiza a interface após limpeza
    * Melhorada robustez para evitar tela branca
   * @private
   */
  _refreshUI() {
    // Evita múltiplas chamadas simultâneas
    if (this._isRefreshing) {
      console.log("⚠️ Refresh já em andamento, ignorando...");
      return;
    }
    this._isRefreshing = true;

    try {
      // Fecha o modal primeiro
      this.closeModal();

      // Usa requestAnimationFrame para garantir que o DOM está pronto
      requestAnimationFrame(() => {
        try {
          // Renderiza todos os grids de forma segura
          if (this.gridRenderer) {
            try {
              this.gridRenderer.renderCategoryCards();
            } catch (e) {
              console.warn("⚠️ Erro ao renderizar categorias:", e);
            }

            try {
              this.gridRenderer.renderBenefitCards();
            } catch (e) {
              console.warn("⚠️ Erro ao renderizar benefícios:", e);
            }

            try {
              this.gridRenderer.renderCreditCards();
            } catch (e) {
              console.warn("⚠️ Erro ao renderizar crédito:", e);
            }

            try {
              this.gridRenderer.renderDebitCards();
            } catch (e) {
              console.warn("⚠️ Erro ao renderizar débito:", e);
            }

            try {
              this.gridRenderer.renderTransactions();
            } catch (e) {
              console.warn("⚠️ Erro ao renderizar transações:", e);
            }
          }

          // Atualiza estatísticas de forma segura
          if (this.statsManager) {
            try {
              this.statsManager.updateAll();
            } catch (e) {
              console.warn("⚠️ Erro ao atualizar estatísticas:", e);
            }
          }

          console.log("✅ Interface atualizada após limpeza de dados");
          this._isRefreshing = false;
        } catch (renderError) {
          console.error("❌ Erro ao renderizar após limpeza:", renderError);
          this._isRefreshing = false;
          // NÃO recarrega a página - isso causava o problema de tela branca
        }
      });
    } catch (error) {
      console.error("❌ Erro ao atualizar UI:", error);
      this._isRefreshing = false;
      // NÃO recarrega a página - isso causava o problema de tela branca
    }
  }

  /**
   * Limpa todos os dados
   */
  async clearAllData() {
    try {
      const confirmed = await this.confirmationModal.show(
        "⚠️ Limpar Todos os Dados",
        "Esta ação vai remover PERMANENTEMENTE todos os dados:\n\n• Todas as Categorias\n• Todos os Benefícios\n• Todos os Cartões de Crédito\n• Todas as Contas de Débito\n• Todos os Lançamentos\n\nEsta ação NÃO pode ser desfeita!",
        "Limpar Tudo",
        "Cancelar"
      );

      if (confirmed) {
        const { categoryStore, benefitStore, creditStore, debitStore, transactionStore } = this.stores;

        // ------------
        // Contagem prévia (para feedback mais útil)
        // ------------
        const counts = {
          categories: categoryStore?.count?.() ?? 0,
          benefits: benefitStore?.count?.() ?? 0,
          credits: creditStore?.count?.() ?? 0,
          debits: debitStore?.count?.() ?? 0,
          transactions: transactionStore?.count?.() ?? 0,
        };

        categoryStore.clear();
        benefitStore.clear();
        creditStore.clear();
        debitStore.clear();
        transactionStore.clear();

        console.log("🗑️ Todos os dados foram limpos!");

        dispatchToast({
          variant: 'success',
          title: 'Dados limpos',
          message: `Categorias: ${counts.categories} • Benefícios: ${counts.benefits} • Crédito: ${counts.credits} • Débito: ${counts.debits} • Lançamentos: ${counts.transactions}`,
          id: 'clear-all-success'
        });

        this._refreshUI();
      }
    } catch (error) {
      console.error("❌ Erro ao limpar todos os dados:", error);

      dispatchToast({
        variant: 'error',
        title: 'Falha ao limpar dados',
        message: 'Não foi possível limpar todos os dados.',
        id: 'clear-all-error'
      });

      this.closeModal();
    }
  }

  /**
   * Limpa apenas categorias
   */
  async clearCategoriesData() {
    try {
      const confirmed = await this.confirmationModal.show(
        "⚠️ Limpar Categorias",
        "Você tem certeza que deseja remover TODAS as categorias?\n\nEsta ação NÃO pode ser desfeita!",
        "Limpar Categorias",
        "Cancelar"
      );

      if (confirmed) {
        const countBefore = this.stores.categoryStore?.count?.() ?? 0;
        this.stores.categoryStore.clear();
        console.log("🗑️ Categorias foram limpas!");

        dispatchToast({
          variant: 'success',
          title: 'Categorias limpas',
          message: `${countBefore} categoria(s) removida(s).`,
          id: 'clear-categories-success'
        });

        this.closeModal();

        this._safeRender(() => {
          if (this.gridRenderer) this.gridRenderer.renderCategoryCards();
        });
      }
    } catch (error) {
      console.error("❌ Erro ao limpar categorias:", error);

      dispatchToast({
        variant: 'error',
        title: 'Falha ao limpar categorias',
        message: 'Não foi possível limpar as categorias.',
        id: 'clear-categories-error'
      });

      this.closeModal();
    }
  }

  /**
   * Limpa apenas benefícios
   */
  async clearBenefitsData() {
    try {
      const confirmed = await this.confirmationModal.show(
        "⚠️ Limpar Benefícios",
        "Você tem certeza que deseja remover TODOS os benefícios?\n\nEsta ação NÃO pode ser desfeita!",
        "Limpar Benefícios",
        "Cancelar"
      );

      if (confirmed) {
        const countBefore = this.stores.benefitStore?.count?.() ?? 0;
        this.stores.benefitStore.clear();
        console.log("🗑️ Benefícios foram limpos!");

        dispatchToast({
          variant: 'success',
          title: 'Benefícios limpos',
          message: `${countBefore} benefício(s) removido(s).`,
          id: 'clear-benefits-success'
        });

        this.closeModal();

        this._safeRender(() => {
          if (this.gridRenderer) this.gridRenderer.renderBenefitCards();
          if (this.statsManager) this.statsManager.updateBenefitStats();
        });
      }
    } catch (error) {
      console.error("❌ Erro ao limpar benefícios:", error);

      dispatchToast({
        variant: 'error',
        title: 'Falha ao limpar benefícios',
        message: 'Não foi possível limpar os benefícios.',
        id: 'clear-benefits-error'
      });

      this.closeModal();
    }
  }

  /**
   * Limpa apenas cartões de crédito
   */
  async clearCreditData() {
    try {
      const confirmed = await this.confirmationModal.show(
        "⚠️ Limpar Cartões de Crédito",
        "Você tem certeza que deseja remover TODOS os cartões de crédito?\n\nEsta ação NÃO pode ser desfeita!",
        "Limpar Cartões",
        "Cancelar"
      );

      if (confirmed) {
        const countBefore = this.stores.creditStore?.count?.() ?? 0;
        this.stores.creditStore.clear();
        console.log("🗑️ Cartões de crédito foram limpos!");

        dispatchToast({
          variant: 'success',
          title: 'Crédito limpo',
          message: `${countBefore} cartão(ões) removido(s).`,
          id: 'clear-credit-success'
        });

        this.closeModal();

        this._safeRender(() => {
          if (this.gridRenderer) this.gridRenderer.renderCreditCards();
          if (this.statsManager) this.statsManager.updateCreditStats();
        });
      }
    } catch (error) {
      console.error("❌ Erro ao limpar cartões de crédito:", error);

      dispatchToast({
        variant: 'error',
        title: 'Falha ao limpar crédito',
        message: 'Não foi possível limpar os cartões de crédito.',
        id: 'clear-credit-error'
      });

      this.closeModal();
    }
  }

  /**
   * Limpa apenas contas de débito
   */
  async clearDebitData() {
    try {
      const confirmed = await this.confirmationModal.show(
        "⚠️ Limpar Contas de Débito",
        "Você tem certeza que deseja remover TODAS as contas de débito?\n\nEsta ação NÃO pode ser desfeita!",
        "Limpar Contas",
        "Cancelar"
      );

      if (confirmed) {
        const countBefore = this.stores.debitStore?.count?.() ?? 0;
        this.stores.debitStore.clear();
        console.log("🗑️ Contas de débito foram limpas!");

        dispatchToast({
          variant: 'success',
          title: 'Débito limpo',
          message: `${countBefore} conta(s) removida(s).`,
          id: 'clear-debit-success'
        });

        this.closeModal();

        this._safeRender(() => {
          if (this.gridRenderer) this.gridRenderer.renderDebitCards();
          if (this.statsManager) this.statsManager.updateDebitStats();
        });
      }
    } catch (error) {
      console.error("❌ Erro ao limpar contas de débito:", error);

      dispatchToast({
        variant: 'error',
        title: 'Falha ao limpar débito',
        message: 'Não foi possível limpar as contas de débito.',
        id: 'clear-debit-error'
      });

      this.closeModal();
    }
  }

  /**
   * Limpa apenas lançamentos
   */
  async clearTransactionsData() {
    try {
      const confirmed = await this.confirmationModal.show(
        "⚠️ Limpar Extrato",
        "Você tem certeza que deseja remover TODOS os lançamentos?\n\n⚠️ Os valores já aplicados nas contas NÃO serão revertidos!\n\nEsta ação NÃO pode ser desfeita!",
        "Limpar Extrato",
        "Cancelar"
      );

      if (confirmed) {
        const countBefore = this.stores.transactionStore?.count?.() ?? 0;
        this.stores.transactionStore.clear();
        console.log("🗑️ Lançamentos foram limpos!");

        dispatchToast({
          variant: 'success',
          title: 'Extrato limpo',
          message: `${countBefore} lançamento(s) removido(s).`,
          id: 'clear-transactions-success'
        });

        this.closeModal();

        this._safeRender(() => {
          if (this.gridRenderer) this.gridRenderer.renderTransactions();
          if (this.statsManager) this.statsManager.updateExtratoStats();
        });
      }
    } catch (error) {
      console.error("❌ Erro ao limpar lançamentos:", error);

      dispatchToast({
        variant: 'error',
        title: 'Falha ao limpar extrato',
        message: 'Não foi possível limpar os lançamentos.',
        id: 'clear-transactions-error'
      });

      this.closeModal();
    }
  }

  /**
   * Executa renderização de forma segura
   * @private
   */
  _safeRender(renderFn) {
    requestAnimationFrame(() => {
      try {
        renderFn();
      } catch (e) {
        console.warn("⚠️ Erro ao renderizar:", e);
      }
    });
  }
}
