/**
 * Módulo: Persist Utils
 * Responsabilidade: Persistência resiliente com limite de tempo (evita travas no refresh/fechar).
 *
 */

/**
 * Faz flush dos stores com limite de tempo para evitar travar a UI.
 * - Só faz flush do que estiver fora de sync (reduz custo)
 * - Interrompe quando passa do orçamento de tempo
 *
 * @param {Array<{ storageKey?: string, isInSync?: Function, syncFlush?: Function }>} storeList
 * @param {Object} [options]
 * @param {number} [options.budgetMs=150] - Orçamento de tempo (ms)
 * @param {string} [options.reason='unspecified'] - Contexto (logs)
 * @returns {{ attempted: number, flushed: number, skippedInSync: number, stoppedByBudget: boolean, elapsedMs: number }}
 */
export function flushStoresWithBudget(storeList, options = {}) {
  // ------------
  // Configuração
  // ------------
  const budgetMs = Number.isFinite(options.budgetMs) ? options.budgetMs : 150;
  const reason = options.reason ? String(options.reason) : 'unspecified';

  // ------------
  // Medição (compatível)
  // ------------
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? () => performance.now()
    : () => Date.now();

  const start = now();

  // ------------
  // Execução
  // ------------
  let attempted = 0;
  let flushed = 0;
  let skippedInSync = 0;
  let stoppedByBudget = false;

  const list = Array.isArray(storeList) ? storeList : [];

  for (const store of list) {
    // Budget guard (antes de iniciar o próximo flush)
    if (now() - start > budgetMs) {
      stoppedByBudget = true;
      break;
    }

    if (!store || typeof store.syncFlush !== 'function') {
      continue;
    }

    attempted++;

    // Evitar flush redundante (principal causa de travas com muitos lançamentos)
    try {
      if (typeof store.isInSync === 'function' && store.isInSync()) {
        skippedInSync++;
        continue;
      }
    } catch {
      // Se falhar a checagem, tenta flush mesmo assim
    }

    try {
      const ok = store.syncFlush();
      if (ok) flushed++;
    } catch (e) {
      // Não interromper o ciclo por falha pontual
      console.warn(`⚠️ Persistência falhou (${reason})`, store?.storageKey || 'store', e);
    }
  }

  const elapsedMs = now() - start;

  return {
    attempted,
    flushed,
    skippedInSync,
    stoppedByBudget,
    elapsedMs
  };
}
