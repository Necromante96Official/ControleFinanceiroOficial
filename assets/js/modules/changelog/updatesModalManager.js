/**
 * Módulo: UpdatesModalManager
 * Responsabilidade: Controlar abertura/fechamento do modal de Histórico de Atualizações.
 */

import {
  APP_AUTHOR,
  APP_BUILD,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_E164
} from '../appMeta/appMetaConstants.js';
import { createUpdatesModalElement } from './createUpdatesModalElement.js';
import { parseUpdatesMarkdown } from './parseUpdatesMarkdown.js';
import { renderUpdatesEntriesHtml } from './renderUpdatesEntriesHtml.js';

export class UpdatesModalManager {
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

  /** Inicializa o modal de Histórico. */
  init() {
    // ------------
    // Se o botão não existir, não inicializa
    // ------------
    if (!this.openButton) return;

    // ------------
    // Criar modal e anexar no body
    // ------------
    this._modal = createUpdatesModalElement();
    document.body.appendChild(this._modal);

    // ------------
    // Listeners
    // ------------
    this.openButton.addEventListener('click', this._onOpenClick);
    document.addEventListener('click', this._onDocumentClick);
    document.addEventListener('keydown', this._onKeyDown);
  }

  /** Abre o modal. */
  async open() {
    if (!this._modal) return;

    this._modal.classList.add('is-open');
    this._modal.setAttribute('aria-hidden', 'false');

    // ------------
    // Atualizar conteúdo sempre que abrir (pega as últimas mudanças)
    // ------------
    await this._loadAndRenderUpdates();

    // Foco no botão de fechar, se existir
    const closeBtn = this._modal.querySelector('button[data-action="close-updates-modal"]');
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
  // Internals
  // ================================

  async _loadAndRenderUpdates() {
    if (!this._modal) return;

    const content = this._modal.querySelector('#updates-modal-content');
    if (!content) return;

    // Estado inicial enquanto carrega
    content.innerHTML = '<p class="updates__empty">Carregando histórico...</p>';

    try {
      // ------------
      // Cache-busting com build (útil em PWA/offline-first)
      // ------------
      const url = `assets/changelog/updates.md?v=${encodeURIComponent(APP_BUILD)}`;
      const res = await fetch(url, { cache: 'no-store' });

      if (!res.ok) {
        throw new Error(`Falha ao carregar updates.md (HTTP ${res.status})`);
      }

      const markdown = await res.text();
      const entries = parseUpdatesMarkdown(markdown);

      // ------------
      // Layout base (autor + suporte)
      // ------------
      const whatsappHref = SUPPORT_WHATSAPP_E164
        ? `https://wa.me/${encodeURIComponent(SUPPORT_WHATSAPP_E164)}`
        : '';

      content.innerHTML = renderUpdatesEntriesHtml(entries, {
        author: APP_AUTHOR,
        whatsappDisplay: SUPPORT_WHATSAPP_DISPLAY,
        whatsappHref,
      });
    } catch (err) {
      content.innerHTML = `
        <p class="updates__empty">
          Não foi possível carregar o histórico agora.<br />
          Verifique o arquivo <strong>assets/changelog/updates.md</strong>.
        </p>
      `;

      // Log silencioso para debug
      console.warn('⚠️ Histórico de Atualizações: erro ao carregar', err);
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

    if (action === 'close-updates-modal') {
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
