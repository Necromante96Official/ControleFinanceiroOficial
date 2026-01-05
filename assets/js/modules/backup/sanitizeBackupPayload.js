/**
 * Módulo: Sanitização de Backup
 * Responsabilidade: Normalizar e limpar o payload de backup antes de importar/restaurar.
 *
 * Objetivos:
 * - Evitar campos calculados "_" (snapshot enriquecido) serem persistidos.
 * - Evitar itens inválidos e duplicados por id.
 * - Reduzir risco de "bug" ao importar com dados existentes (import substitutivo e determinístico).
 */

import { stripPrivateFieldsDeep } from './stripPrivateFieldsDeep.js';
import { dedupeArrayByIdKeepFirst } from './dedupeArrayByIdKeepFirst.js';

/**
 * Sanitiza um payload de backup (v2 ou legado) para uso interno.
 * @param {object} payload
 * @returns {{ payload: object, data: { categories: Array, benefits: Array, credit: Array, debit: Array, transactions: Array } }}
 */
export function sanitizeBackupPayload(payload) {
	// ================ Validação mínima
	if (!payload || typeof payload !== 'object') {
		throw new Error('Backup inválido: payload ausente');
	}
	if (!payload.data || typeof payload.data !== 'object') {
		throw new Error('Backup inválido: campo data ausente');
	}

	// ================ Remover qualquer auditoria do backup (não deve ir para export/import)
	// Obs.: mesmo que algum arquivo legado traga auditoria junto, o app ignora e não reexporta.
	// ------------
	const {
		audit,
		auditLog,
		auditEntries,
		auditoria,
		...payloadWithoutAudit
	} = payload;

	// ================ Extrair listas (sempre arrays)
	const raw = payload.data;
	const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : [];
	const benefitsRaw = Array.isArray(raw.benefits) ? raw.benefits : [];
	const creditRaw = Array.isArray(raw.credit) ? raw.credit : [];
	const debitRaw = Array.isArray(raw.debit) ? raw.debit : [];
	const transactionsRaw = Array.isArray(raw.transactions) ? raw.transactions : [];

	// ================ Limpeza profunda (remove campos privados e chaves perigosas)
	const categoriesClean = categoriesRaw
		.filter(item => item && typeof item === 'object')
		.map(item => stripPrivateFieldsDeep(item));

	const benefitsClean = benefitsRaw
		.filter(item => item && typeof item === 'object')
		.map(item => stripPrivateFieldsDeep(item));

	const creditClean = creditRaw
		.filter(item => item && typeof item === 'object')
		.map(item => stripPrivateFieldsDeep(item));

	const debitClean = debitRaw
		.filter(item => item && typeof item === 'object')
		.map(item => stripPrivateFieldsDeep(item));

	const transactionsClean = transactionsRaw
		.filter(item => item && typeof item === 'object')
		.map(item => stripPrivateFieldsDeep(item));

	// ================ Deduplicação por id (mantém a primeira ocorrência)
	const categories = dedupeArrayByIdKeepFirst(categoriesClean);
	const benefits = dedupeArrayByIdKeepFirst(benefitsClean);
	const credit = dedupeArrayByIdKeepFirst(creditClean);
	const debit = dedupeArrayByIdKeepFirst(debitClean);
	const transactions = dedupeArrayByIdKeepFirst(transactionsClean);

	// ================ Payload sanitizado (mantém metadados, troca data)
	const payloadSanitized = {
		...payloadWithoutAudit,
		data: {
			categories,
			benefits,
			credit,
			debit,
			transactions,
		},
	};

	return {
		payload: payloadSanitized,
		data: payloadSanitized.data,
	};
}
