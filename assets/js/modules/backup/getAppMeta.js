/**
 * Módulo: getAppMeta (Backup)
 * Responsabilidade: Expor metadados (versão/build) usados em backups.
 * Observação: a fonte agora é centralizada em appMeta (sem histórico de updates).
 */

import { getAppMeta as getAppMetaFromConstants } from '../appMeta/getAppMeta.js';

/**
 * Retorna metadados do app (versão/build) para embutir no backup.
 * @returns {{version: string, build: string}}
 */
export function getAppMeta() {
	const meta = getAppMetaFromConstants();
	return {
		version: meta.version,
		build: meta.build,
	};
}
