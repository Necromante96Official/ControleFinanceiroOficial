/**
 * Módulo: Gerenciador de Filtros do Extrato
 * Responsabilidade: Gerenciar filtros de período e categoria do extrato
 *
 * Correção do filtro de "Pagamentos de Fatura"
 * - Detecta por categoryName === 'Pagamento de Fatura' OU metadata.linkedPayment
 * - Não depende mais de paymentMethod (que era incorreto)
 *
 * Tratamento correto de timezone com dateUtils
 * Sistema de filtros refatorado
 * - Filtros de período e categoria funcionam verdadeiramente em conjunto
 * - Lógica simplificada e mais clara
 */

import * as dateUtils from './dateUtils.js';

/**
 * Classe para gerenciar filtros do extrato
 */
export class FilterManager {
  constructor(options) {
    this.elements = options.elements;
    this.transactionStore = options.transactionStore;
    this.categoryStore = options.categoryStore;
    // Stores opcionais para filtro por conta/cartão/benefício
    this.creditStore = options.creditStore;
    this.debitStore = options.debitStore;
    this.benefitStore = options.benefitStore;
    this.onFilterChange = options.onFilterChange || (() => {});

    // ==================================================
    // PERFORMANCE: Cache de filtros (listas grandes)
    // - Evita refazer filtros/ordenação quando nada mudou
    // - Usa revisão do TransactionStore para invalidar
    // ==================================================
    this._filteredCache = {
      key: null,
      result: null,
    };

    // Cache de IDs por tipo de conta (evita recriar Set toda hora)
    this._accountIdsCache = {
      credito: { revision: null, set: null },
      debito: { revision: null, set: null },
      beneficio: { revision: null, set: null },
    };

    // Coleção de categorias selecionadas para multi-filtro (Set para O(1))
    this._multiSelectedCategories = new Set();
  }

  /**
   * Inicializa os filtros e event listeners
   */
  init() {
    this.refreshCategoryOptions();
    this.syncDynamicFilters();
    this.refreshAccountOptions();
    this.setupEventListeners();
  }

  /**
   * Redefine todos os filtros para os valores padrões
   */
  clearFilters() {
    const {
      extratoFilterType,
      extratoFilterCategory,
      extratoFilterAccountType,
      extratoFilterAccountId,
      extratoFilterDate,
      extratoFilterMonthInput,
      extratoFilterYear
    } = this.elements;

    if (extratoFilterType) extratoFilterType.value = 'all';
    
    // Resetar multi-seleção de categorias
    this._multiSelectedCategories.clear();
    if (extratoFilterCategory) {
      extratoFilterCategory.value = 'all';
      this._updateCategoryAllOptionText();
      this._renderCategoryTags();
    }

    if (extratoFilterAccountType) extratoFilterAccountType.value = 'all';
    this.refreshAccountOptions(); // Resetar lista de contas para 'all'

    if (extratoFilterDate) extratoFilterDate.value = '';
    if (extratoFilterMonthInput) extratoFilterMonthInput.value = '';
    if (extratoFilterYear) extratoFilterYear.value = '';

    this.syncDynamicFilters();
    this.onFilterChange();
  }

  /**
   * Configura os event listeners dos filtros
   */
  setupEventListeners() {
    const {
      extratoFilterType,
      extratoFilterCategory,
      extratoFilterAccountType,
      extratoFilterAccountId,
      extratoFilterDate,
      extratoFilterMonthInput,
      extratoFilterYear,
      extratoFiltersClearBtn
    } = this.elements;

    if (extratoFilterType) {
      extratoFilterType.addEventListener('change', () => {
        this.syncDynamicFilters();
        this.onFilterChange();
      });
    }

    if (extratoFiltersClearBtn) {
      extratoFiltersClearBtn.addEventListener('click', () => this.clearFilters());
    }

    if (extratoFilterAccountType) {
      extratoFilterAccountType.addEventListener('change', () => {
        this.refreshAccountOptions();
        this.onFilterChange();
      });
    }

    if (extratoFilterCategory) {
      extratoFilterCategory.addEventListener('change', (e) => this._handleCategoryChange(e));
    }

    [extratoFilterAccountId, extratoFilterDate, extratoFilterMonthInput, extratoFilterYear]
      .filter(Boolean)
      .forEach((element) => {
        element.addEventListener('change', () => this.onFilterChange());
      });
  }

  /**
   * Atualiza as opções do filtro de Conta/Cartão/Benefício.
   * - Depende do tipo selecionado (Crédito/Débito/Benefícios)
   * - Mantém compatibilidade quando stores não são fornecidas
   */
  refreshAccountOptions() {
    const { extratoFilterAccountType, extratoFilterAccountId } = this.elements;
    if (!extratoFilterAccountId) return;

    const selectedType = extratoFilterAccountType ? extratoFilterAccountType.value : 'all';
    const previousValue = extratoFilterAccountId.value;

    // Opção padrão
    extratoFilterAccountId.innerHTML = '<option value="all">Todos</option>';

    // ------------
    // Se tipo = all, não lista itens específicos
    // ------------
    if (!selectedType || selectedType === 'all') {
      extratoFilterAccountId.value = 'all';
      return;
    }

    // ------------
    // Carregar itens conforme o tipo
    // ------------
    let items = [];
    if (selectedType === 'credito' && this.creditStore) {
      items = this.creditStore.getAll().map((c) => ({ id: c.id, name: c.name, icon: c.icon || '💳' }));
    }
    if (selectedType === 'debito' && this.debitStore) {
      items = this.debitStore.getAll().map((d) => ({ id: d.id, name: d.name, icon: d.icon || '🏦' }));
    }
    if (selectedType === 'beneficio' && this.benefitStore) {
      items = this.benefitStore.getAll().map((b) => ({ id: b.id, name: b.name, icon: b.icon || '🎫' }));
    }

    if (!items || items.length === 0) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '__empty';
      emptyOption.textContent = 'Nenhum item cadastrado';
      emptyOption.disabled = true;
      extratoFilterAccountId.appendChild(emptyOption);
      extratoFilterAccountId.value = 'all';
      return;
    }

    items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = String(item.id);
      opt.textContent = `${item.icon} ${item.name}`;
      extratoFilterAccountId.appendChild(opt);
    });

    // Restaurar valor anterior se ainda existir
    if (previousValue && Array.from(extratoFilterAccountId.options).some((opt) => opt.value === previousValue)) {
      extratoFilterAccountId.value = previousValue;
    } else {
      extratoFilterAccountId.value = 'all';
    }
  }

  /**
   * Atualiza as opções de categoria do filtro
   */
  refreshCategoryOptions() {
    const { extratoFilterCategory } = this.elements;
    if (!extratoFilterCategory) return;

    const categories = this.categoryStore.getAll();

    extratoFilterCategory.innerHTML = '<option value="all">Todas as categorias</option>';
    
    const invoicePaymentOption = document.createElement('option');
    invoicePaymentOption.value = '__invoice_payment';
    invoicePaymentOption.textContent = '💳 Pagamentos de Fatura';
    extratoFilterCategory.appendChild(invoicePaymentOption);

    if (categories.length > 0) {
      // Agrupar categorias por tipo
      const entradasGroup = document.createElement('optgroup');
      entradasGroup.label = 'Entradas';
      const saidasGroup = document.createElement('optgroup');
      saidasGroup.label = 'Saídas';

      categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = String(category.id);
        option.textContent = `${category.icon} ${category.name}`;

        const type = (category.type || '').toString().toLowerCase();
        if (type === 'entrada') {
          entradasGroup.appendChild(option);
        } else {
          saidasGroup.appendChild(option);
        }
      });

      if (entradasGroup.children.length > 0) extratoFilterCategory.appendChild(entradasGroup);
      if (saidasGroup.children.length > 0) extratoFilterCategory.appendChild(saidasGroup);
    }

    // Sempre resetar o valor visual para 'all' ou refletir o estado
    this._updateCategoryAllOptionText();
    extratoFilterCategory.value = 'all';
    
    // Atualizar as tags visuais
    this._renderCategoryTags();
  }

  /**
   * Atualiza o texto da opção "Todos" para mostrar contagem
   * @private
   */
  _updateCategoryAllOptionText() {
    const { extratoFilterCategory } = this.elements;
    if (!extratoFilterCategory) return;

    const allOption = extratoFilterCategory.querySelector('option[value="all"]');
    if (!allOption) return;

    const count = this._multiSelectedCategories.size;
    if (count === 0) {
      allOption.textContent = 'Todas as categorias';
    } else if (count === 1) {
      allOption.textContent = '1 categoria selecionada';
    } else {
      allOption.textContent = `${count} categorias selecionadas`;
    }
  }

  /**
   * Renderiza as tags das categorias selecionadas
   * @private
   */
  _renderCategoryTags() {
    const container = document.getElementById('extrato-filter-category-tags');
    if (!container) return;

    container.innerHTML = '';

    if (this._multiSelectedCategories.size === 0) return;

    this._multiSelectedCategories.forEach(id => {
      let label = '';
      if (id === '__invoice_payment') {
        label = '💳 Pagamentos de Fatura';
      } else {
        const cat = this.categoryStore.getById(id);
        label = cat ? `${cat.icon} ${cat.name}` : id;
      }

      const tag = document.createElement('div');
      tag.className = 'extrato-filter__tag';
      tag.innerHTML = `
        <span>${label}</span>
        <span class="extrato-filter__tag-remove" data-id="${id}" title="Remover">&times;</span>
      `;

      tag.querySelector('.extrato-filter__tag-remove').onclick = (e) => {
        e.stopPropagation();
        this._multiSelectedCategories.delete(id);
        this._updateCategoryAllOptionText();
        this._renderCategoryTags();
        this.onFilterChange();
      };

      container.appendChild(tag);
    });
  }

  /**
   * Gerencia a mudança no select de categoria (Multi-seleção via Stacking)
   * @private
   */
  _handleCategoryChange(event) {
    const val = event.target.value;

    if (val === 'all') {
      this._multiSelectedCategories.clear();
    } else if (val === '__empty') {
      return;
    } else {
      // Toggle a categoria
      if (this._multiSelectedCategories.has(val)) {
        this._multiSelectedCategories.delete(val);
      } else {
        this._multiSelectedCategories.add(val);
      }
    }

    this._updateCategoryAllOptionText();
    this._renderCategoryTags();
    
    // Resetar o select para 'all' para que o usuário possa escolher outro
    event.target.value = 'all';
    
    this.onFilterChange();
  }

  /**
   * Alterna visibilidade de um wrapper de filtro
   * @private
   */
  _toggleFilterWrapper(wrapper, shouldShow) {
    if (!wrapper) return;
    wrapper.classList.toggle('extrato-filter--hidden', !shouldShow);
  }

  /**
   * Sincroniza filtros dinâmicos baseado no tipo selecionado
   */
  syncDynamicFilters() {
    const {
      extratoFilterType,
      extratoFilterDayWrapper,
      extratoFilterMonthWrapper,
      extratoFilterYearWrapper,
      extratoFilterDate,
      extratoFilterMonthInput,
      extratoFilterYear
    } = this.elements;

    // Compatibilidade: versões antigas tinham "Por categoria" como tipo de período
    // (agora categoria é sempre controlada pelo seletor de categoria)
    let type = extratoFilterType ? extratoFilterType.value : 'current';
    if (type === 'category') {
      type = 'all';
      if (extratoFilterType) extratoFilterType.value = 'all';
    }

    this._toggleFilterWrapper(extratoFilterDayWrapper, type === 'day');
    this._toggleFilterWrapper(extratoFilterMonthWrapper, type === 'month');
    this._toggleFilterWrapper(extratoFilterYearWrapper, type === 'year');

    const now = new Date();

    if (type === 'day' && extratoFilterDate && !extratoFilterDate.value) {
      extratoFilterDate.value = dateUtils.getLocalISODateString(now);
    }
    if (type === 'month' && extratoFilterMonthInput && !extratoFilterMonthInput.value) {
      const monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      extratoFilterMonthInput.value = monthValue;
    }
    if (type === 'year' && extratoFilterYear && !extratoFilterYear.value) {
      extratoFilterYear.value = String(now.getFullYear());
    }
  }

  /**
   * Obtém transações filtradas baseado nos filtros atuais
    * Sistema de filtros refatorado
   * - Filtros de período e categoria agora funcionam VERDADEIRAMENTE em conjunto
   * - "PaselectedCategories = extratoFilterCategory 
      ? Array.from(extratoFilterCategory.selectedOptions).map(opt => opt.value)
      : ['all'];

  /**
   * Obtém as transações filtradas conforme o estado atual dos inputs da UI.
   * Utiliza cache agressivo por revisão da Store + Snapshot dos filtros.
   * @returns {Array}
   */
  getFilteredTransactions() {
    const {
      extratoFilterType,
      extratoFilterCategory,
      extratoFilterAccountType,
      extratoFilterAccountId,
      extratoFilterDate,
      extratoFilterMonthInput,
      extratoFilterYear
    } = this.elements;

    // ==================================================
    // Cache (chave por revisão + valores de filtro)
    // ==================================================
    // Usamos as categorias do Set interno
    const selectedCategories = Array.from(this._multiSelectedCategories);

    const filterSnapshot = {
      type: extratoFilterType ? extratoFilterType.value : 'all',
      categories: selectedCategories.join(','),
      accountType: extratoFilterAccountType ? extratoFilterAccountType.value : 'all',
      accountId: extratoFilterAccountId ? extratoFilterAccountId.value : 'all',
      day: extratoFilterDate ? extratoFilterDate.value : '',
      month: extratoFilterMonthInput ? extratoFilterMonthInput.value : '',
      year: extratoFilterYear ? extratoFilterYear.value : '',
    };

    const txRevision = this._getStoreRevisionSafe(this.transactionStore);
    const creditRevision = this._getStoreRevisionSafe(this.creditStore);
    const debitRevision = this._getStoreRevisionSafe(this.debitStore);
    const benefitRevision = this._getStoreRevisionSafe(this.benefitStore);

    const cacheKey = this._buildCacheKey({
      txRevision,
      creditRevision,
      debitRevision,
      benefitRevision,
      filterSnapshot,
    });

    if (this._filteredCache.key === cacheKey && Array.isArray(this._filteredCache.result)) {
      return this._filteredCache.result;
    }

    // ETAPA 1: Filtrar por PERÍODO
    const type = filterSnapshot.type;
    let transactions = this._filterByPeriod(type, extratoFilterDate, extratoFilterMonthInput, extratoFilterYear);

    // ETAPA 2 (otimizada): Categoria + Conta em uma única passagem quando possível
    const accountType = filterSnapshot.accountType;
    const accountId = filterSnapshot.accountId;

    const shouldFilterCategory = selectedCategories.length > 0;
    const shouldFilterAccount = !!accountType && accountType !== 'all';

    if (shouldFilterCategory || shouldFilterAccount) {
      transactions = this._filterByCategoryAndAccount(transactions, selectedCategories, accountType, accountId);
    }

    // Salvar cache
    this._filteredCache.key = cacheKey;
    this._filteredCache.result = transactions;

    return transactions;
  }

  /**
   * Monta uma chave estável de cache.
   * @private
   */
  _buildCacheKey({ txRevision, creditRevision, debitRevision, benefitRevision, filterSnapshot }) {
    return [
      `tx:${txRevision}`,
      `cr:${creditRevision}`,
      `db:${debitRevision}`,
      `bf:${benefitRevision}`,
      `t:${filterSnapshot.type}`,
      `c:${filterSnapshot.categories || filterSnapshot.category}`,
      `at:${filterSnapshot.accountType}`,
      `ai:${filterSnapshot.accountId}`,
      `d:${filterSnapshot.day}`,
      `m:${filterSnapshot.month}`,
      `y:${filterSnapshot.year}`,
    ].join('|');
  }

  /**
   * Lê revisão de store com fallback seguro.
   * @private
   */
  _getStoreRevisionSafe(store) {
    try {
      if (!store) return 0;
      if (typeof store.getRevision === 'function') return store.getRevision();
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Filtra em uma única passagem por categoria e conta.
   * @private
   */
  _filterByCategoryAndAccount(transactions, selectedCategories, accountType, accountId) {
    const shouldFilterCategory = Array.isArray(selectedCategories) && selectedCategories.length > 0;
    const shouldFilterAccount = !!accountType && accountType !== 'all';

    const accountIds = shouldFilterAccount ? this._getAccountIdsSet(accountType) : null;

    // ------------
    // Pré-cálculos para reduzir custo dentro do loop
    // ------------
    const selectedAccountId = String(accountId);
    const accountIsAll = selectedAccountId === 'all';
    
    // Set para busca rápida
    const categorySet = new Set(selectedCategories);
    const filterInvoice = categorySet.has('__invoice_payment');

    const methodOf = (t) => (t?.paymentMethod || t?.category || '').toString().toLowerCase();

    return transactions.filter((t) => {
      // ================ Categoria
      if (shouldFilterCategory) {
        const categoryId = t.categoryId ? String(t.categoryId) : null;
        
        let matchCategory = false;
        
        // Verifica se é pagamento de fatura
        if (filterInvoice) {
          const isInvoicePayment =
            t.categoryName === 'Pagamento de Fatura' ||
            (t.categoryId === null && !!t.linkedTransactionId) ||
            (t.categoryId === null && t.metadata?.linkedPayment === true);
          
          if (isInvoicePayment) matchCategory = true;
        }

        // Verifica o ID da categoria no conjunto
        if (!matchCategory && categoryId && categorySet.has(categoryId)) {
          matchCategory = true;
        }

        if (!matchCategory) return false;
      }

      // ================ Conta/Cartão/Benefício
      if (shouldFilterAccount) {
        if (!(accountIds instanceof Set) || accountIds.size === 0) return false;

        const method = methodOf(t);
        const sid = String(t?.sourceId);
        const tid = String(t?.targetId);

        if (accountType === 'credito') {
          // Compra no crédito: sourceId = cartão
          if (method === 'credito') {
            return accountIsAll ? accountIds.has(sid) : sid === selectedAccountId;
          }

          // Pagamento de fatura: targetId = cartão
          if (method === 'pagar-credito') {
            return accountIsAll ? accountIds.has(tid) : tid === selectedAccountId;
          }

          return false;
        }

        if (accountType === 'beneficio') {
          if (method !== 'beneficio') return false;
          return accountIsAll ? accountIds.has(sid) : sid === selectedAccountId;
        }

        if (accountType === 'debito') {
          const matchDebit = (value) => (accountIsAll ? accountIds.has(String(value)) : String(value) === selectedAccountId);

          // Transferência: pode entrar ou sair da conta
          if (method === 'transferencia') {
            return matchDebit(t?.sourceId) || matchDebit(t?.targetId);
          }

          // Pagamento de crédito: sai do débito
          if (method === 'pagar-credito') {
            return matchDebit(t?.sourceId);
          }

          // Métodos não vinculados a débito
          if (method === 'credito' || method === 'beneficio') {
            return false;
          }

          // Demais casos: origem é a conta de débito
          return matchDebit(t?.sourceId);
        }
      }

      return true;
    });
  }

  /**
   * Filtra transações por período
    * Método auxiliar extraído para maior clareza
   * @private
   * @param {string} type - Tipo de filtro de período
   * @param {HTMLInputElement} dateInput - Input de data (para filtro por dia)
   * @param {HTMLInputElement} monthInput - Input de mês
   * @param {HTMLInputElement} yearInput - Input de ano
   * @returns {Array} Transações filtradas por período
   */
  _filterByPeriod(type, dateInput, monthInput, yearInput) {
    const allTransactions = this.transactionStore.getAll();

    switch (type) {
      case 'all':
        return allTransactions;

      case 'current':
        return this.transactionStore.getCurrentMonth();

      case 'category':
        // Compatibilidade: versões antigas tinham este tipo.
        // Hoje, categoria é sempre aplicada no seletor de categoria.
        return allTransactions;

      case 'day':
        return this._filterByDay(dateInput, allTransactions);

      case 'month':
        return this._filterByMonth(monthInput, allTransactions);

      case 'year':
        return this._filterByYear(yearInput, allTransactions);

      default:
        return allTransactions;
    }
  }

  /**
   * Filtra transações por conta/cartão/benefício.
   * - Inclui entradas e saídas (origem/destino), conforme o tipo de transação.
   * - Evita colisão de IDs usando o paymentMethod e a posição (source/target).
   * @private
   * @param {Array} transactions
   * @param {'all'|'credito'|'debito'|'beneficio'} accountType
   * @param {string} accountId
   * @returns {Array}
   */
  _filterByAccount(transactions, accountType, accountId) {
    if (!accountType || accountType === 'all') return transactions;

    const methodOf = (t) => (t?.paymentMethod || t?.category || '').toString().toLowerCase();

    const matchAnyId = (idSet, value) => idSet.has(String(value));

    if (accountType === 'credito') {
      const ids = new Set((this.creditStore?.getAll?.() || []).map((c) => String(c.id)));
      if (ids.size === 0) return [];

      const isAll = accountId === 'all';

      return transactions.filter((t) => {
        const method = methodOf(t);

        // Compra no crédito: sourceId = cartão
        if (method === 'credito') {
          const sid = String(t?.sourceId);
          return isAll ? matchAnyId(ids, sid) : sid === String(accountId);
        }

        // Pagamento de fatura: targetId = cartão
        if (method === 'pagar-credito') {
          const tid = String(t?.targetId);
          return isAll ? matchAnyId(ids, tid) : tid === String(accountId);
        }

        return false;
      });
    }

    if (accountType === 'beneficio') {
      const ids = new Set((this.benefitStore?.getAll?.() || []).map((b) => String(b.id)));
      if (ids.size === 0) return [];

      const isAll = accountId === 'all';

      return transactions.filter((t) => {
        const method = methodOf(t);
        if (method !== 'beneficio') return false;

        const sid = String(t?.sourceId);
        return isAll ? matchAnyId(ids, sid) : sid === String(accountId);
      });
    }

    if (accountType === 'debito') {
      const ids = new Set((this.debitStore?.getAll?.() || []).map((d) => String(d.id)));
      if (ids.size === 0) return [];

      const isAll = accountId === 'all';
      const matchDebit = (value) => (isAll ? matchAnyId(ids, value) : String(value) === String(accountId));

      return transactions.filter((t) => {
        const method = methodOf(t);
        const sourceId = t?.sourceId;
        const targetId = t?.targetId;

        // Transferência: pode entrar ou sair da conta
        if (method === 'transferencia') {
          return matchDebit(sourceId) || matchDebit(targetId);
        }

        // Pagamento de crédito: sai do débito
        if (method === 'pagar-credito') {
          return matchDebit(sourceId);
        }

        // Métodos não vinculados a débito (evita colisão de IDs)
        if (method === 'credito' || method === 'beneficio') {
          return false;
        }

        // Demais casos: origem é a conta de débito escolhida
        return matchDebit(sourceId);
      });
    }

    return transactions;
  }

  /**
   * Filtra por dia específico
    * Usa dateUtils para criar datas corretamente
   * @private
   */
  _filterByDay(dateInput, fallback) {
    if (!dateInput || !dateInput.value) return fallback;

    const [year, month, day] = dateInput.value.split('-').map(Number);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return fallback;
    }
    const start = dateUtils.startOfDay(dateUtils.createDate(year, month, day));
    const end = dateUtils.endOfDay(dateUtils.createDate(year, month, day));
    return this.transactionStore.getByPeriod(start, end);
  }

  /**
   * Filtra por mês específico
    * Usa dateUtils para cálculo correto de início/fim do mês
   * @private
   */
  _filterByMonth(monthInput, fallback) {
    if (!monthInput || !monthInput.value) return fallback;

    const [year, month] = monthInput.value.split('-').map(Number);
    if (Number.isNaN(year) || Number.isNaN(month)) {
      return fallback;
    }
    const start = dateUtils.startOfMonth(year, month);
    const end = dateUtils.endOfMonth(year, month);
    return this.transactionStore.getByPeriod(start, end);
  }

  /**
   * Filtra por ano específico
    * Usa dateUtils para cálculo correto de início/fim do ano
   * @private
   */
  _filterByYear(yearInput, fallback) {
    if (!yearInput || !yearInput.value) return fallback;

    const year = Number(yearInput.value);
    if (Number.isNaN(year)) return fallback;
    const start = dateUtils.startOfYear(year);
    const end = dateUtils.endOfYear(year);
    return this.transactionStore.getByPeriod(start, end);
  }

  /**
   * Filtra transações por categoria
    * Corrigido para detectar pagamentos de fatura corretamente
   * @private
   * @param {Array} transactions - Transações já filtradas por período
   * @param {string} categoryValue - Valor do filtro de categoria
   * @returns {Array} Transações filtradas por categoria
   */
  _filterByCategory(transactions, categoryValue) {
    // Se 'all', retorna todas as transações sem filtro
    if (categoryValue === 'all' || categoryValue === '__empty') {
      return transactions;
    }
    // Detecta transações de pagamento por:
    // 1. categoryName === 'Pagamento de Fatura'
    // 2. categoryId === null E metadata.linkedPayment === true
    // 3. categoryId === null E linkedTransactionId preenchido
    if (categoryValue === '__invoice_payment') {
      return transactions.filter(t => {
        // Critério 1: categoryName é exatamente 'Pagamento de Fatura'
        if (t.categoryName === 'Pagamento de Fatura') {
          return true;
        }

        // Critério 2: É uma transação vinculada (pagamento de fatura cria 2 transações vinculadas)
        if (t.categoryId === null && t.linkedTransactionId) {
          return true;
        }

        // Critério 3: Tem metadata de pagamento vinculado
        if (t.categoryId === null && t.metadata?.linkedPayment === true) {
          return true;
        }

        return false;
      });
    }

    // Filtro por categoria específica (ID)
    return transactions.filter(t => {
      const categoryId = t.categoryId ? String(t.categoryId) : null;
      return categoryId === categoryValue;
    });
  }
}
