/**
 * Módulo: Benefit Utils
 * Responsabilidade: Cálculos e normalizações para Benefícios (limite/usado/livre + recarga).
 *
 */

import * as dateUtils from './dateUtils.js';

/**
 * Normaliza valor numérico.
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
export function toNumber(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Retorna o limite mensal do benefício.
 * @param {Object} benefit
 * @returns {number}
 */
export function getLimit(benefit) {
  return toNumber(benefit?.limit, 0);
}

/**
 * Retorna o usado no ciclo atual.
 * @param {Object} benefit
 * @returns {number}
 */
export function getUsed(benefit) {
  return Math.max(0, toNumber(benefit?.used, 0));
}

/**
 * Retorna o livre (saldo disponível) atual.
 * Compatível com legado: se não existir benefit.available, calcula como (limit - used).
 *
 * @param {Object} benefit
 * @returns {number}
 */
export function getAvailable(benefit) {
  const explicit = toNumber(benefit?.available, NaN);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);

  const limit = getLimit(benefit);
  const used = getUsed(benefit);
  return Math.max(limit - used, 0);
}

/**
 * Normaliza o dia de recarga (1..31).
 * @param {any} reloadDay
 * @returns {number|null}
 */
export function normalizeReloadDay(reloadDay) {
  const n = Number.parseInt(String(reloadDay), 10);
  if (Number.isNaN(n) || n < 1 || n > 31) return null;
  return n;
}

/**
 * Ajusta o dia para o último dia do mês quando necessário (ex.: 31 em fevereiro).
 * @param {number} reloadDay
 * @param {number} year
 * @param {number} monthIndex - 0..11
 * @returns {number}
 */
export function getEffectiveReloadDay(reloadDay, year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(reloadDay, lastDay);
}

/**
 * Calcula a data ISO (UTC) da recarga mais recente (<= data de referência).
 * Usa componentes locais para evitar bugs de timezone.
 *
 * @param {number} reloadDay
 * @param {Date|string} referenceDate
 * @returns {string}
 */
export function computeMostRecentReloadDateISO(reloadDay, referenceDate = new Date()) {
  const normalized = dateUtils.normalizeDate(referenceDate);
  if (Number.isNaN(normalized.getTime())) {
    return dateUtils.today();
  }

  const year = normalized.getFullYear();
  const monthIndex = normalized.getMonth();

  const effectiveThisMonth = getEffectiveReloadDay(reloadDay, year, monthIndex);

  // ------------
  // Se já passou do dia, recarga mais recente é neste mês
  // ------------
  if (normalized.getDate() >= effectiveThisMonth) {
    return new Date(year, monthIndex, effectiveThisMonth, 0, 0, 0, 0).toISOString();
  }

  // ------------
  // Se ainda não chegou no dia, recarga mais recente é no mês anterior
  // ------------
  const prevMonthBase = new Date(year, monthIndex - 1, 1, 0, 0, 0, 0);
  const prevYear = prevMonthBase.getFullYear();
  const prevMonthIndex = prevMonthBase.getMonth();

  const effectivePrev = getEffectiveReloadDay(reloadDay, prevYear, prevMonthIndex);
  return new Date(prevYear, prevMonthIndex, effectivePrev, 0, 0, 0, 0).toISOString();
}
