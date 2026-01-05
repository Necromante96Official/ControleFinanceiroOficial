/**
 * Safe Storage - Wrapper Seguro para localStorage
 * Responsabilidade: Gerenciar acesso ao localStorage com tratamento de erros robusto
 *

 *
 * Funcionalidades:
 * - Try-catch em todas as operações
 * - Fallback para memória se localStorage falhar
 * - Logs detalhados de erros
 * - Verificação de disponibilidade
 * - Tratamento de quota exceeded
 */

class SafeStorage {
  constructor() {
    this.isAvailable = this._checkAvailability();
    this.memoryFallback = new Map();
    this.usingFallback = !this.isAvailable;
    this.warningShown = false;

    if (this.usingFallback) {
      console.warn('⚠️ localStorage não disponível, usando memória temporária');
      this._showFallbackWarning();
    }
  }

  /**
   * Mostra aviso visual quando localStorage falhar e usar fallback de memória
    * Implementado para alertar usuário sobre perda de dados
   * @private
   */
  _showFallbackWarning() {
    // Evitar mostrar múltiplos avisos
    if (this.warningShown) return;
    this.warningShown = true;

    try {
      // ------------
      // Notificação padronizada via evento (evita dependência direta do ToastManager)
      // ------------
      const dispatch = () => {
        try {
          if (typeof window === 'undefined') return;
          window.dispatchEvent(new CustomEvent('app-toast', {
            detail: {
              id: 'storage-fallback-warning',
              variant: 'error',
              persistent: true,
              message: 'ATENÇÃO: Armazenamento não disponível. Dados podem ser perdidos ao recarregar.'
            }
          }));
        } catch {
          // Ignorar
        }
      };

      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          // Garantir ordem: permite que o bootstrap inicialize o ToastManager primeiro
          setTimeout(dispatch, 0);
        }, { once: true });
      } else {
        dispatch();
      }

      console.error('🚨 AVISO CRÍTICO: localStorage indisponível - dados em memória temporária');
    } catch (error) {
      console.error('❌ Erro ao emitir aviso de fallback:', error);
      // Fallback extremo
      try {
        alert('⚠️ ATENÇÃO: Armazenamento não disponível!\nDados serão perdidos ao recarregar.');
      } catch {
        // Ignorar
      }
    }
  }

  /**
   * Verifica se localStorage está disponível
   * @private
   * @returns {boolean}
   */
  _checkAvailability() {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.error('❌ localStorage não disponível:', error.message);
      return false;
    }
  }

  /**
   * Salva item no storage
   * @param {string} key - Chave
   * @param {*} value - Valor (será convertido para string)
   * @returns {boolean} - true se salvou com sucesso
   */
  setItem(key, value) {
    try {
      if (!key) {
        console.error('❌ SafeStorage.setItem: chave vazia');
        return false;
      }

      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (this.usingFallback) {
        this.memoryFallback.set(key, stringValue);
        return true;
      }

      localStorage.setItem(key, stringValue);

      // Verificar se salvou corretamente
      const saved = localStorage.getItem(key);
      if (saved !== stringValue) {
        console.warn(`⚠️ Verificação falhou ao salvar: ${key}`);
        // Tentar novamente
        localStorage.removeItem(key);
        localStorage.setItem(key, stringValue);

        const secondTry = localStorage.getItem(key);
        if (secondTry === stringValue) {
          console.log(`✅ Salvou na segunda tentativa: ${key}`);
          return true;
        }

        console.error(`❌ Falha persistente ao salvar: ${key}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`❌ Erro ao salvar ${key}:`, error);

      // Se for quota exceeded, tentar limpar cache
      if (error.name === 'QuotaExceededError') {
        console.warn('💾 Quota excedida, tentando limpar cache...');
        this._clearCache();

        try {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, stringValue);
          console.log(`✅ Salvou após limpar cache: ${key}`);
          return true;
        } catch (retryError) {
          console.error('❌ Falhou mesmo após limpar cache');
        }
      }

      // Fallback para memória
      if (!this.usingFallback) {
        console.warn(`⚠️ Usando fallback de memória para: ${key}`);
        this.memoryFallback.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        return true;
      }

      return false;
    }
  }

  /**
   * Recupera item do storage
   * @param {string} key - Chave
   * @returns {string|null} - Valor ou null se não existir
   */
  getItem(key) {
    try {
      if (!key) {
        return null;
      }

      if (this.usingFallback) {
        return this.memoryFallback.get(key) || null;
      }

      return localStorage.getItem(key);
    } catch (error) {
      console.error(`❌ Erro ao ler ${key}:`, error);

      // Tentar fallback
      if (this.memoryFallback.has(key)) {
        console.warn(`⚠️ Lendo do fallback: ${key}`);
        return this.memoryFallback.get(key);
      }

      return null;
    }
  }

  /**
   * Remove item do storage
   * @param {string} key - Chave
   * @returns {boolean} - true se removeu com sucesso
   */
  removeItem(key) {
    try {
      if (!key) {
        return false;
      }

      if (this.usingFallback) {
        this.memoryFallback.delete(key);
        return true;
      }

      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao remover ${key}:`, error);

      // Tentar fallback
      if (this.memoryFallback.has(key)) {
        this.memoryFallback.delete(key);
      }

      return false;
    }
  }

  /**
   * Limpa todo o storage
   * @returns {boolean} - true se limpou com sucesso
   */
  clear() {
    try {
      if (this.usingFallback) {
        this.memoryFallback.clear();
        return true;
      }

      localStorage.clear();
      return true;
    } catch (error) {
      console.error('❌ Erro ao limpar storage:', error);
      this.memoryFallback.clear();
      return false;
    }
  }

  /**
   * Retorna quantidade de itens
   * @returns {number}
   */
  get length() {
    try {
      if (this.usingFallback) {
        return this.memoryFallback.size;
      }
      return localStorage.length;
    } catch (error) {
      return this.memoryFallback.size;
    }
  }

  /**
   * Retorna chave pelo índice
   * @param {number} index
   * @returns {string|null}
   */
  key(index) {
    try {
      if (this.usingFallback) {
        const keys = Array.from(this.memoryFallback.keys());
        return keys[index] || null;
      }
      return localStorage.key(index);
    } catch (error) {
      const keys = Array.from(this.memoryFallback.keys());
      return keys[index] || null;
    }
  }

  /**
   * Verifica se uma chave existe
   * @param {string} key
   * @returns {boolean}
   */
  hasItem(key) {
    try {
      if (this.usingFallback) {
        return this.memoryFallback.has(key);
      }
      return localStorage.getItem(key) !== null;
    } catch (error) {
      return this.memoryFallback.has(key);
    }
  }

  /**
   * Retorna todas as chaves
   * @param {string} prefix - Filtrar por prefixo (opcional)
   * @returns {string[]}
   */
  keys(prefix = '') {
    try {
      if (this.usingFallback) {
        const allKeys = Array.from(this.memoryFallback.keys());
        return prefix ? allKeys.filter(k => k.startsWith(prefix)) : allKeys;
      }

      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (!prefix || key.startsWith(prefix))) {
          keys.push(key);
        }
      }
      return keys;
    } catch (error) {
      const allKeys = Array.from(this.memoryFallback.keys());
      return prefix ? allKeys.filter(k => k.startsWith(prefix)) : allKeys;
    }
  }

  /**
   * Limpa cache não essencial
   * @private
   */
  _clearCache() {
    try {
      const keysToKeep = this.keys('finance-control:');
      const allKeys = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) allKeys.push(key);
      }

      // Remove tudo exceto dados do app
      allKeys.forEach(key => {
        if (!key.startsWith('finance-control:')) {
          try {
            localStorage.removeItem(key);
          } catch (e) {
            // Ignorar erro
          }
        }
      });

      console.log('🧹 Cache limpo, mantendo dados do app');
    } catch (error) {
      console.error('❌ Erro ao limpar cache:', error);
    }
  }

  /**
   * Obtém tamanho aproximado dos dados (bytes)
   * @param {string} prefix - Filtrar por prefixo (opcional)
   * @returns {number}
   */
  getSize(prefix = '') {
    try {
      let totalSize = 0;
      const keys = this.keys(prefix);

      keys.forEach(key => {
        const value = this.getItem(key);
        if (value) {
          totalSize += value.length * 2; // UTF-16 = 2 bytes por char
        }
      });

      return totalSize;
    } catch (error) {
      console.error('❌ Erro ao calcular tamanho:', error);
      return 0;
    }
  }

  /**
   * Verifica saúde do storage
   * @returns {Object}
   */
  healthCheck() {
    return {
      available: this.isAvailable,
      usingFallback: this.usingFallback,
      itemCount: this.length,
      sizeBytes: this.getSize('finance-control:'),
      sizeKB: (this.getSize('finance-control:') / 1024).toFixed(2)
    };
  }
}

// Singleton
const safeStorage = new SafeStorage();

export default safeStorage;

/**
 * Exportações nomeadas para compatibilidade
 */
export const setItem = (key, value) => safeStorage.setItem(key, value);
export const getItem = (key) => safeStorage.getItem(key);
export const removeItem = (key) => safeStorage.removeItem(key);
export const clear = () => safeStorage.clear();
export const hasItem = (key) => safeStorage.hasItem(key);
export const keys = (prefix) => safeStorage.keys(prefix);
export const healthCheck = () => safeStorage.healthCheck();
