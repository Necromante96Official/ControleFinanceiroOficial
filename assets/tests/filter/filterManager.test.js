/**
 * Testes do FilterManager (aba Extrato).
 * Responsabilidade: garantir que o filtro por conta não quebre.
 */

import { FilterManager } from '../../js/modules/filterManager.js';
import { assert, assertEqual, assertInstanceOf } from '../utils/assert.js';

/**
 * Cria um store fake com os métodos mínimos usados pelo FilterManager.
 * @param {Array<{id: string|number}>} items
 * @param {number} [revision]
 */
function createStore(items, revision) {
    const list = Array.isArray(items) ? items : [];

    return {
        // ------------
        // API esperada pelo FilterManager
        // ------------
        getAll() {
            return list;
        },

        // getRevision é opcional no código (quando não existe, deve cair em fallback)
        ...(Number.isFinite(revision)
            ? {
                getRevision() {
                    return revision;
                }
            }
            : {})
    };
}

/**
 * Constrói um FilterManager com dependências mínimas.
 */
function createFilterManager({ creditStore, debitStore, benefitStore } = {}) {
    return new FilterManager({
        // elements não são usados nos testes (não chamamos init/setupEventListeners)
        elements: {},

        // stores obrigatórios no construtor original (mas não usados nestes testes)
        transactionStore: null,
        categoryStore: null,

        // stores para filtro por conta
        creditStore: creditStore || null,
        debitStore: debitStore || null,
        benefitStore: benefitStore || null,

        onFilterChange: () => { }
    });
}

/**
 * Retorna os casos de teste do FilterManager.
 */
export function getFilterManagerTests() {
    return [
        {
            name: 'cria Set de IDs (crédito) sem quebrar',
            fn: () => {
                const creditStore = createStore([{ id: 1 }, { id: '2' }]);
                const fm = createFilterManager({ creditStore });

                const ids = fm._getAccountIdsSet('credito');
                assertInstanceOf(ids, Set, 'Resultado precisa ser Set');
                assert(ids.has('1'), 'Deveria conter id "1"');
                assert(ids.has('2'), 'Deveria conter id "2"');
            }
        },

        {
            name: 'filtra por crédito (all) considerando sourceId e targetId',
            fn: () => {
                const creditStore = createStore([{ id: 'cc-1' }, { id: 'cc-2' }], 10);
                const fm = createFilterManager({ creditStore });

                const txs = [
                    // Compra no crédito: sourceId = cartão
                    { paymentMethod: 'credito', sourceId: 'cc-1', categoryId: 'c1' },
                    { paymentMethod: 'credito', sourceId: 'cc-x', categoryId: 'c1' },

                    // Pagamento de fatura: targetId = cartão
                    { paymentMethod: 'pagar-credito', targetId: 'cc-2', categoryId: 'c1' },
                    { paymentMethod: 'pagar-credito', targetId: 'cc-x', categoryId: 'c1' },

                    // Outros métodos não entram no filtro de crédito
                    { paymentMethod: 'debito', sourceId: 'db-1', categoryId: 'c1' }
                ];

                const filtered = fm._filterByCategoryAndAccount(txs, [], 'credito', 'all');
                assertEqual(filtered.length, 2, 'Deveria manter apenas 2 transações');
            }
        },

        {
            name: 'filtra por benefício (id específico)',
            fn: () => {
                const benefitStore = createStore([{ id: 'bf-1' }, { id: 'bf-2' }], 1);
                const fm = createFilterManager({ benefitStore });

                const txs = [
                    { paymentMethod: 'beneficio', sourceId: 'bf-1', categoryId: 'c1' },
                    { paymentMethod: 'beneficio', sourceId: 'bf-2', categoryId: 'c1' },
                    { paymentMethod: 'credito', sourceId: 'cc-1', categoryId: 'c1' }
                ];

                const filtered = fm._filterByCategoryAndAccount(txs, [], 'beneficio', 'bf-2');
                assertEqual(filtered.length, 1, 'Deveria manter apenas 1 transação');
                assertEqual(String(filtered[0].sourceId), 'bf-2', 'Deveria ser do benefício bf-2');
            }
        }
    ];
}
