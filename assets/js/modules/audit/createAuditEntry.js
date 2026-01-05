/**
 * Módulo: Auditoria - Criação de Entrada
 * Responsabilidade: Criar um objeto de auditoria consistente
 */

/**
 * @typedef {'criou'|'editou'|'removeu'|'transferiu'|'pagou'} AuditAction
 */

/**
 * Cria uma entrada de auditoria.
 * @param {{ action: AuditAction, label: string, meta?: any, tsIso?: string }} input
 * @returns {{ id: string, tsIso: string, action: AuditAction, label: string, meta?: any }}
 */
export function createAuditEntry(input) {
  const tsIso = input?.tsIso || new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    tsIso,
    action: input.action,
    label: String(input.label || '').trim(),
    meta: input.meta
  };
}
