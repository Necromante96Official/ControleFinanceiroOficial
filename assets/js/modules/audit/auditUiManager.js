/**
 * Módulo: Auditoria - UI
 * Responsabilidade: Renderizar o histórico de auditoria em um container
 */

import { AUDIT_UPDATED_EVENT } from './auditConstants.js';
import { formatAuditDateTime } from './formatAuditDateTime.js';

export class AuditUiManager {
  constructor(options) {
    this.auditManager = options.auditManager;
    this.root = options.root;

    this._boundOnUpdated = null;
  }

  /**
   * Inicializa o renderer e listeners.
   */
  init() {
    if (!this.root || !this.auditManager) return;

    // Render inicial
    this.render();

    // Listener global
    this._boundOnUpdated = (evt) => {
      const entries = evt?.detail?.entries;
      if (Array.isArray(entries)) {
        this.render(entries);
      } else {
        this.render();
      }
    };

    window.addEventListener(AUDIT_UPDATED_EVENT, this._boundOnUpdated);
  }

  /**
   * Renderiza a lista.
   * @param {Array} maybeEntries
   */
  render(maybeEntries) {
    if (!this.root || !this.auditManager) return;

    const entries = Array.isArray(maybeEntries)
      ? maybeEntries
      : this.auditManager.getEntries();

    // Limpar
    this.root.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'audit-log';

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'audit-log__empty';
      empty.textContent = 'Sem ações recentes.';
      wrapper.appendChild(empty);
      this.root.appendChild(wrapper);
      return;
    }

    const list = document.createElement('div');
    list.className = 'audit-log__list';

    entries.slice(0, 60).forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'audit-log__item';

      const time = document.createElement('span');
      time.className = 'audit-log__time';
      time.textContent = formatAuditDateTime(entry.tsIso);

      const label = document.createElement('span');
      label.className = 'audit-log__label';
      label.textContent = entry.label;

      row.appendChild(time);
      row.appendChild(label);
      list.appendChild(row);
    });

    wrapper.appendChild(list);
    this.root.appendChild(wrapper);
  }

  /**
   * Remove listeners.
   */
  destroy() {
    if (this._boundOnUpdated) {
      window.removeEventListener(AUDIT_UPDATED_EVENT, this._boundOnUpdated);
    }
  }
}
