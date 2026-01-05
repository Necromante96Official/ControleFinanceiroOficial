/**
 * ErrorHandler - Sistema Avançado de Tratamento de Erros
 * Responsabilidade: Capturar, categorizar, reportar e tratar erros
 *
 * Funcionalidades:
 * - Captura global de erros e rejections
 * - Categorização de erros por severidade
 * - Log estruturado com contexto
 * - Retry automático para operações recuperáveis
 * - Notificação ao usuário
 * - Histórico de erros para debugging
 *

 */

import { ERROR_MESSAGES, TIMEOUTS } from './constants.js';

// ============================================
// TIPOS E SEVERIDADES
// ============================================

export const ErrorSeverity = {
  LOW: 'low',           // Avisos, não críticos
  MEDIUM: 'medium',     // Erros recuperáveis
  HIGH: 'high',         // Erros importantes
  CRITICAL: 'critical'  // Erros fatais
};

export const ErrorCategory = {
  NETWORK: 'network',
  STORAGE: 'storage',
  VALIDATION: 'validation',
  PERMISSION: 'permission',
  RUNTIME: 'runtime',
  UNKNOWN: 'unknown'
};

// ============================================
// CLASSE PRINCIPAL
// ============================================

export class ErrorHandler {
  constructor(options = {}) {
    // Configurações
    this.options = {
      maxHistorySize: options.maxHistorySize || 100,
      enableConsoleLog: options.enableConsoleLog ?? true,
      enableNotifications: options.enableNotifications ?? true,
      enableRemoteReporting: options.enableRemoteReporting ?? false,
      remoteEndpoint: options.remoteEndpoint || null
    };

    // Estado
    this.errorHistory = [];
    this.suppressedErrors = new Set();
    this.errorCounts = new Map();
    this.listeners = [];

    // Configurar handlers globais
    this.setupGlobalHandlers();

    // Singleton
    if (!window.__errorHandler) {
      window.__errorHandler = this;
    }
  }

  // ============================================
  // CONFIGURAÇÃO DE HANDLERS GLOBAIS
  // ============================================

  /**
   * Configura listeners de erro global
   */
  setupGlobalHandlers() {
    // Erros de JavaScript
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message), {
        category: ErrorCategory.RUNTIME,
        context: 'window:error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Promises não tratadas
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

      this.handleError(error, {
        category: ErrorCategory.RUNTIME,
        context: 'promise:unhandled',
        severity: ErrorSeverity.HIGH
      });

      event.preventDefault();
    });

    // Erros de rede (fetch)
    this.setupFetchInterceptor();

    // Erros de storage
    this.setupStorageErrorHandler();

    this.log('✅ ErrorHandler inicializado', 'info');
  }

  /**
   * Intercepta fetch para capturar erros de rede
   */
  setupFetchInterceptor() {
    const originalFetch = window.fetch;
    const handler = this;

    window.fetch = async function(...args) {
      try {
        const response = await originalFetch.apply(this, args);

        if (!response.ok) {
          handler.handleError(new Error(`Erro HTTP: ${response.status}`), {
            category: ErrorCategory.NETWORK,
            context: 'fetch',
            url: args[0],
            status: response.status,
            severity: response.status >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM
          });
        }

        return response;
      } catch (error) {
        handler.handleError(error, {
          category: ErrorCategory.NETWORK,
          context: 'fetch',
          url: args[0],
          severity: ErrorSeverity.MEDIUM
        });
        throw error;
      }
    };
  }

  /**
   * Monitora erros de localStorage
   */
  setupStorageErrorHandler() {
    const originalSetItem = localStorage.setItem;
    const handler = this;

    localStorage.setItem = function(key, value) {
      try {
        return originalSetItem.call(this, key, value);
      } catch (error) {
        handler.handleError(error, {
          category: ErrorCategory.STORAGE,
          context: 'localStorage:setItem',
          key: key,
          valueSize: value?.length || 0,
          severity: ErrorSeverity.HIGH
        });
        throw error;
      }
    };
  }

  // ============================================
  // TRATAMENTO DE ERROS
  // ============================================

  /**
   * Processa um erro capturado
   * @param {Error} error - O erro a ser processado
   * @param {Object} metadata - Metadados adicionais
   */
  handleError(error, metadata = {}) {
    // Evitar processamento de erros suprimidos
    if (this.isErrorSuppressed(error)) {
      return;
    }

    // Criar entrada de erro estruturada
    const errorEntry = this.createErrorEntry(error, metadata);

    // Adicionar ao histórico
    this.addToHistory(errorEntry);

    // Incrementar contador
    this.incrementErrorCount(errorEntry.category);

    // Log no console
    if (this.options.enableConsoleLog) {
      this.logToConsole(errorEntry);
    }

    // Notificar listeners
    this.notifyListeners(errorEntry);

    // Notificar usuário (se crítico)
    if (this.options.enableNotifications &&
        [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL].includes(errorEntry.severity)) {
      this.notifyUser(errorEntry);
    }

    // Report remoto (se habilitado)
    if (this.options.enableRemoteReporting && this.options.remoteEndpoint) {
      this.reportToRemote(errorEntry);
    }

    return errorEntry;
  }

  /**
   * Cria entrada de erro estruturada
   */
  createErrorEntry(error, metadata) {
    return {
      id: this.generateId(),
      timestamp: new Date().toISOString(),

      // Informações do erro
      name: error.name,
      message: error.message,
      stack: error.stack,

      // Categorização
      category: metadata.category || this.categorizeError(error),
      severity: metadata.severity || this.assessSeverity(error),

      // Contexto
      context: metadata.context || 'unknown',
      metadata: {
        ...metadata,
        userAgent: navigator.userAgent,
        url: window.location.href,
        online: navigator.onLine
      }
    };
  }

  /**
   * Categoriza erro automaticamente
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') ||
        message.includes('connection') || error.name === 'NetworkError') {
      return ErrorCategory.NETWORK;
    }

    if (message.includes('storage') || message.includes('quota') ||
        message.includes('localstorage')) {
      return ErrorCategory.STORAGE;
    }

    if (message.includes('permission') || message.includes('denied') ||
        error.name === 'SecurityError') {
      return ErrorCategory.PERMISSION;
    }

    if (message.includes('invalid') || message.includes('validation') ||
        error.name === 'ValidationError') {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Avalia severidade do erro
   */
  assessSeverity(error) {
    const message = error.message.toLowerCase();

    // Críticos
    if (error.name === 'ReferenceError' || error.name === 'TypeError' ||
        message.includes('critical') || message.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }

    // Altos
    if (message.includes('storage full') || message.includes('quota') ||
        message.includes('permission denied')) {
      return ErrorSeverity.HIGH;
    }

    // Médios
    if (message.includes('network') || message.includes('timeout') ||
        message.includes('failed')) {
      return ErrorSeverity.MEDIUM;
    }

    return ErrorSeverity.LOW;
  }

  // ============================================
  // HISTÓRICO E ESTATÍSTICAS
  // ============================================

  /**
   * Adiciona erro ao histórico
   */
  addToHistory(errorEntry) {
    this.errorHistory.unshift(errorEntry);

    // Manter tamanho máximo
    if (this.errorHistory.length > this.options.maxHistorySize) {
      this.errorHistory.pop();
    }
  }

  /**
   * Incrementa contador de categoria
   */
  incrementErrorCount(category) {
    const count = this.errorCounts.get(category) || 0;
    this.errorCounts.set(category, count + 1);
  }

  /**
   * Retorna histórico de erros
   */
  getHistory(filter = {}) {
    let history = [...this.errorHistory];

    if (filter.category) {
      history = history.filter(e => e.category === filter.category);
    }

    if (filter.severity) {
      history = history.filter(e => e.severity === filter.severity);
    }

    if (filter.since) {
      const since = new Date(filter.since);
      history = history.filter(e => new Date(e.timestamp) >= since);
    }

    if (filter.limit) {
      history = history.slice(0, filter.limit);
    }

    return history;
  }

  /**
   * Retorna estatísticas de erros
   */
  getStats() {
    return {
      total: this.errorHistory.length,
      byCategory: Object.fromEntries(this.errorCounts),
      bySeverity: {
        low: this.errorHistory.filter(e => e.severity === ErrorSeverity.LOW).length,
        medium: this.errorHistory.filter(e => e.severity === ErrorSeverity.MEDIUM).length,
        high: this.errorHistory.filter(e => e.severity === ErrorSeverity.HIGH).length,
        critical: this.errorHistory.filter(e => e.severity === ErrorSeverity.CRITICAL).length
      },
      recentErrors: this.getHistory({ limit: 5 })
    };
  }

  /**
   * Limpa histórico
   */
  clearHistory() {
    this.errorHistory = [];
    this.errorCounts.clear();
  }

  // ============================================
  // SUPRESSÃO DE ERROS
  // ============================================

  /**
   * Suprime um tipo de erro
   */
  suppressError(errorPattern) {
    this.suppressedErrors.add(errorPattern);
  }

  /**
   * Remove supressão
   */
  unsuppressError(errorPattern) {
    this.suppressedErrors.delete(errorPattern);
  }

  /**
   * Verifica se erro está suprimido
   */
  isErrorSuppressed(error) {
    for (const pattern of this.suppressedErrors) {
      if (typeof pattern === 'string' && error.message.includes(pattern)) {
        return true;
      }
      if (pattern instanceof RegExp && pattern.test(error.message)) {
        return true;
      }
    }
    return false;
  }

  // ============================================
  // NOTIFICAÇÕES E LOGGING
  // ============================================

  /**
   * Log no console
   */
  logToConsole(errorEntry) {
    const emoji = {
      [ErrorSeverity.LOW]: '⚠️',
      [ErrorSeverity.MEDIUM]: '🔶',
      [ErrorSeverity.HIGH]: '🔴',
      [ErrorSeverity.CRITICAL]: '💥'
    };

    console.group(`${emoji[errorEntry.severity]} ${errorEntry.name}: ${errorEntry.message}`);
    console.log('Categoria:', errorEntry.category);
    console.log('Severidade:', errorEntry.severity);
    console.log('Contexto:', errorEntry.context);
    console.log('Timestamp:', errorEntry.timestamp);
    if (errorEntry.stack) {
      console.log('Stack:', errorEntry.stack);
    }
    console.log('Metadata:', errorEntry.metadata);
    console.groupEnd();
  }

  /**
   * Notifica usuário sobre erro
   */
  notifyUser(errorEntry) {
    const messages = {
      [ErrorCategory.NETWORK]: ERROR_MESSAGES.NETWORK,
      [ErrorCategory.STORAGE]: ERROR_MESSAGES.STORAGE_FULL,
      [ErrorCategory.PERMISSION]: ERROR_MESSAGES.PERMISSION_DENIED,
      [ErrorCategory.VALIDATION]: ERROR_MESSAGES.INVALID_DATA,
      [ErrorCategory.UNKNOWN]: ERROR_MESSAGES.GENERIC
    };

    const message = messages[errorEntry.category] || ERROR_MESSAGES.GENERIC;

    // Disparar evento para NotificationManager
    window.dispatchEvent(new CustomEvent('error:notify', {
      detail: {
        message,
        type: 'error',
        errorEntry
      }
    }));
  }

  /**
   * Reporta erro para servidor remoto
   */
  async reportToRemote(errorEntry) {
    if (!this.options.remoteEndpoint) return;

    try {
      await fetch(this.options.remoteEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorEntry)
      });
    } catch (e) {
      // Silencioso - não criar loop de erros
    }
  }

  // ============================================
  // LISTENERS
  // ============================================

  /**
   * Adiciona listener de erros
   */
  onError(callback) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notifica todos os listeners
   */
  notifyListeners(errorEntry) {
    this.listeners.forEach(callback => {
      try {
        callback(errorEntry);
      } catch (e) {
        // Evitar erros em listeners
      }
    });
  }

  // ============================================
  // MÉTODOS UTILITÁRIOS ESTÁTICOS
  // ============================================

  /**
   * Executa função com tratamento de erro
   */
  static safeExecute(fn, context = 'Operação', fallback = null) {
    try {
      const result = fn();

      // Se for promise, tratar async
      if (result instanceof Promise) {
        return result.catch(error => {
          window.__errorHandler?.handleError(error, { context });
          return fallback;
        });
      }

      return result;
    } catch (error) {
      window.__errorHandler?.handleError(error, { context });
      return fallback;
    }
  }

  /**
   * Executa com retry automático
   */
  static async withRetry(fn, options = {}) {
    const {
      maxRetries = 3,
      delay = TIMEOUTS.NETWORK_RETRY,
      backoff = 1.5,
      context = 'Operação'
    } = options;

    let lastError;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, currentDelay));
          currentDelay *= backoff;
        }
      }
    }

    window.__errorHandler?.handleError(lastError, {
      context: `${context} (após ${maxRetries} tentativas)`,
      severity: ErrorSeverity.HIGH
    });

    throw lastError;
  }

  /**
   * Executa com timeout
   */
  static async withTimeout(fn, timeout = 10000, context = 'Operação') {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${context}`)), timeout)
      )
    ]).catch(error => {
      window.__errorHandler?.handleError(error, { context });
      throw error;
    });
  }

  /**
   * Cria erro customizado
   */
  static createError(message, category = ErrorCategory.UNKNOWN, metadata = {}) {
    const error = new Error(message);
    error.category = category;
    error.metadata = metadata;
    return error;
  }

  // ============================================
  // HELPERS PRIVADOS
  // ============================================

  /**
   * Gera ID único
   */
  generateId() {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Log interno
   */
  log(message, level = 'log') {
    if (this.options.enableConsoleLog) {
      console[level](message);
    }
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

// Criar instância global automaticamente
const globalErrorHandler = new ErrorHandler();

export default globalErrorHandler;
