import { getBackupCounts } from './getBackupCounts.js';

// Monta mensagem de pré-visualização do backup para confirmação
export function formatBackupPreviewMessage({ payload, verified, warning }) {
	const counts = getBackupCounts(payload);

	const lines = [];
	lines.push('Pré-visualização do backup:');
	lines.push('');
	lines.push(`- Categorias: ${counts.categories}`);
	lines.push(`- Benefícios: ${counts.benefits}`);
	lines.push(`- Cartões de Débito: ${counts.debitCards}`);
	lines.push(`- Cartões de Crédito: ${counts.creditCards}`);
	lines.push(`- Transações: ${counts.transactions}`);
	lines.push('');

	if (payload?.exportDate) {
		lines.push(`Data do backup: ${payload.exportDate}`);
	}
	if (payload?.version) {
		lines.push(`Versão do app: ${payload.version}`);
	}
	if (payload?.build) {
		lines.push(`Build: ${payload.build}`);
	}

	lines.push('');
	lines.push(`Integridade (hash): ${verified ? 'OK' : 'NÃO DISPONÍVEL'}`);

	if (warning) {
		lines.push('');
		lines.push(`Aviso: ${warning}`);
	}

	lines.push('');
	lines.push('Deseja importar e substituir os dados atuais?');

	return lines.join('\n');
}
