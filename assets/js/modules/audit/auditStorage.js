/**
 * Módulo: Auditoria - Storage
 * Responsabilidade: Persistir e recuperar o histórico de auditoria com segurança
 */

import safeStorage from '../safeStorage.js';
import { AUDIT_STORAGE_KEY } from './auditConstants.js';

/**
 * Carrega o histórico de auditoria do storage.
 * @returns {Array} Lista de entradas (array)
 */
export function loadAuditEntries() {
  try {
    const raw = safeStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Garantir formato mínimo
    return parsed.filter(e => e && typeof e === 'object' && typeof e.tsIso === 'string');
  } catch {
    return [];
  }
}

/**
 * Salva o histórico de auditoria no storage.
 * @param {Array} entries
 * @returns {boolean}
 */
export function saveAuditEntries(entries) {
  try {
    const data = JSON.stringify(Array.isArray(entries) ? entries : []);
    return safeStorage.setItem(AUDIT_STORAGE_KEY, data);
  } catch {
    return false;
  }
}

/**
 * Remove o histórico de auditoria.
 * @returns {boolean}
 */
export function clearAuditEntries() {
  try {
    return safeStorage.removeItem(AUDIT_STORAGE_KEY);
  } catch {
    return false;
  }
}
