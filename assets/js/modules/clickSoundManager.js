/**
 * Click Sound Manager
 * Responsabilidade: tocar som de clique em ações do usuário (sem UI extra).
 *
 * Observações importantes (mobile/PWA):
 * - O navegador pode bloquear áudio sem gesto do usuário.
 * - Por isso o som é disparado apenas dentro de eventos de interação (click/keydown).
 */

import { getItem, setItem } from "./safeStorage.js";

// ==============================
// CONFIG
// ==============================

const CLICK_SOUND_SRC = "assets/sounds/mouse-click.mp3";
const STORAGE_KEY_VOLUME = "finance-control:click-sound-volume";
const DEFAULT_VOLUME = 0.25;
const DEFAULT_POOL_SIZE = 4;

// ==============================
// AUDIO: WEB AUDIO (BAIXA LATÊNCIA)
// ==============================

/** @type {Promise<ArrayBuffer>|null} */
let clickSoundDataPromise = null;

/** @type {AudioContext|null} */
let audioCtxRef = null;

/** @type {GainNode|null} */
let gainNodeRef = null;

/** @type {AudioBuffer|null} */
let decodedBufferRef = null;

/** @type {Promise<AudioBuffer|null>|null} */
let decodePromiseRef = null;

/** @type {boolean} */
let webAudioDisabled = false;

// ==============================
// HELPERS: VOLUME
// ==============================

/**
 * Garante volume válido entre 0 e 1.
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Lê o volume do storage com tolerância a valores inválidos.
 * @returns {number|null}
 */
function readStoredVolume() {
  try {
    const raw = getItem(STORAGE_KEY_VOLUME);
    if (raw === null || raw === undefined) return null;
    const parsed = Number.parseFloat(String(raw));
    if (!Number.isFinite(parsed)) return null;
    return clamp01(parsed);
  } catch {
    return null;
  }
}

// ==============================
// HELPERS: DETECÇÃO DE AÇÃO
// ==============================

/**
 * Verifica se o elemento está desabilitado (HTML ou ARIA).
 * @param {Element} el
 * @returns {boolean}
 */
function isDisabled(el) {
  // ------------
  // HTML: disabled
  // ------------
  if ("disabled" in el && el.disabled) return true;

  // ------------
  // ARIA: aria-disabled
  // ------------
  const ariaDisabled = el.getAttribute?.("aria-disabled");
  return ariaDisabled === "true";
}

/**
 * Define se um input deve gerar som (apenas tipos com ação clara).
 * @param {HTMLInputElement} input
 * @returns {boolean}
 */
function isActionableInput(input) {
  const type = (input.getAttribute("type") || "text").toLowerCase();
  const allowed = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "file"]);
  return allowed.has(type);
}

/**
 * Tenta encontrar um elemento realmente clicável/acionável a partir do alvo.
 * @param {Element} target
 * @returns {Element|null}
 */
function findActionableElement(target) {
  // ------------
  // Seletores mais comuns de ação
  // ------------
  const candidate = target.closest(
    [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role=button]",
      "[role=menuitem]",
      "[data-action]",
      "[onclick]",
      "[tabindex]",
    ].join(",")
  );

  if (!candidate) return null;
  if (isDisabled(candidate)) return null;

  // ------------
  // Regras específicas por tipo
  // ------------
  const tag = candidate.tagName.toLowerCase();

  if (tag === "a") {
    const href = candidate.getAttribute("href");
    if (!href || href.trim() === "#") return null;
    return candidate;
  }

  if (tag === "input") {
    return isActionableInput(/** @type {HTMLInputElement} */ (candidate)) ? candidate : null;
  }

  // select/textarea (abrir teclado/seleção é uma ação)
  if (tag === "select" || tag === "textarea" || tag === "button") return candidate;

  // Elementos genéricos com intenção de clique
  if (candidate.hasAttribute("data-action") || candidate.hasAttribute("onclick")) return candidate;

  // tabindex/role: considerar clicável (botões custom)
  const tabindex = candidate.getAttribute("tabindex");
  const role = candidate.getAttribute("role");
  if (tabindex && tabindex !== "-1") return candidate;
  if (role === "button" || role === "menuitem") return candidate;

  return null;
}

// ==============================
// AUDIO: POOL DE PLAYERS
// ==============================

/**
 * Cria um pool de instâncias Audio para reduzir latência e permitir cliques rápidos.
 * @param {{ src: string, volume: number, poolSize: number }} options
 * @returns {{ play: () => void }}
 */
function createAudioPool({ src, volume, poolSize }) {
  // ------------
  // Pré-criar instâncias evita overhead em cada clique.
  // ------------
  let currentVolume = clamp01(volume);

  const pool = Array.from({ length: poolSize }, () => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = currentVolume;
    audio.load();
    return audio;
  });

  let index = 0;

  /**
   * Toca o som com tolerância a bloqueios do navegador.
   */
  function play() {
    // ------------
    // Volume 0 = mudo (não tenta tocar)
    // ------------
    if (currentVolume <= 0) return;

    const audio = pool[index];
    index = (index + 1) % pool.length;

    try {
      // ------------
      // Reinicia rápido para simular “click”
      // ------------
      if (!Number.isNaN(audio.currentTime)) {
        audio.currentTime = 0;
      }

      const maybePromise = audio.play();

      // ------------
      // Em browsers modernos play() retorna Promise
      // ------------
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {
          // Bloqueado por política de autoplay / erro de mídia
          // Ignorar silenciosamente para não poluir UI.
        });
      }
    } catch {
      // Ignorar para não quebrar interações do usuário.
    }
  }

  /**
   * Atualiza o volume do pool inteiro.
   * @param {number} nextVolume
   */
  function setVolume(nextVolume) {
    currentVolume = clamp01(nextVolume);
    pool.forEach((audio) => {
      audio.volume = currentVolume;
    });
  }

  /**
   * Retorna o volume atual.
   * @returns {number}
   */
  function getVolume() {
    return currentVolume;
  }

  return { play, setVolume, getVolume };
}

// ==============================
// AUDIO: WEB AUDIO HELPERS
// ==============================

/**
 * Pré-carrega o arquivo do clique como ArrayBuffer (sem tocar áudio).
 * Isso reduz delay no primeiro uso do Web Audio.
 */
function primeClickSoundData() {
  if (webAudioDisabled) return;
  if (clickSoundDataPromise) return;

  try {
    clickSoundDataPromise = fetch(CLICK_SOUND_SRC)
      .then((r) => (r && r.ok ? r.arrayBuffer() : Promise.resolve(null)))
      .then((buf) => (buf instanceof ArrayBuffer ? buf : null))
      .catch(() => null);
  } catch {
    clickSoundDataPromise = Promise.resolve(null);
  }
}

/**
 * Garante AudioContext + GainNode (somente após gesto do usuário).
 * @returns {AudioContext|null}
 */
function ensureAudioContext() {
  if (webAudioDisabled) return null;
  if (audioCtxRef && gainNodeRef) return audioCtxRef;

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      webAudioDisabled = true;
      return null;
    }

    // ------------
    // latencyHint "interactive" tende a ser melhor para cliques rápidos
    // ------------
    audioCtxRef = new Ctx({ latencyHint: 'interactive' });
    gainNodeRef = audioCtxRef.createGain();
    gainNodeRef.gain.value = clamp01(currentVolumeRef);
    gainNodeRef.connect(audioCtxRef.destination);

    return audioCtxRef;
  } catch {
    webAudioDisabled = true;
    return null;
  }
}

/**
 * Decodifica o áudio para AudioBuffer (uma vez).
 * @returns {Promise<AudioBuffer|null>}
 */
async function ensureDecodedBuffer() {
  if (webAudioDisabled) return null;
  if (decodedBufferRef) return decodedBufferRef;

  const ctx = ensureAudioContext();
  if (!ctx) return null;

  if (decodePromiseRef) return decodePromiseRef;

  decodePromiseRef = (async () => {
    try {
      primeClickSoundData();
      const data = await (clickSoundDataPromise || Promise.resolve(null));
      if (!data) return null;

      // decodeAudioData pode falhar dependendo do formato/política
      const buffer = await ctx.decodeAudioData(data.slice(0));
      decodedBufferRef = buffer;
      return buffer;
    } catch {
      return null;
    }
  })();

  return decodePromiseRef;
}

/**
 * Tenta tocar via Web Audio (baixo delay). Retorna true se tocou.
 * @returns {Promise<boolean>}
 */
async function tryPlayWithWebAudio() {
  if (currentVolumeRef <= 0) return false;

  const ctx = ensureAudioContext();
  if (!ctx || !gainNodeRef) return false;

  try {
    if (ctx.state === 'suspended') {
      // Resume pode precisar do gesto do usuário (estamos dentro do evento)
      await ctx.resume();
    }

    const buffer = await ensureDecodedBuffer();
    if (!buffer) return false;

    // ------------
    // BufferSource é "one-shot"; cria novo a cada clique.
    // ------------
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tenta tocar via Web Audio de forma imediata (sem await).
 * Objetivo: nunca atrasar o clique. Se não estiver pronto, retorna false.
 * @returns {boolean}
 */
function tryPlayWithWebAudioSyncIfReady() {
  if (webAudioDisabled) return false;
  if (currentVolumeRef <= 0) return false;
  if (!audioCtxRef || !gainNodeRef) return false;
  if (!decodedBufferRef) return false;

  // Se estiver suspenso, precisaríamos de await resume(); não usar aqui.
  if (audioCtxRef.state !== 'running') return false;

  try {
    const source = audioCtxRef.createBufferSource();
    source.buffer = decodedBufferRef;
    source.connect(gainNodeRef);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

// ==============================
// API PÚBLICA
// ==============================

let clickSoundManagerStarted = false;
let audioPoolRef = null;
let currentVolumeRef = DEFAULT_VOLUME;

/**
 * Retorna o volume atual do som de clique (0..1).
 * @returns {number}
 */
export function getClickSoundVolume() {
  return currentVolumeRef;
}

/**
 * Define o volume do som de clique (0..1) e persiste em storage.
 * @param {number} volume
 */
export function setClickSoundVolume(volume) {
  const next = clamp01(volume);
  currentVolumeRef = next;

  try {
    setItem(STORAGE_KEY_VOLUME, String(next));
  } catch {
    // Ignorar falhas de storage
  }

  if (audioPoolRef && typeof audioPoolRef.setVolume === "function") {
    audioPoolRef.setVolume(next);
  }

  // ------------
  // Web Audio: ganho central
  // ------------
  if (gainNodeRef) {
    try {
      gainNodeRef.gain.value = next;
    } catch {
      // Ignorar
    }
  }
}

/**
 * Dispara o som de clique manualmente.
 * Útil quando a ação não é um botão/link tradicional.
 */
export function playClickSound() {
  // ------------
  // Requisito: não pode acontecer de "clicar" e o som atrasar.
  // Estratégia:
  // - Se Web Audio já estiver pronto, toca na hora.
  // - Se não estiver pronto, toca pelo pool (imediato) e aquece o Web Audio em paralelo.
  // ------------
  const played = tryPlayWithWebAudioSyncIfReady();
  if (played) return;

  if (audioPoolRef && typeof audioPoolRef.play === 'function') {
    audioPoolRef.play();
  }

  // Aquecer Web Audio para os próximos cliques
  tryPlayWithWebAudio().catch(() => undefined);
}

/**
 * Inicializa o som de clique global.
 * Deve ser chamado uma única vez.
 */
export function initClickSoundManager() {
  if (clickSoundManagerStarted) return;
  clickSoundManagerStarted = true;

  // ------------
  // Pré-carregar o arquivo (sem tocar) ajuda a reduzir delay
  // ------------
  primeClickSoundData();

  // ------------
  // Volume: carrega do storage (se existir)
  // ------------
  const stored = readStoredVolume();
  currentVolumeRef = stored === null ? DEFAULT_VOLUME : stored;

  // ------------
  // Pool de áudio (baixo custo e simples)
  // ------------
  const audioPool = createAudioPool({
    src: CLICK_SOUND_SRC,
    volume: currentVolumeRef,
    poolSize: DEFAULT_POOL_SIZE,
  });

  audioPoolRef = audioPool;

  // ------------
  // Click: cobre 99% das ações (botões, links, overlays, etc.)
  // ------------
  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      if (event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionable = findActionableElement(target);
      if (!actionable) return;

      // Toca som de forma imediata (nunca atrasar)
      const played = tryPlayWithWebAudioSyncIfReady();
      if (!played) {
        audioPool.play();
      }
    },
    true
  );

  // ------------
  // Teclado: Enter/Espaço em elementos acionáveis
  // ------------
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted) return;
      if (event.key !== "Enter" && event.key !== " ") return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionable = findActionableElement(target);
      if (!actionable) return;

      // Toca som de forma imediata (nunca atrasar)
      const played = tryPlayWithWebAudioSyncIfReady();
      if (!played) {
        audioPool.play();
      }
    },
    true
  );
}

