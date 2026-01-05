/**
 * Store Observer - Sistema de Observação de Mudanças nos Stores
 * Responsabilidade: Notificar observadores sobre mudanças nos dados
 *

 *
 * Implementa Observer Pattern para:
 * - Atualizar estatísticas automaticamente
 * - Sincronizar UI com mudanças de dados
 * - Prevenir estados desatualizados
 * - Desacoplar componentes
 */

export class StoreObserver {
  constructor() {
    this.observers = new Map();
    this.eventQueue = [];
    this.isProcessing = false;
    this.debounceTimers = new Map();
  }

  /**
   * Registra um observador para um store específico
   * @param {string} storeName - Nome do store (categories, benefits, etc)
   * @param {string} event - Tipo de evento (add, update, remove, clear)
   * @param {Function} callback - Função a ser chamada
   * @param {Object} options - Opções (debounce, priority)
   * @returns {string} - ID do observador (para desregistrar)
   */
  on(storeName, event, callback, options = {}) {
    const { debounce = 0, priority = 0 } = options;

    const observerId = `${storeName}:${event}:${Date.now()}-${Math.random()}`;

    if (!this.observers.has(storeName)) {
      this.observers.set(storeName, new Map());
    }

    const storeObservers = this.observers.get(storeName);

    if (!storeObservers.has(event)) {
      storeObservers.set(event, []);
    }

    storeObservers.get(event).push({
      id: observerId,
      callback,
      debounce,
      priority,
      lastCalled: 0
    });

    // Ordenar por prioridade (maior = executa primeiro)
    storeObservers.get(event).sort((a, b) => b.priority - a.priority);

    console.log(`📡 Observer registrado: ${storeName}.${event} (ID: ${observerId})`);

    return observerId;
  }

  /**
   * Remove um observador
   * @param {string} observerId - ID retornado pelo método on()
   */
  off(observerId) {
    for (const [storeName, events] of this.observers.entries()) {
      for (const [event, observers] of events.entries()) {
        const index = observers.findIndex(o => o.id === observerId);
        if (index !== -1) {
          observers.splice(index, 1);
          console.log(`📡 Observer removido: ${observerId}`);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Notifica observadores sobre uma mudança
   * @param {string} storeName - Nome do store
   * @param {string} event - Tipo de evento
   * @param {*} data - Dados do evento
   */
  notify(storeName, event, data = {}) {
    const storeObservers = this.observers.get(storeName);

    if (!storeObservers) return;
    let targetEvent = event;
    if (!storeObservers.has(event)) {
      if (event === 'setAll') {
        // Redirecionar setAll para update (que geralmente recarrega a UI)
        if (storeObservers.has('update')) {
          targetEvent = 'update';
        } else if (storeObservers.has('clear')) {
          targetEvent = 'clear';
        } else {
          return; // Nenhum observer compatível
        }
        console.log(`📡 Redirecionando ${storeName}.${event} -> ${targetEvent}`);
      } else {
        return;
      }
    }

    const observers = storeObservers.get(targetEvent);

    observers.forEach(observer => {
      if (observer.debounce > 0) {
        this._notifyDebounced(observer, storeName, event, data);
      } else {
        this._callObserver(observer, storeName, event, data);
      }
    });
  }

  /**
   * Notifica com debounce
   * @private
   */
  _notifyDebounced(observer, storeName, event, data) {
    const timerKey = observer.id;

    // Cancelar timer anterior
    if (this.debounceTimers.has(timerKey)) {
      clearTimeout(this.debounceTimers.get(timerKey));
    }

    // Criar novo timer
    const timer = setTimeout(() => {
      this._callObserver(observer, storeName, event, data);
      this.debounceTimers.delete(timerKey);
    }, observer.debounce);

    this.debounceTimers.set(timerKey, timer);
  }

  /**
   * Executa callback do observador
   * @private
   */
  _callObserver(observer, storeName, event, data) {
    try {
      observer.lastCalled = Date.now();
      observer.callback({
        storeName,
        event,
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error(`❌ Erro no observer ${observer.id}:`, error);
    }
  }

  /**
   * Notifica múltiplos eventos em batch
   * @param {Array} events - Array de {storeName, event, data}
   */
  notifyBatch(events) {
    events.forEach(({ storeName, event, data }) => {
      this.notify(storeName, event, data);
    });
  }

  /**
   * Remove todos os observadores de um store
   * @param {string} storeName - Nome do store
   */
  clearStore(storeName) {
    if (this.observers.has(storeName)) {
      this.observers.delete(storeName);
      console.log(`📡 Todos os observers de ${storeName} removidos`);
    }
  }

  /**
   * Remove todos os observadores
   */
  clearAll() {
    this.observers.clear();
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    console.log('📡 Todos os observers removidos');
  }

  /**
   * Retorna estatísticas dos observadores
   */
  getStats() {
    const stats = {
      stores: this.observers.size,
      totalObservers: 0,
      byStore: {}
    };

    for (const [storeName, events] of this.observers.entries()) {
      let storeTotal = 0;
      const eventCounts = {};

      for (const [event, observers] of events.entries()) {
        eventCounts[event] = observers.length;
        storeTotal += observers.length;
      }

      stats.byStore[storeName] = {
        total: storeTotal,
        events: eventCounts
      };

      stats.totalObservers += storeTotal;
    }

    return stats;
  }
}

// Singleton
const storeObserver = new StoreObserver();

export default storeObserver;

/**
 * Helper para criar observador de mudanças genérico
 * @param {string} storeName
 * @param {Function} callback - Recebe evento completo
 * @returns {Array<string>} - IDs dos observadores
 */
export function observeStoreChanges(storeName, callback, options = {}) {
  const events = ['add', 'update', 'remove', 'clear', 'setAll'];
  const ids = [];

  events.forEach(event => {
    const id = storeObserver.on(storeName, event, callback, options);
    ids.push(id);
  });

  return ids;
}

/**
 * Helper para remover múltiplos observadores
 * @param {Array<string>} ids - IDs dos observadores
 */
export function unobserveAll(ids) {
  ids.forEach(id => storeObserver.off(id));
}
