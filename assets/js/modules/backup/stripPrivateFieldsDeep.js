/**
 * Módulo: Remoção de Campos Privados
 * Responsabilidade: Remover chaves internas (ex.: iniciadas com "_") e chaves perigosas.
 *
 * Observação:
 * - Backup pode conter campos calculados no export (ex.: _available). Isso não deve ser persistido.
 * - Remove também chaves que podem ser usadas para poluição de protótipo.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Remove campos privados de um objeto/array recursivamente.
 * @param {any} value
 * @returns {any}
 */
export function stripPrivateFieldsDeep(value) {
	// ------------ Primitivos
	if (value === null || value === undefined) return value;
	if (typeof value !== 'object') return value;

	// ------------ Arrays
	if (Array.isArray(value)) {
		return value.map(item => stripPrivateFieldsDeep(item));
	}

	// ------------ Objetos
	const out = {};
	for (const [key, val] of Object.entries(value)) {
		// Remove chaves perigosas
		if (FORBIDDEN_KEYS.has(key)) continue;

		// Remove campos internos/calculados
		if (key.startsWith('_')) continue;

		out[key] = stripPrivateFieldsDeep(val);
	}

	return out;
}
