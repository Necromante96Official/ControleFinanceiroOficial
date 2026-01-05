/**
 * Connectivity Monitor - Monitoramento Online/Offline
 * Responsabilidade: Detectar mudanças de conectividade e exibir avisos de status.
 */

const SESSION_KEY_WAS_OFFLINE = 'finance-control:connectivity:was-offline';

/** Banner de conectividade desativado no momento (solicitado). */
const CONNECTIVITY_BANNER_ENABLED = false;

/**
 * Obtém status online/offline (heurístico).
 * Observação: navigator.onLine é apenas um indicativo.
 * @returns {'online'|'offline'}
 */
function getConnectivityStatus() {
  try {
    return navigator.onLine ? 'online' : 'offline';
  } catch {
    // Em caso de falha, assumir online para não bloquear o uso.
    return 'online';
  }
}

/**
 * Lê flag de "já ficou offline" na sessão.
 * @returns {boolean}
 */
function getWasOfflineThisSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY_WAS_OFFLINE) === '1';
  } catch {
    return false;
  }
}

/**
 * Marca flag de "já ficou offline" na sessão.
 */
function setWasOfflineThisSession() {
  try {
    sessionStorage.setItem(SESSION_KEY_WAS_OFFLINE, '1');
  } catch {
    // Ignorar
  }
}

/**
 * Remove banner atual, se existir.
 */
function removeExistingBanner() {
  const existing = document.querySelector('.connectivity-banner');
  if (!existing) return;
  existing.classList.remove('is-visible');
  setTimeout(() => existing.remove(), 220);
}

/**
 * Cria o banner de conectividade.
 * @param {'online'|'offline'} status
 * @returns {HTMLDivElement}
 */
function createBanner(status) {
  const banner = document.createElement('div');
  banner.className = `connectivity-banner connectivity-banner--${status}`;
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  // ------------
  // Conteúdo objetivo (somente o essencial solicitado)
  // ------------
  const title = status === 'offline' ? 'Você está offline' : 'Você está online';
  const subtitle = status === 'offline'
    ? 'Você pode continuar usando. Dados ficam salvos no aparelho; atualizações e recursos que dependem da internet podem não funcionar.'
    : 'Conexão restabelecida. Recursos que dependem da internet voltaram a funcionar.';

  banner.innerHTML = `
    <div class="connectivity-banner__content">
      <div class="connectivity-banner__icon" aria-hidden="true">${status === 'offline' ? '📴' : '🌐'}</div>
      <div class="connectivity-banner__text">
        <div class="connectivity-banner__title">${title}</div>
        <div class="connectivity-banner__subtitle">${subtitle}</div>
      </div>
    </div>
  `;

  return banner;
}

/**
 * Exibe o banner.
 * Regras:
 * - Offline: sempre exibe quando ficar offline ou iniciar offline.
 * - Online: exibe somente se já ficou offline nesta sessão.
 * @param {'online'|'offline'} status
 */
function showBanner(status) {
  if (typeof document === 'undefined') return;

  // Evitar mostrar online sem ter passado por offline
  if (status === 'online' && !getWasOfflineThisSession()) return;

  // Substituir banner atual
  removeExistingBanner();

  const banner = createBanner(status);
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('is-visible'));

  // ------------
  // Comportamento: offline fica visível; online desaparece sozinho
  // ------------
  if (status === 'online') {
    setTimeout(() => {
      if (!banner.isConnected) return;
      banner.classList.remove('is-visible');
      setTimeout(() => banner.remove(), 220);
    }, 5200);
  }
}

/**
 * Inicializa monitoramento de conectividade.
 * @returns {{ getStatus: () => 'online'|'offline' }}
 */
export function initConnectivityMonitor() {
  // Notificações visuais desativadas: não anexar listeners nem exibir banner.
  if (!CONNECTIVITY_BANNER_ENABLED) {
    try {
      removeExistingBanner();
    } catch {
      // Ignorar
    }

    return {
      getStatus: () => getConnectivityStatus()
    };
  }

  // Garantir inicialização única
  if (typeof window !== 'undefined' && window.__connectivityMonitorInitialized) {
    return {
      getStatus: () => getConnectivityStatus()
    };
  }

  if (typeof window !== 'undefined') {
    window.__connectivityMonitorInitialized = true;
  }

  // ------------
  // Estado inicial
  // ------------
  const initialStatus = getConnectivityStatus();
  if (initialStatus === 'offline') {
    setWasOfflineThisSession();
    showBanner('offline');
  }

  // ------------
  // Listeners de mudança de rede
  // ------------
  window.addEventListener('offline', () => {
    setWasOfflineThisSession();
    showBanner('offline');
  });

  window.addEventListener('online', () => {
    // Somente mostrar online se já houve offline
    if (!getWasOfflineThisSession()) return;
    showBanner('online');
  });

  return {
    getStatus: () => getConnectivityStatus()
  };
}
