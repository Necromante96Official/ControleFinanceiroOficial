/**
 * Runner minimalista de testes.
 * Responsabilidade: executar uma lista de testes e retornar status.
 */

/**
 * @typedef {{ name: string, fn: () => (void|Promise<void>) }} TestCase
 */

/**
 * Executa todos os testes informados.
 * @param {string} suiteName
 * @param {TestCase[]} tests
 * @returns {Promise<{ passed: number, failed: number }>} 
 */
export async function runTests(suiteName, tests) {
    const safeSuite = suiteName || 'suite';
    const list = Array.isArray(tests) ? tests : [];

    let passed = 0;
    let failed = 0;

    console.log(`\n=== ${safeSuite} ===`);

    for (const test of list) {
        const name = test?.name || 'teste sem nome';

        try {
            // ------------
            // Suporte a testes síncronos e assíncronos
            // ------------
            await test.fn();
            passed++;
            console.log(`✅ ${name}`);
        } catch (err) {
            failed++;
            const message = err instanceof Error ? err.message : String(err);
            console.log(`❌ ${name}`);
            console.log(`   ${message}`);
        }
    }

    console.log(`Resumo: ${passed} ok | ${failed} falhou`);
    return { passed, failed };
}
