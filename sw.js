/**
 * Service Worker - PWA Offline Support
 * Cache estratégia: Cache First para assets, Network First para navegação
 */
// Prefixo fixo para não apagar caches de outros apps na mesma origem.
const CACHE_PREFIX = 'controlefinanceiro';
// Build do app (usado para versionar o cache e evitar assets antigos).
const APP_BUILD = '262';

/** Notificações (push/showNotification) desativadas no momento (solicitado). */
const NOTIFICATIONS_ENABLED = false;
// Cache único do app.
const CACHE_NAME = `${CACHE_PREFIX}-static-app-${APP_BUILD}`;
const OFFLINE_URL = './index.html';

/**
 * Faz fetch com timeout para evitar travamento quando offline.
 * @param {Request} request
 * @param {RequestInit} options
 * @param {number} timeoutMs
 */
async function fetchWithTimeout(request, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs) || 0);

  try {
    return await fetch(request, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Recupera o "app shell" do cache para abrir o app offline com consistência.
 * Observação: usamos ignoreSearch para cobrir URLs com query (ex.: ?tab=...).
 * @param {Cache} cache
 */
async function getCachedAppShell(cache) {
  return (
    (await cache.match(OFFLINE_URL, { ignoreSearch: true })) ||
    (await cache.match('./index.html', { ignoreSearch: true })) ||
    (await cache.match('./', { ignoreSearch: true }))
  );
}

/**
 * Verifica se o cache pertence a este app.
 * @param {string} cacheName
 */
function isAppCache(cacheName) {
  return cacheName.startsWith(`${CACHE_PREFIX}-`);
}

/**
 * Remove caches antigos APENAS deste app.
 * @param {string} currentCacheName
 */
async function deleteOldAppCaches(currentCacheName) {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => {
      if (!isAppCache(cacheName)) return undefined;
      if (cacheName === currentCacheName) return undefined;
      console.log('🗑️ Service Worker: Deletando cache antiga (app):', cacheName);
      return caches.delete(cacheName);
    })
  );
}

/**
 * Limpa todos os caches deste app (sem afetar outros apps).
 */
async function deleteAllAppCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => {
      if (!isAppCache(cacheName)) return undefined;
      console.log('🗑️ Service Worker: Deletando cache (app):', cacheName);
      return caches.delete(cacheName);
    })
  );
}

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // CSS Files
  './assets/css/index.css',
  './assets/css/variables.css',
  './assets/css/base.css',
  './assets/css/layout.css',
  './assets/css/buttons.css',
  './assets/css/cards.css',
  './assets/css/forms.css',
  './assets/css/modals.css',
  './assets/css/confirmation-modal.css',
  './assets/css/footer.css',
  './assets/css/splash.css',
  './assets/css/utilities.css',
  './assets/css/toasts.css',
  './assets/css/connectivity-banner.css',
  './assets/css/responsive-mobile.css',
  './assets/css/corrections.css',
  './assets/css/install-banner.css',
  './assets/css/danger-zone.css',
  // Main JS
  './assets/js/main.js',
  // Core Constants (shared by all modules)
  './assets/js/modules/constants.js',
  // Utilitários de normalização monetária
  './assets/js/modules/moneyUtils.js',
  // Safe Storage (localStorage wrapper)
  './assets/js/modules/safeStorage.js',
  // Store Observer (Observer Pattern)
  './assets/js/modules/storeObserver.js',
  // Base Store (Foundation for all stores)
  './assets/js/modules/baseStore.js',
  // Store Modules
  './assets/js/modules/categoryStore.js',
  './assets/js/modules/benefitStore.js',
  './assets/js/modules/creditStore.js',
  './assets/js/modules/debitStore.js',
  './assets/js/modules/transactionStore.js',
  // Form Modules
  './assets/js/modules/categoryForm.js',
  './assets/js/modules/benefitForm.js',
  './assets/js/modules/creditForm.js',
  './assets/js/modules/debitForm.js',
  './assets/js/modules/transactionForm.js',
  // Manager Modules
  './assets/js/modules/splashScreen.js',
  './assets/js/modules/domElements.js',
  './assets/js/modules/statsManager.js',
  './assets/js/modules/filterManager.js',
  './assets/js/modules/transactionManager.js',
  './assets/js/modules/gridRenderer.js',
  './assets/js/modules/saveHandlers.js',
  './assets/js/modules/dangerZoneManager.js',
  // Som (clique + configurações)
  './assets/js/modules/clickSoundManager.js',
  './assets/js/modules/soundSettingsManager.js',

  // Auditoria (últimas ações)
  './assets/js/modules/audit/auditConstants.js',
  './assets/js/modules/audit/auditStorage.js',
  './assets/js/modules/audit/createAuditEntry.js',
  './assets/js/modules/audit/dispatchAuditUpdated.js',
  './assets/js/modules/audit/formatAuditDateTime.js',
  './assets/js/modules/audit/getChangedKeysShallow.js',
  './assets/js/modules/audit/shouldSuppressTransactionAudit.js',
  './assets/js/modules/audit/subscribeAuditToStores.js',
  './assets/js/modules/audit/auditManager.js',
  './assets/js/modules/audit/auditUiManager.js',
  // Backup (hash + prévia)
  './assets/js/modules/backup/sha256Hex.js',
  './assets/js/modules/backup/downloadTextFile.js',
  './assets/js/modules/backup/getBackupCounts.js',
  './assets/js/modules/backup/createBackupEnvelope.js',
  './assets/js/modules/backup/parseBackupEnvelope.js',
  './assets/js/modules/backup/formatBackupPreviewMessage.js',
  './assets/js/modules/backup/getAppMeta.js',
  './assets/js/modules/backup/escapeHtml.js',
  './assets/js/modules/backup/textToSafeHtml.js',
  './assets/js/modules/backup/stripPrivateFieldsDeep.js',
  './assets/js/modules/backup/dedupeArrayByIdKeepFirst.js',
  './assets/js/modules/backup/sanitizeBackupPayload.js',
  // PWA (helpers)
  './assets/js/modules/pwa/getWaitingServiceWorkerMeta.js',
  './assets/js/modules/pwa/waitForServiceWorkerRegistration.js',
  // Metadados do app (versão/build) e Sobre
  './assets/js/modules/appMeta/appMetaConstants.js',
  './assets/js/modules/appMeta/formatBuildForDisplay.js',
  './assets/js/modules/appMeta/getAppMeta.js',
  './assets/js/modules/about/buildWhatsappUrl.js',
  './assets/js/modules/about/createAboutModalMarkup.js',
  './assets/js/modules/about/createAboutModalElement.js',
  './assets/js/modules/about/aboutModalManager.js',

  // Changelog (Histórico de Atualizações)
  './assets/js/modules/changelog/parseUpdatesMarkdown.js',
  './assets/js/modules/changelog/renderUpdatesEntriesHtml.js',
  './assets/js/modules/changelog/createUpdatesModalMarkup.js',
  './assets/js/modules/changelog/createUpdatesModalElement.js',
  './assets/js/modules/changelog/updatesModalManager.js',
  './assets/changelog/updates.md',
  // Cache-busting para match com fetch("...updates.md?v=<build>")
  './assets/changelog/updates.md?v=262',

  // Utility Modules
  './assets/js/modules/categoryPalette.js',
  './assets/js/modules/tabManager.js',
  './assets/js/modules/currencyFormatter.js',
  './assets/js/modules/confirmationModal.js',
  './assets/js/modules/errorHandler.js',
  './assets/js/modules/browserCompat.js',
  './assets/js/modules/storageSync.js',
  './assets/js/modules/autoReloadManager.js',
  './assets/js/modules/notificationManager.js',
  './assets/js/modules/virtualScroll.js',
  './assets/js/modules/toastManager.js',
  './assets/js/modules/pwaUpdateManager.js',
  './assets/js/modules/storageQuotaMonitor.js',
  './assets/js/modules/connectivityMonitor.js',
  './assets/js/modules/dateUtils.js',
  './assets/js/modules/extratoFiltersModal.js',
  './assets/js/modules/extratoFiltersIndicator.js',
  // Assets
  './assets/logo/logo.png',
  // Cache-busting do ícone (mantém compatibilidade com referências sem query)
  './assets/logo/logo.png?v=262',

  // Ícones reais para instalação (Android/Chrome)
  './assets/logo/icon-96.png',
  './assets/logo/icon-96.png?v=262',
  './assets/logo/icon-192.png',
  './assets/logo/icon-192.png?v=262',
  './assets/logo/icon-512.png',
  './assets/logo/icon-512.png?v=262',
  './assets/logo/apple-touch-icon-180.png',
  './assets/logo/apple-touch-icon-180.png?v=262'
];

// ============================================
// Assets essenciais (precisão offline)
// ============================================

/**
 * Estes assets são o mínimo para o app abrir offline.
 * Se algum deles falhar, o SW não deve concluir a instalação.
 */
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/index.css',
  './assets/js/main.js'
];

/**
 * Install Event - Pré-cacheamento de assets estáticos
 */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('📦 Service Worker: Pre-cacheando assets');

      // ------------
      // 1) Precisão offline: garantir o mínimo obrigatório.
      // ------------
      await cache.addAll(CORE_ASSETS);

      // ------------
      // 2) Melhor esforço: demais assets.
      //    Observação: se algum falhar, o SW continua válido,
      //    mas o app ainda abre offline via CORE_ASSETS.
      // ------------
      await Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn(`⚠️ Falha ao cachear: ${url}`, err);
            return undefined;
          })
        )
      );
    })()
  );
  // Importante:
  // - Não ativar automaticamente aqui.
  // - A ativação será solicitada pelo app (botão "Recarregar") via mensagem SKIP_WAITING.
});

// Mensagens do cliente serão tratadas mais abaixo em um único listener

/**
 * Activate Event - Limpar caches antigas e notificar clientes
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      await deleteOldAppCaches(CACHE_NAME);
      await self.clients.claim();
      startMonitoring();
    })()
  );
});

/**
 * Fetch Event - Estratégia de Cache Otimizada para PWA/APK
 * - Cache First para assets estáticos
 * - Network First para navegação
 * - Fallback para index.html (SPA mode)
 */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições externas e chrome-extension
  if (url.origin !== location.origin || url.protocol === 'chrome-extension:') {
    return;
  }

  // Ignorar requisições POST, PUT, DELETE
  if (request.method !== 'GET') {
    return;
  }

  // Strategy: Assets estáticos
  // - Scripts/Styles: Network First (evita servir JS/CSS antigos para sempre)
  // - Outros assets: Stale-While-Revalidate
  if (
    request.url.includes('/assets/') ||
    request.url.includes('/manifest.json') ||
    request.url.includes('/logo/')
  ) {
    return event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        // -------------------------
        // Scripts e CSS: Network First
        // -------------------------
        if (request.destination === 'script' || request.destination === 'style') {
          try {
            const networkResponse = await fetchWithTimeout(
              request,
              { cache: 'no-store' },
              4000
            );

            if (networkResponse && networkResponse.ok) {
              event.waitUntil(cache.put(request, networkResponse.clone()));
              return networkResponse;
            }

            // Se a rede respondeu mas não está ok, tenta cache
            if (cachedResponse) {
              return cachedResponse;
            }

            return networkResponse;
          } catch (error) {
            if (cachedResponse) {
              return cachedResponse;
            }

            if (request.destination === 'style') {
              return new Response('/* offline */', { headers: { 'Content-Type': 'text/css' } });
            }

            return new Response('// offline', { headers: { 'Content-Type': 'text/javascript' } });
          }
        }

        // -------------------------
        // Demais assets: Stale-While-Revalidate
        // -------------------------
        if (cachedResponse) {
          event.waitUntil(
            fetchWithTimeout(request, { cache: 'no-store' }, 6000)
              .then(networkResponse => {
                if (networkResponse && networkResponse.ok) {
                  return cache.put(request, networkResponse.clone());
                }
                return undefined;
              })
              .catch(() => undefined)
          );

          return cachedResponse;
        }

        // Sem cache: tenta rede e cacheia
        try {
          const networkResponse = await fetchWithTimeout(
            request,
            { cache: 'no-store' },
            6000
          );

          if (networkResponse && networkResponse.ok) {
            event.waitUntil(cache.put(request, networkResponse.clone()));
          }

          return networkResponse;
        } catch (error) {
          if (request.destination === 'image') {
            return new Response('', { status: 204 });
          }
          return new Response('Offline', { status: 503 });
        }
      })()
    );
  }

  // Strategy: Network First para navegação (com App Shell offline)
  // Objetivo: garantir que o app sempre abra offline após 1ª visita bem-sucedida.
  if (request.mode === 'navigate' || request.destination === 'document') {
    return event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // ------------
        // App shell: usado como fallback para abrir o app mesmo com query/atalhos.
        // ------------
        const appShell = await getCachedAppShell(cache);
        const cachedNavigation =
          (await cache.match(request, { ignoreSearch: true })) ||
          appShell;

        try {
          const networkResponse = await fetchWithTimeout(
            request,
            {
              cache: 'reload',
              mode: 'same-origin',
              credentials: 'same-origin'
            },
            8000
          );

          // ------------
          // Rede OK: atualizar cache e retornar.
          // - Cachear também o OFFLINE_URL garante que atalhos (?tab=...) abram offline.
          // ------------
          if (networkResponse && networkResponse.ok) {
            event.waitUntil(cache.put(OFFLINE_URL, networkResponse.clone()));
            event.waitUntil(cache.put(request, networkResponse.clone()));
            return networkResponse;
          }

          // ------------
          // Rede respondeu inválida: usar cache se existir.
          // ------------
          if (cachedNavigation) {
            return cachedNavigation;
          }

          return networkResponse;
        } catch (error) {
          // ------------
          // Offline/timeout: sempre tentar devolver o app shell.
          // ------------
          if (cachedNavigation) {
            return cachedNavigation;
          }

          return new Response('Offline: conecte-se uma vez para preparar o cache do app.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      })()
    );
  }

  // Default: Cache First, Network Fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(request).then(response => {
        return response;
      }).catch(() => {
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

/**
 * Background Sync - Sincronizar dados quando conectar
 */
self.addEventListener('sync', event => {
  console.log('🔄 Service Worker: Sync event recebido:', event.tag);
  
  if (event.tag === 'sync-finance-data') {
    event.waitUntil(syncFinanceData());
  }
  
  if (event.tag === 'sync-pending-transactions') {
    event.waitUntil(syncPendingTransactions());
  }
});

/**
 * Sincroniza dados financeiros
 */
async function syncFinanceData() {
  try {
    console.log('🔄 Service Worker: Sincronizando dados financeiros');
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        message: 'Dados sincronizados com sucesso',
        timestamp: new Date().toISOString()
      });
    });
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao sincronizar dados:', error);
    throw error; // Permite retry automático
  }
}

/**
 * Sincroniza transações pendentes (para futura implementação de backend)
 */
async function syncPendingTransactions() {
  try {
    console.log('🔄 Sincronizando transações pendentes...');
    // Placeholder para sincronização com servidor
    return true;
  } catch (error) {
    console.error('❌ Erro ao sincronizar transações:', error);
    throw error;
  }
}

/**
 * Periodic Background Sync - Verificar recarga de benefícios
 * Requer registro: navigator.serviceWorker.ready.then(reg => reg.periodicSync.register('check-benefits', { minInterval: 24 * 60 * 60 * 1000 }))
 */
self.addEventListener('periodicsync', event => {
  console.log('⏰ Service Worker: Periodic sync event:', event.tag);
  
  if (event.tag === 'check-benefits') {
    event.waitUntil(checkBenefitsReload());
  }
});

/**
 * Verifica se benefícios precisam ser recarregados
 */
async function checkBenefitsReload() {
  try {
    console.log('🔄 Verificando recarga de benefícios...');
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'CHECK_BENEFITS_RELOAD',
        timestamp: new Date().toISOString()
      });
    });
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao verificar benefícios:', error);
  }
}

/**
 * Push Notifications - Receber notificações
 * Notificações aprimoradas com múltiplos tipos e ações
 */
self.addEventListener('push', event => {
  // Notificações desativadas no momento (solicitado).
  if (!NOTIFICATIONS_ENABLED) return;

  console.log('📨 Service Worker: Push recebido');
  
  let data = {
    title: 'Controle Financeiro',
    body: 'Você tem uma nova notificação',
    icon: './assets/logo/logo.png',
    badge: './assets/logo/logo.png',
    tag: 'finance-notification',
    requireInteraction: false,
    type: 'info'
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  const notificationConfig = {
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    requireInteraction: data.requireInteraction,
    renotify: true,
    silent: false,
    data: {
      url: data.url || './',
      timestamp: new Date().toISOString(),
      type: data.type
    }
  };
  
  // Configurar por tipo
  switch (data.type) {
    case 'invoice-urgent': // Fatura urgente
      notificationConfig.body = data.body;
      notificationConfig.vibrate = [300, 100, 300, 100, 300]; // Vibração urgente
      notificationConfig.requireInteraction = true;
      notificationConfig.actions = [
        { action: 'pay', title: '💵 Pagar Agora', icon: './assets/logo/logo.png' },
        { action: 'remind', title: '⏰ Lembrar Depois' },
        { action: 'view', title: '👁️ Ver Detalhes' }
      ];
      break;
      
    case 'invoice-warning': // Fatura próxima do vencimento
      notificationConfig.body = data.body;
      notificationConfig.vibrate = [200, 100, 200];
      notificationConfig.actions = [
        { action: 'pay', title: '💵 Pagar' },
        { action: 'view', title: '👁️ Ver Fatura' },
        { action: 'close', title: 'Fechar' }
      ];
      break;
      
    case 'limit-warning': // Limite de crédito próximo
      notificationConfig.body = data.body;
      notificationConfig.vibrate = [200, 100, 200];
      notificationConfig.actions = [
        { action: 'view', title: '📊 Ver Gastos' },
        { action: 'close', title: 'OK' }
      ];
      break;
      
    case 'benefit-reload': // Benefício recarregado
      notificationConfig.body = data.body;
      notificationConfig.vibrate = [100, 50, 100];
      notificationConfig.silent = false;
      notificationConfig.actions = [
        { action: 'view', title: '💰 Ver Benefícios' },
        { action: 'close', title: 'OK' }
      ];
      break;
      
    case 'summary': // Resumo diário/semanal
      notificationConfig.body = data.body;
      notificationConfig.vibrate = [100];
      notificationConfig.actions = [
        { action: 'view', title: '📊 Ver Resumo' },
        { action: 'close', title: 'Fechar' }
      ];
      break;
      
    default: // Notificação genérica
      notificationConfig.body = data.body;
      notificationConfig.vibrate = [200, 100, 200];
      notificationConfig.actions = [
        { action: 'open', title: 'Abrir App' },
        { action: 'close', title: 'Fechar' }
      ];
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, notificationConfig)
  );
});

/**
 * Notification Click - Ação ao clicar na notificação
 * Ações específicas por tipo de notificação
 */
self.addEventListener('notificationclick', event => {
  // Notificações desativadas no momento (solicitado).
  if (!NOTIFICATIONS_ENABLED) return;

  console.log('🔔 Notificação clicada:', event.action, event.notification.data);
  
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  const action = event.action;
  
  // Ações específicas
  if (action === 'close') {
    return; // Apenas fecha
  }
  
  if (action === 'remind') {
    // Reagendar notificação para 1 hora depois
    setTimeout(() => {
      self.registration.showNotification('⏰ Lembrete: Fatura Pendente', {
        body: 'Não esqueça de pagar sua fatura!',
        icon: './assets/logo/logo.png',
        badge: './assets/logo/logo.png',
        tag: 'reminder-' + Date.now(),
        vibrate: [200, 100, 200]
      });
    }, 60 * 60 * 1000); // 1 hora
    return;
  }
  
  // Determinar URL baseado na ação e tipo
  let urlToOpen = './';
  
  if (action === 'pay' || action === 'view') {
    const type = notificationData.type;
    
    switch (type) {
      case 'invoice-urgent':
      case 'invoice-warning':
      case 'limit-warning':
        urlToOpen = './?tab=credito'; // Abrir aba de crédito
        break;
      case 'benefit-reload':
        urlToOpen = './?tab=beneficios'; // Abrir aba de benefícios
        break;
      case 'summary':
        urlToOpen = './?tab=extrato'; // Abrir aba de extrato
        break;
      default:
        urlToOpen = notificationData.url || './';
    }
  } else {
    urlToOpen = notificationData.url || './';
  }
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Se já existe uma aba aberta, focar nela e navegar
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Enviar mensagem para navegar para a aba correta
            client.postMessage({
              type: 'NAVIGATE_TO',
              url: urlToOpen
            });
            return client.focus();
          }
        }
        // Caso contrário, abrir nova aba
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

/**
 * Message Event - Comunicação com cliente
 */
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};
  
  console.log('📩 Service Worker: Mensagem recebida:', type);
  
  switch (type) {
    case 'GET_APP_META':
      // Responde via MessageChannel (event.ports[0]) quando disponível.
      // Isso funciona mesmo com SW em "waiting", antes de controlar a página.
      try {
        const replyPort = event?.ports?.[0];
        if (replyPort && typeof replyPort.postMessage === 'function') {
          replyPort.postMessage({
            version: 'v1.0.3',
            build: APP_BUILD
          });
        }
      } catch {
        // Ignorar
      }
      break;

    case 'SKIP_WAITING':
      // Ativar a nova versão apenas quando o app pedir explicitamente.
      try {
        self.skipWaiting();
      } catch {
        // Ignorar
      }
      break;

    case 'ENABLE_MONITORING':
      if (!NOTIFICATIONS_ENABLED) break;
      console.log('✅ Monitoramento habilitado pelo usuário');
      monitoringEnabled = true;
      startMonitoring();
      break;

    case 'DISABLE_MONITORING':
      if (!NOTIFICATIONS_ENABLED) break;
      console.log('❌ Monitoramento desabilitado pelo usuário');
      monitoringEnabled = false;
      stopMonitoring();
      break;

    case 'SEND_INVOICE_NOTIFICATION':
      if (!NOTIFICATIONS_ENABLED) break;
      if (payload && payload.invoiceData) {
        sendInvoiceNotification(payload.invoiceData);
      }
      break;
      
    case 'TRIGGER_SYNC':
      if ('sync' in self.registration) {
        self.registration.sync.register(payload?.tag || 'sync-finance-data')
          .then(() => {
            event.source?.postMessage({ type: 'SYNC_REGISTERED' });
          })
          .catch(err => {
            console.error('Erro ao registrar sync:', err);
          });
      }
      break;
      
    case 'PENDING_INVOICES_DATA':
      if (!NOTIFICATIONS_ENABLED) break;
      // Recebe dados de faturas pendentes do cliente
      if (payload && payload.invoices && payload.invoices.length > 0) {
        payload.invoices.forEach(invoice => {
          sendInvoiceNotification(invoice);
        });
      }
      break;
      
    case 'START_INVOICE_TIMER':
      if (!NOTIFICATIONS_ENABLED) break;
      startInvoiceNotificationTimer();
      break;
      
    case 'STOP_INVOICE_TIMER':
      if (invoiceNotificationTimer) {
        clearInterval(invoiceNotificationTimer);
        invoiceNotificationTimer = null;
        console.log('⏹️ Timer de notificações de fatura parado');
      }
      break;
  }
});

/**
 * Sistema de Monitoramento em Background
 * - Configurável e com múltiplos tipos de verificação
 */
const MONITORING_INTERVAL = 30 * 60 * 1000; // 30 minutos (configurável)
let monitoringTimer = null;
let monitoringEnabled = false;

/**
 * Inicia sistema de monitoramento periódico
 * - Verifica faturas, limites, benefícios e envia notificações
 */
function startMonitoring() {
  if (!NOTIFICATIONS_ENABLED) return;
  if (monitoringTimer) {
    clearInterval(monitoringTimer);
  }
  
  if (!monitoringEnabled) {
    console.log('⏸️ Monitoramento desabilitado pelo usuário');
    return;
  }
  
  // Verifica imediatamente e depois a cada 30 minutos
  performMonitoringChecks();
  monitoringTimer = setInterval(performMonitoringChecks, MONITORING_INTERVAL);
  console.log('⏰ Sistema de monitoramento iniciado (30 min)');
}

/**
 * Para o sistema de monitoramento
 */
function stopMonitoring() {
  if (monitoringTimer) {
    clearInterval(monitoringTimer);
    monitoringTimer = null;
    console.log('⏹️ Sistema de monitoramento parado');
  }
}

/**
 * Realiza todas as verificações de monitoramento
 * Múltiplos tipos de alertas
 */
async function performMonitoringChecks() {
  if (!NOTIFICATIONS_ENABLED) return;
  console.log('🔍 Executando verificações de monitoramento...');
  
  try {
    await checkPendingInvoices(); // Faturas pendentes
    await checkCreditLimits(); // Limites de crédito
    await checkBenefitUsage(); // Uso de benefícios
    await checkLowBalances(); // Saldos baixos
  } catch (error) {
    console.error('❌ Erro nas verificações de monitoramento:', error);
  }
}

/**
 * Verifica limites de crédito próximos do máximo
 * Nova verificação
 */
async function checkCreditLimits() {
  try {
    const clients = await self.clients.matchAll();
    
    clients.forEach(client => {
      client.postMessage({
        type: 'CHECK_CREDIT_LIMITS',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('❌ Erro ao verificar limites:', error);
  }
}

/**
 * Verifica uso de benefícios
 * Nova verificação
 */
async function checkBenefitUsage() {
  try {
    const clients = await self.clients.matchAll();
    
    clients.forEach(client => {
      client.postMessage({
        type: 'CHECK_BENEFIT_USAGE',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('❌ Erro ao verificar benefícios:', error);
  }
}

/**
 * Verifica saldos baixos em contas
 * Nova verificação
 */
async function checkLowBalances() {
  try {
    const clients = await self.clients.matchAll();
    
    clients.forEach(client => {
      client.postMessage({
        type: 'CHECK_LOW_BALANCES',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('❌ Erro ao verificar saldos:', error);
  }
}

/**
 * Verifica faturas pendentes e envia notificação
 * Melhorado com mais detalhes
 */
async function checkPendingInvoices() {
  try {
    const clients = await self.clients.matchAll();
    
    // Solicita dados de faturas aos clientes
    clients.forEach(client => {
      client.postMessage({
        type: 'GET_PENDING_INVOICES',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('❌ Erro ao verificar faturas:', error);
  }
}

/**
 * Envia notificação de fatura pendente
 */
async function sendInvoiceNotification(invoiceData) {
  if (!NOTIFICATIONS_ENABLED) return;
  try {
    const { cardName, amount, dueDay } = invoiceData;
    
    const today = new Date();
    const currentDay = today.getDate();
    let daysUntilDue = dueDay - currentDay;
    
    if (daysUntilDue < 0) {
      daysUntilDue += 30; // Próximo mês
    }
    
    let urgencyText = '';
    let urgencyEmoji = '💳';
    
    if (daysUntilDue <= 0) {
      urgencyText = 'VENCE HOJE!';
      urgencyEmoji = '🚨';
    } else if (daysUntilDue <= 3) {
      urgencyText = `Vence em ${daysUntilDue} dia(s)!`;
      urgencyEmoji = '⚠️';
    } else if (daysUntilDue <= 7) {
      urgencyText = `Vence em ${daysUntilDue} dias`;
      urgencyEmoji = '📅';
    } else {
      urgencyText = `Vence dia ${dueDay}`;
      urgencyEmoji = '💳';
    }
    
    await self.registration.showNotification(`${urgencyEmoji} Fatura Pendente`, {
      body: `${cardName}: R$ ${amount.toFixed(2).replace('.', ',')}\n${urgencyText}`,
      icon: './assets/logo/logo.png',
      badge: './assets/logo/logo.png',
      tag: `invoice-${cardName}`,
      requireInteraction: daysUntilDue <= 3,
      vibrate: [200, 100, 200],
      data: {
        url: './?tab=credito',
        type: 'invoice',
        cardName
      },
      actions: [
        { action: 'pay', title: '💵 Pagar Agora' },
        { action: 'later', title: 'Lembrar Depois' }
      ]
    });
    
    console.log(`📱 Notificação de fatura enviada: ${cardName}`);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de fatura:', error);
  }
}
