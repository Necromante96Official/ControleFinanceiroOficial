/**
 * Date Utilities - Tratamento Padronizado de Datas e Timezone
 *
 * Fornece funções utilitárias para lidar com datas de forma consistente,
 * evitando problemas de timezone e garantindo comparações precisas.
 *
 * ESTRATÉGIA:
 * - Armazena SEMPRE em formato ISO 8601 UTC (toISOString)
 * - Converte para horário local apenas para exibição
 * - Normaliza datas para comparação sem considerar horário
 * - Padroniza criação de datas para evitar shifts de timezone
 *

 */

/**
 * Obtém timestamp atual em ISO 8601 UTC
 * Uso: Armazenar createdAt, updatedAt, lastReloadDate, etc.
 * @returns {string} Data/hora atual em formato ISO UTC (ex: "2025-01-15T14:30:00.000Z")
 */
export function now() {
  return new Date().toISOString();
}

/**
 * Obtém data atual (apenas data, sem horário) em ISO 8601
 * Uso: Armazenar campos de data sem necessidade de horário preciso
 * @returns {string} Data atual em formato ISO (ex: "2025-01-15T00:00:00.000Z")
 */
export function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

/**
 * Obtém data LOCAL no formato YYYY-MM-DD.
 * Uso: inputs HTML type="date" e tokens diários (sem depender de UTC).
 *
 * IMPORTANTE:
 * - Não usa toISOString(), pois toISOString() é sempre UTC e pode "virar" o dia à noite.
 *
 * @param {Date} [date] - Data base (padrão: agora)
 * @returns {string} Data local em formato YYYY-MM-DD
 */
export function getLocalISODateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converte um ISO DateTime (ou Date) para valor de input type="date" (YYYY-MM-DD) no horário local.
 *
 * @param {Date|string} date - Date ou string ISO
 * @returns {string} Valor seguro para input type="date" (ou string vazia se inválido)
 */
export function toDateInputValue(date) {
  const normalized = normalizeDate(date);
  if (Number.isNaN(normalized.getTime())) return '';
  return getLocalISODateString(normalized);
}

/**
 * Normaliza uma data/string para Date object sem timezone shifts
 *
 * PROBLEMA: new Date("2025-01-15") pode criar datas diferentes dependendo do timezone
 * SOLUÇÃO: Extrai componentes e cria data em horário local explicitamente
 *
 * @param {Date|string} date - Data a ser normalizada
 * @returns {Date} Date object normalizado (horário local, 00:00:00.000)
 */
export function normalizeDate(date) {
  if (!date) return new Date(NaN); // Invalid date

  let d;

  if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'string') {
    // Parse ISO string mantendo componentes locais
    d = new Date(date);
  } else {
    return new Date(NaN);
  }

  // Extrai componentes e cria nova data em horário local (sem timezone)
  // Isso garante que 2025-01-15T00:00:00Z seja tratada como 15 de janeiro
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Cria Date object a partir de componentes (ano, mês, dia)
 * Uso: Criar datas explícitas sem risco de timezone shifts
 *
 * @param {number} year - Ano (ex: 2025)
 * @param {number} month - Mês (1-12, não 0-11)
 * @param {number} day - Dia (1-31)
 * @returns {Date} Date object em horário local
 */
export function createDate(year, month, day) {
  // month - 1 porque Date usa 0-11 para meses
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Cria ISO string a partir de componentes (ano, mês, dia)
 * Uso: Armazenar datas específicas em formato ISO
 *
 * @param {number} year - Ano (ex: 2025)
 * @param {number} month - Mês (1-12, não 0-11)
 * @param {number} day - Dia (1-31)
 * @returns {string} Data em formato ISO UTC
 */
export function createISODate(year, month, day) {
  return createDate(year, month, day).toISOString();
}

/**
 * Converte Date/string para início do dia (00:00:00.000)
 * @param {Date|string} date - Data a converter
 * @returns {Date} Data com horário ajustado para 00:00:00.000
 */
export function startOfDay(date) {
  const normalized = normalizeDate(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Converte Date/string para fim do dia (23:59:59.999)
 * @param {Date|string} date - Data a converter
 * @returns {Date} Data com horário ajustado para 23:59:59.999
 */
export function endOfDay(date) {
  const normalized = normalizeDate(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

/**
 * Obtém início do mês atual
 * @returns {Date} Primeiro dia do mês às 00:00:00.000
 */
export function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Obtém fim do mês atual
 * @returns {Date} Último dia do mês às 23:59:59.999
 */
export function endOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Obtém início de um mês específico
 * @param {number} year - Ano (ex: 2025)
 * @param {number} month - Mês (1-12, não 0-11)
 * @returns {Date} Primeiro dia do mês às 00:00:00.000
 */
export function startOfMonth(year, month) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

/**
 * Obtém fim de um mês específico
 * @param {number} year - Ano (ex: 2025)
 * @param {number} month - Mês (1-12, não 0-11)
 * @returns {Date} Último dia do mês às 23:59:59.999
 */
export function endOfMonth(year, month) {
  // month (não month - 1) porque queremos o dia 0 do mês seguinte = último dia do mês anterior
  return new Date(year, month, 0, 23, 59, 59, 999);
}

/**
 * Obtém início de um ano específico
 * @param {number} year - Ano (ex: 2025)
 * @returns {Date} 1º de janeiro às 00:00:00.000
 */
export function startOfYear(year) {
  return new Date(year, 0, 1, 0, 0, 0, 0);
}

/**
 * Obtém fim de um ano específico
 * @param {number} year - Ano (ex: 2025)
 * @returns {Date} 31 de dezembro às 23:59:59.999
 */
export function endOfYear(year) {
  return new Date(year, 11, 31, 23, 59, 59, 999);
}

/**
 * Verifica se uma data está dentro de um período
 * @param {Date|string} date - Data a verificar
 * @param {Date|string} startDate - Data inicial do período
 * @param {Date|string} endDate - Data final do período
 * @returns {boolean} true se a data está no período
 */
export function isInPeriod(date, startDate, endDate) {
  const normalized = normalizeDate(date);
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  return normalized >= start && normalized <= end;
}

/**
 * Compara duas datas (ignora horário)
 * @param {Date|string} date1 - Primeira data
 * @param {Date|string} date2 - Segunda data
 * @returns {number} -1 se date1 < date2, 0 se iguais, 1 se date1 > date2
 */
export function compareDates(date1, date2) {
  const d1 = normalizeDate(date1).getTime();
  const d2 = normalizeDate(date2).getTime();

  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * Verifica se duas datas são do mesmo dia
 * @param {Date|string} date1 - Primeira data
 * @param {Date|string} date2 - Segunda data
 * @returns {boolean} true se são do mesmo dia
 */
export function isSameDay(date1, date2) {
  return compareDates(date1, date2) === 0;
}

/**
 * Formata data para exibição (padrão brasileiro)
 * @param {Date|string} date - Data a formatar
 * @param {boolean} includeTime - Se deve incluir horário (padrão: false)
 * @returns {string} Data formatada (ex: "15/01/2025" ou "15/01/2025 14:30")
 */
export function formatDate(date, includeTime = false) {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return 'Data inválida';
  }

  const options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo' // Força timezone brasileiro
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return d.toLocaleString('pt-BR', options);
}

/**
 * Parse de string de data em formato brasileiro (dd/mm/yyyy)
 * @param {string} dateStr - String no formato "dd/mm/yyyy"
 * @returns {Date} Date object ou Invalid Date se formato incorreto
 */
export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return new Date(NaN);
  }

  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    return new Date(NaN);
  }

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return new Date(NaN);
  }

  return createDate(year, month, day);
}

/**
 * Adiciona dias a uma data
 * @param {Date|string} date - Data base
 * @param {number} days - Número de dias a adicionar (pode ser negativo)
 * @returns {Date} Nova data
 */
export function addDays(date, days) {
  const d = normalizeDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Adiciona meses a uma data
 * @param {Date|string} date - Data base
 * @param {number} months - Número de meses a adicionar (pode ser negativo)
 * @returns {Date} Nova data
 */
export function addMonths(date, months) {
  const d = normalizeDate(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Calcula diferença em dias entre duas datas
 * @param {Date|string} date1 - Primeira data
 * @param {Date|string} date2 - Segunda data
 * @returns {number} Diferença em dias (positivo se date1 > date2)
 */
export function diffInDays(date1, date2) {
  const d1 = normalizeDate(date1).getTime();
  const d2 = normalizeDate(date2).getTime();
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.round((d1 - d2) / msPerDay);
}

/**
 * Obtém nome do mês em português
 * @param {number} monthIndex - Índice do mês (0-11)
 * @returns {string} Nome do mês
 */
export function getMonthName(monthIndex) {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return months[monthIndex] || 'Mês inválido';
}

/**
 * Obtém nome abreviado do mês em português
 * @param {number} monthIndex - Índice do mês (0-11)
 * @returns {string} Nome abreviado do mês
 */
export function getMonthNameShort(monthIndex) {
  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  return months[monthIndex] || 'Mês inválido';
}

/**
 * Formata data e hora para exibição completa (padrão brasileiro)
 * Helper para formato completo DD/MM/YYYY HH:mm:ss
 * @param {Date|string} date - Data a formatar
 * @returns {string} Data e hora formatadas (ex: "05/12/2025 18:46:24")
 */
export function formatDateTime(date) {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return 'Data inválida';
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}
