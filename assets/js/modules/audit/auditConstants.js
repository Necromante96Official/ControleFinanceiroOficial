/**
 * Módulo: Auditoria - Constantes
 * Responsabilidade: Centralizar chaves e limites do histórico de auditoria
 */

export const AUDIT_STORAGE_KEY = 'finance-control:audit-log';

// Quantidade máxima de ações armazenadas (últimas N)
export const AUDIT_MAX_ENTRIES = 120;

// Evento disparado no window quando o histórico muda
export const AUDIT_UPDATED_EVENT = 'audit-log-updated';
