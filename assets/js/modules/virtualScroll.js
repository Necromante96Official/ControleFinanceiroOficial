/**
 * VirtualScroll - Renderização Virtualizada para Listas Longas
 * Responsabilidade: Renderizar apenas itens visíveis + buffer para performance
 *
 * Funcionalidades:
 * - Renderização sob demanda (lazy rendering)
 * - Buffer de itens acima/abaixo da viewport
 * - Reciclagem de elementos DOM
 * - Suporte a scroll suave
 * - Renderização incremental
 *

 */

export class VirtualScroll {
  /**
   * @param {Object} options - Configurações do virtual scroll
   * @param {HTMLElement} options.container - Container do scroll
   * @param {number} options.itemHeight - Altura estimada de cada item (px)
   * @param {number} options.bufferSize - Quantidade de itens extras para renderizar
   * @param {Function} options.renderItem - Função que renderiza um item
   * @param {Function} options.onItemClick - Callback para clique em item
   */
  constructor(options) {
    this.container = options.container;
    this.itemHeight = options.itemHeight || 120;
    this.bufferSize = options.bufferSize || 5;
    this.renderItem = options.renderItem;
    this.onItemClick = options.onItemClick || null;

    // =============================
    // Auto-ajuste de altura do item
    // =============================
    // Evita “espaço sobrando” no fim da lista quando a altura estimada diverge da real.
    this.autoMeasureItemHeight = options.autoMeasureItemHeight !== false;
    this._isMeasuringItemHeight = false;
    this._didMeasureItemHeight = false;

    this.items = [];
    this.renderedItems = new Map();
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.isEnabled = true;
    this.threshold = 100; // Mínimo de items para ativar virtual scroll

    // Elementos internos
    this.wrapper = null;
    this.content = null;
    this.spacerTop = null;
    this.spacerBottom = null;

    // Estado
    this.visibleRange = { start: 0, end: 0 };
    this.isScrolling = false;
    this.scrollTimeout = null;

    // =============================
    // ResizeObserver: anti-loop
    // =============================
    // Evita o aviso do Chrome "ResizeObserver loop completed with undelivered notifications"
    // ao coalescer mudanças de layout em um único frame e pular renders redundantes.
    this._resizeRafId = null;
    this._resizeUpdatePending = false;

    // Bind methods
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this._scheduleResizeUpdate = this._scheduleResizeUpdate.bind(this);
  }

  /**
   * Agenda uma atualização de layout (altura + render) em um único frame.
   * @private
   */
  _scheduleResizeUpdate() {
    // ------------
    // Coalescer múltiplos eventos (resize + resizeObserver)
    // ------------
    this._resizeUpdatePending = true;
    if (this._resizeRafId != null) return;

    this._resizeRafId = window.requestAnimationFrame(() => {
      this._resizeRafId = null;
      if (!this._resizeUpdatePending) return;
      this._resizeUpdatePending = false;

      // ------------
      // Renderizar somente se a altura mudou (reduz loops)
      // ------------
      const didChange = this.updateContainerHeight();
      if (didChange) {
        this.render();
      }
    });
  }

  /**
   * Inicializa o virtual scroll
   */
  init() {
    this.setupDOM();
    this.setupListeners();
    console.log('📜 VirtualScroll inicializado');
  }

  /**
   * Configura estrutura DOM necessária
   */
  setupDOM() {
    // Limpa container
    this.container.innerHTML = '';

    // Wrapper para scroll
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'virtual-scroll-wrapper';
    this.wrapper.style.cssText = `
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
    `;

    // Espaçador superior (para manter posição do scroll)
    this.spacerTop = document.createElement('div');
    this.spacerTop.className = 'virtual-scroll-spacer-top';
    this.spacerTop.style.cssText = 'height: 0; width: 100%;';

    // Conteúdo visível
    this.content = document.createElement('div');
    this.content.className = 'virtual-scroll-content';
    this.content.style.cssText = 'width: 100%;';

    // Espaçador inferior
    this.spacerBottom = document.createElement('div');
    this.spacerBottom.className = 'virtual-scroll-spacer-bottom';
    this.spacerBottom.style.cssText = 'height: 0; width: 100%;';

    // Monta estrutura
    this.wrapper.appendChild(this.spacerTop);
    this.wrapper.appendChild(this.content);
    this.wrapper.appendChild(this.spacerBottom);
    this.container.appendChild(this.wrapper);
  }

  /**
   * Configura listeners de scroll e resize
   */
  setupListeners() {
    this.wrapper.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleResize, { passive: true });

    // Observer para detectar mudanças no container
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => {
        this._scheduleResizeUpdate();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  /**
   * Handler de scroll com throttle
   */
  handleScroll() {
    if (!this.isEnabled || this.items.length < this.threshold) return;

    this.scrollTop = this.wrapper.scrollTop;
    this.isScrolling = true;

    // Renderiza durante scroll
    this.render();

    // Marca fim do scroll
    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = false;
    }, 150);
  }

  /**
   * Handler de resize
   */
  handleResize() {
    this._scheduleResizeUpdate();
  }

  /**
   * Atualiza altura do container
   */
  updateContainerHeight() {
    const nextHeight = this.wrapper?.clientHeight || 500;
    const didChange = nextHeight !== this.containerHeight;
    this.containerHeight = nextHeight;
    return didChange;
  }

  /**
   * Define os itens a serem renderizados
   * @param {Array} items - Lista de itens
   */
  setItems(items) {
    this.items = items || [];
    this.renderedItems.clear();
    this.scrollTop = 0;

    // Reset do auto-ajuste ao trocar a lista
    this._didMeasureItemHeight = false;
    this._isMeasuringItemHeight = false;

    // Se poucos itens, renderiza todos sem virtual scroll
    if (this.items.length < this.threshold) {
      this.renderAllItems();
      return;
    }

    this.updateContainerHeight();
    this.render();
  }

  /**
   * Renderiza todos os itens (para listas pequenas)
   */
  renderAllItems() {
    this.content.innerHTML = '';
    this.spacerTop.style.height = '0';
    this.spacerBottom.style.height = '0';

    if (this.items.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'Nenhum item encontrado.';
      this.content.appendChild(emptyState);
      return;
    }

    const fragment = document.createDocumentFragment();
    this.items.forEach((item, index) => {
      const element = this.renderItem(item, index);
      if (element) {
        this.setupItemListeners(element, item, index);
        fragment.appendChild(element);
      }
    });
    this.content.appendChild(fragment);
  }

  /**
   * Calcula range de itens visíveis
   * @returns {Object} { start, end }
   */
  calculateVisibleRange() {
    const totalHeight = this.items.length * this.itemHeight;
    const viewportTop = this.scrollTop;
    const viewportBottom = viewportTop + this.containerHeight;

    let start = Math.floor(viewportTop / this.itemHeight) - this.bufferSize;
    let end = Math.ceil(viewportBottom / this.itemHeight) + this.bufferSize;

    // Clamp valores
    start = Math.max(0, start);
    end = Math.min(this.items.length, end);

    return { start, end, totalHeight };
  }

  /**
   * Renderiza itens visíveis
   */
  render() {
    if (this.items.length < this.threshold) return;

    const { start, end, totalHeight } = this.calculateVisibleRange();

    // Se range não mudou, não re-renderiza
    if (start === this.visibleRange.start && end === this.visibleRange.end) {
      return;
    }

    this.visibleRange = { start, end };

    // Atualiza espaçadores
    const topHeight = start * this.itemHeight;
    const bottomHeight = (this.items.length - end) * this.itemHeight;

    this.spacerTop.style.height = `${topHeight}px`;
    this.spacerBottom.style.height = `${Math.max(0, bottomHeight)}px`;

    // Renderiza itens visíveis
    const fragment = document.createDocumentFragment();

    for (let i = start; i < end; i++) {
      const item = this.items[i];
      if (!item) continue;

      // Reutiliza elemento se já renderizado
      let element = this.renderedItems.get(item.id);

      if (!element) {
        element = this.renderItem(item, i);
        if (element) {
          this.setupItemListeners(element, item, i);
          this.renderedItems.set(item.id, element);
        }
      }

      if (element) {
        fragment.appendChild(element);
      }
    }

    // Atualiza conteúdo
    this.content.innerHTML = '';
    this.content.appendChild(fragment);

    // ------------
    // Auto-ajuste da altura estimada (1x por setItems)
    // ------------
    this._maybeAutoMeasureItemHeight();

    // Limpa elementos não visíveis do cache (mantém só os próximos)
    this.cleanupCache(start, end);
  }

  /**
   * Mede a altura real do item renderizado e ajusta itemHeight uma única vez.
   * Mantém a posição do scroll proporcional para não “pular”.
   */
  _maybeAutoMeasureItemHeight() {
    if (!this.autoMeasureItemHeight) return;
    if (this._didMeasureItemHeight) return;
    if (this._isMeasuringItemHeight) return;

    const first = this.content?.firstElementChild;
    if (!first) return;

    this._isMeasuringItemHeight = true;

    requestAnimationFrame(() => {
      let hasValidSample = false;
      try {
        const samples = [];
        const maxSamples = 6;
        let el = this.content.firstElementChild;

        while (el && samples.length < maxSamples) {
          const h = Math.round(el.getBoundingClientRect().height);
          if (h > 0) samples.push(h);
          el = el.nextElementSibling;
        }

        hasValidSample = samples.length > 0;

        const sum = samples.reduce((acc, n) => acc + n, 0);
        const avg = samples.length ? Math.round(sum / samples.length) : 0;
        if (!avg) return;

        const oldHeight = this.itemHeight;

        // Só ajustar se a diferença for perceptível (evita loops por variações pequenas)
        if (Math.abs(avg - oldHeight) < 8) return;

        this.itemHeight = avg;

        // Manter o scroll proporcional ao novo itemHeight
        const ratio = oldHeight > 0 ? (this.scrollTop / oldHeight) : 0;
        const newScrollTop = Math.max(0, Math.round(ratio * this.itemHeight));

        if (this.wrapper) {
          this.wrapper.scrollTop = newScrollTop;
        }

        this.scrollTop = newScrollTop;

        // Forçar recalcular range com a nova altura
        this.visibleRange = { start: -1, end: -1 };
      } finally {
        // Só “fechar” a medição se conseguimos ler altura real.
        if (hasValidSample) {
          this._didMeasureItemHeight = true;
        }
        this._isMeasuringItemHeight = false;

        // Re-render com a altura corrigida
        if (hasValidSample) {
          this.render();
        }
      }
    });
  }

  /**
   * Limpa cache de elementos não visíveis
   */
  cleanupCache(start, end) {
    const maxCacheSize = (end - start) * 2;

    if (this.renderedItems.size > maxCacheSize) {
      const visibleIds = new Set(
        this.items.slice(start, end).map(item => item.id)
      );

      for (const [id, element] of this.renderedItems) {
        if (!visibleIds.has(id)) {
          this.renderedItems.delete(id);
        }
      }
    }
  }

  /**
   * Configura listeners em um item
   */
  setupItemListeners(element, item, index) {
    if (this.onItemClick) {
      element.addEventListener('click', (e) => {
        if (!e.target.closest('[data-action]')) {
          this.onItemClick(item, index, e);
        }
      });
    }
  }

  /**
   * Scrolla para um item específico
   * @param {number} index - Índice do item
   * @param {string} behavior - 'smooth' ou 'instant'
   */
  scrollToItem(index, behavior = 'smooth') {
    const targetTop = index * this.itemHeight;
    this.wrapper.scrollTo({
      top: targetTop,
      behavior
    });
  }

  /**
   * Scrolla para o topo
   */
  scrollToTop(behavior = 'smooth') {
    this.wrapper.scrollTo({ top: 0, behavior });
  }

  /**
   * Scrolla para o fim
   */
  scrollToBottom(behavior = 'smooth') {
    const maxScroll = this.items.length * this.itemHeight;
    this.wrapper.scrollTo({ top: maxScroll, behavior });
  }

  /**
   * Atualiza um item específico
   * @param {number} id - ID do item
   * @param {Object} newData - Novos dados
   */
  updateItem(id, newData) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return;

    this.items[index] = { ...this.items[index], ...newData };

    // Remove do cache para forçar re-render
    this.renderedItems.delete(id);

    // Re-renderiza se item estiver visível
    if (index >= this.visibleRange.start && index < this.visibleRange.end) {
      this.render();
    }
  }

  /**
   * Remove um item
   * @param {number} id - ID do item
   */
  removeItem(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return;

    this.items.splice(index, 1);
    this.renderedItems.delete(id);
    this.render();
  }

  /**
   * Adiciona um item no início
   * @param {Object} item - Novo item
   */
  prependItem(item) {
    this.items.unshift(item);
    this.render();
  }

  /**
   * Adiciona um item no fim
   * @param {Object} item - Novo item
   */
  appendItem(item) {
    this.items.push(item);
    this.render();
  }

  /**
   * Retorna estatísticas do virtual scroll
   */
  getStats() {
    return {
      totalItems: this.items.length,
      renderedItems: this.renderedItems.size,
      visibleRange: this.visibleRange,
      scrollTop: this.scrollTop,
      containerHeight: this.containerHeight,
      isEnabled: this.isEnabled && this.items.length >= this.threshold
    };
  }

  /**
   * Habilita/desabilita virtual scroll
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.renderAllItems();
    } else {
      this.render();
    }
  }

  /**
   * Força re-renderização completa
   */
  refresh() {
    this.renderedItems.clear();
    this.visibleRange = { start: 0, end: 0 };

    if (this.items.length < this.threshold) {
      this.renderAllItems();
    } else {
      this.render();
    }
  }

  /**
   * Limpa e destrói o virtual scroll
   */
  destroy() {
    this.wrapper.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Cancelar atualização pendente (se houver)
    if (this._resizeRafId != null) {
      window.cancelAnimationFrame(this._resizeRafId);
      this._resizeRafId = null;
      this._resizeUpdatePending = false;
    }

    clearTimeout(this.scrollTimeout);
    this.renderedItems.clear();
    this.items = [];

    this.container.innerHTML = '';
    console.log('📜 VirtualScroll destruído');
  }
}

/**
 * Factory para criar VirtualScroll com configurações padrão
 */
export function createVirtualScroll(container, renderItem, options = {}) {
  return new VirtualScroll({
    container,
    renderItem,
    itemHeight: options.itemHeight || 120,
    bufferSize: options.bufferSize || 5,
    onItemClick: options.onItemClick || null,
    ...options
  });
}
