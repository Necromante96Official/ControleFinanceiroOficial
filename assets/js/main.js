/**
 * APLICACAO: Controle Financeiro Familiar
 * Arquivo Principal: main.js (Refatorado)
 *

 *
 * Responsabilidade: Orquestrar todos os módulos e inicializar a aplicação
 *

 * - 🛡️ Proteção contra travamento em sessões longas
 * - ⚡ Splash screen otimizada (3s ao invés de 5s)
 * - 🔄 Sugestão inteligente de reload após 6h de inatividade
 *
 * Estrutura Modular:
 * - splashScreen.js: Gerenciamento da splash screen
 * - domElements.js: Referências centralizadas aos elementos DOM
 * - gridRenderer.js: Renderização de cards
 * - statsManager.js: Gerenciamento de estatísticas
 * - filterManager.js: Gerenciamento de filtros do extrato
 * - transactionManager.js: Aplicar/reverter valores de transações
 * - saveHandlers.js: Handlers de salvamento
 * - clearDataManager.js: Modal de limpeza de dados

 */

// Stores
import { CategoryStore } from "./modules/categoryStore.js";
import { BenefitStore } from "./modules/benefitStore.js";
import { CreditStore } from "./modules/creditStore.js";
import { DebitStore } from "./modules/debitStore.js";
import { TransactionStore } from "./modules/transactionStore.js";
import { BaseStore } from "./modules/baseStore.js";

// Forms
import { CategoryForm } from "./modules/categoryForm.js";
import { BenefitForm } from "./modules/benefitForm.js";
import { CreditForm } from "./modules/creditForm.js";
import { DebitForm } from "./modules/debitForm.js";
import { TransactionForm } from "./modules/transactionForm.js";

// Managers
import { TabManager } from "./modules/tabManager.js";
import { StatsManager } from "./modules/statsManager.js";
import { FilterManager } from "./modules/filterManager.js";
import { ExtratoFiltersModal } from "./modules/extratoFiltersModal.js";
import { ExtratoFiltersIndicator } from "./modules/extratoFiltersIndicator.js";
import { TransactionManager } from "./modules/transactionManager.js";
import { GridRenderer } from "./modules/gridRenderer.js";
import { SaveHandlers } from "./modules/saveHandlers.js";
import { DangerZoneManager } from "./modules/dangerZoneManager.js";
import { UpdatesModalManager } from "./modules/changelog/updatesModalManager.js";

// Auditoria (últimas ações)
import { AuditManager } from "./modules/audit/auditManager.js";
import { AuditUiManager } from "./modules/audit/auditUiManager.js";
import { subscribeAuditToStores } from "./modules/audit/subscribeAuditToStores.js";

// Utilities
import { defaultCategories } from "./modules/categoryPalette.js";
import { confirmationModal } from "./modules/confirmationModal.js";
import { ErrorHandler } from "./modules/errorHandler.js";
import { BrowserCompat } from "./modules/browserCompat.js";
import { StorageSync } from "./modules/storageSync.js";
import { AutoReloadManager } from "./modules/autoReloadManager.js";
import { NotificationManager } from "./modules/notificationManager.js";
import { initSplashScreen, forceRemoveSplash, completeSplashScreen } from "./modules/splashScreen.js";
import { initConnectivityMonitor } from "./modules/connectivityMonitor.js";
import { getToastManager } from "./modules/toastManager.js";
import { initPwaUpdateManager } from "./modules/pwaUpdateManager.js";
import { initStorageQuotaMonitor } from "./modules/storageQuotaMonitor.js";
import { flushStoresWithBudget } from "./modules/persistUtils.js";
import { initClickSoundManager } from "./modules/clickSoundManager.js";
import { SoundSettingsManager } from "./modules/soundSettingsManager.js";
import safeStorage from "./modules/safeStorage.js";
import storeObserver, { observeStoreChanges } from "./modules/storeObserver.js";
import { TIMINGS, STORAGE_KEYS } from "./modules/constants.js";
import { runDataHealthRepair } from "./modules/dataHealth/runDataHealthRepair.js";
import {
  getDOMElements,
  validateCriticalElements,
  getCategoryFormElements,
  getBenefitFormElements,
  getCreditFormElements,
  getDebitFormElements,
  getTransactionFormElements,
} from "./modules/domElements.js";

// Constantes
const SCROLL_STORAGE_KEY = "finance-control:scroll-position";

// Flag global para prevenir múltiplas inicializações
let appInitialized = false;

// Referência global aos stores para persistência
let globalStores = null;

/**
 * Aguarda o DOM estar completamente carregado
 * Substitui setTimeout por Promise + requestAnimationFrame
 * @returns {Promise<void>}
 */
function waitForDOMReady() {
  return new Promise(resolve => {
    if (document.readyState === 'complete') {
      // DOM já está completamente carregado
      resolve();
    } else {
      // Aguardar evento de load
      window.addEventListener('load', resolve, { once: true });
    }
  });
}

function notifyBootSuccess(message) {
  if (typeof window !== 'undefined' && typeof window.__notifyBootSuccess === 'function') {
    window.__notifyBootSuccess(message);
  }
}

function notifyBootError(message) {
  if (typeof window !== 'undefined' && typeof window.__notifyBootError === 'function') {
    window.__notifyBootError(message);
  }
}

/**
 * Proteção contra travamento em sessões longas
 * Detecta e recupera de estados inválidos
 */
function _preventLongSessionFreeze() {
  // Verificar se última inicialização foi há muito tempo
  try {
    const lastStartup = localStorage.getItem('finance-control:startup-time');
    if (lastStartup) {
      const timeSinceStartup = Date.now() - parseInt(lastStartup);
      const hoursOpen = timeSinceStartup / (1000 * 60 * 60);

      if (hoursOpen > 4) {
        console.warn(`⚠️ Sistema aberto há ${hoursOpen.toFixed(1)}h - Limpando cache`);
        // Limpar caches que podem causar travamento
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => {
              if (name.includes('old') || name.includes('temp')) {
                caches.delete(name);
              }
            });
          });
        }
      }
    }
  } catch (e) {
    console.error('❌ Erro ao verificar tempo de sessão:', e);
  }
}

/**
 * Proteção contra tela branca: garante que a splash seja removida (FAILSAFE).
 * Importante: este tempo precisa ser maior que o tempo típico de inicialização
 * em aparelhos fracos, senão dá sensação de “travou” (splash sai cedo demais).
 */
function ensureSplashRemoved() {
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash && splash.classList.contains('splash-screen--active')) {
      forceRemoveSplash();
      console.log('⚠️ Splash removida por failsafe (20s)');
    }
  }, 20000);
}

/**
 * Verifica se estamos em um ambiente APK/WebView
 */
function isAPKEnvironment() {
  return BaseStore.isAPKEnvironment();
}

/**
 * Força persistência de todos os stores globais
 */
function forcePersistAllStores() {
  if (!globalStores) return;

  // ==================================================
  // Persistência resiliente (evita travas no refresh)
  // ==================================================
  // Em dispositivos móveis/APK, o beforeunload pode travar se houver muitos lançamentos
  // (JSON.stringify + localStorage). Aqui fazemos flush com orçamento de tempo.
  const result = flushStoresWithBudget([
    globalStores.categoryStore,
    globalStores.benefitStore,
    globalStores.creditStore,
    globalStores.debitStore,
    globalStores.transactionStore,
  ], {
    budgetMs: BaseStore.isAPKEnvironment() ? 120 : 200,
    reason: 'persist-all'
  });

  if (result.stoppedByBudget) {
    console.warn('⚠️ Persistência interrompida por budget (anti-trava)', result);
  }
}

/**
 * Verifica integridade dos stores
 */
function checkStoresIntegrity() {
  if (!globalStores) return;

  const stores = [
    globalStores.categoryStore,
    globalStores.benefitStore,
    globalStores.creditStore,
    globalStores.debitStore,
    globalStores.transactionStore
  ];

  stores.forEach(store => {
    if (!store.isInSync()) {
      console.warn(`⚠️ ${store.storageKey} dessincronizado, reparando...`);
      store.repair();
    }
  });
}

// ============================================
// CARD: SISTEMA ATUALIZADO (ROBUSTO)
// ============================================

/**
 * Obtém um valor do localStorage com fallback seguro.
 * @param {string} key
 * @param {string|null} fallback
 * @returns {string|null}
 */
function _safeGetLocalStorageValue(key, fallback = null) {
  try {
    if (!BaseStore.isStorageAvailable()) return fallback;
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Salva um valor no localStorage com fallback seguro.
 * @param {string} key
 * @param {string} value
 */
function _safeSetLocalStorageValue(key, value) {
  try {
    if (!BaseStore.isStorageAvailable()) return;
    localStorage.setItem(key, value);
  } catch {
    // Ignorar falhas de storage (modo privado, restrições, etc.)
  }
}

/**
 * Detecta se existem dados do usuário no storage.
 * Usado para diferenciar: "primeiro uso" vs "app já usado e apenas atualizou".
 * @returns {boolean}
 */
function _hasExistingUserDataInStorage() {
  try {
    if (!BaseStore.isStorageAvailable()) return false;

    // ------------
    // Critério: considerar dados relevantes (não contar categorias default)
    // ------------
    const keysToCheck = [
      STORAGE_KEYS.BENEFITS,
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.CREDIT_CARDS,
      STORAGE_KEYS.DEBIT_CARDS,
    ];

    return keysToCheck.some((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    });
  } catch {
    return false;
  }
}

/**
 * Inicializa a aplicação quando o DOM está pronto
 */
document.addEventListener("DOMContentLoaded", () => {
  // Prevenir múltiplas inicializações
  if (appInitialized) {
    console.warn('⚠️ Aplicação já inicializada, ignorando');
    return;
  }
  appInitialized = true;
  _preventLongSessionFreeze();
  ensureSplashRemoved();

  // Monitorar conectividade (offline/online) e avisar quando necessário
  initConnectivityMonitor();

  // Som de clique global (ações clicáveis)
  initClickSoundManager();

  // Notificações visuais (toasts) - padronizadas e não intrusivas
  try {
    getToastManager().init();
  } catch {
    // Ignorar
  }

  // Atualizações do PWA mais previsíveis (aviso + botão de recarregar).
  try {
    initPwaUpdateManager();
  } catch {
    // Ignorar
  }

  // Monitor de cota do storage (prevenção de perda de dados) - apenas toast quando crítico.
  try {
    initStorageQuotaMonitor();
  } catch {
    // Ignorar
  }

  try {
    // Log do ambiente e teste do localStorage
    console.log('🔍 Verificando ambiente...');
    console.log(`📱 APK/WebView: ${isAPKEnvironment()}`);
    console.log(`💾 localStorage: ${BaseStore.isStorageAvailable() ? 'OK' : 'FALHA'}`);

    if (!BaseStore.isStorageAvailable()) {
      console.error('❌ localStorage não disponível! Dados serão perdidos ao fechar.');
      try {
        getToastManager().show({
          id: 'storage-unavailable',
          variant: 'error',
          persistent: true,
          message: 'ATENÇÃO: O armazenamento local não está disponível. Seus dados podem não ser salvos.'
        });
      } catch {
        // Ignorar
      }
    }

    // Verificar compatibilidade do navegador
    const isCompatible = BrowserCompat.checkCompatibility();

    if (!isCompatible) {
      console.warn("⚠️ Navegador com compatibilidade limitada");
    }

    // Configurar tratamento de erros global
    new ErrorHandler();

    // Iniciar splash screen
    console.log("⏳ Iniciando splash screen...");
    initSplashScreen();
    waitForDOMReady().then(() => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          try {
            console.log("🔄 Chamando initApp()...");
            initApp();
            console.log("✅ initApp() completado!");
            // Remover splash de forma suave (sem “sumir antes da hora”)
            completeSplashScreen();
            notifyBootSuccess('Aplicação pronta');
          } catch (error) {
            console.error("❌ Erro ao inicializar aplicação:", error);
            console.error("Stack:", error.stack);
            forceRemoveSplash();
            notifyBootError(error.message);
            showErrorMessage("Erro ao carregar aplicação. Tente recarregar: " + error.message);
          }
        });
      }, 100);
    });
  } catch (error) {
    console.error("❌ Erro durante inicialização:", error);
    console.error("Stack:", error.stack);
    forceRemoveSplash();
    notifyBootError(error.message);
    showErrorMessage("Erro ao inicializar. Tente recarregar.");
  }
});

// ============================================
// EVENTOS DE PERSISTÊNCIA
// ============================================

// Salvar dados antes de fechar/recarregar a página
window.addEventListener('beforeunload', () => {
  // Budget menor no beforeunload para evitar travar o pull-to-refresh.
  try {
    if (globalStores) {
      flushStoresWithBudget([
        globalStores.categoryStore,
        globalStores.benefitStore,
        globalStores.creditStore,
        globalStores.debitStore,
        globalStores.transactionStore,
      ], {
        budgetMs: 80,
        reason: 'beforeunload'
      });
    }
  } catch {
    // Ignorar para não bloquear o unload
  }

  // Cleanup do GridRenderer
  if (globalStores && globalStores._gridRenderer) {
    globalStores._gridRenderer.destroy();
  }
});

// Salvar quando a página perde visibilidade
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Persistência mais completa ao sair do app (budget moderado)
    try {
      if (globalStores) {
        flushStoresWithBudget([
          globalStores.categoryStore,
          globalStores.benefitStore,
          globalStores.creditStore,
          globalStores.debitStore,
          globalStores.transactionStore,
        ], {
          budgetMs: 220,
          reason: 'visibility-hidden'
        });
      }
    } catch {
      // Ignorar
    }
  } else if (document.visibilityState === 'visible') {
    try {
      const lastStartup = localStorage.getItem('finance-control:startup-time');
      if (lastStartup) {
        const timeSinceStartup = Date.now() - parseInt(lastStartup);
        const hoursInactive = timeSinceStartup / (1000 * 60 * 60);

        if (hoursInactive > 6) {
          console.warn(`⚠️ Página inativa há ${hoursInactive.toFixed(1)}h - Recomendado recarregar`);
          // Mostrar sugestão de reload
          _showReloadSuggestion();
        }
      }
    } catch (e) {
      console.error('❌ Erro ao verificar inatividade:', e);
    }
  }
});

// Para APK: salvar quando pausar (Capacitor)
document.addEventListener('pause', () => {
  try {
    if (globalStores) {
      flushStoresWithBudget([
        globalStores.categoryStore,
        globalStores.benefitStore,
        globalStores.creditStore,
        globalStores.debitStore,
        globalStores.transactionStore,
      ], {
        budgetMs: 250,
        reason: 'pause'
      });
    }
  } catch {
    // Ignorar
  }
});

// Para APK: salvar quando a página perde foco
window.addEventListener('blur', () => {
  try {
    if (globalStores) {
      flushStoresWithBudget([
        globalStores.categoryStore,
        globalStores.benefitStore,
        globalStores.creditStore,
        globalStores.debitStore,
        globalStores.transactionStore,
      ], {
        budgetMs: 180,
        reason: 'blur'
      });
    }
  } catch {
    // Ignorar
  }
});

// Para APK: salvar periodicamente (a cada 30 segundos)
setInterval(() => {
  if (globalStores && BaseStore.isAPKEnvironment()) {
    try {
      flushStoresWithBudget([
        globalStores.categoryStore,
        globalStores.benefitStore,
        globalStores.creditStore,
        globalStores.debitStore,
        globalStores.transactionStore,
      ], {
        budgetMs: 180,
        reason: 'apk-interval'
      });
    } catch {
      // Ignorar
    }
  }
}, 30000);

/**
 * Mostra sugestão de recarregar após sessão muito longa
 * Prevenir travamentos em sessões longas
 */
function _showReloadSuggestion() {
  const suggestion = document.createElement('div');
  suggestion.className = 'reload-suggestion';
  suggestion.innerHTML = `
    <div class="reload-suggestion-content">
      <span class="reload-suggestion-icon">⏰</span>
      <div class="reload-suggestion-text">
        <strong>Sessão Longa Detectada</strong>
        <p>Para melhor performance, recomendamos recarregar a página.</p>
      </div>
      <button class="reload-suggestion-btn" onclick="location.reload()">
        Recarregar
      </button>
      <button class="reload-suggestion-dismiss" onclick="this.parentElement.parentElement.remove()">
        ✕
      </button>
    </div>
  `;

  // Verificar se já existe
  if (document.querySelector('.reload-suggestion')) return;

  document.body.appendChild(suggestion);

  requestAnimationFrame(() => {
    suggestion.classList.add('show');
  });
}

/**
 * Mostra mensagem de erro amigável ao usuário
 */
function showErrorMessage(message) {
  const container = document.querySelector('.screen__content');
  if (container) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px;">
        <p style="color:#ff6b6b;font-size:1.2rem;margin-bottom:20px;">⚠️ ${message}</p>
        <button onclick="location.reload()" style="padding:12px 24px;background:#1fc2c0;color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;">
          Recarregar
        </button>
      </div>
    `;
  }
}

/**
 * Função principal de inicialização da aplicação
 */
function initApp() {
  console.log("🚀 Iniciando Controle Financeiro Familiar...");

  // ============================================
  // 1. OBTER ELEMENTOS DOM
  // ============================================
  const elements = getDOMElements();
  const validation = validateCriticalElements(elements);

  if (!validation.isValid) {
    validation.errors.forEach(err => console.error(`❌ ${err}`));
    notifyBootError('Elementos críticos não encontrados');
    // Evitar tela travada/splash infinita quando algum elemento crítico falha.
    forceRemoveSplash();
    showErrorMessage('Erro ao carregar interface. Tente recarregar.');
    throw new Error('Elementos críticos não encontrados');
  }

  console.log("✅ Elementos DOM carregados");

  // ============================================
  // 2. INICIALIZAR STORES
  // ============================================
  console.log("📦 Inicializando stores...");

  let stores;
  try {
    stores = {
      categoryStore: new CategoryStore(defaultCategories),
      benefitStore: new BenefitStore(),
      creditStore: new CreditStore(),
      debitStore: new DebitStore(),
      transactionStore: new TransactionStore(),
    };
  } catch (error) {
    console.error("❌ Erro ao inicializar stores:", error);
    forceRemoveSplash();
    showErrorMessage("Erro ao carregar dados. Verifique o armazenamento local.");
    throw error;
  }

  // Atribuir referência global para persistência
  globalStores = stores;

  // Log detalhado dos stores
  console.log('📊 Stores carregadas:');
  console.log(`   - Categorias: ${stores.categoryStore.count()} | Sync: ${stores.categoryStore.isInSync()}`);
  console.log(`   - Benefícios: ${stores.benefitStore.count()} | Sync: ${stores.benefitStore.isInSync()}`);
  console.log(`   - Crédito: ${stores.creditStore.count()} | Sync: ${stores.creditStore.isInSync()}`);
  console.log(`   - Débito: ${stores.debitStore.count()} | Sync: ${stores.debitStore.isInSync()}`);
  console.log(`   - Transações: ${stores.transactionStore.count()} | Sync: ${stores.transactionStore.isInSync()}`);

  // Verificar integridade
  checkStoresIntegrity();

  // ==================================================
  // SAÚDE DOS DADOS (anti-corrupção)
  // - Reparo seguro após carregar dados
  // - Recalcula campos que podem ser derivados do extrato
  // ==================================================
  try {
    const repairReport = runDataHealthRepair(stores);
    if (repairReport?.creditUsed?.changed) {
      console.log(`🛡️ DataHealth: ${repairReport.creditUsed.fixes.length} correção(ões) aplicada(s) no crédito`);
    }
    if (repairReport?.debitBalances?.changed) {
      console.log(`🛡️ DataHealth: ${repairReport.debitBalances.fixes.length} correção(ões) aplicada(s) no débito`);
    }
  } catch (e) {
    console.warn('⚠️ DataHealth: falha ao executar reparos no boot', e);
  }

  const autoReloadManager = new AutoReloadManager(
    stores.benefitStore,
    stores.creditStore,
    TIMINGS.BENEFIT_RELOAD_CHECK
  );
  autoReloadManager.start();

  // ============================================
  // Recarga automática resiliente (focus/retorno)
  // ============================================
  // Em mobile/WebView, timers podem ser throttled em background.
  // Ao voltar para o app, forçamos a checagem para garantir a recarga no dia correto.
  const handleAutoReloadResume = () => {
    try {
      autoReloadManager.check();
    } catch (e) {
      console.warn('⚠️ Erro ao forçar checagem de recarga ao retornar:', e);
    }
  };

  window.addEventListener('focus', handleAutoReloadResume);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleAutoReloadResume();
    }
  });

  console.log("✅ Stores inicializadas");

  // ============================================
  // AUDITORIA: registrar últimas ações
  // ============================================
  const auditManager = new AuditManager();
  subscribeAuditToStores({ auditManager });

  // ============================================
  // 3. INICIALIZAR FORMULÁRIOS
  // ============================================
  const forms = {
    categoryForm: new CategoryForm(getCategoryFormElements()),
    benefitForm: new BenefitForm(getBenefitFormElements()),
    creditForm: new CreditForm(getCreditFormElements()),
    debitForm: new DebitForm(getDebitFormElements()),
    transactionForm: new TransactionForm(getTransactionFormElements(stores)),
  };

  forms.categoryForm.init();
  forms.benefitForm.init();
  forms.creditForm.init();
  forms.debitForm.init();
  forms.transactionForm.init();

  console.log("✅ Formulários inicializados");

  // ============================================
  // 4. INICIALIZAR MANAGERS
  // ============================================

  // Transaction Manager (aplicar/reverter valores)
  const transactionManager = new TransactionManager(stores);

  // Modal flutuante: Filtros do Extrato
  const extratoFiltersModal = new ExtratoFiltersModal({
    openButton: elements.extratoFiltersOpenBtn,
    modal: elements.extratoFiltersModal,
    closeButton: elements.extratoFiltersCloseBtn,
  });
  extratoFiltersModal.init();

  // Indicador: botão "Filtros" fica marcado quando há filtros ativos
  const extratoFiltersIndicator = new ExtratoFiltersIndicator({
    openButton: elements.extratoFiltersOpenBtn,
    elements,
  });
  extratoFiltersIndicator.init();

  // Referência para o gridRenderer (definida após criação)
  let gridRenderer = null;

  // Filter Manager (filtros do extrato)
  const filterManager = new FilterManager({
    elements,
    transactionStore: stores.transactionStore,
    categoryStore: stores.categoryStore,
    creditStore: stores.creditStore,
    debitStore: stores.debitStore,
    benefitStore: stores.benefitStore,
    onFilterChange: () => {
      // Verificação de segurança: só renderiza se gridRenderer existir
      if (gridRenderer) {
        try {
          // Ao mudar filtro, voltar para o início do extrato
          gridRenderer.renderTransactions({ scrollToTop: true, showLoading: true });
        } catch (e) {
          console.warn("⚠️ Erro ao renderizar transações no filtro:", e);
        }
      }
    },
  });
  filterManager.init();

  // Stats Manager (estatísticas)
  const statsManager = new StatsManager({
    stores,
    elements,
    getFilteredTransactions: () => filterManager.getFilteredTransactions(),
  });

  // Grid Renderer (renderização de cards)
  gridRenderer = new GridRenderer({
    stores,
    elements,
    forms,
    confirmationModal,
    transactionManager,
    filterManager,
    statsManager,
    auditManager,
  });

  // Salvar referência global para cleanup
  if (globalStores) {
    globalStores._gridRenderer = gridRenderer;
  }

  // Save Handlers (salvamento)
  const saveHandlers = new SaveHandlers({
    stores,
    forms,
    gridRenderer,
    statsManager,
    transactionManager,
  });
  saveHandlers.registerCallbacks();

  // Danger Zone Manager (zona de perigo reformulada)
  const dangerZoneManager = new DangerZoneManager({
    stores,
    elements,
    confirmationModal,
    gridRenderer,
    statsManager,
    transactionManager,
    auditManager,
  });
  dangerZoneManager.init();

  // Montar UI de auditoria (render dentro da aba Configurações)
  try {
    const auditRoot = document.getElementById('audit-log-root');
    const auditUiManager = new AuditUiManager({ auditManager, root: auditRoot });
    auditUiManager.init();

    // Guardar referência para eventuais limpezas
    if (globalStores) {
      globalStores._auditUiManager = auditUiManager;
      globalStores._auditManager = auditManager;
    }
  } catch (e) {
    console.warn('⚠️ Auditoria: falha ao montar UI', e);
  }

  // Configuração de volume do som de clique (aba Configurações)
  const soundSettingsManager = new SoundSettingsManager();
  soundSettingsManager.init();

  // Histórico de Atualizações (aba Configurações)
  const updatesModalManager = new UpdatesModalManager({
    openButton: elements.updatesOpenBtn,
  });
  updatesModalManager.init();

  console.log("✅ Managers inicializados");


  // ============================================
  // 5. CONFIGURAR OBSERVERS PARA AUTO-UPDATE
  // ============================================

  // Observer para Benefícios
  observeStoreChanges('benefits', () => {
    statsManager.updateBenefitStats();
    gridRenderer.renderBenefitCards();
  }, { debounce: 100 });

  // Observer para Crédito
  observeStoreChanges('credit-cards', () => {
    statsManager.updateCreditStats();
    gridRenderer.renderCreditCards();
  }, { debounce: 100 });

  // Observer para Débito
  observeStoreChanges('debit', () => {
    statsManager.updateDebitStats();
    gridRenderer.renderDebitCards();
  }, { debounce: 100 });

  // Observer para Transações
  observeStoreChanges('transactions', () => {
    statsManager.updateExtratoStats();
    gridRenderer.renderTransactions();
  }, { debounce: 100 });

  // Observer para Categorias
  observeStoreChanges('categories', () => {
    try {
      filterManager.refreshCategoryOptions();
      gridRenderer.renderCategoryCards();

      // Atualizar opções de categoria nos formulários
      forms.transactionForm?.updateCategoryOptions?.();
    } catch (e) {
      console.warn('⚠️ Erro ao atualizar categorias via observer:', e);
    }
  }, { debounce: 100 });

  console.log("✅ Observers configurados:", storeObserver.getStats());

  // ============================================
  // 6. INICIALIZAR GERENCIADOR DE ABAS
  // ============================================
  let currentActiveTab = "extrato";

  const toggleAddButtonVisibility = (tabKey) => {
    const { addBtn } = elements;
    if (!addBtn) return;
    const isConfigTab = tabKey === "configuracoes";
    addBtn.classList.toggle("footer__add-btn--hidden", isConfigTab);
    addBtn.setAttribute("aria-hidden", isConfigTab ? "true" : "false");
  };

  const handleBeforeTabChange = (oldTab, newTab) => {
    // Cleanup ao sair da aba de extrato (que usa VirtualScroll)
    if (oldTab === "extrato" && newTab !== "extrato") {
      if (gridRenderer && gridRenderer.virtualScroll) {
        console.log('🧹 Limpando VirtualScroll ao sair da aba extrato');
        gridRenderer.resetVirtualScroll();
      }
    }
  };

  const handleTabChange = (tabKey) => {
    currentActiveTab = tabKey;
    toggleAddButtonVisibility(tabKey);

    // Re-renderizar extrato ao entrar na aba (recria VirtualScroll se necessário)
    if (tabKey === "extrato" && gridRenderer) {
      requestAnimationFrame(() => {
        gridRenderer.renderTransactions({ showLoading: true });
      });
    }
  };

  const tabManager = new TabManager({
    buttonSelector: ".footer__link",
    panelSelector: ".tab-panel",
    activeButtonClass: "footer__link--active",
    activePanelClass: "tab-panel--active",
    onBeforeTabChange: handleBeforeTabChange,
    onTabChange: handleTabChange,
  });

  // Ler tab inicial de query params (para shortcuts do manifest funcionarem)
  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = urlParams.get('tab');
  const validTabs = ['extrato', 'debito', 'credito', 'beneficios', 'categorias', 'configuracoes'];
  const initialTab = validTabs.includes(tabFromUrl) ? tabFromUrl : 'extrato';

  tabManager.init(initialTab);

  // Limpa query param da URL após usar (opcional, melhora UX)
  if (tabFromUrl && window.history.replaceState) {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  console.log("✅ Gerenciador de abas inicializado");

  // ============================================
  // 6. SINCRONIZAÇÃO ENTRE ABAS
  // ============================================
  const storageSync = new StorageSync(stores);

  storageSync.on("finance-control:categories", () => {
    console.log("🔄 Recarregando categorias de outra aba");
    const stored = localStorage.getItem("finance-control:categories");
    if (stored) stores.categoryStore.categories = JSON.parse(stored);
    gridRenderer.renderCategoryCards();
  });

  storageSync.on("finance-control:benefits", () => {
    console.log("🔄 Recarregando benefícios de outra aba");
    const stored = localStorage.getItem("finance-control:benefits");
    if (stored) stores.benefitStore.setAll(JSON.parse(stored));
    gridRenderer.renderBenefitCards();
    statsManager.updateBenefitStats();
  });

  storageSync.on("finance-control:credit-cards", () => {
    console.log("🔄 Recarregando cartões de crédito de outra aba");
    const stored = localStorage.getItem("finance-control:credit-cards");
    if (stored) stores.creditStore.cards = JSON.parse(stored);
    gridRenderer.renderCreditCards();
    statsManager.updateCreditStats();
  });

  // Sincronização entre abas: manter chave alinhada ao padrão do store (DEBIT_CARDS)
  storageSync.on("finance-control:debit-cards", () => {
    console.log("🔄 Recarregando cartões de débito de outra aba");
    const stored = localStorage.getItem("finance-control:debit-cards");
    if (stored) stores.debitStore.cards = JSON.parse(stored);
    gridRenderer.renderDebitCards();
    statsManager.updateDebitStats();
  });

  storageSync.on("finance-control:transactions", () => {
    console.log("🔄 Recarregando transações de outra aba");
    stores.transactionStore.transactions = [];
    stores.transactionStore.load();
    gridRenderer.renderTransactions();
    statsManager.updateExtratoStats();
  });

  // ============================================
  // 7. BOTÃO ADICIONAR (+)
  // ============================================
  const { addBtn } = elements;
  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();

      switch (currentActiveTab) {
        case "categorias":
          console.log("📝 Abrindo formulário de nova categoria");
          forms.categoryForm.open();
          break;
        case "beneficios":
          console.log("📝 Abrindo formulário de novo benefício");
          forms.benefitForm.open();
          break;
        case "credito":
          console.log("📝 Abrindo formulário de novo cartão de crédito");
          forms.creditForm.open();
          break;
        case "debito":
          console.log("📝 Abrindo formulário de nova conta de débito");
          forms.debitForm.open();
          break;
        case "extrato":
          console.log("📝 Abrindo formulário de novo lançamento");
          forms.transactionForm.open();
          break;
      }
    });
  }

  // ============================================
  // 8. SCROLL POSITION PERSISTENCE
  // ============================================
  let scrollFrame = null;

  const persistScrollPosition = () => {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      safeStorage.setItem(SCROLL_STORAGE_KEY, window.scrollY.toString());
    });
  };

  const restoreScrollPosition = () => {
    const stored = safeStorage.getItem(SCROLL_STORAGE_KEY);
    if (stored !== null) {
      const position = Number(stored);
      if (!Number.isNaN(position)) {
        setTimeout(() => {
          window.scrollTo({ top: position, behavior: "auto" });
        }, 240);
      }
    }
  };

  window.addEventListener("scroll", persistScrollPosition, { passive: true });

  // Limpa animationFrame pendente ao sair da página (previne memory leak)
  window.addEventListener("beforeunload", () => {
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
    }
  });

  // ============================================
  // 9. DIAGNÓSTICO E DEBUG
  // ============================================
  window.diagnoseApp = () => {
    const categories = stores.categoryStore.getAll();
    const benefits = stores.benefitStore.getAll();
    const credits = stores.creditStore.getAll();
    const debits = stores.debitStore.getAll();
    const transactions = stores.transactionStore.getAll();

    console.log("🔍 DIAGNÓSTICO DA APLICAÇÃO");
    console.log("📂 Categorias:", categories.length);
    console.log("💰 Benefícios:", benefits.length);
    console.log("💳 Cartões de Crédito:", credits.length);
    console.log("💵 Contas de Débito:", debits.length);
    console.log("📋 Transações:", transactions.length);
    console.log("💾 SafeStorage Health:", safeStorage.healthCheck());
    console.log("📱 Ambiente APK:", isAPKEnvironment());

    // Debug info de cada store
    console.log("🔧 Debug stores:", {
      categories: stores.categoryStore.getDebugInfo(),
      benefits: stores.benefitStore.getDebugInfo(),
      credits: stores.creditStore.getDebugInfo(),
      debits: stores.debitStore.getDebugInfo(),
      transactions: stores.transactionStore.getDebugInfo()
    });

    return { categories, benefits, credits, debits, transactions };
  };

  // Função para testar salvamento
  window.testStorage = () => {
    console.log("🧪 TESTE DE ARMAZENAMENTO");

    // 1. Testar localStorage diretamente
    const testKey = '__test_' + Date.now();
    const testValue = 'valor_' + Math.random();

    try {
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      if (retrieved === testValue) {
        console.log("✅ localStorage: FUNCIONANDO");
      } else {
        console.error("❌ localStorage: FALHOU (valor diferente)");
        return false;
      }
    } catch (e) {
      console.error("❌ localStorage: ERRO", e);
      return false;
    }

    // 2. Listar todas as chaves do app
    console.log("📦 Chaves no SafeStorage:");
    const appKeys = safeStorage.keys('finance-control:');
    appKeys.forEach(key => {
      const value = safeStorage.getItem(key);
      console.log(`   ${key}: ${value ? value.length : 0} bytes`);
    });

    // 3. Verificar sincronização dos stores
    console.log("🔄 Sincronização:");
    console.log(`   - Categorias: ${stores.categoryStore.isInSync() ? '✅' : '❌'}`);
    console.log(`   - Benefícios: ${stores.benefitStore.isInSync() ? '✅' : '❌'}`);
    console.log(`   - Crédito: ${stores.creditStore.isInSync() ? '✅' : '❌'}`);
    console.log(`   - Débito: ${stores.debitStore.isInSync() ? '✅' : '❌'}`);
    console.log(`   - Transações: ${stores.transactionStore.isInSync() ? '✅' : '❌'}`);

    return true;
  };

  // Função para forçar salvamento de todos os stores
  window.forceSave = () => {
    console.log("💾 FORÇANDO SALVAMENTO...");
    forcePersistAllStores();
    console.log("✅ Salvamento forçado concluído");
    window.testStorage();
  };
  window.testNotifications = () => {
    // Notificações desativadas no momento (solicitado).
    console.log("🔕 Notificações desativadas no momento");
    return false;
  };

  // ============================================
  // 10. SERVICE WORKER COMMUNICATION
  // ============================================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, version } = event.data || {};

      switch (type) {
        case 'GET_PENDING_INVOICES':
          // Service Worker solicitou dados de faturas pendentes
          const creditCards = stores.creditStore.getAll();
          const pendingInvoices = creditCards
            .filter(card => card.used > 0)
            .map(card => ({
              cardName: card.name,
              amount: card.used,
              dueDay: card.dueDay
            }));

          if (pendingInvoices.length > 0 && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'PENDING_INVOICES_DATA',
              payload: { invoices: pendingInvoices }
            });
          }
          break;
      }
    });

    // Notificações do Service Worker desativadas no momento (solicitado).
  }

  // ============================================
  // 11. VERIFICAR NOTIFICAÇÕES DE VENCIMENTO (DESATIVADO)
  // ============================================
  // Notificações desativadas no momento (solicitado).

  // ============================================
  // 12. RENDERIZAR INICIAL
  // ============================================
  gridRenderer.renderAll();
  restoreScrollPosition();

  // ============================================
  // 13. FINALIZAÇÃO
  // ============================================
  console.log("✅ Aplicação iniciada com sucesso!");
  console.log("📊 Sistema pronto para uso");
}
