/**
 * Módulo: Modal de Confirmação do Sistema
 * Responsabilidade: Exibir confirmações sem usar alert() do navegador
 */

export class ConfirmationModal {
  constructor() {
    this.modal = null;
    this.resolveCallback = null;
  }

  /**
   * Mostra um modal de confirmação e retorna uma Promise
   * @param {string} title - Título do modal
   * @param {string} message - Mensagem a exibir
   * @param {string} confirmText - Texto do botão confirmar (default: "Confirmar")
   * @param {string} cancelText - Texto do botão cancelar (default: "Cancelar")
   * @returns {Promise<boolean>} Resolve true se confirmar, false se cancelar
   */
  async show(title, message, confirmText = "Confirmar", cancelText = "Cancelar") {
    return new Promise((resolve) => {
      this.resolveCallback = resolve;
      this._createModal(title, message, confirmText, cancelText);
      this._showModal();
    });
  }

  /**
   * Cria a estrutura do modal
   * @private
   */
  _createModal(title, message, confirmText, cancelText) {
    // Remover modal anterior se existir
    if (this.modal) {
      this.modal.remove();
    }

    // Criar overlay
    const overlay = document.createElement("div");
    overlay.className = "confirmation-modal__overlay";

    // Criar modal
    this.modal = document.createElement("div");
    this.modal.className = "confirmation-modal";

    // Se cancelText é null, não mostra o botão de cancelar
    const cancelBtnHTML = cancelText
      ? `<button class="confirmation-modal__btn confirmation-modal__btn--cancel" type="button">${cancelText}</button>`
      : '';

    this.modal.innerHTML = `
      <div class="confirmation-modal__content">
        <header class="confirmation-modal__header">
          <h3 class="confirmation-modal__title">${title}</h3>
        </header>
        <div class="confirmation-modal__body">
          <p class="confirmation-modal__message">${message}</p>
        </div>
        <footer class="confirmation-modal__footer">
          ${cancelBtnHTML}
          <button class="confirmation-modal__btn confirmation-modal__btn--confirm" type="button">
            ${confirmText}
          </button>
        </footer>
      </div>
    `;

    // Adicionar listeners
    const confirmBtn = this.modal.querySelector(".confirmation-modal__btn--confirm");
    const cancelBtn = this.modal.querySelector(".confirmation-modal__btn--cancel");

    confirmBtn.addEventListener("click", () => {
      // Evita clique duplo e dá feedback visual.
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processando...';
      this.modal?.setAttribute?.('aria-busy', 'true');
      this._closeModal(true);
    });

    // Só adiciona listener no cancelBtn se ele existir
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        // Evita clique duplo durante o fechamento.
        cancelBtn.disabled = true;
        this._closeModal(false);
      });
    }

    overlay.addEventListener("click", () => {
      this._closeModal(false);
    });

    // Adicionar ao DOM
    document.body.appendChild(overlay);
    document.body.appendChild(this.modal);
  }

  /**
   * Mostra o modal
   * @private
   */
  _showModal() {
    // Trigger animation
    setTimeout(() => {
      if (this.modal) {
        this.modal.classList.add("is-open");
        document.querySelector(".confirmation-modal__overlay").classList.add("is-open");
      }
    }, 10);
  }

  /**
   * Fecha o modal e resolve a Promise
   * @private
   */
  _closeModal(confirmed) {
    if (this.modal) {
      this.modal.classList.remove("is-open");
      document.querySelector(".confirmation-modal__overlay")?.classList.remove("is-open");

      setTimeout(() => {
        if (this.modal) {
          this.modal.remove();
          document.querySelector(".confirmation-modal__overlay")?.remove();
          this.modal = null;
        }
        if (this.resolveCallback) {
          this.resolveCallback(confirmed);
        }
      }, 300);
    }
  }
}

// Instância global para fácil acesso
export const confirmationModal = new ConfirmationModal();
