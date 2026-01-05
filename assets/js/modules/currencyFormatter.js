/**
 * Módulo: Formatador de Moeda
 * Responsabilidade: Formatar e processar valores monetários com vírgula (separador decimal BR)
 */

import { parseMoneyToNumber } from './moneyUtils.js';

/**
 * Formata um valor numérico para formato monetário BR enquanto o usuário digita
 * Exemplo: "1200" → "1.200,00"
 * @param {string} value - Valor digitado pelo usuário
 * @returns {string} Valor formatado
 */
export function formatCurrencyInput(value) {
  // Remove tudo que não for número
  let numbers = value.replace(/\D/g, "");

  if (!numbers) return "";

  // Converte para número
  let num = parseInt(numbers, 10);

  // Formata com locale pt-BR
  return (num / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Extrai apenas os números de um valor formatado
 * Exemplo: "1.200,00" → 1200.00 (como número)
 * @param {string} formattedValue - Valor formatado (ex: "1.200,00")
 * @returns {number} Valor como número
 */
export function parseCurrencyInput(formattedValue) {
  // Reaproveita a mesma regra global do app (aceita "1.200,00", "1200.00", "R$ 1.200,00", etc.)
  return parseMoneyToNumber(formattedValue);
}

/**
 * Formata um número para exibição em reais
 * Exemplo: 1200 → "R$ 1.200,00"
 * @param {number} value - Valor numérico
 * @returns {string} Valor formatado com símbolo R$
 */
export function formatCurrencyDisplay(value) {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Formata um número para apenas valor com vírgula
 * Exemplo: 1200 → "1.200,00"
 * @param {number} value - Valor numérico
 * @returns {string} Valor formatado
 */
export function formatCurrencySimple(value) {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
