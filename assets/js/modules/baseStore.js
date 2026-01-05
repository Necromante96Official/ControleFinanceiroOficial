/**
 * Módulo: Base Store
 * Responsabilidade: Classe base abstrata para gerenciamento de dados com persistência em localStorage
 *
 * Esta classe fornece funcionalidades comuns de CRUD (Create, Read, Update, Delete)
 * e persistência que são compartilhadas por todos os stores do sistema.
 *
 * Stores que estendem esta classe:
 * - CategoryStore
 * - BenefitStore
 * - CreditStore
 * - DebitStore
 * - TransactionStore
 *

 */

import safeStorage from './safeStorage.js';
import storeObserver from './storeObserver.js';
import * as dateUtils from './dateUtils.js';
import { normalizeStoreItems } from './dataHealth/normalizeStoreItems.js';
import { SafeJson } from './safeJson.js';

export class BaseStore {
  /**
   * @param {string} storageKey - Chave para armazenamento no localStorage
   * @param {string} itemsProperty - Nome da propriedade que armazena os itens (ex: 'categories', 'benefits', 'cards')
   * @param {Array} initialItems - Itens iniciais caso não exista nada no storage
   * @param {string} observerName - Nome para o observer (opcional, padrão: storageKey sem prefixo)
   */
  constructor(storageKey, itemsProperty = 'items', initialItems = [], observerName = null) {
    this.storageKey = storageKey;
    this.itemsProperty = itemsProperty;
    this.observerName = observerName || storageKey.replace('finance-control:', '');

    // ==================================================
    // PERFORMANCE: Revisão do store (para caches externos)
    // - Incrementa a cada persistência bem-sucedida
    // - Permite memoização segura (ex.: filtros do extrato)
    // ==================================================
    this._revision = 0;

    // Carregar dados do localStorage ou usar initialItems
    const loaded = this._loadFromStorage();

    if (loaded !== null) {
      this[itemsProperty] = loaded;
      console.log(`📦 ${storageKey}: carregou ${loaded.length} item(s) do storage`);
    } else {
      // Clonar initialItems para evitar mutação
      this[itemsProperty] = initialItems.map(item => ({ ...item }));
      console.log(`📦 ${storageKey}: usando ${initialItems.length} item(s) padrão`);

      // Salvar items iniciais se houver
      if (initialItems.length > 0) {
        this._saveToStorage();
      }
    }

    // Cache do maxId para evitar O(n) em cada add()
    this._maxId = this._calculateMaxId();
  }

  /**
   * Retorna a referência ao array de itens
   * @protected
   * @returns {Array}
   */
  get _items() {
    return this[this.itemsProperty];
  }

  /**
   * Define o array de itens
   * @protected
   */
  set _items(value) {
    this[this.itemsProperty] = value;
    this._maxId = this._calculateMaxId();
  }

  /**
   * Carrega itens do localStorage usando SafeStorage
   * @protected
   * @returns {Array|null} Items carregados ou null se não existir/erro
   */
  _loadFromStorage() {
    try {
      const stored = safeStorage.getItem(this.storageKey);

      if (stored === null || stored === undefined) {
        return null;
      }

      if (stored === '' || stored === '[]') {
        return [];
      }

      const parsed = SafeJson.parse(stored, null);

      if (!Array.isArray(parsed)) {
        console.warn(`⚠️ ${this.storageKey}: dados não são array, ignorando`);
        return null;
      }

      // ==================================================
      // SAÚDE DOS DADOS (anti-corrupção)
      // - Normaliza campos para evitar NaN/strings inválidas
      // - Remove itens claramente inválidos (não-objeto)
      // - Regrava no storage se precisar reparar
      // ==================================================
      const normalized = normalizeStoreItems(this.storageKey, parsed);

      if (normalized.issues?.length) {
        console.warn(`⚠️ ${this.storageKey}: DataHealth encontrou ${normalized.issues.length} aviso(s)`, normalized.issues);
      }

      if (normalized.changed) {
        try {
          const repairedData = JSON.stringify(normalized.items);
          const repairedOk = safeStorage.setItem(this.storageKey, repairedData);
          if (repairedOk) {
            console.log(`🛡️ ${this.storageKey}: DataHealth reparou e salvou dados normalizados`);
          } else {
            console.warn(`⚠️ ${this.storageKey}: DataHealth tentou reparar mas não conseguiu salvar`);
          }
        } catch (e) {
          console.warn(`⚠️ ${this.storageKey}: DataHealth falhou ao regravar após normalização`, e);
        }
      }

      return normalized.items;
    } catch (error) {
      console.error(`❌ Erro ao carregar ${this.storageKey}:`, error);
      return null;
    }
  }

  /**
   * Salva itens no localStorage usando SafeStorage
   * @protected
   * @returns {boolean} - true se salvou com sucesso
   */
  _saveToStorage() {
    // ==================================================
    // SAÚDE DOS DADOS (anti-corrupção)
    // - Valida/normaliza sempre antes de persistir
    // - Mantém a memória consistente com o que vai para o storage
    // ==================================================
    const normalized = normalizeStoreItems(this.storageKey, this._items);

    if (normalized.changed) {
      // Definir diretamente para evitar efeitos colaterais desnecessários
      this[this.itemsProperty] = normalized.items;
      this._maxId = this._calculateMaxId();
    }

    const data = JSON.stringify(this._items);
    const success = safeStorage.setItem(this.storageKey, data);

    // ------------
    // PERFORMANCE: marcar revisão somente quando persistiu
    // ------------
    if (success) {
      this._bumpRevision('save');
    }

    if (!success) {
      console.error(`❌ ${this.storageKey}: falha ao salvar`);
    }

    return success;
  }

  /**
   * Retorna a revisão atual do store.
   * @returns {number}
   */
  getRevision() {
    return this._revision || 0;
  }

  /**
   * Incrementa a revisão do store.
   * @private
   */
  _bumpRevision(reason = '') {
    // Evitar NaN e manter incremento monotônico
    const current = Number.isFinite(this._revision) ? this._revision : 0;
    this._revision = current + 1;
    // Log opcional (somente quando debug estiver ligado)
    if (reason && typeof window !== 'undefined' && window.__DEBUG_REVISIONS__) {
      console.log(`🔁 ${this.storageKey}: revisão++ (${this._revision}) [${reason}]`);
    }
  }

  /**
   * Limpa dados de cache para liberar espaço

   * @private
   */
  _clearCacheData() {
    const keysToRemove = [];
    const APP_PREFIX = 'finance-control:';

    // WHITELIST: Chaves que NUNCA devem ser removidas
    const PROTECTED_KEYS = [
      'finance-control:categories',
      'finance-control:benefits',
      'finance-control:credit-cards',
      'finance-control:debit-cards',
      'finance-control:transactions',
      'finance-control:settings',
      'finance-control:locale',
      'finance-control:theme',
      'finance-control:auto-backup-last'
    ];

    // BLACKLIST: Padrões que indicam cache/temporário (podem ser removidos)
    const CACHE_PATTERNS = [
      /^finance-control:cache:/,           // Cache explícito
      /^finance-control:temp:/,            // Dados temporários
      /^finance-control:scroll:/,          // Posição de scroll
      /^finance-control:draft:/,           // Rascunhos
      /^finance-control:backup:.*:\d+$/,   // Backups antigos (exceto o último)
      /^finance-control:notif:credit-due/, // Notificações de crédito já enviadas
      /^finance-control:session:/          // Dados de sessão
    ];

    // Proteger o último backup criado
    let lastBackupKey = null;
    try {
      lastBackupKey = localStorage.getItem('finance-control:auto-backup-last');
    } catch (e) {
      console.warn('⚠️ Não foi possível verificar último backup');
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // Ignorar se não for do nosso app
      if (!key || !key.startsWith(APP_PREFIX)) continue;

      // PROTEÇÃO 1: Nunca remover chaves protegidas
      if (PROTECTED_KEYS.includes(key)) {
        console.log(`🔒 Protegido: ${key}`);
        continue;
      }

      // PROTEÇÃO 2: Nunca remover o último backup
      if (lastBackupKey && key === lastBackupKey) {
        console.log(`🔒 Protegido (último backup): ${key}`);
        continue;
      }

      // VERIFICAÇÃO: Deve corresponder a um padrão de cache
      const shouldRemove = CACHE_PATTERNS.some(pattern => pattern.test(key));

      if (shouldRemove) {
        keysToRemove.push(key);
      } else {
        // Logging para debug: chaves não removidas
        console.log(`⏭️ Ignorado (não corresponde a cache): ${key}`);
      }
    }

    // Executar remoção
    let removedCount = 0;
    let failedCount = 0;

    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`🗑️ Removido: ${key}`);
        removedCount++;
      } catch (e) {
        console.warn(`⚠️ Falha ao remover: ${key}`, e);
        failedCount++;
      }
    });

    console.log(`✅ Limpeza de cache concluída:`);
    console.log(`   - ${removedCount} item(ns) removido(s)`);
    console.log(`   - ${failedCount} falha(s)`);
    console.log(`   - ${PROTECTED_KEYS.length} chave(s) protegida(s)`);

    return {
      removed: removedCount,
      failed: failedCount,
      protected: PROTECTED_KEYS.length
    };
  }

  /**
   * Calcula o maior ID existente
   * @protected
   * @returns {number}
   */
  _calculateMaxId() {
    if (!this._items || this._items.length === 0) return 0;
    return this._items.reduce((max, item) => Math.max(max, item.id || 0), 0);
  }

  /**
   * Gera o próximo ID único
   * @protected
   * @returns {number}
   */
  _generateNextId() {
    return ++this._maxId;
  }

  /**
   * Retorna cópia de todos os itens
   * @returns {Array}
   */
  getAll() {
    return [...this._items];
  }

  /**
   * Busca item por ID
   * @param {number} id - ID do item
   * @returns {Object|undefined}
   */
  findById(id) {
    return this._items.find(item => item.id === id);
  }

  /**
   * Alias para findById
   * @param {number} id - ID do item
   * @returns {Object|undefined}
   */
  getById(id) {
    return this.findById(id);
  }

  /**
   * Adiciona um novo item

   * @param {Object} payload - Dados do novo item
   * @returns {Object} Item criado
   */
  add(payload) {
    const nextId = this._generateNextId();

    // Remove id do payload para evitar sobrescrever nextId
    const { id, ...cleanPayload } = payload;

    const newItem = {
      id: nextId,
      ...cleanPayload,
      createdAt: dateUtils.now()
    };

    this._items.push(newItem);

    // IMPORTANTE: Salvar imediatamente
    const saved = this._saveToStorage();

    if (!saved) {
      console.error(`❌ ATENÇÃO: Item adicionado mas NÃO foi salvo no storage!`);
    } else {
      console.log(`✅ ${this.storageKey}: item ${nextId} adicionado e salvo`);
    }

    // Notificar observadores
    storeObserver.notify(this.observerName, 'add', { item: newItem, id: nextId });

    return newItem;
  }

  /**
   * Atualiza um item existente
   * @param {number} id - ID do item a atualizar
   * @param {Object} payload - Dados para atualizar
   * @returns {Object|null} Item atualizado ou null se não encontrado
   */
  update(id, payload) {
    const index = this._items.findIndex(item => item.id === id);
    if (index === -1) return null;

    const oldItem = { ...this._items[index] };

    this._items[index] = {
      ...this._items[index],
      ...payload,
      updatedAt: dateUtils.now()
    };

    // IMPORTANTE: Salvar imediatamente
    const saved = this._saveToStorage();

    if (!saved) {
      console.error(`❌ ATENÇÃO: Item atualizado mas NÃO foi salvo no storage!`);

      // ==================================================
      // SEGURANÇA: rollback em memória
      // - Evita ficar com estado diferente do storage.
      // ==================================================
      this._items[index] = oldItem;
      return null;
    } else {
      console.log(`✅ ${this.storageKey}: item ${id} atualizado e salvo`);
    }

    // Notificar observadores
    storeObserver.notify(this.observerName, 'update', {
      item: this._items[index],
      id,
      oldItem
    });

    return this._items[index];
  }

  /**
   * Remove um item por ID
   * @param {number} id - ID do item a remover
   * @returns {Object|null} Item removido ou null se não encontrado
   */
  remove(id) {
    const index = this._items.findIndex(item => item.id === id);
    if (index === -1) return null;

    const removed = this._items.splice(index, 1)[0];

    // IMPORTANTE: Salvar imediatamente
    const saved = this._saveToStorage();

    if (!saved) {
      console.error(`❌ ATENÇÃO: Item removido mas mudança NÃO foi salva!`);

      // ==================================================
      // SEGURANÇA: rollback em memória
      // - Evita remoção "fantasma" que volta após reload.
      // ==================================================
      this._items.splice(index, 0, removed);
      return null;
    } else {
      console.log(`✅ ${this.storageKey}: item ${id} removido e salvo`);
    }

    // Notificar observadores
    storeObserver.notify(this.observerName, 'remove', { item: removed, id });

    return removed;
  }

  /**
   * Limpa todos os itens
   */
  clear() {
    const itemCount = this._items.length;
    this._items = [];
    this._maxId = 0;
    try {
      localStorage.removeItem(this.storageKey);
      console.log(`🗑️ ${this.storageKey}: dados limpos`);
    } catch (e) {
      console.error(`❌ Erro ao limpar ${this.storageKey}:`, e);
    }

    // ------------
    // PERFORMANCE: revisão também muda ao limpar
    // ------------
    this._bumpRevision('clear');

    // Notificar observadores
    storeObserver.notify(this.observerName, 'clear', { itemCount });
  }

  /**
   * Retorna a quantidade de itens
   * @returns {number}
   */
  count() {
    return this._items.length;
  }

  /**
   * Verifica se está vazio
   * @returns {boolean}
   */
  isEmpty() {
    return this._items.length === 0;
  }

  /**
   * Sobrescreve todos os itens (útil para importação)

   * @param {Array} items - Novos itens
   */
  setAll(items) {
    console.log(`📦 ${this.storageKey}: setAll iniciando com ${items.length} item(s)`);
    const clonedItems = items.map(item => {
      // Clonar todos os campos preservando tipos
      const cloned = {};
      for (const key in item) {
        cloned[key] = item[key];
      }
      return cloned;
    });

    // Definir diretamente na propriedade (sem usar setter que recalcula _maxId)
    this[this.itemsProperty] = clonedItems;
    this._maxId = this._calculateMaxId();
    const saved = this._saveToStorage();
    if (!saved) {
      console.error(`❌ ${this.storageKey}: FALHA ao salvar após setAll!`);
    } else {
      console.log(`✅ ${this.storageKey}: setAll com ${items.length} item(s) salvo`);

      // Verificar integridade
      const loadedBack = this._loadFromStorage();
      if (loadedBack && loadedBack.length === items.length) {
        console.log(`✅ ${this.storageKey}: Verificação OK - ${loadedBack.length} item(s) persistidos`);
      } else {
        console.error(`❌ ${this.storageKey}: INCONSISTÊNCIA - esperado ${items.length}, encontrado ${loadedBack?.length || 0}`);
      }
    }
    storeObserver.notify(this.observerName, 'setAll', { items: clonedItems });
  }

  /**
   * Recarrega os dados do localStorage
   * @returns {boolean} - true se recarregou com sucesso
   */
  reload() {
    const loaded = this._loadFromStorage();
    if (loaded !== null) {
      this._items = loaded;
      this._maxId = this._calculateMaxId();
      console.log(`🔄 ${this.storageKey}: recarregou ${loaded.length} item(s)`);
      return true;
    }
    return false;
  }

  /**
   * Força a persistência imediata dos dados
   * @returns {boolean}
   */
  forcePersist() {
    console.log(`💾 ${this.storageKey}: forçando persistência de ${this._items.length} item(s)`);
    return this._saveToStorage();
  }

  /**
   * Flush síncrono - força gravação imediata
   * @returns {boolean}
   */
  syncFlush() {
    try {
      // ==================================================
      // SAÚDE DOS DADOS (anti-corrupção)
      // - Normaliza antes do flush síncrono (evita gravar lixo)
      // ==================================================
      const normalized = normalizeStoreItems(this.storageKey, this._items);
      if (normalized.changed) {
        this[this.itemsProperty] = normalized.items;
        this._maxId = this._calculateMaxId();
      }

      const data = JSON.stringify(this._items);

      // Remove e adiciona para forçar escrita
      localStorage.removeItem(this.storageKey);
      localStorage.setItem(this.storageKey, data);

      // Verificação
      const check = localStorage.getItem(this.storageKey);
      const success = check === data;

      if (success) {
        console.log(`✅ ${this.storageKey}: flush OK (${this._items.length} itens)`);
      } else {
        console.error(`❌ ${this.storageKey}: flush FALHOU`);
      }

      return success;
    } catch (error) {
      console.error(`❌ ${this.storageKey}: erro no flush:`, error);
      return false;
    }
  }

  /**
   * Retorna informações de debug sobre o store
   * @returns {Object}
   */
  getDebugInfo() {
    let storageData = null;
    let storageSize = 0;

    try {
      storageData = localStorage.getItem(this.storageKey);
      storageSize = storageData ? storageData.length : 0;
    } catch (e) {
      storageSize = -1;
    }

    return {
      storageKey: this.storageKey,
      memoryCount: this._items.length,
      storageSize: storageSize,
      maxId: this._maxId,
      inSync: storageData === JSON.stringify(this._items)
    };
  }

  /**
   * Verifica se os dados em memória estão sincronizados com o storage
   * @returns {boolean}
   */
  isInSync() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const memory = JSON.stringify(this._items);
      return stored === memory;
    } catch (e) {
      return false;
    }
  }

  /**
   * Repara possíveis inconsistências - usa o que estiver mais recente
   * @returns {boolean}
   */
  repair() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const memory = JSON.stringify(this._items);

      if (stored === memory) {
        console.log(`✅ ${this.storageKey}: já está sincronizado`);
        return true;
      }

      // Se memória tem mais itens, salvar memória
      // Se storage tem mais itens, carregar storage
      let storedItems = [];
      try {
        storedItems = stored ? JSON.parse(stored) : [];
      } catch (e) {
        storedItems = [];
      }

      if (this._items.length >= storedItems.length) {
        console.log(`🔧 ${this.storageKey}: salvando dados da memória (${this._items.length} itens)`);
        return this._saveToStorage();
      } else {
        console.log(`🔧 ${this.storageKey}: carregando dados do storage (${storedItems.length} itens)`);
        this._items = storedItems;
        this._maxId = this._calculateMaxId();
        return true;
      }
    } catch (error) {
      console.error(`❌ ${this.storageKey}: erro no repair:`, error);
      return false;
    }
  }

  /**
   * Método estático para verificar se o localStorage está funcionando
   * @returns {boolean}
   */
  static isStorageAvailable() {
    try {
      const test = '__test__' + Date.now();
      localStorage.setItem(test, test);
      const result = localStorage.getItem(test) === test;
      localStorage.removeItem(test);
      return result;
    } catch (e) {
      return false;
    }
  }

  /**
   * Detecta se estamos em ambiente APK/WebView
   * @returns {boolean}
   */
  static isAPKEnvironment() {
    if (typeof window === 'undefined') return false;

    return (
      window.Capacitor !== undefined ||
      document.URL.includes('localhost') ||
      document.URL.startsWith('file://') ||
      document.URL.includes('android_asset') ||
      (navigator.userAgent && navigator.userAgent.includes('wv'))
    );
  }
}
