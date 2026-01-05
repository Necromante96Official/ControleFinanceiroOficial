/**
 * Módulo: Deduplicação por ID
 * Responsabilidade: Remover itens duplicados (mesmo id) preservando a primeira ocorrência.
 */

/**
 * Deduplica um array de objetos pelo campo "id".
 * - Se o item não tiver id finito, ele é mantido.
 * - Se houver id repetido, mantém o primeiro e descarta os seguintes.
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function dedupeArrayByIdKeepFirst(items) {
	if (!Array.isArray(items)) return [];

	const seen = new Set();
	const out = [];

	for (const item of items) {
		if (!item || typeof item !== 'object') continue;

		const id = Number(item.id);
		const hasValidId = Number.isFinite(id) && id > 0;

		if (!hasValidId) {
			out.push(item);
			continue;
		}

		if (seen.has(id)) {
			continue;
		}

		seen.add(id);
		// Normaliza id para número (evita id string)
		out.push({ ...item, id });
	}

	return out;
}
