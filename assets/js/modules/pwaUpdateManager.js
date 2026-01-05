/**
 * Módulo: PWA Update Manager
 * Responsabilidade: Tornar as atualizações do PWA mais previsíveis.
 * - Detecta quando existe uma nova versão do Service Worker em "waiting".
 * - Exibe aviso "Nova versão disponível" com botão "Recarregar".
 * - Aplica update via mensagem "SKIP_WAITING" e recarrega no "controllerchange".
 */

import { dispatchToast } from './toastManager.js';
import { getAppMeta } from './backup/getAppMeta.js';
import { getWaitingServiceWorkerMeta } from './pwa/getWaitingServiceWorkerMeta.js';
import { waitForServiceWorkerRegistration } from './pwa/waitForServiceWorkerRegistration.js';

// ============================================
// Configuração
// ============================================

const DEFAULTS = {
  toastId: 'pwa:update-available',
  // ------------
  // Requisito: enquanto o usuário estiver no sistema,
  // detectar atualizações com mais rapidez.
  // ------------
  throttleUpdateMs: 5 * 1000,
  pollUpdateMs: 5 * 1000
};

let _initialized = false;
let _refreshing = false;
let _lastUpdateCheckAt = 0;
let _swUpdateBlocked = false;

// ============================================
// API
// ============================================

/**
 * Inicializa o monitor de atualizações do PWA.
 * Observação: o registro do SW é feito no index.html; aqui apenas monitoramos.
 */
export function initPwaUpdateManager(options = {}) {
  if (_initialized) return;
  _initialized = true;

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const config = {
    ...DEFAULTS,
    ...options
  };

  // ------------
  // Ao trocar o controller, recarrega para aplicar a nova versão.
  // ------------
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_refreshing) return;
    _refreshing = true;
    window.location.reload();
  });

  // ------------
  // Bootstrap assíncrono
  // ------------
  _setup(config).catch(() => undefined);
}

// ============================================
// Internals
// ============================================

async function _setup(config) {
  // ------------
  // IMPORTANTÍSSIMO:
  // O registro do SW é feito no index.html (evento "load").
  // Se o app inicializar antes disso, getRegistration() pode retornar undefined.
  // Aqui aguardamos um curto período para evitar perder o monitor de updates.
  // ------------
  const registration = await waitForServiceWorkerRegistration({ timeoutMs: 30000, pollMs: 150 });
  if (!registration) return;

  // ------------
  // Se já existe update aguardando, avisar imediatamente.
  // ------------
  if (registration.waiting) {
    _notifyUpdateAvailable({ registration, config });
  }

  // ------------
  // Detectar novas instalações
  // ------------
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      // ------------
      // Regras de detecção
      // - Em "primeira instalação", a página AINDA não é controlada (controller = null)
      //   e também não existe registration.active no momento do "installed".
      // - Em "update", já existe um SW ativo (registration.active) e o novo entra em waiting.
      // ------------
      const isInstalled = installing.state === 'installed';
      const hasController = Boolean(navigator.serviceWorker.controller);
      const hasActiveServiceWorker = Boolean(registration.active);

      if (isInstalled && (hasController || hasActiveServiceWorker)) {
        _notifyUpdateAvailable({ registration, config });
        return;
      }
    });
  });

  // ------------
  // Forçar checagens em momentos previsíveis (sem spam)
  // ------------
  // ------------
  // Checagens iniciais em sequência (defesa contra timing de rede/cache)
  // - 1ª: imediata
  // - 2ª: logo após alguns segundos (quando o SW novo pode ter terminado o install)
  // ------------
  _tryUpdate({ registration, config, force: true });
  setTimeout(() => _tryUpdate({ registration, config, force: true }), 2500);
  setTimeout(() => _tryUpdate({ registration, config, force: true }), 8000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _tryUpdate({ registration, config });
    }
  });

  // ------------
  // Checagem periódica enquanto o app está aberto (sem depender de reload)
  // ------------
  if (Number(config.pollUpdateMs) > 0) {
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      _tryUpdate({ registration, config });
    }, Number(config.pollUpdateMs));
  }

  // ------------
  // Ao voltar a ficar online, checar update imediatamente
  // ------------
  window.addEventListener('online', () => _tryUpdate({ registration, config }));
}

function _tryUpdate({ registration, config, force = false }) {
  // ------------
  // Evitar checagens quando offline
  // ------------
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  // ------------
  // Se já detectamos erro fatal (ex.: sw.js 404), não insistir.
  // ------------
  if (_swUpdateBlocked) return;

  const now = Date.now();
  if (!force && now - _lastUpdateCheckAt < config.throttleUpdateMs) return;
  _lastUpdateCheckAt = now;

  try {
    Promise.resolve(registration.update()).catch((error) => {
      const msg = String(error?.message || error || '');

      // Caso típico: sw.js não está acessível (404)
      if (msg.includes('404') || msg.includes('bad HTTP response code')) {
        _swUpdateBlocked = true;
        console.warn('⚠️ SW: atualização bloqueada (404). Verifique publicação do sw.js.', error);
      }
    });
  } catch {
    // Ignorar
  }

  // ------------
  // Defesa extra:
  // Mesmo que algum evento seja perdido, se existir "waiting" após update(),
  // exibimos o toast.
  // ------------
  const checkWaiting = () => {
    try {
      if (registration.waiting) {
        _notifyUpdateAvailable({ registration, config });
      }
    } catch {
      // Ignorar
    }
  };

  // ------------
  // Defesa extra:
  // - 350ms: cobre updates muito rápidos
  // - 2500ms: cobre downloads/installs que demoram mais
  // ------------
  setTimeout(checkWaiting, 350);
  setTimeout(checkWaiting, 2500);
}

function _notifyUpdateAvailable({ registration, config }) {
  _notifyUpdateAvailableAsync({ registration, config }).catch(() => undefined);
}

async function _notifyUpdateAvailableAsync({ registration, config }) {
  // ------------
  // Preferir metadados da versão em "waiting" (versão que será aplicada ao recarregar).
  // Fallback: metadados atuais do app.
  // ------------
  const currentMeta = getAppMeta();
  const waitingMeta = await getWaitingServiceWorkerMeta(registration?.waiting);

  const version = waitingMeta?.version || currentMeta?.version || '';
  const build = waitingMeta?.build || currentMeta?.build || '';

  // ==================================================
  // Toast premium: informações organizadas e mais destacadas
  // - título
  // - badges (versão/build)
  // - mensagem curta
  // ==================================================
  const metaBadges = [];
  if (version) metaBadges.push(String(version));
  if (build) metaBadges.push(`build ${build}`);

  dispatchToast({
    id: config.toastId,
    variant: 'info',
    tone: 'update',
    persistent: true,
    showIcon: false,
    showClose: false,
    title: 'Atualização disponível',
    meta: metaBadges,
    message: 'Recarregue para usar o sistema.',
    actionLabel: 'Recarregar',
    onAction: () => _applyUpdate({ registration })
  });
}

function _applyUpdate({ registration }) {
  // ==================================================
  // Segurança: garantir recarregamento mesmo se o
  // "controllerchange" não disparar por algum motivo.
  // ==================================================
  const safeReload = () => {
    if (_refreshing) return;
    _refreshing = true;
    window.location.reload();
  };

  // ------------
  // Caso padrão: existe worker em waiting, pedir para ativar.
  // ------------
  if (registration?.waiting) {
    const waiting = registration.waiting;

    // ------------
    // Se o SW mudar de estado para activated, recarregar.
    // ------------
    try {
      waiting.addEventListener('statechange', () => {
        if (waiting.state === 'activated') {
          safeReload();
        }
      });
    } catch {
      // Ignorar
    }

    // ------------
    // Fallback forte: recarregar mesmo sem eventos.
    // ------------
    const fallbackMs = 2500;
    setTimeout(() => safeReload(), fallbackMs);

    try {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      // Ignorar
    }

    // Tentar forçar update do registration também (sem depender disso)
    try {
      registration.update();
    } catch {
      // Ignorar
    }

    return;
  }

  // ------------
  // Fallback: tentar update e recarregar.
  // ------------
  try {
    registration.update();
  } catch {
    // Ignorar
  }

  setTimeout(() => safeReload(), 1500);
}
