// Calcula SHA-256 (hex) a partir de uma string UTF-8
export async function sha256HexFromText(text) {
	// ------------ Validação defensiva
	if (typeof text !== 'string') {
		throw new Error('sha256HexFromText: texto inválido');
	}

	// ------------ Hash
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const bytes = new Uint8Array(digest);

	// ------------ Converte para hex
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}

	return hex;
}
