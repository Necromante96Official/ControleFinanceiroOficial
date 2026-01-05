/**
 * Módulo: Auditoria - Notificação
 * Responsabilidade: Emitir evento global quando o histórico muda
 */

import { AUDIT_UPDATED_EVENT } from './auditConstants.js';

/**
 * Dispara evento global com as entradas atuais.
 * @param {Array} entries
 */
export function dispatchAuditUpdated(entries) {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(AUDIT_UPDATED_EVENT, {
      detail: {
        entries: Array.isArray(entries) ? entries : []
      }
    }));
  } catch {
    // Ignorar
  }
}
