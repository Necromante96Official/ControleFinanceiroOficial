/**
 * Utilitário simples de asserções para testes (sem dependências).
 * Responsabilidade: validar condições e lançar erros claros.
 */

/**
 * Lança erro se a condição for falsa.
 * @param {boolean} condition
 * @param {string} message
 */
export function assert(condition, message) {
    if (condition) return;
    throw new Error(message || 'Asserção falhou');
}

/**
 * Compara igualdade estrita.
 * @template T
 * @param {T} actual
 * @param {T} expected
 * @param {string} message
 */
export function assertEqual(actual, expected, message) {
    if (Object.is(actual, expected)) return;
    throw new Error(
        message || `Esperado: ${String(expected)} | Atual: ${String(actual)}`
    );
}

/**
 * Verifica se um valor é instância de um tipo.
 * @param {unknown} value
 * @param {Function} ctor
 * @param {string} message
 */
export function assertInstanceOf(value, ctor, message) {
    // ------------
    // Evita false positives quando ctor não é função.
    // ------------
    if (typeof ctor !== 'function') {
        throw new Error('assertInstanceOf: ctor inválido');
    }

    if (value instanceof ctor) return;
    throw new Error(message || `Valor não é instância de ${ctor.name || 'ctor'}`);
}
