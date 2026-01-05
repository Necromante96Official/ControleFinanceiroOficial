/**
 * Módulo: Utilitários de Dinheiro
 * Responsabilidade: Normalizar valores monetários (número / string) para número seguro.
 */

/**
 * Converte valores monetários variados para número.
 * - Aceita número, "1200.00", "1.200,00", "R$ 1.200,00", etc.
 * - Evita erro comum de coerção booleana (ex.: string "0" é truthy).
 * @param {unknown} value
 * @returns {number}
 */
export function parseMoneyToNumber(value) {
  // ------------
  // Números já prontos
  // ------------
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  // ------------
  // Strings / outros tipos
  // ------------
  const raw = value === null || value === undefined ? '' : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  // Mantém apenas dígitos e separadores relevantes
  const cleaned = trimmed.replace(/[^0-9.,-]/g, '');
  if (!cleaned) return 0;

  // Se tiver vírgula, tratamos como pt-BR: "." = milhar e "," = decimal
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Caso padrão ("1200.00", "0", "10")
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Considera "zero" valores muito pequenos que exibiriam como "R$ 0,00".
 * @param {number} amount
 * @param {number} epsilon
 * @returns {boolean}
 */
export function isEffectivelyZero(amount, epsilon = 0.005) {
  return !Number.isFinite(amount) || Math.abs(amount) < epsilon;
}

/**
 * Normaliza valores muito pequenos para zero.
 * @param {number} amount
 * @param {number} epsilon
 * @returns {number}
 */
export function clampToZero(amount, epsilon = 0.005) {
  return isEffectivelyZero(amount, epsilon) ? 0 : amount;
}

/**
 * Converte qualquer valor monetário em string fixa com 2 casas (padrão de persistência).
 * - Centraliza a regra que antes ficava espalhada em vários `.toFixed(2)`.
 * - Mantém ponto como separador decimal (ex.: "1200.00") para armazenamento.
 * @param {unknown} value
 * @returns {string}
 */
export function formatMoneyToFixedString(value) {
  // ------------
  // Normaliza e evita -0.00
  // ------------
  const amount = clampToZero(parseMoneyToNumber(value));

  // ------------
  // Arredondamento explícito (reduz ruído de ponto flutuante)
  // ------------
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;

  return rounded.toFixed(2);
}

/**
 * Formata um número de forma consistente em pt-BR.
 * Uso: métricas/indicadores na UI (não monetário).
 * @param {unknown} value
 * @param {{ minimumFractionDigits?: number, maximumFractionDigits?: number }} [options]
 * @returns {string}
 */
export function formatNumberPtBR(value, options = {}) {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
  const safe = Number.isFinite(num) ? num : 0;

  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options;

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(safe);
}
