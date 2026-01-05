/**
 * Módulo: Sincronização de Dados Entre Abas e Service Worker
 * Responsabilidade: Manter dados sincronizados em tempo real
 *
 * Funcionalidades:
 * - Sincronização entre múltiplas abas via localStorage events
 * - Comunicação com Service Worker
 * - Detecção de conflitos de dados
 * - Queue de sincronização para modo offline
 * - Broadcast Channel para comunicação inter-tabs
 *

 */

export class StorageSync {
  constructor(options = {}) {
    this.stores = options.stores || {};
    this.listeners = new Map();
    this.syncQueue = [];
    this.isOnline = navigator.onLine;
    this.broadcastChannel = null;
    this.swRegistration = null;
    this.lastSyncTimestamp = null;

    // Referências aos handlers para poder removê-los no destroy()
    this._storageHandler = null;
    this._onlineHandler = null;
    this._offlineHandler = null;
    this._swMessageHandler = null;

    this.init();
  }

  /**
   * Inicializa todos os listeners e canais de comunicação
   */
  init() {
    this.setupStorageListener();
    this.setupBroadcastChannel();
    this.setupOnlineListener();
    this.setupServiceWorkerListener();
    this.loadPendingSync();

    console.log('✅ StorageSync inicializado');
  }

  /**
   * Registra callback para mudanças em uma chave específica
   */
  on(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);

    return () => this.off(key, callback); // Retorna função para remover listener
  }

  /**
   * Remove callback registrado
   */
  off(key, callback) {
    if (this.listeners.has(key)) {
      this.listeners.get(key).delete(callback);
    }
  }

  /**
   * Emite evento para todos os listeners de uma chave
   */
  emit(key, data) {
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Erro em callback de sync (${key}):`, error);
        }
      });
    }
  }

  /**
   * Configura listener para mudanças no localStorage (sincronização entre abas)
   */
  setupStorageListener() {
    this._storageHandler = (event) => {
      if (!event.key || !event.key.startsWith('finance-control:')) return;

      console.log(`🔄 Sincronizando entre abas: ${event.key}`);

      // Valida dados antes de processar
      let oldValue = null;
      let newValue = null;

      try {
        oldValue = event.oldValue ? JSON.parse(event.oldValue) : null;
      } catch (e) {
        console.warn('⚠️ Dados antigos inválidos no storage event');
      }

      try {
        newValue = event.newValue ? JSON.parse(event.newValue) : null;

        // Validação adicional: deve ser array ou objeto
        if (newValue !== null && typeof newValue !== 'object') {
          console.warn('⚠️ Dados inválidos recebidos (não é array/objeto)');
          return;
        }
      } catch (e) {
        console.warn('⚠️ Dados novos inválidos no storage event');
        return; // Não processa dados corrompidos
      }

      const changeData = {
        key: event.key,
        oldValue,
        newValue,
        timestamp: new Date().toISOString(),
        source: 'storage-event'
      };

      // Notifica listeners
      this.emit(event.key, changeData);
      this.emit('*', changeData); // Listener wildcard

      // Recarrega store correspondente se existir
      this.reloadStore(event.key);
    };

    window.addEventListener('storage', this._storageHandler);
  }

  /**
   * Configura Broadcast Channel para comunicação mais rápida entre abas
   */
  setupBroadcastChannel() {
    if (!('BroadcastChannel' in window)) {
      console.warn('⚠️ BroadcastChannel não suportado');
      return;
    }

    this.broadcastChannel = new BroadcastChannel('finance-control-sync');

    this.broadcastChannel.onmessage = (event) => {
      // Valida estrutura da mensagem
      if (!event.data || typeof event.data !== 'object') {
        console.warn('⚠️ Mensagem broadcast inválida recebida');
        return;
      }

      const { type, key, data, senderId } = event.data;

      // Valida campos obrigatórios
      if (!type || typeof type !== 'string') {
        console.warn('⚠️ Mensagem broadcast sem tipo válido');
        return;
      }

      // Ignora mensagens próprias
      if (senderId === this.getTabId()) return;

      console.log(`📨 Broadcast recebido: ${type} - ${key}`);

      switch (type) {
        case 'DATA_UPDATED':
          if (key && typeof key === 'string') {
            this.emit(key, { ...data, source: 'broadcast' });
            this.reloadStore(key);
          }
          break;

        case 'SYNC_REQUEST':
          this.handleSyncRequest(event.data);
          break;

        case 'SYNC_RESPONSE':
          this.handleSyncResponse(event.data);
          break;

        default:
          console.warn(`⚠️ Tipo de mensagem desconhecido: ${type}`);
      }
    };

    this.broadcastChannel.onmessageerror = () => {
      console.error('❌ Erro ao receber mensagem broadcast');
    };
  }

  /**
   * Envia mensagem via Broadcast Channel
   */
  broadcast(type, key, data = {}) {
    if (!this.broadcastChannel) return;

    this.broadcastChannel.postMessage({
      type,
      key,
      data,
      senderId: this.getTabId(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Retorna ID único desta aba
   */
  getTabId() {
    if (!this._tabId) {
      this._tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    return this._tabId;
  }

  /**
   * Configura listener para mudanças de conectividade
   */
  setupOnlineListener() {
    this._onlineHandler = () => {
      console.log('🌐 Conexão restaurada');
      this.isOnline = true;
      this.processSyncQueue();
      this.emit('connectivity', { online: true });
    };

    this._offlineHandler = () => {
      console.log('📴 Modo offline');
      this.isOnline = false;
      this.emit('connectivity', { online: false });
    };

    window.addEventListener('online', this._onlineHandler);
    window.addEventListener('offline', this._offlineHandler);
  }

  /**
   * Configura comunicação com Service Worker
   */
  setupServiceWorkerListener() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(registration => {
      this.swRegistration = registration;
      console.log('✅ Service Worker conectado para sync');
    });

    this._swMessageHandler = (event) => {
      const { type, ...data } = event.data;

      console.log(`📨 Mensagem do SW: ${type}`);

      switch (type) {
        case 'SYNC_COMPLETE':
          this.lastSyncTimestamp = data.timestamp;
          this.emit('sync-complete', data);
          break;

        case 'CHECK_BENEFITS_RELOAD':
          this.emit('check-benefits', data);
          break;
      }
    };

    navigator.serviceWorker.addEventListener('message', this._swMessageHandler);
  }

  /**
   * Envia mensagem para o Service Worker com timeout
   * @param {Object} message - Mensagem a enviar
   * @param {number} timeout - Timeout em ms (padrão: 5000)
   */
  sendToServiceWorker(message, timeout = 5000) {
    if (!navigator.serviceWorker.controller) {
      console.warn('⚠️ Service Worker não está controlando esta página');
      return Promise.resolve(false);
    }

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      let timeoutId = null;

      // Configura timeout
      timeoutId = setTimeout(() => {
        channel.port1.close();
        console.warn('⚠️ Timeout na comunicação com Service Worker');
        resolve(false); // Resolve com false em vez de reject para não quebrar fluxo
      }, timeout);

      channel.port1.onmessage = (event) => {
        clearTimeout(timeoutId);
        resolve(event.data);
      };

      channel.port1.onmessageerror = () => {
        clearTimeout(timeoutId);
        console.error('❌ Erro na mensagem do Service Worker');
        resolve(false);
      };

      try {
        navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('❌ Erro ao enviar mensagem para SW:', error);
        resolve(false);
      }
    });
  }

  /**
    * Notifica outras abas sobre sincronização de dados
   */
  notifyUpdate(storeKey, action = 'update') {
    const data = {
      action,
      timestamp: new Date().toISOString()
    };

    // Via Broadcast Channel (mais rápido)
    this.broadcast('DATA_UPDATED', storeKey, data);

    // Também dispara evento local
    this.emit(storeKey, { ...data, source: 'local' });
  }

  /**
   * Recarrega um store específico do localStorage
   */
  reloadStore(key) {
    const storeName = this.getStoreNameFromKey(key);

    if (storeName && this.stores[storeName]) {
      this.stores[storeName].reload();
      console.log(`🔄 Store ${storeName} recarregado`);
    }
  }

  /**
   * Mapeia chave de localStorage para nome do store
   */
  getStoreNameFromKey(key) {
    const mapping = {
      'finance-control:categories': 'categories',
      'finance-control:benefits': 'benefits',
      'finance-control:credit-cards': 'credits',
      'finance-control:debit-cards': 'debits',
      'finance-control:transactions': 'transactions'
    };
    return mapping[key];
  }

  /**
   * Adiciona item à fila de sincronização (para modo offline)
   */
  addToSyncQueue(operation) {
    const queueItem = {
      id: Date.now(),
      ...operation,
      createdAt: new Date().toISOString()
    };

    this.syncQueue.push(queueItem);
    this.savePendingSync();

    console.log(`📝 Adicionado à fila de sync:`, operation.type);

    // Se online, processa imediatamente
    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  /**
   * Processa fila de sincronização
   */
  async processSyncQueue() {
    if (this.syncQueue.length === 0) return;

    console.log(`🔄 Processando ${this.syncQueue.length} itens na fila de sync`);

    const processed = [];

    for (const item of this.syncQueue) {
      try {
        // Aqui entraria a lógica de sincronização com servidor
        // Por enquanto, apenas marca como processado
        processed.push(item.id);
        console.log(`✅ Sincronizado: ${item.type}`);
      } catch (error) {
        console.error(`❌ Erro ao sincronizar ${item.type}:`, error);
      }
    }

    // Remove itens processados
    this.syncQueue = this.syncQueue.filter(item => !processed.includes(item.id));
    this.savePendingSync();

    // Notifica completion
    this.emit('queue-processed', { processed: processed.length });
  }

  /**
   * Salva fila de sincronização no localStorage
   */
  savePendingSync() {
    localStorage.setItem('finance-control:sync-queue', JSON.stringify(this.syncQueue));
  }

  /**
   * Carrega fila de sincronização do localStorage
   */
  loadPendingSync() {
    try {
      const stored = localStorage.getItem('finance-control:sync-queue');
      if (stored) {
        this.syncQueue = JSON.parse(stored);
        console.log(`📋 ${this.syncQueue.length} itens pendentes de sync`);
      }
    } catch (error) {
      console.error('Erro ao carregar fila de sync:', error);
      this.syncQueue = [];
    }
  }

  /**
   * Solicita sincronização via Background Sync
   */
  requestBackgroundSync(tag = 'sync-finance-data') {
    if (!this.swRegistration || !('sync' in this.swRegistration)) {
      console.warn('⚠️ Background Sync não suportado');
      return Promise.resolve(false);
    }

    return this.swRegistration.sync.register(tag)
      .then(() => {
        console.log(`✅ Background sync registrado: ${tag}`);
        return true;
      })
      .catch(error => {
        console.error('Erro ao registrar background sync:', error);
        return false;
      });
  }

  /**
   * Detecta conflitos entre dados locais e remotos
   */
  detectConflicts(localData, remoteData, key = 'updatedAt') {
    const conflicts = [];

    // Compara cada item
    for (const local of localData) {
      const remote = remoteData.find(r => r.id === local.id);

      if (remote && local[key] !== remote[key]) {
        conflicts.push({
          id: local.id,
          local: local,
          remote: remote,
          localTimestamp: local[key],
          remoteTimestamp: remote[key]
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflitos usando estratégia "último vence"
   */
  resolveConflicts(conflicts, strategy = 'last-write-wins') {
    return conflicts.map(conflict => {
      if (strategy === 'last-write-wins') {
        const localTime = new Date(conflict.localTimestamp);
        const remoteTime = new Date(conflict.remoteTimestamp);
        return localTime > remoteTime ? conflict.local : conflict.remote;
      }
      // Outras estratégias podem ser adicionadas
      return conflict.local;
    });
  }

  /**
   * Destrói a instância e limpa todos os recursos
   */
  destroy() {
    // Limpa listeners internos
    this.listeners.clear();

    // Remove event listeners do window
    if (this._storageHandler) {
      window.removeEventListener('storage', this._storageHandler);
      this._storageHandler = null;
    }

    if (this._onlineHandler) {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }

    if (this._offlineHandler) {
      window.removeEventListener('offline', this._offlineHandler);
      this._offlineHandler = null;
    }

    // Remove listener do Service Worker
    if (this._swMessageHandler && 'serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', this._swMessageHandler);
      this._swMessageHandler = null;
    }

    // Fecha BroadcastChannel
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    // Limpa referências
    this.stores = {};
    this.syncQueue = [];
    this.swRegistration = null;

    console.log('🗑️ StorageSync destruído');
  }
}
