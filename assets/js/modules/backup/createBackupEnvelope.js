import { sha256HexFromText } from './sha256Hex.js';

// Cria um envelope de backup com hash de integridade (sem compactação)
// - payload: objeto com { version, build, exportDate, timestamp, type, summary, data }
export async function createBackupEnvelope({ payload }) {
	// ------------ Validação defensiva
	if (!payload || typeof payload !== 'object') {
		throw new Error('createBackupEnvelope: payload inválido');
	}

	// ------------ Canonicalização (JSON minificado) para hash estável
	const payloadJson = JSON.stringify(payload);
	const integrityHex = await sha256HexFromText(payloadJson);

	// ------------ Envelope base
	const envelopeBase = {
		format: 'controle-financeiro-backup',
		schemaVersion: 2,
		createdAt: new Date().toISOString(),
		integrity: {
			algo: 'SHA-256',
			source: 'payload-json',
			hex: integrityHex,
		},
	};

	// ------------ Inclui payload direto (JSON)
	return {
		...envelopeBase,
		payload,
	};
}
