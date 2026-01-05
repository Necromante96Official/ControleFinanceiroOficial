/**
 * Módulo: formatBuildForDisplay
 * Responsabilidade: Converter um build com pontos para o formato exibido sem pontos.
 * Exemplo: "308" -> "308".
 */

/**
 * Formata o build para exibição removendo tudo que não for dígito.
 * @param {string} build
 * @returns {string}
 */
export function formatBuildForDisplay(build) {
  const normalized = String(build ?? '').trim();
  if (!normalized) return '';

  // ------------
  // Remover qualquer caractere que não seja número
  // ------------
  const digitsOnly = normalized.replace(/\D/g, '');
  return digitsOnly;
}
