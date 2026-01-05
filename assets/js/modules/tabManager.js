/**
 * Módulo: Gerenciador de Abas
 * Responsabilidade: Gerenciar alternância entre abas (Categorias / Configurações)
 */

export class TabManager {
  constructor(options = {}) {
    const {
      buttonSelector = ".footer__link",
      panelSelector = ".tab-panel",
      activeButtonClass = "footer__link--active",
      activePanelClass = "tab-panel--active",
      storageKey = "finance-control:active-tab",
      onTabChange = null,
      onBeforeTabChange = null,
    } = options;

    this.buttons = Array.from(document.querySelectorAll(buttonSelector));
    this.panels = Array.from(document.querySelectorAll(panelSelector));
    this.activeButtonClass = activeButtonClass;
    this.activePanelClass = activePanelClass;
    this.storageKey = storageKey;
    this.onTabChange = typeof onTabChange === "function" ? onTabChange : null;
    this.onBeforeTabChange = typeof onBeforeTabChange === "function" ? onBeforeTabChange : null;
    this.currentTab = null;
  }

  /**
   * Inicializa o gerenciador de abas
   * @param {string} defaultTab - Aba ativa por padrão
   */
  init(defaultTab = "beneficios") {
    const storedTab = this._readFromStorage();
    const initialTab = storedTab || defaultTab;

    if (!this.buttons.length || !this.panels.length) {
      console.warn("TabManager: nenhum botão ou painel encontrado");
    }

    // Delegação de eventos para maior robustez
    this.buttons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const tabKey = button.dataset.tab;
        if (tabKey) this.activate(tabKey);
      });
    });

    this.activate(initialTab);
  }

  /**
   * Ativa uma aba específica
   * @param {string} tabKey - Chave da aba a ativar
   */
  activate(tabKey) {
    if (!tabKey) return;

    // Chamar callback antes de trocar (para cleanup)
    if (this.onBeforeTabChange && this.currentTab !== tabKey) {
      this.onBeforeTabChange(this.currentTab, tabKey);
    }

    // Ativar/desativar painéis
    this.panels.forEach((panel) => {
      const isActive = panel.dataset.tab === tabKey;
      panel.classList.toggle(this.activePanelClass, isActive);
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
      // Remover estilo inline para deixar CSS controlar o display
      panel.style.removeProperty("display");
    });

    // Ativar/desativar botões
    this.buttons.forEach((button) => {
      const isActive = button.dataset.tab === tabKey;
      button.classList.toggle(this.activeButtonClass, isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      
      // Acessibilidade: Indica qual aba está ativa para leitores de tela
      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    this._persist(tabKey);
    this.currentTab = tabKey;

    if (this.onTabChange) {
      this.onTabChange(tabKey);
    }
  }

  _persist(tabKey) {
    try {
      if (this.storageKey) {
        window.localStorage.setItem(this.storageKey, tabKey);
      }
    } catch (error) {
      console.warn("Não foi possível persistir a aba ativa", error);
    }
  }

  _readFromStorage() {
    try {
      if (this.storageKey) {
        return window.localStorage.getItem(this.storageKey);
      }
    } catch (error) {
      console.warn("Não foi possível ler a aba ativa", error);
    }
    return null;
  }
}
