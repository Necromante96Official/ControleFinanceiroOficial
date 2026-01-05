/**
 * Módulo: storageQuotaMonitor
 * Responsabilidade: Monitorar a cota estimada de armazenamento e avisar ANTES de estourar.
 *
 * Regras:
 * - Usa navigator.storage.estimate() quando disponível.
 * - Não muda UX: apenas exibe um toast quando ficar crítico.
 * - Possui throttling para evitar spam.
 */

import { dispatchToast } from './toastManager.js';

// ============================================
// Configuração
// ============================================

const DEFAULTS = {
  // ------------
  // Critério de alerta
  // - ratioCritical: quando uso/quota ultrapassa esse valor.
  // - remainingBytesCritical: quando o espaço restante fica muito baixo.
  // ------------
  ratioCritical: 0.9,
  remainingBytesCritical: 10 * 1024 * 1024, // 10MB

  // ------------
  // Frequências
  // ------------
  minCheckIntervalMs: 5 * 60 * 1000, // 5 min
  pollVisibleIntervalMs: 10 * 60 * 1000, // 10 min

  // ------------
  // Anti-spam do toast
  // ------------
  warnThrottleMs: 12 * 60 * 60 * 1000, // 12h

  // ------------
  // Toast
  // ------------
  toastId: 'storage-quota-critical',
  toastDurationMs: 8000
};

const STORAGE_KEYS = {
  LAST_CHECK_AT: 'finance-control:storage-quota:last-check-at',
  LAST_WARN_AT: 'finance-control:storage-quota:last-warn-at'
};

let _initialized = false;
let _pollTimer = null;

// ============================================
// API
// ============================================

/**
 * Inicializa o monitor de cota.
 * @param {object} [options]
 */
export function initStorageQuotaMonitor(options = {}) {
  if (_initialized) return;
  _initialized = true;

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!navigator?.storage?.estimate) return;

  // ------------
  // Check inicial
  // ------------
  _tryCheckAndWarn({ config });

  // ------------
  // Ao voltar para a aba/app, checar novamente (com throttling)
  // ------------
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _tryCheckAndWarn({ config });
    }
  });

  // ------------
  // Quando voltar a ficar online, checar novamente
  // ------------
  window.addEventListener('online', () => _tryCheckAndWarn({ config }));

  // ------------
  // Checagem periódica quando visível (leve)
  // ------------
  if (Number(config.pollVisibleIntervalMs) > 0) {
    _pollTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      _tryCheckAndWarn({ config });
    }, Number(config.pollVisibleIntervalMs));
  }
}

// ============================================
// Internals
// ============================================

function _tryReadNumber(key) {
  try {
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function _tryWriteNumber(key, value) {
  try {
    localStorage.setItem(key, String(Number(value) || 0));
  } catch {
    // Ignorar
  }
}

function _formatPercent(value) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `${pct}%`;
}

function _formatMb(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)}MB`;
}

async function _tryCheckAndWarn({ config }) {
  // ------------
  // Throttle de checagem (para não ficar chamando estimate() em excesso)
  // ------------
  const now = Date.now();
  const lastCheckAt = _tryReadNumber(STORAGE_KEYS.LAST_CHECK_AT);
  if (lastCheckAt && now - lastCheckAt < Number(config.minCheckIntervalMs)) return;
  _tryWriteNumber(STORAGE_KEYS.LAST_CHECK_AT, now);

  let estimate;
  try {
    estimate = await navigator.storage.estimate();
  } catch {
    return;
  }

  const quota = Number(estimate?.quota) || 0;
  const usage = Number(estimate?.usage) || 0;
  if (quota <= 0) return;

  const ratio = usage / quota;
  const remaining = Math.max(0, quota - usage);

  const isCriticalByRatio = ratio >= Number(config.ratioCritical);
  const isCriticalByRemaining = remaining <= Number(config.remainingBytesCritical);

  if (!isCriticalByRatio && !isCriticalByRemaining) return;

  // ------------
  // Throttle do toast (anti-spam)
  // ------------
  const lastWarnAt = _tryReadNumber(STORAGE_KEYS.LAST_WARN_AT);
  if (lastWarnAt && now - lastWarnAt < Number(config.warnThrottleMs)) return;
  _tryWriteNumber(STORAGE_KEYS.LAST_WARN_AT, now);

  // ------------
  // Aviso: sugerir "Backup + Limpeza" (sem mudar UX)
  // ------------
  const percent = _formatPercent(ratio);
  const remainingLabel = _formatMb(remaining);

  dispatchToast({
    id: config.toastId,
    variant: 'warning',
    durationMs: Number(config.toastDurationMs),
    title: 'Armazenamento quase cheio',
    message: `Uso estimado: ${percent}. Restante: ${remainingLabel}. Recomendado: faça Backup e use Limpeza de Dados para evitar perda de informações.`
  });
}

/**
 * Para testes manuais/debug: encerra o polling.
 */
export function _stopStorageQuotaMonitorForTests() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  _initialized = false;
}
