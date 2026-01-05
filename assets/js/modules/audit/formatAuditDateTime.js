/**
 * Módulo: Auditoria - Formatação de Data/Hora
 * Responsabilidade: Formatar timestamps ISO para exibição (pt-BR)
 */

/**
 * Formata um ISO string para data/hora local.
 * @param {string} tsIso
 * @returns {string}
 */
export function formatAuditDateTime(tsIso) {
  try {
    const date = new Date(tsIso);
    if (Number.isNaN(date.getTime())) return '';

    // ------------
    // Formato consistente: dd/mm/aaaa hh:mm
    // ------------
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch {
    return '';
  }
}
