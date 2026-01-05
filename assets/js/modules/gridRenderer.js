/**
 * Módulo: Renderizadores de Grid
 * Responsabilidade: Renderizar cards de categorias, benefícios, crédito, débito e transações
 *

 *                  - Cards de crédito mostram status do ciclo (pago/pendente/próximo ciclo)
 *                  - Alertas de vencimento só aparecem para faturas realmente pendentes
 *                  - Gastos após pagamento são considerados do próximo ciclo

 *

 * - _handleCreditPayment() APENAS cria transação, NUNCA toca nos valores
 * - TransactionManager aplica tudo com logs detalhados e verificações
 * - Sem creditStore.registerPayment() ou debitStore.update() direto
 * - Import/Export 100% consistente
 */

import { formatCurrencyDisplay, formatCurrencyInput, parseCurrencyInput, formatCurrencySimple } from "./currencyFormatter.js";
import { TransactionStore } from "./transactionStore.js";
import { VirtualScroll } from "./virtualScroll.js";
import { clampToZero, parseMoneyToNumber } from "./moneyUtils.js";
import { playClickSound } from "./clickSoundManager.js";
import { dispatchToast } from "./toastManager.js";

/**
 * Classe para renderizar todos os grids da aplicação
 */
export class GridRenderer {
  constructor(options) {
    this.stores = options.stores;
    this.elements = options.elements;
    this.forms = options.forms;
    this.confirmationModal = options.confirmationModal;
    this.transactionManager = options.transactionManager;
    this.filterManager = options.filterManager;
    this.statsManager = options.statsManager;

    // ==================================================
    // AUDITORIA (opcional)
    // - Registra ações sem depender do store (transferiu/pagou)
    // ==================================================
    this.auditManager = options.auditManager || null;

    // Virtual Scroll para transações
    this.virtualScroll = null;
    // Extrato mais compacto (lista)
    this.transactionItemHeight = 72;

    // Handlers de event delegation (armazenados para cleanup)
    this._handlers = {};

    // ==================================================
    // LOADING (skeleton)
    // - Evita múltiplos renders enfileirados (filtros/tabs)
    // ==================================================
    this._pendingRafByKey = {};
  }

  // ============================================
  // SEGURANÇAS (Edição/Remoção)
  // ============================================

  /**
   * Conta quantos lançamentos referenciam uma entidade.
   * @private
   * @param {(t: any) => boolean} predicate
   * @returns {number}
   */
  _countTransactionsBy(predicate) {
    const { transactionStore } = this.stores;
    try {
      const all = transactionStore.getAll();
      return all.filter(predicate).length;
    } catch {
      return 0;
    }
  }

  /**
   * Mostra modal informativo (sem botão cancelar).
   * @private
   */
  async _showInfoModal(title, message) {
    await this.confirmationModal.show(title, message, 'Entendi', null);
  }

  // ============================================
  // CLEANUP E LIFECYCLE
  // ============================================

  /**
   * Limpa recursos ao destruir o renderer
    * Aprimorado para prevenir memory leaks
   */
  destroy() {
    console.log('🧹 Iniciando limpeza do GridRenderer...');

    // Destruir VirtualScroll se existir
    if (this.virtualScroll) {
      try {
        this.virtualScroll.destroy();
        this.virtualScroll = null;
        console.log('✅ VirtualScroll destruído');
      } catch (error) {
        console.error('❌ Erro ao destruir VirtualScroll:', error);
      }
    }

    // Remover event handlers (CRÍTICO para prevenir memory leak)
    let removedCount = 0;
    Object.keys(this._handlers).forEach(key => {
      const gridKey = key.replace('_', '').replace('Handler', '');
      const grid = this.elements[gridKey];

      if (grid && this._handlers[key]) {
        try {
          grid.removeEventListener('click', this._handlers[key]);
          removedCount++;
          console.log(`🗑️ Handler removido: ${key}`);
        } catch (error) {
          console.warn(`⚠️ Erro ao remover handler ${key}:`, error);
        }
      }

      // Liberar referência para garbage collection
      delete this._handlers[key];
    });

    // Limpar objeto de handlers
    this._handlers = {};

    console.log(`✅ GridRenderer limpo: ${removedCount} handler(s) removido(s)`);
  }

  /**
   * Limpa e recria VirtualScroll (método privado mantido para compatibilidade)
   * @deprecated Use resetVirtualScroll() público ao invés deste método
   * @private
   */
  _resetVirtualScroll() {
    console.warn('⚠️ _resetVirtualScroll() é privado. Use resetVirtualScroll() público.');
    this.resetVirtualScroll();
  }

  /**
   * Limpa e recria VirtualScroll (método público)
    * Refatorado de privado para público
   * @public
   */
  resetVirtualScroll() {
    if (this.virtualScroll) {
      try {
        this.virtualScroll.destroy();
        this.virtualScroll = null;
        console.log('✅ VirtualScroll resetado');
      } catch (error) {
        console.error('❌ Erro ao resetar VirtualScroll:', error);
        this.virtualScroll = null; // Força limpeza mesmo com erro
      }
    } else {
      console.log('ℹ️ VirtualScroll já está null');
    }
  }

  // ============================================
  // MÉTODOS UTILITÁRIOS COMPARTILHADOS
  // ============================================

  /**
   * Formata valor para moeda
   * @private
   */
  _formatCurrency(value) {
    return formatCurrencyDisplay(value);
  }

  /**
   * Escapa HTML para prevenir XSS e trata null/undefined
   * @private
   * @param {*} text - Texto a escapar
   * @param {string} fallback - Valor padrão se for null/undefined/vazio
   * @returns {string} Texto escapado
   */
  _escapeHtml(text, fallback = '') {
    if (text === null || text === undefined || text === 'null' || text === 'undefined') {
      return fallback;
    }
    const str = String(text).trim();
    if (str === '' || str === 'null' || str === 'undefined') {
      return fallback;
    }
    const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, char => escapes[char]);
  }

  /**
   * Cria elemento de estado vazio
   * @private
   */
  _createEmptyState(params = {}) {
    // ------------
    // Estado vazio padrão (mensagem simples + dica)
    // ------------
    const {
      title = 'Nada por aqui ainda',
      message = 'Nenhum item foi criado ainda.',
      hint = 'Toque no botão "+" para adicionar o primeiro.'
    } = params || {};

    const el = document.createElement("div");
    el.className = "empty-state";

    el.innerHTML = `
      <h3 class="empty-state__title">${this._escapeHtml(title, 'Nada por aqui ainda')}</h3>
      <p class="empty-state__message">${this._escapeHtml(message, 'Nenhum item foi criado ainda.')}</p>
      <p class="empty-state__hint">${this._escapeHtml(hint, 'Toque no botão "+" para adicionar o primeiro.')}</p>
    `;
    return el;
  }

  /**
   * Renderiza skeleton de carregamento dentro de um container.
   * @private
   * @param {{ count?: number, compact?: boolean }} options
   */
  _createLoadingSkeleton(options = {}) {
    const { count = 6, compact = false } = options || {};

    const root = document.createElement('div');
    root.className = `loading-skeleton${compact ? ' loading-skeleton--compact' : ''}`;
    root.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < Math.max(1, Number(count) || 1); i += 1) {
      const item = document.createElement('div');
      item.className = 'loading-skeleton__item';
      root.appendChild(item);
    }

    return root;
  }

  /**
   * Renderiza um grid com opção de mostrar skeleton antes (via requestAnimationFrame).
   * Importante: útil em renderizações pesadas (filtros/troca de aba) para não parecer que travou.
   * @private
   */
  _renderWithOptionalLoading({ key, container, showLoading, skeletonCount, skeletonCompact, render }) {
    if (!container || typeof render !== 'function') return;

    // ------------
    // Cancelar render pendente anterior (evita flicker e corrida)
    // ------------
    const prevRaf = this._pendingRafByKey[key];
    if (prevRaf) {
      try {
        cancelAnimationFrame(prevRaf);
      } catch {
        // Ignorar
      }
      this._pendingRafByKey[key] = null;
    }

    if (!showLoading) {
      render();
      return;
    }

    // ------------
    // Mostrar skeleton e renderizar no próximo frame
    // ------------
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '';
    container.appendChild(this._createLoadingSkeleton({ count: skeletonCount, compact: skeletonCompact }));

    this._pendingRafByKey[key] = requestAnimationFrame(() => {
      this._pendingRafByKey[key] = null;

      try {
        render();
      } finally {
        container.removeAttribute('aria-busy');
      }
    });
  }

  // ============================================
  // SISTEMA DE EVENT DELEGATION UNIFICADO
  // ============================================

  /**
   * Configura event delegation genérico para qualquer grid
    * Implementado limpeza correta de handlers para prevenir memory leak
   * @private
   * @param {string} gridKey - Chave do grid nos elements (ex: 'categoryGrid')
   * @param {string} cardSelector - Seletor CSS do card (ex: '.category-item')
   * @param {Function} actionHandler - Função que processa as ações
   */
  _setupEventDelegation(gridKey, cardSelector, actionHandler) {
    const grid = this.elements[gridKey];
    if (!grid) {
      console.warn(`⚠️ Grid não encontrado: ${gridKey}`);
      return;
    }

    const handlerKey = `_${gridKey}Handler`;

    // CRÍTICO: Remove handler antigo ANTES de adicionar novo
    if (this._handlers[handlerKey]) {
      grid.removeEventListener('click', this._handlers[handlerKey]);

      // Liberar referência para garbage collection
      delete this._handlers[handlerKey];

      console.log(`🧹 Handler removido: ${handlerKey}`);
    }

    // Cria novo handler
    this._handlers[handlerKey] = async (e) => {
      const actionBtn = e.target.closest('[data-action]');
      const card = e.target.closest(cardSelector);

      if (!card) return;

      const id = parseInt(card.dataset.id || actionBtn?.dataset.id, 10);
      if (isNaN(id)) return;

      if (actionBtn) {
        // Clique em um botão de ação dentro do card
        e.stopPropagation();
        await actionHandler(actionBtn.dataset.action, id, card, actionBtn);
      } else {
        // Clique no card sem botão de ação = ação de "detalhe"
        await actionHandler('edit', id, card, null);
      }
    };

    // Adiciona novo handler
    grid.addEventListener('click', this._handlers[handlerKey]);
    console.log(`✅ Handler configurado: ${handlerKey}`);
  }

  // ============================================
  // CATEGORIAS
  // ============================================

  /**
   * Renderiza cards de categorias organizados por tipo
   */
  renderCategoryCards(options = {}) {
    // ------------
    // Opções
    // - showLoading: mostrar skeleton antes de renderizar
    // ------------
    const { showLoading = false } = options || {};

    this._renderWithOptionalLoading({
      key: 'categories',
      container: this.elements?.categoryGrid,
      showLoading,
      skeletonCount: 6,
      skeletonCompact: true,
      render: () => this._renderCategoryCardsSync()
    });
  }

  /**
   * Renderização síncrona de categorias (separada para permitir skeleton).
   * @private
   */
  _renderCategoryCardsSync() {
    const { categoryGrid } = this.elements;
    const { categoryStore } = this.stores;
    const { categoryForm } = this.forms;

    try {
      // Setup event delegation
      this._setupEventDelegation('categoryGrid', '.category-item, .category-card', async (action, id) => {
        const category = categoryStore.findById(id);
        if (!category) return;

        if (action === 'edit') {
          categoryForm.openEdit(category.id, category);
        } else if (action === 'delete') {
          // Segurança: não remover categoria se houver lançamentos vinculados
          const usedCount = this._countTransactionsBy((t) => (t.categoryId || null) === category.id);
          if (usedCount > 0) {
            dispatchToast({
              variant: 'warning',
              title: 'Não é possível remover',
              message: `A categoria "${category.name}" está vinculada a ${usedCount} lançamento(s).`,
              id: `category-delete-blocked-${category.id}`
            });

            await this._showInfoModal(
              'Não é possível remover',
              `A categoria "${category.name}" está vinculada a ${usedCount} lançamento(s).\n\nRemova/edite os lançamentos primeiro para não quebrar o histórico.`
            );
            return;
          }

          const confirmed = await this.confirmationModal.show(
            "Remover Categoria",
            `Tem certeza que deseja remover "${category.name}"?`,
            "Remover", "Cancelar"
          );
          if (confirmed) {
            const removed = categoryStore.remove(category.id);
            if (removed) {
              dispatchToast({
                variant: 'success',
                title: 'Categoria removida',
                message: `"${category.name}" removida com sucesso.`,
                id: `category-deleted-${category.id}`
              });
            } else {
              dispatchToast({
                variant: 'error',
                title: 'Falha ao remover',
                message: 'Não foi possível remover a categoria.',
                id: `category-delete-failed-${category.id}`
              });
              return;
            }
            this.renderCategoryCards();
          }
        }
      });

      categoryGrid.innerHTML = "";
      const categories = categoryStore.getAll();

      if (categories.length === 0) {
        categoryGrid.appendChild(this._createEmptyState({
          title: 'Nenhuma categoria cadastrada',
          message: 'Crie categorias de entrada e saída para organizar seus lançamentos.',
          hint: 'Toque no botão "+" e escolha "Categoria".'
        }));
        return;
      }

      // Separar por tipo
      const entradas = categories.filter(c => c.type === "Entrada");
      const saidas = categories.filter(c => c.type === "Saída");
      const fragment = document.createDocumentFragment();

      // Seção Entradas
      if (entradas.length > 0) {
        fragment.appendChild(this._createCategorySection("Entradas", "📥", "income", entradas));
      }

      // Seção Saídas
      if (saidas.length > 0) {
        fragment.appendChild(this._createCategorySection("Saídas", "📤", "expense", saidas));
      }

      categoryGrid.appendChild(fragment);
      this.filterManager?.refreshCategoryOptions();
      console.log(`✅ ${categories.length} categoria(s) renderizada(s)`);
    } catch (error) {
      console.error("❌ Erro ao renderizar categorias:", error);
      categoryGrid.innerHTML = '<div class="error-state">❌ Erro ao carregar categorias</div>';
    }
  }

  /**
   * Cria seção de categorias
   * @private
   */
  _createCategorySection(title, icon, type, items) {
    const section = document.createElement("section");
    section.className = `category-section category-section--${type}`;
    section.innerHTML = `
      <header class="category-section__header">
        <span class="category-section__icon">${icon}</span>
        <h3 class="category-section__title">${title}</h3>
        <span class="category-section__count">${items.length}</span>
      </header>
      <div class="category-section__list"></div>
    `;

    const list = section.querySelector('.category-section__list');
    items.forEach(cat => list.appendChild(this._createCategoryItem(cat)));
    return section;
  }

  /**
   * Cria item de categoria
   * @private
   */
  _createCategoryItem(category) {
    const item = document.createElement("article");
    item.className = "category-item";
    item.dataset.id = category.id;
    item.style.setProperty("--category-color", this._escapeHtml(category.color, "#1fc2c0"));
    item.innerHTML = `
      <div class="category-item__icon" style="background-color:${this._escapeHtml(category.color, "#1fc2c0")}">
        ${this._escapeHtml(category.icon, "📁")}
      </div>
      <div class="category-item__info">
        <span class="category-item__name">${this._escapeHtml(category.name, "Categoria")}</span>
      </div>
      <div class="category-item__actions">
        <button class="category-item__btn" data-action="edit" type="button" title="Editar">✏️</button>
        <button class="category-item__btn category-item__btn--delete" data-action="delete" type="button" title="Remover">🗑️</button>
      </div>
    `;
    return item;
  }

  // ============================================
  // BENEFÍCIOS
  // ============================================

  /**
   * Renderiza cards de benefícios
   */
  renderBenefitCards(options = {}) {
    const { showLoading = false } = options || {};

    this._renderWithOptionalLoading({
      key: 'benefits',
      container: this.elements?.benefitsGrid,
      showLoading,
      skeletonCount: 5,
      skeletonCompact: false,
      render: () => this._renderBenefitCardsSync()
    });
  }

  /**
   * Renderização síncrona de benefícios (separada para permitir skeleton).
   * @private
   */
  _renderBenefitCardsSync() {
    const { benefitsGrid } = this.elements;
    const { benefitStore } = this.stores;
    const { benefitForm } = this.forms;

    try {
      // Setup event delegation
      this._setupEventDelegation('benefitsGrid', '.benefit-card', async (action, id) => {
        const benefit = benefitStore.findById(id);
        if (!benefit) return;

        if (action === 'edit') {
          benefitForm.openEdit(benefit.id, benefit);
        } else if (action === 'delete') {
          // Segurança: não remover benefício se houver lançamentos vinculados
          const usedCount = this._countTransactionsBy((t) => {
            const method = t.paymentMethod || t.category;
            return method === 'beneficio' && (t.sourceId || null) === benefit.id;
          });

          if (usedCount > 0) {
            dispatchToast({
              variant: 'warning',
              title: 'Não é possível remover',
              message: `O benefício "${benefit.name}" está vinculado a ${usedCount} lançamento(s).`,
              id: `benefit-delete-blocked-${benefit.id}`
            });

            await this._showInfoModal(
              'Não é possível remover',
              `O benefício "${benefit.name}" está vinculado a ${usedCount} lançamento(s).\n\nRemova/edite os lançamentos primeiro para evitar inconsistência de saldo.`
            );
            return;
          }

          const confirmed = await this.confirmationModal.show(
            "Remover Benefício",
            `Tem certeza que deseja remover "${benefit.name}"?`,
            "Remover", "Cancelar"
          );
          if (confirmed) {
            const removed = benefitStore.remove(benefit.id);
            if (removed) {
              dispatchToast({
                variant: 'success',
                title: 'Benefício removido',
                message: `"${benefit.name}" removido com sucesso.`,
                id: `benefit-deleted-${benefit.id}`
              });
            } else {
              dispatchToast({
                variant: 'error',
                title: 'Falha ao remover',
                message: 'Não foi possível remover o benefício.',
                id: `benefit-delete-failed-${benefit.id}`
              });
              return;
            }
            this.renderBenefitCards();
            this.statsManager?.updateBenefitStats();
          }
        }
      });

      benefitsGrid.innerHTML = "";
      const benefits = benefitStore.getAll();

      if (benefits.length === 0) {
        benefitsGrid.appendChild(this._createEmptyState({
          title: 'Nenhum benefício cadastrado',
          message: 'Cadastre benefícios (ex.: vale) para controlar limite, uso e recarga.',
          hint: 'Toque no botão "+" e escolha "Benefício".'
        }));
        return;
      }

      const fragment = document.createDocumentFragment();
      benefits.forEach(b => fragment.appendChild(this._createBenefitCard(b)));
      benefitsGrid.appendChild(fragment);

      this.statsManager?.updateBenefitStats();
      console.log(`✅ ${benefits.length} benefício(s) renderizado(s)`);
    } catch (error) {
      console.error("❌ Erro ao renderizar benefícios:", error);
      benefitsGrid.innerHTML = '<div class="error-state">❌ Erro ao carregar benefícios</div>';
    }
  }

  /**
   * Cria card de benefício
   * @private
   */
  _createBenefitCard(benefit) {
    // Garantir que os valores são números
    const limit = parseFloat(benefit.limit) || 0;
    const used = parseFloat(benefit.used) || 0;

    // Cálculo preciso da porcentagem
    // "Livre" acumulável (compatível com legado)
    const explicitAvailable = parseFloat(benefit.available);
    const available = Number.isFinite(explicitAvailable)
      ? Math.max(explicitAvailable, 0)
      : Math.max(limit - used, 0);
    const usagePercent = limit > 0
      ? Math.round((used / limit) * 10000) / 100  // Precisão de 2 casas decimais
      : 0;

    // Garantir que não ultrapassa 100%
    const displayPercent = Math.min(usagePercent, 100);

    const card = document.createElement("article");
    card.className = "benefit-card";
    card.dataset.id = benefit.id;
    card.style.setProperty("--benefit-color", this._escapeHtml(benefit.color, "#1fc2c0"));
    card.innerHTML = `
      <div class="benefit-card__header">
        <div class="benefit-card__icon">${this._escapeHtml(benefit.icon, "🎁")}</div>
        <div class="benefit-card__info">
          <h3 class="benefit-card__name">${this._escapeHtml(benefit.name, "Benefício")}</h3>
          <span class="benefit-card__type">${this._escapeHtml(benefit.type, "Benefício")}</span>
        </div>
      </div>
      <div class="benefit-card__values">
        <div class="benefit-card__value-row">
          <span class="benefit-card__label">Limite</span>
          <span class="benefit-card__amount">${this._formatCurrency(limit)}</span>
        </div>
        <div class="benefit-card__value-row">
          <span class="benefit-card__label">Usado</span>
          <span class="benefit-card__amount">${this._formatCurrency(used)}</span>
        </div>
        <div class="benefit-card__value-row">
          <span class="benefit-card__label">Livre</span>
          <span class="benefit-card__amount benefit-card__amount--available">${this._formatCurrency(available)}</span>
        </div>
      </div>
      <div class="benefit-card__progress">
        <div class="benefit-card__progress-track">
          <div class="benefit-card__progress-fill" style="width: ${displayPercent}%"></div>
        </div>
        <span class="benefit-card__progress-label">${displayPercent.toFixed(1)}% usado</span>
      </div>
      <div class="benefit-card__footer">
        <button class="benefit-card__btn benefit-card__btn--edit" data-action="edit" type="button">✏️ Editar</button>
        <button class="benefit-card__btn benefit-card__btn--delete" data-action="delete" type="button">🗑️ Remover</button>
      </div>
    `;
    return card;
  }

  // ============================================
  // CRÉDITO
  // ============================================

  /**
   * Calcula dias até vencimento
   * @private
    * @deprecated Use creditStore._calculateDueDate() para cálculo correto com ciclos
   */
  _getDaysUntilDue(dueDay) {
    const today = new Date();
    const currentDay = today.getDate();
    let dueDate;

    if (dueDay >= currentDay) {
      dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
    } else {
      dueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    }

    return Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  }

  /**
   * Atualiza alertas de vencimento
    * Usa sistema inteligente de ciclos
   *         Só mostra alerta para cartões com fatura pendente no ciclo ATUAL
   */
  updateDueAlerts() {
    const { creditDueAlert } = this.elements;
    const { creditStore } = this.stores;
    if (!creditDueAlert) return;

    const cards = creditStore.getAll();

    // (não considera gastos do próximo ciclo)
    // Regras:
    // - Só alertar quando faltar 2 dias (ou menos) para o vencimento
    // - Não alertar quando usado == limite
    const alertCards = cards.filter((card) => {
      // Se a fatura do ciclo atual já foi paga, não alertar
      if (card.paidForCurrentCycle) return false;

      // Parse robusto (pt-BR) para evitar falso positivo por string formatada (ex.: "1.200,00")
      const used = clampToZero(parseMoneyToNumber(card.used));
      if (used <= 0) return false;

      const limit = clampToZero(parseMoneyToNumber(card.limit));
      // Tolerância em centavos (evita ruído de ponto flutuante)
      const isUsedEqualLimit = Math.abs(used - limit) < 0.01;
      if (isUsedEqualLimit) return false;

      // Usa o método do store que considera ciclos (ajustado para 2 dias)
      return creditStore.isNearDueDate(card, 2);
    });

    if (alertCards.length === 0) {
      creditDueAlert.style.display = 'none';
      return;
    }

    const alerts = alertCards.map(card => {
      const days = creditStore.getDaysUntilDue(card);
      if (days === 0) return `<strong>${card.name}</strong> vence HOJE!`;
      if (days === 1) return `<strong>${card.name}</strong> vence amanhã`;
      return `<strong>${card.name}</strong> vence em ${days} dias`;
    });

    creditDueAlert.innerHTML = `<span class="due-alert__icon">⚠️</span><span class="due-alert__text">${alerts.join(' • ')}</span>`;
    creditDueAlert.style.display = 'flex';
  }

  /**
   * Renderiza cards de cartões de crédito
   */
  renderCreditCards(options = {}) {
    const { showLoading = false } = options || {};

    this._renderWithOptionalLoading({
      key: 'credit',
      container: this.elements?.creditGrid,
      showLoading,
      skeletonCount: 4,
      skeletonCompact: false,
      render: () => this._renderCreditCardsSync()
    });
  }

  /**
   * Renderização síncrona de crédito (separada para permitir skeleton).
   * @private
   */
  _renderCreditCardsSync() {
    const { creditGrid } = this.elements;
    const { creditStore } = this.stores;
    const { creditForm } = this.forms;

    try {
      // Setup event delegation
      this._setupEventDelegation('creditGrid', '.credit-card', async (action, id) => {
        const card = creditStore.findById(id);
        if (!card) return;

        if (action === 'edit') {
          creditForm.openEdit(card.id, card);
        } else if (action === 'delete') {
          // Segurança: não remover cartão se houver lançamentos vinculados
          const usedCount = this._countTransactionsBy((t) => {
            const method = t.paymentMethod || t.category;
            if (method === 'credito' && (t.sourceId || null) === card.id) return true;
            if (method === 'pagar-credito' && (t.targetId || null) === card.id) return true;
            return false;
          });

          if (usedCount > 0) {
            dispatchToast({
              variant: 'warning',
              title: 'Não é possível remover',
              message: `O cartão "${card.name}" está vinculado a ${usedCount} lançamento(s).`,
              id: `credit-delete-blocked-${card.id}`
            });

            await this._showInfoModal(
              'Não é possível remover',
              `O cartão "${card.name}" está vinculado a ${usedCount} lançamento(s).\n\nRemova/edite os lançamentos primeiro para não quebrar faturas e histórico.`
            );
            return;
          }

          const confirmed = await this.confirmationModal.show(
            "Remover Cartão",
            `Tem certeza que deseja remover "${card.name}"?`,
            "Remover", "Cancelar"
          );
          if (confirmed) {
            const removed = creditStore.remove(card.id);
            if (removed) {
              dispatchToast({
                variant: 'success',
                title: 'Cartão removido',
                message: `"${card.name}" removido com sucesso.`,
                id: `credit-deleted-${card.id}`
              });
            } else {
              dispatchToast({
                variant: 'error',
                title: 'Falha ao remover',
                message: 'Não foi possível remover o cartão.',
                id: `credit-delete-failed-${card.id}`
              });
              return;
            }
            this.renderCreditCards();
            this.statsManager?.updateCreditStats();
          }
        } else if (action === 'payment') {
          await this._handleCreditPayment(card);
        }
      });

      creditGrid.innerHTML = "";
      this.updateDueAlerts();
      const cards = creditStore.getAll();

      if (cards.length === 0) {
        creditGrid.appendChild(this._createEmptyState({
          title: 'Nenhum cartão de crédito cadastrado',
          message: 'Cadastre seus cartões para acompanhar limite, gastos e vencimento.',
          hint: 'Toque no botão "+" para adicionar o primeiro cartão.'
        }));
        return;
      }

      const fragment = document.createDocumentFragment();
      cards.forEach(c => fragment.appendChild(this._createCreditCard(c)));
      creditGrid.appendChild(fragment);

      this.statsManager?.updateCreditStats();
      console.log(`✅ ${cards.length} cartão(ões) de crédito renderizado(s)`);
    } catch (error) {
      console.error("❌ Erro ao renderizar cartões de crédito:", error);
      creditGrid.innerHTML = '<div class="error-state">❌ Erro ao carregar cartões de crédito</div>';
    }
  }

  /**
   * Cria card de crédito
    * Mostra status do ciclo de fatura (pago/pendente) e indica gastos do próximo ciclo
   * @private
   */
  _createCreditCard(card) {
    const { creditStore } = this.stores;

    // Garantir que os valores são números
    const limit = clampToZero(parseMoneyToNumber(card.limit));
    const used = clampToZero(parseMoneyToNumber(card.used));

    // Cálculo preciso da porcentagem
    const available = Math.max(limit - used, 0);
    const usagePercent = limit > 0
      ? Math.round((used / limit) * 10000) / 100  // Precisão de 2 casas decimais
      : 0;

    // Garantir que não ultrapassa 100%
    const displayPercent = Math.min(usagePercent, 100);
    const cycleInfo = creditStore.getBillingCycleInfo(card);
    const isPaidForCycle = cycleInfo.isPaidForCurrentCycle;
    const hasNextCycleExpenses = cycleInfo.hasNextCycleExpenses;
    let cycleStatusClass = '';
    let cycleStatusText = '';
    let cycleStatusIcon = '';

    if (isPaidForCycle && used > 0) {
      // Fatura paga, mas há gastos novos (são do próximo ciclo)
      cycleStatusClass = 'credit-card__cycle--next';
      cycleStatusIcon = '🔄';
      cycleStatusText = `Gastos do próximo ciclo`;
    } else if (isPaidForCycle) {
      // Fatura paga, sem gastos novos
      cycleStatusClass = 'credit-card__cycle--paid';
      cycleStatusIcon = '✅';
      cycleStatusText = `Fatura paga`;
    } else if (used > 0) {
      // Fatura pendente
      cycleStatusClass = 'credit-card__cycle--pending';
      cycleStatusIcon = '⏳';
      cycleStatusText = `Fatura pendente`;
    } else {
      // Sem gastos
      cycleStatusClass = 'credit-card__cycle--clear';
      cycleStatusIcon = '✨';
      cycleStatusText = `Sem gastos`;
    }

    const el = document.createElement("article");
    el.className = "credit-card";
    el.dataset.id = card.id;
    el.style.setProperty("--credit-color", this._escapeHtml(card.color, "#1fc2c0"));
    el.innerHTML = `
      <div class="credit-card__header">
        <div class="credit-card__icon">${this._escapeHtml(card.icon, "💳")}</div>
        <div class="credit-card__info">
          <h3 class="credit-card__name">${this._escapeHtml(card.name, "Cartão")}</h3>
          <span class="credit-card__type">💳 Cartão de Crédito</span>
        </div>
      </div>
      <div class="credit-card__values">
        <div class="credit-card__value-row">
          <span class="credit-card__label">Limite</span>
          <span class="credit-card__amount">${this._formatCurrency(limit)}</span>
        </div>
        <div class="credit-card__value-row">
          <span class="credit-card__label">${hasNextCycleExpenses ? 'Próximo ciclo' : 'Usado'}</span>
          <span class="credit-card__amount">${this._formatCurrency(used)}</span>
        </div>
        <div class="credit-card__value-row">
          <span class="credit-card__label">Disponível</span>
          <span class="credit-card__amount credit-card__amount--available">${this._formatCurrency(available)}</span>
        </div>
      </div>
      <div class="credit-card__progress">
        <div class="credit-card__progress-track">
          <div class="credit-card__progress-fill" style="width: ${displayPercent}%"></div>
        </div>
        <span class="credit-card__progress-label">${displayPercent.toFixed(1)}% usado</span>
      </div>
      <div class="credit-card__due-info">
        <span class="credit-card__due-label">📅 Vencimento: dia ${card.dueDay || 10}</span>
        <span class="credit-card__cycle-status ${cycleStatusClass}">${cycleStatusIcon} ${cycleStatusText}</span>
      </div>
      <div class="credit-card__footer">
        <button class="credit-card__btn credit-card__btn--payment" data-action="payment" type="button" ${isPaidForCycle && used <= 0 ? 'disabled' : ''}>💵 Pagar Fatura</button>
        <button class="credit-card__btn credit-card__btn--edit" data-action="edit" type="button">✏️</button>
        <button class="credit-card__btn credit-card__btn--delete" data-action="delete" type="button">🗑️</button>
      </div>
    `;
    return el;
  }

  /**
   * Processa pagamento de fatura de crédito
   * @private
   */
  async _handleCreditPayment(cardParam) {
    const { creditStore, debitStore, transactionStore } = this.stores;

    // CRÍTICO: Buscar cartão atualizado do store (não usar a referência do parâmetro)
    const card = creditStore.getById(cardParam.id);
    if (!card) {
      console.error('❌ Cartão não encontrado no store:', cardParam.id);
      return;
    }

    // Compatibilidade: card.used pode vir como string (ex.: "0,00")
    const usedNow = clampToZero(parseMoneyToNumber(card.used));
    if (usedNow <= 0) {
      await this.confirmationModal.show("Sem Fatura", `O cartão "${card.name}" não possui fatura pendente.`, "OK", "Fechar");
      return;
    }

    const debitAccounts = debitStore.getAll();
    if (debitAccounts.length === 0) {
      await this.confirmationModal.show("Sem Conta de Débito", "Você precisa criar uma conta de débito para pagar a fatura.", "OK", "Fechar");
      return;
    }

    const selectorResult = await this._showDebitAccountSelector(debitAccounts, card);
    if (!selectorResult) return;

    // Buscar dados atualizados antes de calcular o valor a pagar
    const cardId = card.id;
    const accountId = selectorResult.account?.id;
    const requestedAmount = selectorResult.amount;
    const currentCard = creditStore.getById(cardId);
    const currentAccount = debitStore.getById(accountId);

    if (!currentCard || !currentAccount) {
      console.error('❌ Dados não encontrados para pagamento:', { cardId, accountId });
      return;
    }

    // ==================================================
    // REGRA: pagamento com valor digitado
    // - Usuário escolhe quanto pagar.
    // - Nunca paga acima da fatura.
    // - Nunca deixa débito negativo.
    // - Cartão reduz o "usado" apenas pelo valor pago.
    // ==================================================
    // Compatibilidade: currentCard.used pode vir como string com vírgula
    const invoiceValue = Math.max(0, clampToZero(parseMoneyToNumber(currentCard.used)));
    const debitBalance = Math.max(0, parseFloat(currentAccount.balance) || 0);
    const requested = Math.max(0, parseFloat(requestedAmount) || 0);
    const valorPago = Math.min(invoiceValue, debitBalance, requested);

    if (debitBalance <= 0) {
      await this.confirmationModal.show(
        "Saldo Insuficiente",
        `A conta "${currentAccount.name}" está com saldo ${this._formatCurrency(currentAccount.balance)}.\n\nNão é possível pagar a fatura com saldo zerado.`,
        "OK", "Fechar"
      );
      return;
    }

    // Segurança: se a fatura for maior que o saldo, o pagamento será parcial por definição.
    // Aqui não exigimos confirmação extra porque o usuário já digitou o valor e vê o saldo.

    if (!Number.isFinite(valorPago) || valorPago <= 0) {
      console.warn('⚠️ Pagamento: valor calculado inválido', { valorPago, invoiceValue, debitBalance });
      return;
    }

    const now = new Date().toISOString();
    // Lançamento 1: ENTRADA no crédito (devolve o limite usado)
    const entradaCreditoTransaction = {
      name: `Pagamento Recebido - ${currentCard.name}`,
      description: `Entrada referente ao pagamento da fatura do cartão ${currentCard.name}`,
      type: 'entrada',
      categoryId: null,
      categoryName: 'Pagamento de Fatura',
      categoryIcon: '💳',
      categoryColor: '#4caf50',
      paymentMethod: 'credito',
      sourceId: cardId, // Crédito recebe
      sourceName: currentCard.name,
      targetId: null,
      targetName: null,
      value: valorPago,
      originalValue: valorPago,
      date: now,
      createdAt: now,
      metadata: {
        paymentType: 'invoice-payment-credit-entry',
        linkedPayment: true, // MARCADOR: transação vinculada
        isPartialPayment: valorPago < invoiceValue,
        invoiceValue,
        remainingInvoice: Math.max(0, invoiceValue - valorPago),
        creditCardLimit: currentCard.limit,
        creditCardUsedBefore: currentCard.used,
        creditCardUsedAfter: Math.max(0, (parseFloat(currentCard.used) || 0) - valorPago)
      }
    };

    // Lançamento 2: SAÍDA no débito (desconta o pagamento)
    const saidaDebitoTransaction = {
      name: `Pagamento de Fatura - ${currentCard.name}`,
      description: `Pagamento da fatura do cartão ${currentCard.name} com a conta ${currentAccount.name}`,
      type: 'saida',
      categoryId: null,
      categoryName: 'Pagamento de Fatura',
      categoryIcon: '💳',
      categoryColor: '#ff9fac',
      paymentMethod: 'debito',
      sourceId: accountId, // Débito paga
      sourceName: currentAccount.name,
      targetId: null,
      targetName: null,
      value: valorPago,
      originalValue: valorPago,
      date: now,
      createdAt: now,
      metadata: {
        paymentType: 'invoice-payment-debit-exit',
        linkedPayment: true, // MARCADOR: transação vinculada
        isPartialPayment: valorPago < invoiceValue,
        invoiceValue,
        remainingInvoice: Math.max(0, invoiceValue - valorPago),
        debitBalanceBefore: currentAccount.balance,
        debitBalanceAfter: Math.max(0, (parseFloat(currentAccount.balance) || 0) - valorPago)
      }
    };

    // Adicionar AMBAS as transações
    const addedEntrada = transactionStore?.add(entradaCreditoTransaction);
    const addedSaida = transactionStore?.add(saidaDebitoTransaction);

    if (!addedEntrada || !addedSaida) {
      console.error('❌ Erro ao criar transações de pagamento');
      if (addedEntrada) transactionStore.remove(addedEntrada.id);
      if (addedSaida) transactionStore.remove(addedSaida.id);
      return;
    }

    // VINCULAR as duas transações (uma aponta para a outra)
    transactionStore.update(addedEntrada.id, {
      linkedTransactionId: addedSaida.id
    });
    transactionStore.update(addedSaida.id, {
      linkedTransactionId: addedEntrada.id
    });

    // Aplicar valores usando TransactionManager
    if (this.transactionManager) {
      const entradaSuccess = this.transactionManager.applyValues(addedEntrada);
      const saidaSuccess = this.transactionManager.applyValues(addedSaida);

      if (entradaSuccess && saidaSuccess) {
        console.log('✅ Pagamento processado com sucesso:');
        console.log('  📥 Entrada no crédito:', addedEntrada);
        console.log('  📤 Saída no débito:', addedSaida);

        // ==================================================
        // AUDITORIA: registrar pagamento (uma única entrada)
        // ==================================================
        this.auditManager?.logInvoicePayment({
          creditCardName: currentCard.name,
          debitAccountName: currentAccount.name,
          value: valorPago,
          isPartial: valorPago < invoiceValue
        });

        // FORÇAR re-renderização
        setTimeout(() => {
          this.renderCreditCards();
          this.renderDebitCards();
          this.renderTransactions();
          this.statsManager?.updateAll();
        }, 50);

        console.log(`✅ Fatura "${currentCard.name}" paga com "${currentAccount.name}"`);
      } else {
        console.error('❌ Falha ao aplicar valores das transações');
        // Rollback: remover ambas
        this.transactionManager.revertValues(addedEntrada);
        this.transactionManager.revertValues(addedSaida);
        transactionStore.remove(addedEntrada.id);
        transactionStore.remove(addedSaida.id);
      }
    } else {
      console.error('❌ TransactionManager não disponível');
      transactionStore.remove(addedEntrada.id);
      transactionStore.remove(addedSaida.id);
    }
  }

  /**
   * Modal de seleção de conta de débito
   * @private
   */
  _showDebitAccountSelector(accounts, card) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "debit-selector-modal";

      // ================================
      // Formatação/parse monetário pt-BR
      // - Formata durante digitação: "1200" -> "1.200,00"
      // - Parse robusto com milhar e vírgula: "1.200,00" -> 1200
      // ================================

      modal.innerHTML = `
        <div class="debit-selector-modal__overlay"></div>
        <div class="debit-selector-modal__content">
          <header class="debit-selector-modal__header">
            <h3 class="debit-selector-modal__title">💳 Pagar Fatura</h3>
            <p class="debit-selector-modal__subtitle">Fatura: ${this._formatCurrency(card.used)}</p>
          </header>
          <div class="debit-selector-modal__body">
            <p class="debit-selector-modal__instruction">Selecione a conta para débito:</p>
            <div class="debit-selector-modal__accounts">
              ${accounts.map(acc => `
                <label class="debit-selector-modal__account ${acc.balance < card.used ? 'debit-selector-modal__account--insufficient' : ''}">
                  <input type="radio" name="debit-account" value="${acc.id}">
                  <span class="debit-selector-modal__account-icon">${this._escapeHtml(acc.icon)}</span>
                  <span class="debit-selector-modal__account-info">
                    <span class="debit-selector-modal__account-name">${this._escapeHtml(acc.name)}</span>
                    <span class="debit-selector-modal__account-balance">${this._formatCurrency(acc.balance)}</span>
                  </span>
                  ${acc.balance < card.used ? '<span class="debit-selector-modal__account-warning">Saldo insuficiente p/ pagar tudo</span>' : '<span class="debit-selector-modal__account-check">✓</span>'}
                </label>
              `).join('')}
            </div>

            <div class="debit-selector-modal__payment-amount">
              <label class="debit-selector-modal__payment-amount-label" for="invoice-payment-amount">Valor a pagar:</label>
              <input
                id="invoice-payment-amount"
                class="debit-selector-modal__payment-amount-input"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="Ex: 50,00"
              />
              <small class="debit-selector-modal__payment-amount-hint"></small>
            </div>
          </div>
          <footer class="debit-selector-modal__footer">
            <button type="button" class="debit-selector-modal__btn debit-selector-modal__btn--cancel">Cancelar</button>
            <button type="button" class="debit-selector-modal__btn debit-selector-modal__btn--confirm" disabled>Pagar</button>
          </footer>
        </div>
      `;

      document.body.appendChild(modal);

      const confirmBtn = modal.querySelector('.debit-selector-modal__btn--confirm');
      const amountInput = modal.querySelector('#invoice-payment-amount');
      const amountHint = modal.querySelector('.debit-selector-modal__payment-amount-hint');

      const getSelectedAccount = () => {
        const sel = modal.querySelector('input[name="debit-account"]:checked');
        if (!sel) return null;
        const id = parseInt(sel.value, 10);
        return accounts.find(a => a.id === id) || null;
      };

      const getMaxPayableForAccount = (acc) => {
        const invoiceValue = Math.max(0, parseFloat(card.used) || 0);
        const debitBalance = Math.max(0, parseFloat(acc?.balance) || 0);
        return Math.min(invoiceValue, debitBalance);
      };

      const setDefaultAmountForAccount = (acc) => {
        const maxPayable = getMaxPayableForAccount(acc);
        // Valor padrão: tenta pagar o máximo possível (fatura ou saldo, o menor)
        amountInput.value = maxPayable > 0 ? formatCurrencySimple(maxPayable) : '';
      };

      const updateAmountHint = () => {
        const acc = getSelectedAccount();
        const maxPayable = getMaxPayableForAccount(acc);
        amountHint.textContent = acc
          ? `Máximo: ${this._formatCurrency(maxPayable)} (limitado pela fatura e pelo saldo da conta)`
          : 'Selecione uma conta para definir o máximo.';
      };

      const updateConfirmState = () => {
        const acc = getSelectedAccount();
        if (!acc) {
          confirmBtn.disabled = true;
          return;
        }

        const maxPayable = getMaxPayableForAccount(acc);
        const amount = parseCurrencyInput(amountInput.value);

        const isValid = Number.isFinite(amount) && amount > 0 && amount <= maxPayable;
        confirmBtn.disabled = !isValid;
      };

      // Pré-seleção inteligente: primeira conta com saldo > 0
      const firstWithBalance = accounts.find(a => (parseFloat(a.balance) || 0) > 0);
      const preselect = firstWithBalance
        ? modal.querySelector(`input[name="debit-account"][value="${firstWithBalance.id}"]`)
        : null;

      if (preselect) {
        preselect.checked = true;
        setDefaultAmountForAccount(firstWithBalance);
      }

      updateAmountHint();
      updateConfirmState();

      const cleanup = () => {
        modal.classList.add("debit-selector-modal--closing");
        setTimeout(() => modal.remove(), 200);
      };

      modal.querySelectorAll('input[name="debit-account"]').forEach(r => {
        r.addEventListener("change", () => {
          const acc = getSelectedAccount();
          if (acc) {
            // Ao trocar a conta, ajusta o valor digitado para o máximo daquela conta.
            setDefaultAmountForAccount(acc);
          }
          updateAmountHint();
          updateConfirmState();
        });
      });

      amountInput.addEventListener('input', (e) => {
        // Máscara: garante separadores "." e "," enquanto digita
        e.target.value = formatCurrencyInput(e.target.value);
        updateConfirmState();
      });

      modal.querySelector(".debit-selector-modal__overlay").addEventListener("click", () => { cleanup(); resolve(null); });
      modal.querySelector(".debit-selector-modal__btn--cancel").addEventListener("click", () => { cleanup(); resolve(null); });
      modal.querySelector(".debit-selector-modal__btn--confirm").addEventListener("click", () => {
        const acc = getSelectedAccount();
        if (!acc) return;

        const maxPayable = getMaxPayableForAccount(acc);
        const amount = parseCurrencyInput(amountInput.value);
        if (!Number.isFinite(amount) || amount <= 0) return;

        // Clamp final (segurança): garante que não ultrapasse fatura/saldo.
        const clampedAmount = Math.min(amount, maxPayable);

        cleanup();
        resolve({ account: acc, amount: clampedAmount });
      });

      requestAnimationFrame(() => modal.classList.add("debit-selector-modal--active"));
    });
  }

  /**
   * Modal de transferência entre contas de débito
   * - Seleciona destino
   * - Permite enviar saldo total ou valor digitado
   * @private
   */
  _showDebitTransferSelector(destinationAccounts, sourceAccount) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'debit-selector-modal';

      // ================================
      // Formatação/parse monetário pt-BR
      // ================================

      const sourceBalance = Math.max(0, parseFloat(sourceAccount?.balance) || 0);

      modal.innerHTML = `
        <div class="debit-selector-modal__overlay"></div>
        <div class="debit-selector-modal__content">
          <header class="debit-selector-modal__header">
            <h3 class="debit-selector-modal__title">🔄 Transferir</h3>
            <p class="debit-selector-modal__subtitle">Origem: ${this._escapeHtml(sourceAccount?.name || 'Conta')} • Saldo: ${this._formatCurrency(sourceBalance)}</p>
          </header>
          <div class="debit-selector-modal__body">
            <p class="debit-selector-modal__instruction">Selecione a conta de destino:</p>
            <div class="debit-selector-modal__accounts">
              ${destinationAccounts.map(acc => `
                <label class="debit-selector-modal__account">
                  <input type="radio" name="transfer-destination" value="${acc.id}">
                  <span class="debit-selector-modal__account-icon">${this._escapeHtml(acc.icon)}</span>
                  <span class="debit-selector-modal__account-info">
                    <span class="debit-selector-modal__account-name">${this._escapeHtml(acc.name)}</span>
                    <span class="debit-selector-modal__account-balance">${this._formatCurrency(acc.balance)}</span>
                  </span>
                  <span class="debit-selector-modal__account-check">✓</span>
                </label>
              `).join('')}
            </div>

            <div class="debit-selector-modal__amount-mode">
              <p class="debit-selector-modal__amount-mode-title">Valor:</p>
              <label class="debit-selector-modal__amount-mode-option">
                <input type="radio" name="transfer-amount-mode" value="total" checked>
                <span>Enviar saldo total</span>
              </label>
              <label class="debit-selector-modal__amount-mode-option">
                <input type="radio" name="transfer-amount-mode" value="custom">
                <span>Digitar valor</span>
              </label>
            </div>

            <div class="debit-selector-modal__payment-amount">
              <label class="debit-selector-modal__payment-amount-label" for="debit-transfer-amount">Valor a transferir:</label>
              <input
                id="debit-transfer-amount"
                class="debit-selector-modal__payment-amount-input"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="Ex: 50,00"
                disabled
              />
              <small class="debit-selector-modal__payment-amount-hint"></small>
            </div>
          </div>
          <footer class="debit-selector-modal__footer">
            <button type="button" class="debit-selector-modal__btn debit-selector-modal__btn--cancel">Cancelar</button>
            <button type="button" class="debit-selector-modal__btn debit-selector-modal__btn--confirm" disabled>Transferir</button>
          </footer>
        </div>
      `;

      document.body.appendChild(modal);

      const confirmBtn = modal.querySelector('.debit-selector-modal__btn--confirm');
      const amountInput = modal.querySelector('#debit-transfer-amount');
      const amountHint = modal.querySelector('.debit-selector-modal__payment-amount-hint');

      const getSelectedDestination = () => {
        const sel = modal.querySelector('input[name="transfer-destination"]:checked');
        if (!sel) return null;
        const id = parseInt(sel.value, 10);
        return destinationAccounts.find(a => a.id === id) || null;
      };

      const getAmountMode = () => {
        const sel = modal.querySelector('input[name="transfer-amount-mode"]:checked');
        return sel?.value || 'total';
      };

      const getMaxTransferable = () => {
        // Segurança: transferência nunca pode ultrapassar o saldo atual da conta de origem.
        return Math.max(0, parseFloat(sourceAccount?.balance) || 0);
      };

      const setDefaultAmount = () => {
        const max = getMaxTransferable();
        amountInput.value = max > 0 ? formatCurrencySimple(max) : '';
      };

      const updateAmountHint = () => {
        const max = getMaxTransferable();
        amountHint.textContent = `Máximo: ${this._formatCurrency(max)} (saldo da conta de origem)`;
      };

      const updateAmountInputState = () => {
        const mode = getAmountMode();
        if (mode === 'total') {
          amountInput.disabled = true;
          setDefaultAmount();
        } else {
          amountInput.disabled = false;
          if (!amountInput.value) setDefaultAmount();
        }
      };

      const updateConfirmState = () => {
        const dest = getSelectedDestination();
        if (!dest) {
          confirmBtn.disabled = true;
          return;
        }

        const mode = getAmountMode();
        const max = getMaxTransferable();
        if (max <= 0) {
          confirmBtn.disabled = true;
          return;
        }

        if (mode === 'total') {
          confirmBtn.disabled = !(max > 0);
          return;
        }

        const amount = parseCurrencyInput(amountInput.value);
        const isValid = Number.isFinite(amount) && amount > 0 && amount <= max;
        confirmBtn.disabled = !isValid;
      };

      const cleanup = () => {
        modal.classList.add('debit-selector-modal--closing');
        setTimeout(() => modal.remove(), 200);
      };

      // Estado inicial
      updateAmountHint();
      updateAmountInputState();
      updateConfirmState();

      modal.querySelectorAll('input[name="transfer-destination"]').forEach(r => {
        r.addEventListener('change', () => {
          updateConfirmState();
        });
      });

      modal.querySelectorAll('input[name="transfer-amount-mode"]').forEach(r => {
        r.addEventListener('change', () => {
          updateAmountHint();
          updateAmountInputState();
          updateConfirmState();
        });
      });

      amountInput.addEventListener('input', (e) => {
        // Máscara: garante separadores "." e "," enquanto digita
        e.target.value = formatCurrencyInput(e.target.value);
        updateConfirmState();
      });

      modal.querySelector('.debit-selector-modal__overlay').addEventListener('click', () => { cleanup(); resolve(null); });
      modal.querySelector('.debit-selector-modal__btn--cancel').addEventListener('click', () => { cleanup(); resolve(null); });
      modal.querySelector('.debit-selector-modal__btn--confirm').addEventListener('click', () => {
        const dest = getSelectedDestination();
        if (!dest) return;

        const mode = getAmountMode();
        const max = getMaxTransferable();
        if (max <= 0) return;

        let amount = max;
        if (mode === 'custom') {
          const parsed = parseCurrencyInput(amountInput.value);
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          amount = Math.min(parsed, max);
        }

        cleanup();
        resolve({ account: dest, amount });
      });

      requestAnimationFrame(() => modal.classList.add('debit-selector-modal--active'));
    });
  }

  // ============================================
  // DÉBITO
  // ============================================

  /**
   * Renderiza cards de contas de débito
   */
  renderDebitCards(options = {}) {
    const { showLoading = false } = options || {};

    this._renderWithOptionalLoading({
      key: 'debit',
      container: this.elements?.debitGrid,
      showLoading,
      skeletonCount: 4,
      skeletonCompact: false,
      render: () => this._renderDebitCardsSync()
    });
  }

  /**
   * Renderização síncrona de débito (separada para permitir skeleton).
   * @private
   */
  _renderDebitCardsSync() {
    const { debitGrid } = this.elements;
    const { debitStore } = this.stores;
    const { debitForm } = this.forms;

    try {
      // Setup event delegation
      this._setupEventDelegation('debitGrid', '.debit-card', async (action, id) => {
        const card = debitStore.findById(id);
        if (!card) return;

        if (action === 'edit') {
          debitForm.openEdit(card.id, card);
        } else if (action === 'transfer') {
          await this._handleDebitTransfer(card);
        } else if (action === 'delete') {
          // Segurança: não remover conta se houver lançamentos vinculados
          const usedCount = this._countTransactionsBy((t) => {
            const method = t.paymentMethod || t.category;
            if (method === 'debito' && (t.sourceId || null) === card.id) return true;
            if (method === 'pagar-credito' && (t.sourceId || null) === card.id) return true;
            return false;
          });

          if (usedCount > 0) {
            dispatchToast({
              variant: 'warning',
              title: 'Não é possível remover',
              message: `A conta "${card.name}" está vinculada a ${usedCount} lançamento(s).`,
              id: `debit-delete-blocked-${card.id}`
            });

            await this._showInfoModal(
              'Não é possível remover',
              `A conta "${card.name}" está vinculada a ${usedCount} lançamento(s).\n\nRemova/edite os lançamentos primeiro para evitar inconsistência de saldo.`
            );
            return;
          }

          const confirmed = await this.confirmationModal.show(
            "Remover Conta/Dinheiro",
            `Tem certeza que deseja remover "${card.name}"?`,
            "Remover", "Cancelar"
          );
          if (confirmed) {
            const removed = debitStore.remove(card.id);
            if (removed) {
              dispatchToast({
                variant: 'success',
                title: 'Conta removida',
                message: `"${card.name}" removida com sucesso.`,
                id: `debit-deleted-${card.id}`
              });
            } else {
              dispatchToast({
                variant: 'error',
                title: 'Falha ao remover',
                message: 'Não foi possível remover a conta.',
                id: `debit-delete-failed-${card.id}`
              });
              return;
            }
            this.renderDebitCards();
            this.statsManager?.updateDebitStats();
          }
        }
      });

      debitGrid.innerHTML = "";
      const cards = debitStore.getAll();

      if (cards.length === 0) {
        debitGrid.appendChild(this._createEmptyState({
          title: 'Nenhuma conta de débito cadastrada',
          message: 'Cadastre suas contas/dinheiro para controlar saldos e transferências.',
          hint: 'Toque no botão "+" para adicionar a primeira conta.'
        }));
        return;
      }

      const fragment = document.createDocumentFragment();
      cards.forEach(c => fragment.appendChild(this._createDebitCard(c)));
      debitGrid.appendChild(fragment);

      this.statsManager?.updateDebitStats();
      console.log(`✅ ${cards.length} conta(s) de débito renderizada(s)`);
    } catch (error) {
      console.error("❌ Erro ao renderizar contas de débito:", error);
      debitGrid.innerHTML = '<div class="error-state">❌ Erro ao carregar contas de débito</div>';
    }
  }

  /**
   * Cria card de débito
   * @private
   */
  _createDebitCard(card) {
    const el = document.createElement("article");
    el.className = "debit-card";
    el.dataset.id = card.id;
    el.style.setProperty("--debit-color", this._escapeHtml(card.color, "#1fc2c0"));
    el.innerHTML = `
      <div class="debit-card__header">
        <div class="debit-card__icon">${this._escapeHtml(card.icon, "🏦")}</div>
        <div class="debit-card__info">
          <h3 class="debit-card__name">${this._escapeHtml(card.name, "Conta")}</h3>
          <span class="debit-card__type">💵 Conta/Dinheiro</span>
        </div>
      </div>
      <div class="debit-card__values">
        <div class="debit-card__value-row">
          <span class="debit-card__label">Saldo</span>
          <span class="debit-card__amount debit-card__amount--balance">${this._formatCurrency(card.balance || 0)}</span>
        </div>
      </div>
      <div class="debit-card__footer">
        <button class="debit-card__btn debit-card__btn--transfer" data-action="transfer" type="button">🔄 Transferir</button>
        <button class="debit-card__btn debit-card__btn--edit" data-action="edit" type="button">✏️ Editar</button>
        <button class="debit-card__btn debit-card__btn--delete" data-action="delete" type="button">🗑️ Remover</button>
      </div>
    `;
    return el;
  }

  /**
   * Transfere saldo entre duas contas de débito
   * - Cria 2 lançamentos vinculados (saída na origem + entrada no destino)
   * - Não permite saldo negativo na origem
   * @private
   */
  async _handleDebitTransfer(cardParam) {
    const { debitStore, transactionStore } = this.stores;

    // Segurança: sempre usar dados atualizados do store
    const getDebitById = (id) => (debitStore.getById ? debitStore.getById(id) : debitStore.findById(id));
    const source = getDebitById(cardParam.id);
    if (!source) return;

    const sourceBalance = Math.max(0, parseFloat(source.balance) || 0);
    if (sourceBalance <= 0) {
      await this._showInfoModal(
        'Saldo insuficiente',
        `A conta "${source.name}" está com saldo ${this._formatCurrency(source.balance)}.\n\nNão é possível transferir com saldo zerado.`
      );
      return;
    }

    const allAccounts = debitStore.getAll();
    const destinations = allAccounts.filter(a => a.id !== source.id);
    if (destinations.length === 0) {
      await this._showInfoModal(
        'Sem conta de destino',
        'Você precisa ter pelo menos 2 contas de débito para transferir valores.'
      );
      return;
    }

    const selectorResult = await this._showDebitTransferSelector(destinations, source);
    if (!selectorResult) return;

    const targetId = selectorResult.account?.id;
    const requestedAmount = selectorResult.amount;

    const currentSource = getDebitById(source.id);
    const currentTarget = getDebitById(targetId);
    if (!currentSource || !currentTarget) {
      console.error('❌ Transferência: contas não encontradas', { sourceId: source.id, targetId });
      return;
    }

    const maxTransferable = Math.max(0, parseFloat(currentSource.balance) || 0);
    const requested = Math.max(0, parseFloat(requestedAmount) || 0);
    const value = Math.min(maxTransferable, requested);

    if (!Number.isFinite(value) || value <= 0) {
      console.warn('⚠️ Transferência: valor inválido', { value, maxTransferable, requested });
      return;
    }

    const now = new Date().toISOString();

    // Lançamento ÚNICO: TRANSFERÊNCIA (neutro no extrato)
    const transferencia = {
      name: `Transferência - ${currentSource.name} → ${currentTarget.name}`,
      description: `Transferência de ${currentSource.name} para ${currentTarget.name}`,
      type: 'transferencia',
      categoryId: null,
      categoryName: 'Transferência',
      categoryIcon: '🔄',
      categoryColor: '#1fc2c0',
      paymentMethod: 'transferencia',
      sourceId: currentSource.id,
      sourceName: currentSource.name,
      targetId: currentTarget.id,
      targetName: currentTarget.name,
      value,
      originalValue: value,
      date: now,
      createdAt: now,
      metadata: {
        // Marcar como transferência para regras e estatísticas
        isTransfer: true,
        transferFromId: currentSource.id,
        transferFromName: currentSource.name,
        transferToId: currentTarget.id,
        transferToName: currentTarget.name,
        sourceBalanceBefore: currentSource.balance,
        sourceBalanceAfter: Math.max(0, (parseFloat(currentSource.balance) || 0) - value),
        targetBalanceBefore: currentTarget.balance,
        targetBalanceAfter: (parseFloat(currentTarget.balance) || 0) + value
      }
    };

    const added = transactionStore?.add(transferencia);
    if (!added) {
      console.error('❌ Transferência: erro ao criar lançamento');
      return;
    }

    if (!this.transactionManager) {
      console.error('❌ Transferência: TransactionManager não disponível');
      transactionStore.remove(added.id);
      return;
    }

    const success = this.transactionManager.applyValues(added);

    if (success) {
      // ==================================================
      // AUDITORIA: registrar transferência (uma única entrada)
      // ==================================================
      this.auditManager?.logTransfer({
        fromName: currentSource.name,
        toName: currentTarget.name,
        value
      });

      setTimeout(() => {
        this.renderDebitCards();
        this.renderTransactions();
        this.statsManager?.updateAll();
      }, 50);
      return;
    }

    // Rollback: reverter e remover
    this.transactionManager.revertValues(added);
    transactionStore.remove(added.id);

    await this._showInfoModal(
      'Não foi possível transferir',
      'Falha ao aplicar os valores da transferência.\n\nNada foi salvo para evitar inconsistência.'
    );
  }

  // ============================================
  // TRANSAÇÕES
  // ============================================

  /**
   * Cria elemento de transação
   * @private
   */
  _createTransactionElement(transaction) {
    const { creditStore } = this.stores;
    const sourceName = this.transactionManager.getSourceName(transaction) || "Transação";
    const sourceColor = this.transactionManager.getSourceColor(transaction) || "#1fc2c0";
    const formattedDate = TransactionStore.formatDate(transaction.date);
    const paymentMethod = transaction.paymentMethod || transaction.category || "debito";
    const transactionType = transaction.type || "saida";
    const isTransfer = transactionType === 'transferencia' || !!transaction?.metadata?.isTransfer;

    let categoryLabel = '';
    if (transaction.categoryName && transaction.categoryName !== 'null') {
      categoryLabel = `${this._escapeHtml(transaction.categoryIcon, "📝")} ${this._escapeHtml(transaction.categoryName, "Categoria")}`;
    } else {
      switch (paymentMethod) {
        case 'debito': categoryLabel = '💵 Débito'; break;
        case 'credito': categoryLabel = '💳 Crédito'; break;
        case 'beneficio': categoryLabel = '🎁 Benefício'; break;
        case 'transferencia':
          categoryLabel = '🔄 Transferência';
          break;
        case 'pagar-credito':
          const target = creditStore.getById(transaction.targetId);
          categoryLabel = `💳 Pagamento → ${target ? this._escapeHtml(target.name, "Cartão") : 'Cartão'}`;
          break;
        default: categoryLabel = '📝 Transação';
      }
    }

    const isLinked = transaction.linkedTransactionId !== undefined;
    const linkedTitle = isTransfer
      ? 'Transação vinculada (transferência)'
      : 'Transação vinculada (pagamento de fatura)';
    const linkedBadge = isLinked ? `<span class="transaction-card__linked-badge" title="${linkedTitle}">🔗</span>` : '';

    // ==================================================
    // Lista do Extrato com texto do meio abaixo do nome
    // - Mantém apenas 1 barrinha (entrada/saída/transferência)
    // - Exibe o meio (transferência/crédito/débito/benefício) como texto
    // ==================================================
    const methodKey = isTransfer
      ? 'transferencia'
      : (paymentMethod === 'beneficio'
        ? 'beneficio'
        : (paymentMethod === 'credito' || paymentMethod === 'pagar-credito'
          ? 'credito'
          : 'debito'));

    const methodLabelMap = {
      credito: 'crédito',
      debito: 'débito',
      beneficio: 'benefício',
      transferencia: 'transferência'
    };
    const methodLabel = methodLabelMap[methodKey] || 'débito';

    const valueKindClass = isTransfer ? 'transfer' : (transactionType === 'entrada' ? 'income' : 'expense');
    const valuePrefix = isTransfer ? '' : (transactionType === 'entrada' ? '+' : '-');

    const card = document.createElement("article");
    card.className = `transaction-card transaction-card--compact transaction-card--${transactionType}${isLinked ? ' transaction-card--linked' : ''}`;
    card.dataset.id = transaction.id;
    card.innerHTML = `
      <div class="transaction-card__info">
        <div class="transaction-card__name-row">
          <h3 class="transaction-card__name">${linkedBadge}${this._escapeHtml(transaction.name, "Transação")}</h3>
        </div>
        <div class="transaction-card__subrow">
          <span class="transaction-card__method transaction-card__method--${methodKey}">${this._escapeHtml(methodLabel, 'débito')}</span>
        </div>
      </div>
      <div class="transaction-card__right">
        <div class="transaction-card__value-container">
          <span class="transaction-card__value transaction-card__value--${valueKindClass}">${valuePrefix} ${this._formatCurrency(transaction.value || 0)}</span>
        </div>
      </div>
    `;
    return card;
  }

  /**
   * Fecha o painel de detalhe aberto (se houver)
    * Sistema de detalhes flutuante para transações
   * @private
   */
  _closeTransactionDetailPane() {
    if (this._transactionDetail) {
      try {
        if (this._transactionDetail.pane && this._transactionDetail.pane.remove) this._transactionDetail.pane.remove();
        if (this._transactionDetail.overlay && this._transactionDetail.overlay.remove) this._transactionDetail.overlay.remove();
      } catch (e) {
        // ignore
      }
      this._transactionDetail = null;
    }
  }

  /**
   * Monta apresentação visual do fluxo do dinheiro (origem → destino)
    * Deixa o detalhe mais organizado e intuitivo
   * @private
   */
  _getTransactionFlowPresentation(transaction, paymentMethodDisplay) {
    const { debitStore, creditStore } = this.stores;

    const type = transaction.type || 'saida';
    const paymentMethod = transaction.paymentMethod || 'debito';
    const isTransfer = type === 'transferencia' || !!transaction?.metadata?.isTransfer;

    // ------------
    // Origem padrão: conta/cartão/benefício usado no lançamento
    // ------------
    const source = {
      icon: this.transactionManager.getSourceIcon(transaction) || '📝',
      name: this.transactionManager.getSourceName(transaction) || 'Conta',
      color: this.transactionManager.getSourceColor(transaction) || '#1fc2c0'
    };

    // ------------
    // Categoria (quando existir) vira o lado “Categoria” do fluxo
    // ------------
    const hasCategory = !!(transaction.categoryName && transaction.categoryName !== 'null');
    const category = {
      icon: transaction.categoryIcon || '🏷️',
      name: hasCategory ? transaction.categoryName : (paymentMethodDisplay || '—'),
      color: transaction.categoryColor || '#1fc2c0'
    };

    // ------------
    // Destinos especiais (transferência / pagar fatura)
    // ------------
    const debitTarget = transaction.targetId && debitStore?.getById ? debitStore.getById(transaction.targetId) : null;
    const creditTarget = transaction.targetId && creditStore?.getById ? creditStore.getById(transaction.targetId) : null;

    const transferTarget = {
      icon: debitTarget?.icon || '💵',
      name: debitTarget?.name || transaction.targetName || transaction?.metadata?.transferToName || 'Conta',
      color: debitTarget?.color || '#1fc2c0'
    };

    const invoiceTarget = {
      icon: creditTarget?.icon || '💳',
      name: creditTarget?.name || transaction.targetName || 'Cartão',
      color: creditTarget?.color || '#ffd93d'
    };

    // ------------
    // Regras do fluxo por tipo
    // ------------
    if (isTransfer) {
      return {
        labelFrom: 'Saiu de',
        from: source,
        labelTo: 'Entrou em',
        to: transferTarget
      };
    }

    if (paymentMethod === 'pagar-credito') {
      return {
        labelFrom: 'Saiu de',
        from: source,
        labelTo: 'Foi para',
        to: invoiceTarget
      };
    }

    if (type === 'entrada') {
      return {
        labelFrom: 'Veio de',
        from: category,
        labelTo: 'Entrou em',
        to: source
      };
    }

    return {
      labelFrom: 'Saiu de',
      from: source,
      labelTo: 'Foi para',
      to: category
    };
  }

  /**
   * Abre um painel flutuante com os detalhes da transação
    * Implementa aba flutuante com todas as informações detalhadas
   *         - Qual cartão/conta foi usado (débito, crédito ou benefício)
   *         - Qual categoria foi utilizada
   *         - Se é entrada ou saída
   *         - Data do lançamento
   *         - Valor destacado em cor apropriada
   *         - Botões de Editar e Remover com ações diretas
   * @private
   */
  _openTransactionDetailPane(transaction, card) {
    const { transactionStore } = this.stores;

    // Fechar painel existente
    this._closeTransactionDetailPane();

    const overlay = document.createElement('div');
    overlay.className = 'transaction-detail-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = 9998;
    overlay.addEventListener('click', () => this._closeTransactionDetailPane());

    const pane = document.createElement('div');
    pane.className = 'transaction-detail-pane';
    pane.dataset.txId = transaction.id;
    const sourceIcon = this.transactionManager.getSourceIcon(transaction) || '📝';
    const sourceName = this.transactionManager.getSourceName(transaction) || 'Conta';
    const sourceColor = this.transactionManager.getSourceColor(transaction) || '#1fc2c0';
    const formattedDate = TransactionStore.formatDate(transaction.date);
    const valueFormatted = this._formatCurrency(transaction.value || 0);
    const type = transaction.type || 'saida';
    const paymentMethod = transaction.paymentMethod || 'debito';
    const categoryName = transaction.categoryName || '';
    const isLinked = transaction.linkedTransactionId !== undefined;
    const paymentMethodLabels = {
      credito: 'Crédito',
      debito: 'Débito',
      beneficio: 'Benefícios',
      'pagar-credito': 'Crédito',
      transferencia: 'Transferência'
    };
    const paymentMethodDisplay = paymentMethodLabels[paymentMethod] || paymentMethod;

    const isTransfer = type === 'transferencia' || !!transaction?.metadata?.isTransfer;
    const valuePrefix = isTransfer ? '' : (type === 'entrada' ? '+' : '-');

    // ==================================================
    // Layout do detalhe conforme padrão solicitado
    // ==================================================
    const typeLabel = isTransfer ? 'Transferência' : (type === 'entrada' ? 'Entrada' : 'Saída');
    const sourceLineLabel = type === 'entrada' ? 'Entrou:' : 'Saiu:';
    const categoryLine = (categoryName && categoryName !== 'null')
      ? `${this._escapeHtml(transaction.categoryIcon || '🏷️', '🏷️')} ${this._escapeHtml(categoryName, 'Categoria')}`
      : 'Sem categoria';

    pane.innerHTML = `
      <div class="transaction-detail-pane__card" style="--tx-color: ${this._escapeHtml(transaction.categoryColor || sourceColor, '#1fc2c0')}">
        <header class="transaction-detail-pane__header">
          <div class="transaction-detail-pane__icon">${this._escapeHtml(transaction.categoryIcon || sourceIcon)}</div>
          <div class="transaction-detail-pane__title">
            <h4 class="transaction-detail-pane__name">${this._escapeHtml(transaction.name, 'Transação')}</h4>
          </div>
          <button type="button" class="transaction-detail-pane__close" aria-label="Fechar">✖️</button>
        </header>
        <div class="transaction-detail-pane__body">
          <div class="transaction-detail-pane__category">${categoryLine}</div>
          <div class="transaction-detail-pane__divider" role="separator"></div>

          <div class="transaction-detail-pane__value ${isTransfer ? 'transfer' : (type === 'entrada' ? 'income' : 'expense')}">${valuePrefix} ${valueFormatted}</div>
          <div class="transaction-detail-pane__divider" role="separator"></div>

          <div class="transaction-detail-pane__row">
            <strong>Data:</strong>
            <span class="transaction-detail-pane__row-value">${formattedDate}</span>
          </div>
          <div class="transaction-detail-pane__row">
            <strong>Meio Usado:</strong>
            <span class="transaction-detail-pane__row-value">${this._escapeHtml(paymentMethodDisplay)}</span>
          </div>
          <div class="transaction-detail-pane__row">
            <strong>Tipo:</strong>
            <span class="transaction-detail-pane__row-value">${this._escapeHtml(typeLabel)}</span>
          </div>
          <div class="transaction-detail-pane__row">
            <strong>${this._escapeHtml(sourceLineLabel)}</strong>
            <span class="transaction-detail-pane__row-value">${this._escapeHtml(sourceName)}</span>
          </div>

          <div class="transaction-detail-pane__divider" role="separator"></div>
          <div class="transaction-detail-pane__actions">
            <button class="transaction-detail-pane__btn transaction-detail-pane__btn--edit" data-action="detail-edit" data-id="${transaction.id}">✏️ Editar</button>
            <button class="transaction-detail-pane__btn transaction-detail-pane__btn--delete" data-action="detail-delete" data-id="${transaction.id}">🗑️ Remover</button>
          </div>
        </div>
      </div>
    `;

    // Inserir overlay e painel
    document.body.appendChild(overlay);
    document.body.appendChild(pane);
    pane.style.position = 'fixed';
    pane.style.left = '50%';
    pane.style.top = '50%';
    pane.style.transform = 'translate(-50%, -50%)';
    pane.style.zIndex = 9999;

    // Escutar ações internas do painel
    pane.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'detail-edit') {
        this._closeTransactionDetailPane();
        this.forms.transactionForm.openEdit(transaction.id, transaction);
      } else if (action === 'detail-delete') {
        const confirmed = await this.confirmationModal.show(
          'Remover Lançamento',
          `Tem certeza que deseja remover "${transaction.name}"?\n\nOs valores serão revertidos.`,
          'Remover', 'Cancelar'
        );
        if (confirmed) {
          // ==================================================
          // SEGURANÇA: remoção atômica
          // - Só remove após reverter todos os lançamentos envolvidos.
          // ==================================================
          if (isLinked) {
            const linked = transactionStore.findById(transaction.linkedTransactionId);
            if (linked) {
              const revertedMain = this.transactionManager.revertValues(transaction);
              const revertedLinked = this.transactionManager.revertValues(linked);

              if (!revertedMain || !revertedLinked) {
                dispatchToast({
                  variant: 'error',
                  title: 'Não foi possível remover',
                  message: 'Falha ao reverter valores do lançamento vinculado.',
                  id: `transaction-detail-delete-revert-failed-${transaction.id}`
                });

                const isTransfer = !!(
                  transaction?.metadata?.isTransfer ||
                  linked?.metadata?.isTransfer ||
                  transaction?.categoryName === 'Transferência' ||
                  linked?.categoryName === 'Transferência'
                );
                const isInvoicePayment = !!(
                  transaction?.metadata?.linkedPayment ||
                  linked?.metadata?.linkedPayment ||
                  transaction?.categoryName === 'Pagamento de Fatura' ||
                  linked?.categoryName === 'Pagamento de Fatura'
                );

                await this._showInfoModal(
                  'Não foi possível remover',
                  isTransfer
                    ? 'Falha ao reverter valores da transferência.\n\nNada foi removido para não causar inconsistência.'
                    : (isInvoicePayment
                      ? 'Falha ao reverter valores do pagamento de fatura.\n\nNada foi removido para não causar inconsistência.'
                      : 'Falha ao reverter valores do lançamento vinculado.\n\nNada foi removido para não causar inconsistência.')
                );
                return;
              }

              transactionStore.remove(transaction.id);
              transactionStore.remove(linked.id);
            } else {
              const reverted = this.transactionManager.revertValues(transaction);
              if (!reverted) {
                dispatchToast({
                  variant: 'error',
                  title: 'Não foi possível remover',
                  message: 'Falha ao reverter valores deste lançamento.',
                  id: `transaction-detail-delete-revert-failed-${transaction.id}`
                });

                await this._showInfoModal(
                  'Não foi possível remover',
                  'Falha ao reverter os valores deste lançamento.\n\nNada foi removido para não causar inconsistência.'
                );
                return;
              }
              transactionStore.remove(transaction.id);
            }
          } else {
            const reverted = this.transactionManager.revertValues(transaction);
            if (!reverted) {
              dispatchToast({
                variant: 'error',
                title: 'Não foi possível remover',
                message: 'Falha ao reverter valores deste lançamento.',
                id: `transaction-detail-delete-revert-failed-${transaction.id}`
              });

              await this._showInfoModal(
                'Não foi possível remover',
                'Falha ao reverter os valores deste lançamento.\n\nNada foi removido para não causar inconsistência.'
              );
              return;
            }
            transactionStore.remove(transaction.id);
          }

          dispatchToast({
            variant: 'success',
            title: 'Lançamento removido',
            message: `"${transaction.name}" removido com sucesso.`,
            id: `transaction-detail-deleted-${transaction.id}`
          });

          this._closeTransactionDetailPane();
          this.renderAll();
          this.statsManager?.updateAll();
        }
      }
    });

    // Botão de fechar
    const closeBtn = pane.querySelector('.transaction-detail-pane__close');
    if (closeBtn) closeBtn.addEventListener('click', () => this._closeTransactionDetailPane());

    // Guardar referência para fechamento futuro
    this._transactionDetail = { pane, overlay };
  }

  /**
   * Renderiza lançamentos do extrato
    * Lista compacta com separadores cinzentos entre itens
   *         - Exibe: nome, valor, botões de editar/remover
   *         - Clique no item abre painel flutuante com detalhes
   *         - Mantém compatibilidade com Virtual Scroll (>100 itens)
   */
  renderTransactions(options = {}) {
    // ==================================================
    // Opções
    // - scrollToTop: usado quando muda filtro (voltar ao início do extrato)
    // - showLoading: mostrar skeleton antes de renderizar
    // ==================================================
    const { scrollToTop = false, showLoading = false } = options || {};

    this._renderWithOptionalLoading({
      key: 'transactions',
      container: this.elements?.extratoGrid,
      showLoading,
      skeletonCount: 10,
      skeletonCompact: true,
      render: () => this._renderTransactionsSync({ scrollToTop })
    });
  }

  /**
   * Renderização síncrona de transações (separada para permitir skeleton).
   * @private
   */
  _renderTransactionsSync(options = {}) {
    const { extratoGrid } = this.elements;
    const { transactionStore } = this.stores;
    const { transactionForm } = this.forms;

    const { scrollToTop = false } = options || {};

    try {
      const transactions = this.filterManager?.getFilteredTransactions() || transactionStore.getAll();

      // ==================================================
      // Alternância entre renderização direta (<100) e VirtualScroll (>=100)
      // ==================================================
      const shouldUseVirtualScroll = transactions.length >= 100;

      // Se estamos no modo direto, garantir que não exista VirtualScroll ativo
      if (!shouldUseVirtualScroll && this.virtualScroll) {
        this.resetVirtualScroll();
      }

      // Se estamos no modo virtual, garantir que o DOM do VirtualScroll existe
      if (shouldUseVirtualScroll && this.virtualScroll && !extratoGrid.querySelector('.virtual-scroll-wrapper')) {
        this.resetVirtualScroll();
      }

      // Setup event delegation
      this._setupEventDelegation('extratoGrid', '.transaction-card', async (action, id, card, actionBtn) => {
        const transaction = transactionStore.findById(id);
        if (!transaction) return;

        // Clique no card (sem botão) deve abrir painel de detalhes
        if (action === 'edit' && !actionBtn) {
          // ------------
          // Abertura de detalhes é uma ação de toque (mesmo sem botão)
          // ------------
          playClickSound();
          this._openTransactionDetailPane(transaction, card);
          return;
        }

        if (action === 'edit') {
          transactionForm.openEdit(transaction.id, transaction);
        } else if (action === 'delete') {
          const isLinked = transaction.linkedTransactionId !== undefined;
          const linkedTransaction = isLinked ? transactionStore.findById(transaction.linkedTransactionId) : null;

          let confirmMessage = `Tem certeza que deseja remover "${transaction.name}"?\n\nOs valores serão revertidos.`;

          if (isLinked && linkedTransaction) {
            const isInvoicePayment = !!(
              transaction?.metadata?.linkedPayment ||
              linkedTransaction?.metadata?.linkedPayment ||
              transaction?.categoryName === 'Pagamento de Fatura' ||
              linkedTransaction?.categoryName === 'Pagamento de Fatura'
            );

            const isTransfer = !!(
              transaction?.metadata?.isTransfer ||
              linkedTransaction?.metadata?.isTransfer ||
              transaction?.categoryName === 'Transferência' ||
              linkedTransaction?.categoryName === 'Transferência'
            );

            if (isInvoicePayment) {
              confirmMessage = `Este lançamento faz parte de um PAGAMENTO DE FATURA.\n\nRemover este lançamento também removerá:\n• ${transaction.name}\n• ${linkedTransaction.name}\n\nOs valores de ambos serão revertidos.\n\nDeseja continuar?`;
            } else if (isTransfer) {
              confirmMessage = `Este lançamento faz parte de uma TRANSFERÊNCIA ENTRE CONTAS DE DÉBITO.\n\nRemover este lançamento também removerá:\n• ${transaction.name}\n• ${linkedTransaction.name}\n\nOs valores de ambos serão revertidos.\n\nDeseja continuar?`;
            } else {
              confirmMessage = `Este lançamento é VINCULADO.\n\nRemover este lançamento também removerá:\n• ${transaction.name}\n• ${linkedTransaction.name}\n\nOs valores de ambos serão revertidos.\n\nDeseja continuar?`;
            }
          }

          const confirmed = await this.confirmationModal.show(
            "Remover Lançamento",
            confirmMessage,
            "Remover", "Cancelar"
          );

          if (confirmed) {
            // ==================================================
            // SEGURANÇA: só remove se conseguir reverter valores
            // ==================================================
            if (isLinked && linkedTransaction) {
              const revertedMain = this.transactionManager.revertValues(transaction);
              const revertedLinked = this.transactionManager.revertValues(linkedTransaction);

              if (!revertedMain || !revertedLinked) {
                dispatchToast({
                  variant: 'error',
                  title: 'Não foi possível remover',
                  message: 'Falha ao reverter valores do lançamento vinculado.',
                  id: `transaction-delete-revert-failed-${transaction.id}`
                });

                const isTransfer = !!(
                  transaction?.metadata?.isTransfer ||
                  linkedTransaction?.metadata?.isTransfer ||
                  transaction?.categoryName === 'Transferência' ||
                  linkedTransaction?.categoryName === 'Transferência'
                );
                const isInvoicePayment = !!(
                  transaction?.metadata?.linkedPayment ||
                  linkedTransaction?.metadata?.linkedPayment ||
                  transaction?.categoryName === 'Pagamento de Fatura' ||
                  linkedTransaction?.categoryName === 'Pagamento de Fatura'
                );

                await this._showInfoModal(
                  'Não foi possível remover',
                  isTransfer
                    ? 'Falha ao reverter valores da transferência.\n\nNada foi removido para não causar inconsistência.'
                    : (isInvoicePayment
                      ? 'Falha ao reverter valores do pagamento de fatura.\n\nNada foi removido para não causar inconsistência.'
                      : 'Falha ao reverter valores do lançamento vinculado.\n\nNada foi removido para não causar inconsistência.')
                );
                return;
              }

              transactionStore.remove(transaction.id);
              transactionStore.remove(linkedTransaction.id);
            } else {
              const revertedMain = this.transactionManager.revertValues(transaction);
              if (!revertedMain) {
                dispatchToast({
                  variant: 'error',
                  title: 'Não foi possível remover',
                  message: 'Falha ao reverter valores deste lançamento.',
                  id: `transaction-delete-revert-failed-${transaction.id}`
                });

                await this._showInfoModal(
                  'Não foi possível remover',
                  'Falha ao reverter os valores deste lançamento.\n\nNada foi removido para não causar inconsistência.'
                );
                return;
              }

              transactionStore.remove(transaction.id);
            }

            dispatchToast({
              variant: 'success',
              title: 'Lançamento removido',
              message: `"${transaction.name}" removido com sucesso.`,
              id: `transaction-deleted-${transaction.id}`
            });

            this.renderAll();
            this.statsManager?.updateAll();
          }
        }
      });

      // Renderização direta para menos de 100 itens
      if (!shouldUseVirtualScroll) {
        extratoGrid.innerHTML = "";

        // ------------
        // Requisito: ao mudar filtro, voltar para o início
        // ------------
        if (scrollToTop) {
          try {
            extratoGrid.scrollTop = 0;
          } catch {
            // Ignorar
          }
        }

        if (transactions.length === 0) {
          extratoGrid.appendChild(this._createEmptyState({
            title: 'Nenhum lançamento encontrado',
            message: 'Não há lançamentos para os filtros/período selecionados.',
            hint: 'Toque no botão "+" para adicionar um lançamento ou ajuste os filtros.'
          }));
          this.statsManager?.updateExtratoStats();
          return;
        }

        const fragment = document.createDocumentFragment();
        transactions.forEach(t => fragment.appendChild(this._createTransactionElement(t)));
        extratoGrid.appendChild(fragment);

        this.statsManager?.updateExtratoStats();
        console.log(`✅ ${transactions.length} lançamento(s) renderizado(s)`);
        return;
      }

      // Virtual Scroll para muitos itens
      if (!this.virtualScroll) {
        this.virtualScroll = new VirtualScroll({
          container: extratoGrid,
          itemHeight: this.transactionItemHeight,
          bufferSize: 8,
          renderItem: (item) => this._createTransactionElement(item)
        });
        this.virtualScroll.init();
      }

      // ------------
      // Requisito: ao mudar filtro, voltar para o início
      // (no VirtualScroll, quem rola é o wrapper interno)
      // ------------
      if (scrollToTop) {
        try {
          if (this.virtualScroll?.wrapper) {
            this.virtualScroll.wrapper.scrollTop = 0;
          }
        } catch {
          // Ignorar
        }
      }

      this.virtualScroll.setItems(transactions);

      this.statsManager?.updateExtratoStats();
      console.log(`✅ ${transactions.length} lançamento(s) renderizado(s) (virtual scroll)`);
    } catch (error) {
      console.error("❌ Erro ao renderizar transações:", error);
      extratoGrid.innerHTML = '<div class="error-state">❌ Erro ao carregar lançamentos</div>';
    }
  }

  // ============================================
  // MÉTODOS PÚBLICOS
  // ============================================

  /**
   * Renderiza todos os grids
   */
  renderAll() {
    this.renderCategoryCards();
    this.renderBenefitCards();
    this.renderCreditCards();
    this.renderDebitCards();
    this.renderTransactions();
  }

  /**
   * Limpa recursos ao destruir o renderer
   */
  destroy() {
    // Virtual Scroll
    if (this.virtualScroll) {
      this.virtualScroll.destroy();
      this.virtualScroll = null;
    }

    // Event handlers
    const grids = ['categoryGrid', 'benefitsGrid', 'creditGrid', 'debitGrid', 'extratoGrid'];
    grids.forEach(gridKey => {
      const grid = this.elements[gridKey];
      const handlerKey = `_${gridKey}Handler`;
      if (this._handlers[handlerKey] && grid) {
        grid.removeEventListener('click', this._handlers[handlerKey]);
        this._handlers[handlerKey] = null;
      }
    });

    console.log('🧹 GridRenderer recursos liberados');
  }
}
