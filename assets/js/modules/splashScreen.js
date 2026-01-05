/**
 * Módulo: Splash Screen
 * Responsabilidade: Controlar exibição/remoção da splash de forma resiliente,
 * evitando splash infinita, múltiplos timers e “sumiço” antes do app estar pronto.
 */

// =============================
// Configurações (anti-trava)
// =============================
// Tempo máximo absoluto: garante que a splash nunca fique presa.
const SPLASH_MAX_VISIBLE_MS = 20000;

// Tempo mínimo: evita flash em aparelhos rápidos.
const SPLASH_MIN_VISIBLE_MS = 500;

// Intervalo do progresso: 1% a cada 20ms (~2s até 100%).
const PROGRESS_INTERVAL_MS = 20;

// Delay curto antes de esconder (suaviza a transição final).
const HIDE_DELAY_MS = 250;

// =============================
// Estado interno (um único ciclo)
// =============================
const splashRuntime = {
  active: false,
  hidden: false,
  startTime: 0,
  progress: 0,
  bootCompleted: false,
  progressIntervalId: null,
  maxVisibleTimeoutId: null,
  hideTimeoutId: null,
  elements: {
    splash: null,
    progressBar: null,
    progressText: null,
    statusText: null,
  },
};

/**
 * Atualiza a mensagem da splash de forma fluida (sem emojis).
 * @param {number} progress
 */
function setSplashStatusByProgress(progress) {
  const statusEl = splashRuntime.elements.statusText;
  if (!statusEl) return;

  // ------------
  // Mensagens curtas e fáceis de entender
  // ------------
  let message = "Carregando";

  if (progress < 15) message = "Preparando";
  else if (progress < 35) message = "Carregando";
  else if (progress < 60) message = "Organizando";
  else if (progress < 85) message = "Ajustando detalhes";
  else message = "Quase pronto";

  // Evitar re-render desnecessário
  if (statusEl.textContent !== message) {
    statusEl.textContent = message;
  }
}

/**
 * Inicializa splash screen com animação de progresso otimizada
 * Garante splash sempre visível ao recarregar
 */
export function initSplashScreen() {
  // Evitar múltiplas inicializações (ex.: eventos duplicados)
  if (splashRuntime.active) {
    return;
  }

  const splashScreen = document.getElementById("splash-screen");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");

  if (!splashScreen) {
    console.warn("⚠️ Splash screen não encontrada");
    return;
  }

  // ------------
  // Preparar estado
  // ------------
  splashRuntime.active = true;
  splashRuntime.hidden = false;
  splashRuntime.startTime = Date.now();
  splashRuntime.progress = 0;
  splashRuntime.bootCompleted = false;
  splashRuntime.elements.splash = splashScreen;
  splashRuntime.elements.progressBar = progressBar;
  splashRuntime.elements.progressText = progressText;
  splashRuntime.elements.statusText = document.querySelector(".splash-text");

  // ------------
  // Garantir visibilidade imediata
  // ------------
  splashScreen.classList.add("splash-screen--active");
  splashScreen.style.display = "flex";
  splashScreen.style.opacity = "1";
  splashScreen.style.visibility = "visible";
  splashScreen.style.zIndex = "99999";

  // Salvar horário de startup (usado por proteções no main)
  try {
    localStorage.setItem("finance-control:startup-time", splashRuntime.startTime.toString());
  } catch {
    // Ignorar para não travar a inicialização
  }

  // ------------
  // Progresso “bonito” e previsível
  // 1% a cada 100ms até 100%
  // ------------
  splashRuntime.progressIntervalId = setInterval(() => {
    if (!splashRuntime.active || splashRuntime.hidden) return;

    splashRuntime.progress = Math.min(100, splashRuntime.progress + 1);

    if (progressBar) progressBar.style.transform = `scaleX(${splashRuntime.progress / 100})`;
    if (progressText) progressText.textContent = `${splashRuntime.progress}%`;

    setSplashStatusByProgress(splashRuntime.progress);

    // Chegou em 100%
    if (splashRuntime.progress >= 100) {
      cleanupTimers();

      // Se o app já terminou de iniciar, esconder já.
      if (splashRuntime.bootCompleted) {
        splashRuntime.hideTimeoutId = setTimeout(() => {
          hideSplash(splashScreen);
        }, HIDE_DELAY_MS);
      } else {
        const statusEl = splashRuntime.elements.statusText;
        if (statusEl) statusEl.textContent = "Finalizando";
      }
    }
  }, PROGRESS_INTERVAL_MS);

  // ------------
  // FAILSAFE absoluto: nunca deixar splash “presa”
  // ------------
  splashRuntime.maxVisibleTimeoutId = setTimeout(() => {
    if (!splashRuntime.active) return;
    console.warn("⚠️ Splash removida por failsafe (tempo máximo)" );
    forceRemoveSplash();
  }, SPLASH_MAX_VISIBLE_MS);
}

/**
 * Finaliza a splash de forma suave.
 * Deve ser chamado quando o app terminar a inicialização com sucesso.
 */
export function completeSplashScreen() {
  if (!splashRuntime.active) return;

  splashRuntime.bootCompleted = true;

  const { splash, progressBar, progressText } = splashRuntime.elements;
  if (!splash) {
    splashRuntime.active = false;
    return;
  }

  // ------------
  // Respeitar tempo mínimo (evita “piscar”)
  // ------------
  const elapsed = Date.now() - splashRuntime.startTime;
  const waitMs = Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsed);

  setTimeout(() => {
    // Se ainda não chegou em 100%, deixar o progresso seguir até 100%.
    // Quando chegar, ele mesmo fecha (porque bootCompleted = true).
    if (splashRuntime.progress < 100) {
      return;
    }

    // Já está em 100%: garantir consistência visual e fechar.
    if (progressBar) progressBar.style.transform = "scaleX(1)";
    if (progressText) progressText.textContent = "100%";

    splashRuntime.hideTimeoutId = setTimeout(() => {
      hideSplash(splash);
    }, HIDE_DELAY_MS);
  }, waitMs);
}

/**
 * Esconde a splash screen com transição suave
 * @param {HTMLElement} splashScreen - Elemento da splash
 */
function hideSplash(splashScreen) {
  if (!splashScreen) return;
  if (splashRuntime.hidden) return;

  // ------------
  // Limpar timers para evitar trabalho em background
  // ------------
  cleanupTimers();
  splashRuntime.hidden = true;

  splashScreen.style.transition = "opacity 0.5s ease-out";
  splashScreen.style.opacity = "0";

  setTimeout(() => {
    splashScreen.classList.remove("splash-screen--active");
    splashScreen.style.display = "none";

    // Reset mínimo (para próxima abertura/reload)
    splashScreen.style.opacity = "1";
    splashScreen.style.visibility = "visible";

    splashRuntime.active = false;
  }, 500);
}

/**
 * Remove splash screen forçadamente (para uso em caso de erro)
 */
export function forceRemoveSplash() {
  const splash = document.getElementById("splash-screen");

  // Limpar timers sempre (mesmo se o DOM não tiver a splash)
  cleanupTimers();

  splashRuntime.active = false;
  splashRuntime.hidden = true;

  if (!splash) return;

  splash.classList.remove("splash-screen--active");
  splash.style.display = "none";
  splash.style.opacity = "1";
  splash.style.visibility = "visible";
}

/**
 * Limpa todos os timers internos da splash.
 * Evita acúmulo de intervalos/timeouts em casos de erro/dupla inicialização.
 */
function cleanupTimers() {
  if (splashRuntime.progressIntervalId) {
    clearInterval(splashRuntime.progressIntervalId);
    splashRuntime.progressIntervalId = null;
  }
  if (splashRuntime.maxVisibleTimeoutId) {
    clearTimeout(splashRuntime.maxVisibleTimeoutId);
    splashRuntime.maxVisibleTimeoutId = null;
  }
  if (splashRuntime.hideTimeoutId) {
    clearTimeout(splashRuntime.hideTimeoutId);
    splashRuntime.hideTimeoutId = null;
  }
}
