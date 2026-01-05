/**
 * Transaction Form - Formulário de Lançamentos
 *
 * Gerencia o formulário de criação/edição de transações,
 * com seleção de categoria que define automaticamente o tipo (entrada/saída).
 */

import { formatCurrencyInput, parseCurrencyInput } from "./currencyFormatter.js";
import * as dateUtils from "./dateUtils.js";
import { dispatchToast } from "./toastManager.js";
import { isToastHandledError } from "./toastHandledError.js";
import { runWithBusyButton } from "./domElements.js";

export class TransactionForm {
  constructor(options) {
    this.formSheet = options.formSheet;
    this.formTitle = options.formTitle;
    this.nameInput = options.nameInput;
    this.valueInput = options.valueInput;
    this.dateInput = options.dateInput;
    this.typeOptions = options.typeOptions;
    this.categoryContainer = options.categoryContainer;
    this.sourceContainer = options.sourceContainer;
    this.targetContainer = options.targetContainer;
    this.saveButton = options.saveButton;
    this.closeButton = options.closeButton;

    // Stores para obter dados
    this.debitStore = options.debitStore;
    this.creditStore = options.creditStore;
    this.benefitStore = options.benefitStore;
    this.categoryStore = options.categoryStore;

    this.editingId = null;
    this.originalTransaction = null;
    this.selectedType = null;
    this.selectedCategoryId = null;
    this.selectedPaymentMethod = null;
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.saveCallback = null;

    // Container de erros de validação
    this.validationContainer = null;
  }

  /**
   * Inicializa o formulário
   */
  init() {
    this.setupValueInput();
    this.setupDateInput();
    this.setupCloseButton();
    this.setupSaveButton();
    this.setupTypeOptions();
    this.setupValidationContainer();
    console.log("✅ TransactionForm inicializado");
  }

  /**
   * Configura container de validação customizada
   */
  setupValidationContainer() {
    // Procura container existente ou cria um novo
    const formBody = this.formSheet.querySelector('.form-sheet__body');
    if (!formBody) return;

    let container = formBody.querySelector('.validation-errors');
    if (!container) {
      container = document.createElement('div');
      container.className = 'validation-errors';
      container.setAttribute('role', 'alert');
      container.setAttribute('aria-live', 'polite');
      container.innerHTML = `
        <div class="validation-errors__title">
          <span>⚠️</span>
          <span>Por favor, corrija os seguintes campos:</span>
        </div>
        <ul class="validation-errors__list"></ul>
      `;

      // Insere após o header
      const header = formBody.querySelector('.form-sheet__header');
      if (header && header.nextSibling) {
        formBody.insertBefore(container, header.nextSibling);
      } else {
        formBody.prepend(container);
      }
    }

    this.validationContainer = container;
  }

  /**
   * Exibe erros de validação customizados
   */
  showValidationErrors(errors) {
    if (!this.validationContainer) {
      this.setupValidationContainer();
    }

    const list = this.validationContainer.querySelector('.validation-errors__list');
    if (list) {
      list.innerHTML = errors.map(error =>
        `<li class="validation-errors__item">${error}</li>`
      ).join('');
    }

    this.validationContainer.classList.add('is-visible');

    // Scroll para o container de erros
    this.validationContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Marca campos com erro
    this.markFieldsWithErrors(errors);
  }

  /**
   * Oculta erros de validação
   */
  hideValidationErrors() {
    if (this.validationContainer) {
      this.validationContainer.classList.remove('is-visible');
    }
    this.clearFieldErrors();
  }

  /**
   * Marca campos que têm erro
   */
  markFieldsWithErrors(errors) {
    this.clearFieldErrors();

    const errorsLower = errors.map(e => e.toLowerCase());

    // Mapeia erros para campos
    if (errorsLower.some(e => e.includes('nome'))) {
      this.nameInput?.closest('.field')?.classList.add('field--error');
    }
    if (errorsLower.some(e => e.includes('valor'))) {
      this.valueInput?.closest('.field')?.classList.add('field--error');
    }
    if (errorsLower.some(e => e.includes('entrada') || e.includes('saída') || e.includes('tipo'))) {
      const typeField = this.formSheet.querySelector('.type-options')?.closest('.field');
      typeField?.classList.add('field--error');
    }
    if (errorsLower.some(e => e.includes('categoria'))) {
      this.categoryContainer?.closest('.field')?.classList.add('field--error');
    }
    if (errorsLower.some(e => e.includes('método') || e.includes('conta') || e.includes('cartão') || e.includes('benefício'))) {
      this.sourceContainer?.closest('.field')?.classList.add('field--error');
    }
  }

  /**
   * Limpa marcação de erros dos campos
   */
  clearFieldErrors() {
    const fields = this.formSheet.querySelectorAll('.field--error');
    fields.forEach(field => field.classList.remove('field--error'));
  }

  /**
   * Configura os botões de tipo (Entrada/Saída)
   */
  setupTypeOptions() {
    if (!this.typeOptions) return;
    this.typeOptions.forEach((button) => {
      button.addEventListener("click", () => {
        const typeValue = button.dataset.type;
        if (!typeValue) return;
        this.selectType(typeValue);
      });
    });
  }

  /**
   * Seleciona explicitamente o tipo do lançamento
   */
  selectType(type) {
    if (!type) return;
    this.selectedType = type;
    if (this.typeOptions) {
      this.typeOptions.forEach((button) => {
        const isActive = button.dataset.type === type;
        button.classList.toggle("type-option--active", isActive);
        button.classList.toggle("is-active", isActive);
      });
    }

    this.selectedCategoryId = null;
    this.selectedPaymentMethod = null;
    this.selectedSourceId = null;
    this.selectedTargetId = null;

    if (this.categoryContainer) {
      this.renderCategoryOptions();
    }

    if (this.sourceContainer) this.sourceContainer.innerHTML = "";
    if (this.targetContainer) this.targetContainer.innerHTML = "";
  }

  /**
   * Limpa seleção de tipo (usado ao resetar formulário)
   */
  clearTypeSelection() {
    this.selectedType = null;
    if (this.typeOptions) {
      this.typeOptions.forEach((button) => {
        button.classList.remove("type-option--active");
        button.classList.remove("is-active");
      });
    }
  }

  /**
   * Configura input de valor com formatação de moeda
   */
  setupValueInput() {
    if (!this.valueInput) return;

    this.valueInput.addEventListener("input", (e) => {
      const formatted = formatCurrencyInput(e.target.value);
      e.target.value = formatted;
    });

    this.valueInput.addEventListener("focus", () => {
      if (this.valueInput.value === "0,00") {
        this.valueInput.value = "";
      }
    });

    this.valueInput.addEventListener("blur", () => {
      if (this.valueInput.value === "") {
        this.valueInput.value = "0,00";
      }
    });
  }

  /**
   * Configura input de data com valor padrão
   */
  setupDateInput() {
    if (!this.dateInput) return;
    this.dateInput.value = dateUtils.getLocalISODateString();
  }

  /**
   * Configura botão de fechar
   */
  setupCloseButton() {
    if (!this.closeButton) return;
    this.closeButton.addEventListener("click", () => {
      this.close();
    });
  }

  /**
   * Configura botão de salvar
    * Inclui preventDefault para evitar comportamento padrão do navegador
   */
  setupSaveButton() {
    if (!this.saveButton) return;
    this.saveButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await runWithBusyButton(
        {
          button: this.saveButton,
          container: this.formSheet,
          busyText: 'Processando...'
        },
        async () => {
          try {
            this.handleSave();
          } catch (error) {
            // Evita erro não tratado no clique (toasts já são emitidos no form/handlers).
          }
        }
      );
    });
  }

  /**
   * Renderiza opções de categorias do usuário
   */
  renderCategoryOptions() {
    if (!this.categoryContainer || !this.categoryStore) return;

    this.categoryContainer.innerHTML = "";
    const categories = this.categoryStore.getAll();

    if (categories.length === 0) {
      this.categoryContainer.appendChild(this.createCategoryHint("Nenhuma categoria disponível. Crie categorias primeiro."));
      return;
    }

    if (!this.selectedType) {
      this.categoryContainer.appendChild(this.createCategoryHint("Selecione \"Entrada\" ou \"Saída\" para listar as categorias."));
      return;
    }

    const normalizeType = (value = "") =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const desiredType = this.selectedType === "entrada" ? "entrada" : "saida";
    const filtered = categories.filter((cat) => normalizeType(cat.type) === desiredType);

    if (filtered.length === 0) {
      this.categoryContainer.appendChild(
        this.createCategoryHint("Nenhuma categoria cadastrada para este tipo. Crie uma na aba Categorias.")
      );
      return;
    }

    const label = document.createElement("span");
    label.className = `source-label ${this.selectedType === "entrada" ? "source-label--income" : "source-label--expense"}`;
    label.textContent = this.selectedType === "entrada" ? "Categorias de Entrada" : "Categorias de Saída";
    this.categoryContainer.appendChild(label);

    const grid = document.createElement("div");
    grid.className = "category-options-grid";

    filtered.forEach((cat) => {
      const button = this.createCategoryButton(cat);
      if (this.selectedCategoryId === cat.id) {
        button.classList.add("category-option--active");
      }
      grid.appendChild(button);
    });

    this.categoryContainer.appendChild(grid);
  }

  createCategoryHint(text) {
    const hint = document.createElement("p");
    hint.className = "category-options-hint";
    hint.textContent = text;
    return hint;
  }

  /**
   * Cria um botão de categoria
   */
  createCategoryButton(category) {
    const btn = document.createElement("button");
    btn.type = "button";
    const typeClass = this.selectedType === "entrada" ? "category-option--entrada" : "category-option--saida";
    btn.className = `category-option ${typeClass}`;
    btn.dataset.categoryId = category.id;
    btn.innerHTML = `
      <span class="category-option__icon" style="background-color: ${category.color}">${category.icon}</span>
      <span class="category-option__label">${category.name}</span>
    `;

    btn.addEventListener("click", () => {
      this.categoryContainer.querySelectorAll(".category-option").forEach(b =>
        b.classList.remove("category-option--active")
      );
      btn.classList.add("category-option--active");

      this.selectedCategoryId = category.id;
      this.selectedPaymentMethod = null;
      this.selectedSourceId = null;
      this.selectedTargetId = null;

      this.renderPaymentMethodOptions();
    });

    return btn;
  }

  /**
   * Renderiza opções de método de pagamento
   */
  renderPaymentMethodOptions() {
    if (!this.sourceContainer) return;

    this.sourceContainer.innerHTML = "";
    this.selectedPaymentMethod = null;
    this.selectedSourceId = null;

    if (this.targetContainer) this.targetContainer.innerHTML = "";
    this.selectedTargetId = null;

    if (!this.selectedType) {
      const hint = document.createElement("p");
      hint.className = "source-empty";
      hint.textContent = "Selecione o tipo e a categoria antes do método de pagamento.";
      this.sourceContainer.appendChild(hint);
      return;
    }

    const labelEl = document.createElement("span");
    labelEl.className = "source-label";
    labelEl.textContent = this.selectedType === 'entrada' ? "Receber em" : "Pagar com";
    this.sourceContainer.appendChild(labelEl);

    const methodsDiv = document.createElement("div");
    methodsDiv.className = "payment-methods";

    let methods = [];

    if (this.selectedType === 'entrada') {
      methods = [
        { id: 'debito', label: 'Débito / Dinheiro', icon: '💵' }
      ];
    } else {
      methods = [
        { id: 'debito', label: 'Débito / Dinheiro', icon: '💵' },
        { id: 'credito', label: 'Cartão de Crédito', icon: '💳' },
        { id: 'beneficio', label: 'Benefício', icon: '🎁' }
      ];
    }

    methods.forEach(method => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "payment-method-option";
      btn.dataset.method = method.id;
      btn.innerHTML = `<span class="payment-method-option__icon">${method.icon}</span><span class="payment-method-option__label">${method.label}</span>`;

      btn.addEventListener("click", () => {
        methodsDiv.querySelectorAll(".payment-method-option").forEach(b =>
          b.classList.remove("payment-method-option--active")
        );
        btn.classList.add("payment-method-option--active");
        this.selectedPaymentMethod = method.id;
        this.selectedSourceId = null;
        this.renderSourceOptions();
      });

      methodsDiv.appendChild(btn);
    });

    this.sourceContainer.appendChild(methodsDiv);
  }

  /**
   * Renderiza opções de origem (cartão/conta/benefício específico)
   */
  renderSourceOptions() {
    if (!this.sourceContainer) return;
    const existingSourceList = this.sourceContainer.querySelector('.source-options');
    if (existingSourceList) existingSourceList.remove();

    const existingLabels = this.sourceContainer.querySelectorAll('.source-label');
    if (existingLabels.length > 1) {
      existingLabels[1].remove();
    }

    if (this.targetContainer) this.targetContainer.innerHTML = "";
    this.selectedTargetId = null;

    let items = [];
    let label = "";

    switch (this.selectedPaymentMethod) {
      case 'debito':
        items = this.debitStore ? this.debitStore.getAll() : [];
        label = "Selecione a conta";
        break;
      case 'credito':
        items = this.creditStore ? this.creditStore.getAll() : [];
        label = "Selecione o cartão";
        break;
      case 'beneficio':
        items = this.benefitStore ? this.benefitStore.getAll() : [];
        label = "Selecione o benefício";
        break;
    }

    if (items.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.className = "source-empty";
      emptyMsg.textContent = `Nenhum item disponível. Crie primeiro na aba correspondente.`;
      this.sourceContainer.appendChild(emptyMsg);
      return;
    }

    const labelEl = document.createElement("span");
    labelEl.className = "source-label";
    labelEl.textContent = label;
    this.sourceContainer.appendChild(labelEl);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "source-options";

    items.forEach(item => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "source-option";
      btn.dataset.sourceId = item.id;

      let availableInfo = '';
      if (this.selectedPaymentMethod === 'debito') {
        availableInfo = `Saldo: R$ ${this.formatValue(item.balance || 0)}`;
      } else if (this.selectedPaymentMethod === 'credito') {
        const available = (item.limit || 0) - (item.used || 0);
        availableInfo = `Disponível: R$ ${this.formatValue(available)}`;
      } else if (this.selectedPaymentMethod === 'beneficio') {
        const available = (item.limit || 0) - (item.used || 0);
        availableInfo = `Disponível: R$ ${this.formatValue(available)}`;
      }

      btn.innerHTML = `
        <span class="source-option__icon" style="background-color: ${item.color}">${item.icon}</span>
        <span class="source-option__name">${item.name}</span>
        <span class="source-option__value">${availableInfo}</span>
      `;

      btn.addEventListener("click", () => {
        optionsDiv.querySelectorAll(".source-option").forEach(b =>
          b.classList.remove("source-option--active")
        );
        btn.classList.add("source-option--active");
        this.selectedSourceId = Number(item.id);
      });

      optionsDiv.appendChild(btn);
    });

    this.sourceContainer.appendChild(optionsDiv);
  }

  /**
   * Formata valor para exibição
   */
  formatValue(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Abre o formulário para novo lançamento
   */
  open(transaction = {}) {
    this.reset();
    this.formTitle.textContent = "Novo Lançamento";
    this.formSheet.classList.add("is-open");
    this.formSheet.setAttribute("aria-hidden", "false");

    if (transaction.type) {
      this.selectType(transaction.type);
    } else {
      this.renderCategoryOptions();
    }

    this.dateInput.value = dateUtils.getLocalISODateString();
  }

  /**
   * Abre o formulário para edição
    * Pré-preenche todos os campos com dados atuais
   */
  openEdit(id, transaction) {
    this.reset();
    this.editingId = id;
    this.originalTransaction = { ...transaction };
    this.formTitle.textContent = "Editar Lançamento";
    this.formSheet.classList.add("is-open");
    this.formSheet.setAttribute("aria-hidden", "false");
    this.nameInput.value = transaction.name || "";
    this.valueInput.value = this.formatValue(transaction.value);
    this.dateInput.value = transaction.date
      ? dateUtils.toDateInputValue(transaction.date)
      : dateUtils.getLocalISODateString();
    const transactionType = transaction.type || "saida";
    this.selectType(transactionType);

    // Renderizar categorias do tipo selecionado
    this.renderCategoryOptions();
    setTimeout(() => {
      if (transaction.categoryId) {
        const categoryBtn = this.categoryContainer.querySelector(`[data-category-id="${transaction.categoryId}"]`);
        if (categoryBtn) {
          categoryBtn.click();
          setTimeout(() => {
            if (transaction.paymentMethod) {
              const methodBtn = this.sourceContainer.querySelector(`[data-method="${transaction.paymentMethod}"]`);
              if (methodBtn) {
                methodBtn.click();
                setTimeout(() => {
                  if (transaction.sourceId) {
                    const sourceBtn = this.sourceContainer.querySelector(`[data-source-id="${transaction.sourceId}"]`);
                    if (sourceBtn) {
                      sourceBtn.click();
                    }
                  }
                }, 50);
              }
            }
          }, 50);
        }
      }
    }, 50);
  }

  /**
   * Fecha o formulário
   */
  close() {
    this.formSheet.classList.remove("is-open");
    this.formSheet.setAttribute("aria-hidden", "true");
    this.reset();
  }

  /**
   * Reseta o formulário
   */
  reset() {
    this.editingId = null;
    this.originalTransaction = null;
    this.clearTypeSelection();
    this.selectedCategoryId = null;
    this.selectedPaymentMethod = null;
    this.selectedSourceId = null;
    this.selectedTargetId = null;

    // Oculta erros de validação
    this.hideValidationErrors();

    if (this.nameInput) this.nameInput.value = "";
    if (this.valueInput) this.valueInput.value = "0,00";
    if (this.categoryContainer) this.categoryContainer.innerHTML = "";
    if (this.sourceContainer) this.sourceContainer.innerHTML = "";
    if (this.targetContainer) this.targetContainer.innerHTML = "";
  }

  // ============================================
  // Validações (mensagens curtas)
  // ============================================

  /**
   * Valida se o método de pagamento é permitido para o tipo.
   */
  _isPaymentMethodAllowed(type, method) {
    if (!type || !method) return false;

    if (type === 'entrada') {
      return method === 'debito';
    }

    if (type === 'saida') {
      return method === 'debito' || method === 'credito' || method === 'beneficio';
    }

    return true;
  }

  /**
   * Retorna o item selecionado (conta/cartão/benefício) pelo método.
   */
  _getSourceItemByPaymentMethod(method, sourceId) {
    const id = Number(sourceId);
    if (!method || !Number.isFinite(id)) return null;

    switch (method) {
      case 'debito':
        return this.debitStore ? this.debitStore.findById(id) : null;
      case 'credito':
        return this.creditStore ? this.creditStore.findById(id) : null;
      case 'beneficio':
        return this.benefitStore ? this.benefitStore.findById(id) : null;
      default:
        return null;
    }
  }

  /**
   * Calcula o valor disponível do item selecionado.
   */
  _getAvailableAmount(method, item) {
    if (!item) return null;

    if (method === 'debito') {
      return Number(item.balance) || 0;
    }

    if (method === 'credito' || method === 'beneficio') {
      const limit = Number(item.limit) || 0;
      const used = Number(item.used) || 0;
      return Math.max(0, limit - used);
    }

    return null;
  }

  /**
   * Valida o formulário
   */
  validate() {
    const errors = [];

    if (!this.nameInput.value.trim()) {
      errors.push("Informe o nome");
    }

    const value = parseCurrencyInput(this.valueInput.value);
    if (value <= 0) {
      errors.push("Valor inválido");
    }

    if (!this.selectedType) {
      errors.push("Selecione Entrada/Saída");
    }

    if (!this.selectedCategoryId) {
      errors.push("Selecione a categoria");
    } else if (this.categoryStore && !this.categoryStore.findById(this.selectedCategoryId)) {
      errors.push("Categoria inválida");
    }

    if (!this.selectedPaymentMethod) {
      errors.push("Selecione o método");
    } else if (!this._isPaymentMethodAllowed(this.selectedType, this.selectedPaymentMethod)) {
      errors.push("Método inválido");
    }

    if (!this.selectedSourceId) {
      errors.push("Selecione a origem");
    } else {
      const sourceItem = this._getSourceItemByPaymentMethod(this.selectedPaymentMethod, this.selectedSourceId);
      if (!sourceItem) {
        errors.push("Origem inválida");
      } else if (this.selectedType === 'saida' && value > 0) {
        const available = this._getAvailableAmount(this.selectedPaymentMethod, sourceItem);
        if (typeof available === 'number' && value > available) {
          if (this.selectedPaymentMethod === 'debito') errors.push('Saldo insuficiente');
          else if (this.selectedPaymentMethod === 'credito') errors.push('Limite insuficiente');
          else if (this.selectedPaymentMethod === 'beneficio') errors.push('Benefício insuficiente');
        }
      }
    }

    return errors;
  }

  /**
   * Manipula salvamento
   */
  handleSave() {
    const errors = this.validate();

    if (errors.length > 0) {
      // Usa validação customizada em vez de alert()
      this.showValidationErrors(errors);

      // Toast superior: feedback imediato sem roubar foco.
      dispatchToast({
        variant: 'warning',
        title: 'Corrija os campos',
        message: errors.join('\n'),
        id: 'transaction-validation'
      });
      return;
    }

    // Oculta erros anteriores se validação passou
    this.hideValidationErrors();

    const value = parseCurrencyInput(this.valueInput.value);
    const dateValue = this.dateInput.value;

    const category = this.categoryStore ? this.categoryStore.findById(this.selectedCategoryId) : null;

    const payload = {
      id: this.editingId,
      name: this.nameInput.value.trim(),
      type: this.selectedType,
      categoryId: this.selectedCategoryId,
      categoryName: category ? category.name : '',
      categoryIcon: category ? category.icon : '📝',
      categoryColor: category ? category.color : '#1fc2c0',
      paymentMethod: this.selectedPaymentMethod,
      sourceId: this.selectedSourceId,
      targetId: this.selectedTargetId,
      value: value,
      date: new Date(dateValue + 'T12:00:00').toISOString(),
      originalTransaction: this.originalTransaction
    };

    console.log("📤 Payload da transação:", payload);

    const isEditing = Boolean(this.editingId);

    try {
      if (this.saveCallback) {
        this.saveCallback(payload);
      }

      dispatchToast({
        variant: 'success',
        title: isEditing ? 'Lançamento atualizado' : 'Lançamento criado',
        message: `"${payload.name}" salvo com sucesso.`,
        id: isEditing ? `transaction-saved-${this.editingId}` : 'transaction-created'
      });
    } catch (error) {
      if (!isToastHandledError(error)) {
        dispatchToast({
          variant: 'error',
          title: 'Falha ao salvar',
          message: 'Não foi possível salvar o lançamento.',
          id: 'transaction-save-error'
        });
      }

      throw error;
    }

    this.close();
  }

  /**
   * Registra callback de salvamento
   */
  onSave(callback) {
    this.saveCallback = callback;
  }
}
