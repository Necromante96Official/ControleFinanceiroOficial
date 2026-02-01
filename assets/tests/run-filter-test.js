/**
 * Entry point do npm script "test:filter".
 * Responsabilidade: executar uma suíte mínima de testes do filtro do Extrato.
 */

import { runTests } from './utils/testRunner.js';
import { getFilterManagerTests } from './filter/filterManager.test.js';

// ==================================================
// Execução
// ==================================================

try {
    const { failed } = await runTests('FilterManager', getFilterManagerTests());

    // ------------
    // Define exit code sem forçar saída abrupta.
    // ------------
    if (failed > 0) {
        process.exitCode = 1;
    }
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Falha inesperada ao executar testes:', message);
    process.exitCode = 1;
}
