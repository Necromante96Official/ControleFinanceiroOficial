// Converte Uint8Array para Base64 (ASCII)
export function uint8ToBase64(bytes) {
	if (!(bytes instanceof Uint8Array)) {
		throw new Error('uint8ToBase64: bytes inválidos');
	}

	// ------------ Converte para string binária (chunked para evitar stack overflow)
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}

	return btoa(binary);
/**
 * Módulo: Compactação removida
 * Responsabilidade: Mantido apenas por compatibilidade (não utilizado).
 */

export function uint8ToBase64() {
	throw new Error('Compactação removida: utilitário base64 não deve ser usado.');
}
