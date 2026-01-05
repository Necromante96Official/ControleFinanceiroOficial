/**
 * Módulo: Modal de Filtros do Extrato
 * Responsabilidade: Abrir/fechar a aba flutuante de filtros do Extrato (com acessibilidade)
 *
 * Regras de acessibilidade aplicadas:
 * - Fecha com ESC
 * - Fecha ao clicar no overlay
 * - Mantém o foco “preso” dentro do modal (tab trap)
 * - Restaura foco no botão que abriu o modal
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Classe para controlar o modal de filtros do Extrato
 */
export class ExtratoFiltersModal {
  constructor(options) {
    this.openButton = options.openButton;
    this.modal = options.modal;
    this.closeButton = options.closeButton;

    // Elementos auxiliares
    this.overlay = this.modal ? this.modal.querySelector('.modal__overlay') : null;
    this.container = this.modal ? this.modal.querySelector('.modal__container') : null;

    // Estado interno
    this._isOpen = false;
    this._lastFocusedElement = null;
    this._previousBodyOverflow = '';

    // Binds
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onOverlayClick = this._onOverlayClick.bind(this);
  }

  /**
   * Inicializa listeners do modal
   */
  init() {
    if (!this.openButton || !this.modal || !this.container) return;

    // ------------
    // Abertura/fechamento
    // ------------
    this.openButton.addEventListener('click', () => this.open());
    if (this.closeButton) this.closeButton.addEventListener('click', () => this.close());
    if (this.overlay) this.overlay.addEventListener('click', this._onOverlayClick);

    // Estado inicial acessível
    this.modal.setAttribute('aria-hidden', 'true');
  }

  /**
   * Abre o modal
   */
  open() {
    if (!this.modal || !this.container || this._isOpen) return;

    this._isOpen = true;
    this._lastFocusedElement = document.activeElement;

    // Evita scroll no conteúdo de fundo enquanto o modal está aberto
    this._previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    this.modal.classList.add('is-open');
    this.modal.setAttribute('aria-hidden', 'false');

    // Listener global para ESC e tab trap
    document.addEventListener('keydown', this._onKeyDown);

    // ------------
    // Foco inicial: primeiro campo focável do modal
    // ------------
    const focusables = this._getFocusableElements();
    const firstFocusable = focusables[0] || this.closeButton || this.openButton;

    // Pequeno delay para garantir transição/classe aplicada antes do foco
    setTimeout(() => {
      try {
        firstFocusable?.focus?.();
      } catch (_) {
        // Silencioso: fallback apenas
      }
    }, 0);
  }

  /**
   * Fecha o modal
   */
  close() {
    if (!this.modal || !this._isOpen) return;

    this._isOpen = false;

    this.modal.classList.remove('is-open');
    this.modal.setAttribute('aria-hidden', 'true');

    // Restaurar scroll do body
    document.body.style.overflow = this._previousBodyOverflow;

    // Remover listener global
    document.removeEventListener('keydown', this._onKeyDown);

    // Restaurar foco onde o usuário estava
    const focusTarget = this._lastFocusedElement || this.openButton;
    setTimeout(() => {
      try {
        focusTarget?.focus?.();
      } catch (_) {
        // Silencioso
      }
    }, 0);
  }

  /**
   * Retorna lista de elementos focáveis dentro do modal
   * @private
   */
  _getFocusableElements() {
    if (!this.container) return [];
    return Array.from(this.container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
      // Ignorar elementos invisíveis
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  /**
   * Fecha quando clica no overlay
   * @private
   */
  _onOverlayClick() {
    this.close();
  }

  /**
   * Gerencia teclado: ESC + tab trap
   * @param {KeyboardEvent} event
   * @private
   */
  _onKeyDown(event) {
    if (!this._isOpen) return;

    // Fechar com ESC
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    // Conter tabulação dentro do modal
    if (event.key !== 'Tab') return;

    const focusables = this._getFocusableElements();
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const isShift = event.shiftKey;
    const active = document.activeElement;

    // Se SHIFT+TAB no primeiro, volta para o último
    if (isShift && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    // Se TAB no último, volta para o primeiro
    if (!isShift && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
