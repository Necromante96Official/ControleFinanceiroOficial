import { sha256HexFromText } from './sha256Hex.js';

// Faz parse e validação básica do arquivo de backup.
// Suporta:
// - Formato novo (envelope schemaVersion 2)
// - Formato legado (objeto direto com { data, summary, ... })
export async function parseBackupEnvelopeFromJsonText(jsonText) {
	// ------------ Parse
	let root;
	try {
		root = JSON.parse(jsonText);
	} catch {
		throw new Error('Arquivo inválido: JSON malformado');
	}

	// ------------ Formato novo
	if (root && root.format === 'controle-financeiro-backup' && root.schemaVersion === 2) {
		const integrity = root.integrity;
		if (!integrity || integrity.algo !== 'SHA-256' || integrity.source !== 'payload-json' || !integrity.hex) {
			throw new Error('Backup inválido: integridade ausente ou inválida');
		}

		// ------------ Compactação removida: rejeitar backups compactados antigos
		if (root.compression === 'gzip' || root.payloadBase64) {
			throw new Error('Backup compactado não é mais suportado. Exporte novamente um backup atualizado (não compactado).');
		}

		const payload = root.payload;
		if (!payload || typeof payload !== 'object') {
			throw new Error('Backup inválido: payload ausente');
		}

		// ------------ Verificação de integridade
		const computedHex = await sha256HexFromText(JSON.stringify(payload));
		if (computedHex !== integrity.hex) {
			throw new Error('Integridade falhou: o backup parece corrompido ou adulterado');
		}

		return {
			format: 'v2',
			payload,
			verified: true,
			warning: root.warning || null,
		};
	}

	// ------------ Formato legado (sem hash)
	// Aceita desde que tenha "data" (objeto com listas) e algum identificador de versão/build opcional.
	if (!root || typeof root !== 'object' || !root.data) {
		throw new Error('Backup inválido: estrutura não reconhecida');
	}

	return {
		format: 'legacy',
		payload: root,
		verified: false,
		warning: 'Backup antigo (sem verificação de integridade).',
	};
}
