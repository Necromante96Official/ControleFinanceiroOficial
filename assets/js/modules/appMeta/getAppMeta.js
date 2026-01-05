/**
 * Módulo: getAppMeta
 * Responsabilidade: Expor metadados do app para UI/backup.
 */

import { APP_AUTHOR, APP_BUILD, APP_VERSION } from './appMetaConstants.js';
import { formatBuildForDisplay } from './formatBuildForDisplay.js';

/**
 * Retorna metadados do app.
 * @returns {{
 *  version: string,
 *  versionNumber: string,
 *  build: string,
 *  buildDisplay: string,
 *  author: string
 * }}
 */
export function getAppMeta() {
  const buildDisplay = formatBuildForDisplay(APP_BUILD);

  return {
    // Mantém o padrão anterior usado em outras áreas (com "v").
    version: `v${APP_VERSION}`,
    // Versão como número para exibição em frases ("Versão 1.0.3").
    versionNumber: APP_VERSION,
    // Build com pontos para uso interno/cache.
    build: APP_BUILD,
    // Build sem pontos para exibição ("Build 292").
    buildDisplay,
    author: APP_AUTHOR,
  };
}
