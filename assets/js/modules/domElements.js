/**
 * Módulo: Referências aos Elementos DOM
 * Responsabilidade: Centralizar todas as referências a elementos do DOM
 */

/**
 * Obtém todas as referências aos elementos DOM da aplicação
 * @returns {Object} Objeto com todas as referências ou null se elementos críticos faltarem
 */
export function getDOMElements() {
  const elements = {
    // Grids
    categoryGrid: document.getElementById("category-grid"),
    benefitsGrid: document.getElementById("benefits-grid"),
    creditGrid: document.getElementById("credit-grid"),
    debitGrid: document.getElementById("debit-grid"),
    extratoGrid: document.getElementById("extrato-grid"),

    // Formulários
    categoryFormElement: document.getElementById("category-form"),
    benefitFormElement: document.getElementById("benefit-form"),
    creditFormElement: document.getElementById("credit-form"),
    debitFormElement: document.getElementById("debit-form"),
    transactionFormElement: document.getElementById("transaction-form"),

    // Stats de Benefícios
    statTotal: document.getElementById("stat-total"),
    statUsed: document.getElementById("stat-used"),
    statAvailable: document.getElementById("stat-available"),

    // Stats de Crédito
    creditStatTotal: document.getElementById("credit-stat-total"),
    creditStatAvailable: document.getElementById("credit-stat-available"),
    creditStatDue: document.getElementById("credit-stat-due"),
    creditDueAlert: document.getElementById("credit-due-alert"),

    // Stats de Débito
    debitStatTotal: document.getElementById("debit-stat-total"),

    // Stats do Extrato
    extratoStatEntradas: document.getElementById("extrato-stat-entradas"),
    extratoStatSaidas: document.getElementById("extrato-stat-saidas"),
    extratoStatSaldo: document.getElementById("extrato-stat-saldo"),

    // Filtros do Extrato
    extratoFiltersOpenBtn: document.getElementById("extrato-filters-open"),
    extratoFiltersModal: document.getElementById("extrato-filters-modal"),
    extratoFiltersCloseBtn: document.getElementById("extrato-filters-close"),
    extratoFilterType: document.getElementById("extrato-filter-type"),
    extratoFilterCategory: document.getElementById("extrato-filter-category"),
    extratoFilterAccountType: document.getElementById("extrato-filter-account-type"),
    extratoFilterAccountId: document.getElementById("extrato-filter-account-id"),
    extratoFilterDate: document.getElementById("extrato-filter-date"),
    extratoFilterMonthInput: document.getElementById("extrato-filter-month-input"),
    extratoFilterYear: document.getElementById("extrato-filter-year"),
    extratoFilterDayWrapper: document.getElementById("extrato-filter-day-wrapper"),
    extratoFilterMonthWrapper: document.getElementById("extrato-filter-month-wrapper"),
    extratoFilterYearWrapper: document.getElementById("extrato-filter-year-wrapper"),

    // Botão Adicionar
    addBtn: document.getElementById("add-btn"),

    // Histórico de Atualizações
    updatesOpenBtn: document.getElementById("updates-open"),

    // Modal de Limpeza
    clearModal: document.getElementById("clear-modal"),
    clearDataBtn: document.getElementById("clear-data-btn"),
    closeModalBtn: document.getElementById("close-modal"),
    cancelClearBtn: document.getElementById("cancel-clear"),
    clearAllBtn: document.getElementById("clear-all"),
    clearCategoriesBtn: document.getElementById("clear-categories"),
    clearBenefitsBtn: document.getElementById("clear-benefits"),
    clearCreditBtn: document.getElementById("clear-credit"),
    clearDebitBtn: document.getElementById("clear-debit"),
    clearTransactionsBtn: document.getElementById("clear-transactions"),

    // Modal de Exportação
    exportModal: document.getElementById("export-modal"),
    exportDataBtn: document.getElementById("export-data-btn"),
    exportDownloadBtn: document.getElementById("export-download"),
    exportWhatsappBtn: document.getElementById("export-whatsapp"),
    exportCopyBtn: document.getElementById("export-copy"),
    cancelExportBtn: document.getElementById("cancel-export"),

    // Modal de Importação
    importModal: document.getElementById("import-modal"),
    importDataBtn: document.getElementById("import-data-btn"),
    importCodeInput: document.getElementById("import-code"),
    importFileInput: document.getElementById("import-file"),
    importFileName: document.getElementById("import-file-name"),
    cancelImportBtn: document.getElementById("cancel-import"),
    confirmImportBtn: document.getElementById("confirm-import"),

    // Modal de Resultado da Importação
    importResultModal: document.getElementById("import-result-modal"),
    importResultContent: document.getElementById("import-result-content"),
    closeImportResultBtn: document.getElementById("close-import-result"),
  };

  return elements;
}

/**
 * Valida se elementos críticos existem
 * @param {Object} elements - Objeto com referências DOM
 * @returns {Object} Objeto com resultado da validação e mensagens de erro
 */
export function validateCriticalElements(elements) {
  const errors = [];

  if (!elements.categoryGrid || !elements.benefitsGrid || !elements.categoryFormElement) {
    errors.push("Elementos DOM de categorias não encontrados!");
  }

  if (!elements.benefitFormElement) {
    errors.push("Elementos DOM de benefícios não encontrados!");
  }

  if (!elements.creditFormElement || !elements.creditGrid) {
    errors.push("Elementos DOM de crédito não encontrados!");
  }

  if (!elements.debitFormElement || !elements.debitGrid) {
    errors.push("Elementos DOM de débito não encontrados!");
  }

  if (!elements.transactionFormElement || !elements.extratoGrid) {
    errors.push("Elementos DOM de extrato não encontrados!");
  }

  if (!elements.addBtn) {
    console.warn("⚠️ Botão '+' não foi encontrado. Certifique-se de que o footer existe.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Obtém elementos específicos para inicialização do CategoryForm
 * @returns {Object} Elementos do formulário de categorias
 */
export function getCategoryFormElements() {
  return {
    formSheet: document.getElementById("category-form"),
    formTitle: document.getElementById("category-form-title"),
    nameInput: document.getElementById("category-name"),
    colorOptions: document.getElementById("category-color-options"),
    iconOptions: document.getElementById("category-icon-options"),
    typeOptions: document.querySelectorAll("#category-form .type-option"),
    saveButton: document.getElementById("save-category"),
    closeButton: document.getElementById("close-category-form"),
  };
}

/**
 * Obtém elementos específicos para inicialização do BenefitForm
 * @returns {Object} Elementos do formulário de benefícios
 */
export function getBenefitFormElements() {
  return {
    formSheet: document.getElementById("benefit-form"),
    formTitle: document.getElementById("benefit-form-title"),
    nameInput: document.getElementById("benefit-name"),
    limitInput: document.getElementById("benefit-limit"),
    availableInput: document.getElementById("benefit-available"),
    reloadDayInput: document.getElementById("benefit-reload-day"),
    colorOptions: document.getElementById("benefit-color-options"),
    iconOptions: document.getElementById("benefit-icon-options"),
    typeOptions: document.querySelectorAll("#benefit-form .type-option"),
    saveButton: document.getElementById("save-benefit"),
    closeButton: document.getElementById("close-benefit-form"),
  };
}

/**
 * Obtém elementos específicos para inicialização do CreditForm
 * @returns {Object} Elementos do formulário de crédito
 */
export function getCreditFormElements() {
  return {
    formSheet: document.getElementById("credit-form"),
    formTitle: document.getElementById("credit-form-title"),
    nameInput: document.getElementById("credit-name"),
    limitInput: document.getElementById("credit-limit"),
    dueDayInput: document.getElementById("credit-due-day"),
    colorOptions: document.getElementById("credit-color-options"),
    iconOptions: document.getElementById("credit-icon-options"),
    saveButton: document.getElementById("save-credit"),
    closeButton: document.getElementById("close-credit-form"),
  };
}

/**
 * Obtém elementos específicos para inicialização do DebitForm
 * @returns {Object} Elementos do formulário de débito
 */
export function getDebitFormElements() {
  return {
    formSheet: document.getElementById("debit-form"),
    formTitle: document.getElementById("debit-form-title"),
    nameInput: document.getElementById("debit-name"),
    balanceInput: document.getElementById("debit-balance"),
    colorOptions: document.getElementById("debit-color-options"),
    iconOptions: document.getElementById("debit-icon-options"),
    saveButton: document.getElementById("save-debit"),
    closeButton: document.getElementById("close-debit-form"),
  };
}

/**
 * Obtém elementos específicos para inicialização do TransactionForm
 * @param {Object} stores - Objeto com as stores
 * @returns {Object} Elementos do formulário de transações
 */
export function getTransactionFormElements(stores) {
  return {
    formSheet: document.getElementById("transaction-form"),
    formTitle: document.getElementById("transaction-form-title"),
    nameInput: document.getElementById("transaction-name"),
    valueInput: document.getElementById("transaction-value"),
    dateInput: document.getElementById("transaction-date"),
    typeOptions: document.querySelectorAll("#transaction-form .type-option"),
    categoryContainer: document.getElementById("transaction-category"),
    sourceContainer: document.getElementById("transaction-source"),
    targetContainer: document.getElementById("transaction-target"),
    saveButton: document.getElementById("save-transaction"),
    closeButton: document.getElementById("close-transaction-form"),
    debitStore: stores.debitStore,
    creditStore: stores.creditStore,
    benefitStore: stores.benefitStore,
    categoryStore: stores.categoryStore,
  };
}

// ================================
// Utilitário: Estado ocupado (UI)
// ================================

/**
 * Executa uma ação com o botão em estado de processamento.
 * - Evita cliques duplicados (lock por dataset)
 * - Desabilita o botão e troca o texto para "Processando..."
 * - Sinaliza a região com aria-busy
 * @param {{button?: HTMLElement|null, container?: HTMLElement|null, busyText?: string}} options
 * @param {Function} action
 */
export async function runWithBusyButton(options, action) {
  const button = options?.button || null;
  const container = options?.container || null;
  const busyText = options?.busyText || 'Processando...';

  // Se não existir botão, apenas executa.
  if (!button) {
    return await Promise.resolve().then(() => action?.());
  }

  // Lock simples: impede reentrada por clique duplo.
  if (button.dataset?.busy === '1') {
    return undefined;
  }

  const original = {
    disabled: 'disabled' in button ? Boolean(button.disabled) : null,
    ariaDisabled: button.getAttribute?.('aria-disabled'),
    html: button.innerHTML,
    ariaBusy: container?.getAttribute?.('aria-busy') ?? null,
  };

  try {
    button.dataset.busy = '1';

    // ------------
    // Estado visual
    // ------------
    if ('disabled' in button) {
      button.disabled = true;
    } else {
      button.setAttribute?.('aria-disabled', 'true');
    }

    if (typeof busyText === 'string' && busyText.trim()) {
      button.textContent = busyText;
    }

    // ------------
    // Acessibilidade
    // ------------
    if (container?.setAttribute) {
      container.setAttribute('aria-busy', 'true');
    }

    return await Promise.resolve().then(() => action?.());
  } finally {
    // ------------
    // Restauração
    // ------------
    delete button.dataset.busy;

    if ('disabled' in button && original.disabled !== null) {
      button.disabled = original.disabled;
    }

    if (original.ariaDisabled === null || original.ariaDisabled === undefined) {
      button.removeAttribute?.('aria-disabled');
    } else {
      button.setAttribute?.('aria-disabled', original.ariaDisabled);
    }

    button.innerHTML = original.html;

    if (container?.setAttribute) {
      if (original.ariaBusy === null) {
        container.removeAttribute('aria-busy');
      } else {
        container.setAttribute('aria-busy', original.ariaBusy);
      }
    }
  }
}
