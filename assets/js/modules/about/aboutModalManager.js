/**
 * Módulo: AboutModalManager
 * Responsabilidade: Controlar abertura/fechamento do modal "Sobre".
 */

import { getAppMeta } from '../appMeta/getAppMeta.js';
import { SUPPORT_WHATSAPP_DISPLAY } from '../appMeta/appMetaConstants.js';
import { buildWhatsappUrl } from './buildWhatsappUrl.js';
import { createAboutModalElement } from './createAboutModalElement.js';

export class AboutModalManager {
  /**
   * @param {{ openButton: HTMLButtonElement | null }} params
   */
  constructor({ openButton }) {
    this.openButton = openButton ?? null;

    /** @type {HTMLElement | null} */
    this._modal = null;

    // Bind para remover listeners com segurança
    this._onDocumentClick = this._onDocumentClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onOpenClick = this._onOpenClick.bind(this);
  }

  /** Inicializa o modal "Sobre". */
  init() {
    // ------------
    // Se o botão não existir, não inicializa
    // ------------
    if (!this.openButton) return;

    // ------------
    // Criar modal e anexar no body
    // ------------
    const meta = getAppMeta();

    this._modal = createAboutModalElement({
      buildDisplay: meta.buildDisplay,
      versionNumber: meta.versionNumber,
      author: meta.author,
      whatsappUrl: buildWhatsappUrl(),
      whatsappDisplay: SUPPORT_WHATSAPP_DISPLAY,
    });

    document.body.appendChild(this._modal);

    // ------------
    // Listeners
    // ------------
    this.openButton.addEventListener('click', this._onOpenClick);
    document.addEventListener('click', this._onDocumentClick);
    document.addEventListener('keydown', this._onKeyDown);
  }

  /** Abre o modal. */
  open() {
    if (!this._modal) return;

    this._modal.classList.add('is-open');
    this._modal.setAttribute('aria-hidden', 'false');

    // Foco no botão de fechar, se existir
    const closeBtn = this._modal.querySelector('button[data-action="close-about-modal"]');
    if (closeBtn && typeof closeBtn.focus === 'function') {
      closeBtn.focus();
    }
  }

  /** Fecha o modal. */
  close() {
    if (!this._modal) return;

    this._modal.classList.remove('is-open');
    this._modal.setAttribute('aria-hidden', 'true');

    // Retornar foco ao botão de abertura
    if (this.openButton && typeof this.openButton.focus === 'function') {
      this.openButton.focus();
    }
  }

  // ================================
  // Handlers
  // ================================

  _onOpenClick() {
    this.open();
  }

  /**
   * Fecha ao clicar no overlay ou no botão de fechar.
   * @param {MouseEvent} event
   */
  _onDocumentClick(event) {
    if (!this._modal) return;
    if (!this._modal.classList.contains('is-open')) return;

    const target = /** @type {HTMLElement | null} */ (event.target);
    const action = target?.getAttribute?.('data-action');

    if (action === 'close-about-modal') {
      this.close();
    }
  }

  /**
   * Fecha com ESC.
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (!this._modal) return;
    if (!this._modal.classList.contains('is-open')) return;

    this.close();
  }
}
