/**
 * Toast Manager - Notificações visuais do sistema (não intrusivas)
 * Responsabilidade: Exibir toasts padronizados com a cara do app, com dedupe e acessibilidade.
 *
 * Regras:
 * - Não rouba foco.
 * - Dedupe por id (evita spam e bugs visuais).
 * - Acessível: role status/alert + aria-atomic.
 */

import { TIMINGS } from './constants.js';

// ============================================
// Flag global (temporário)
// ============================================

/**
 * Notificações visuais (toasts) ativadas.
 * Escopo: apenas toast superior (sem Notifications API / banners).
 */
const TOASTS_ENABLED = true;

/** Implementação no-op para manter compatibilidade sem renderizar UI. */
const NOOP_TOAST_MANAGER = {
  init() {},
  destroy() {},
  show() {},
  hide() {}
};

const EVENTS = {
  TOAST: 'app-toast'
};

const SELECTORS = {
  CONTAINER: '.toast-container'
};

const DEFAULTS = {
  DURATION_MS: Number(TIMINGS?.TOAST_DURATION) > 0 ? Number(TIMINGS.TOAST_DURATION) : 3000
};

export class ToastManager {
  constructor() {
    this._container = null;
    this._timers = new Map();
    this._boundOnEvent = null;

    // Bloqueio de clique fora do toast de atualização (modo central)
    this._boundBlockOutsideUpdateClick = null;

    // Guardar handlers por elemento para permitir rebind seguro quando o toast é atualizado por id.
    this._closeHandlers = new WeakMap();
    this._actionHandlers = new WeakMap();
  }

  // ============================================
  // Bootstrap
  // ============================================

  /**
   * Inicializa o container e o listener global de eventos.
   */
  init() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    this._ensureContainer();

    if (!this._boundOnEvent) {
      this._boundOnEvent = (event) => {
        const detail = event?.detail || {};
        this.show(detail);
      };

      window.addEventListener(EVENTS.TOAST, this._boundOnEvent);
    }
  }

  /**
   * Remove listeners e limpa timers.
   */
  destroy() {
    if (typeof window !== 'undefined' && this._boundOnEvent) {
      window.removeEventListener(EVENTS.TOAST, this._boundOnEvent);
    }

    this._boundOnEvent = null;

    for (const timer of this._timers.values()) {
      clearTimeout(timer);
    }
    this._timers.clear();

    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }

    this._container = null;
  }

  // ============================================
  // API
  // ============================================

  /**
   * Exibe um toast.
   * @param {Object} params
    * @param {string} [params.icon] - Ícone curto (opcional). Se omitido, é definido automaticamente pela variante.
   * @param {string} [params.title] - Título curto (opcional)
   * @param {string} params.message - Texto principal
   * @param {string|string[]} [params.meta] - Metadados em formato de "badges" (ex.: versão/build)
   * @param {'info'|'success'|'warning'|'error'} [params.variant]
   * @param {string} [params.tone] - Tom extra (ex.: "update") para estilos específicos
   * @param {number} [params.durationMs]
   * @param {boolean} [params.persistent]
   * @param {string} [params.id] - Dedupe por id (se repetir, atualiza o existente)
   * @param {boolean} [params.showIcon] - Se false, remove/oculta o ícone do toast
  * @param {boolean} [params.showClose] - Se false, remove/oculta o botão OK/Fechar
   * @param {string} [params.actionLabel]
   * @param {Function} [params.onAction]
   */
  show({
    icon = null,
    title = null,
    message,
    meta = null,
    variant = 'info',
    tone = null,
    durationMs = DEFAULTS.DURATION_MS,
    persistent = false,
    id = null,
    showIcon = true,
    showClose = true,
    actionLabel = null,
    onAction = null
  } = {}) {
    if (typeof document === 'undefined') return;

    const safeMessage = String(message || '').trim();
    if (!safeMessage) return;

    const safeTitle = String(title || '').trim();
    const safeTone = String(tone || '').trim();
    const safeMeta = this._normalizeMeta(meta);
    const safeIcon = String(icon || '').trim();
    const safeShowIcon = showIcon !== false;
    const safeShowClose = showClose !== false;

    this._ensureContainer();

    // ------------
    // Dedupe: se já existe, só atualiza conteúdo e timer
    // ------------
    const existing = id ? this._container.querySelector(`[data-toast-id="${CSS.escape(String(id))}"]`) : null;
    const toast = existing || this._createToastElement({ icon: safeIcon, title: safeTitle, message: safeMessage, meta: safeMeta, variant, tone: safeTone, id, actionLabel, showIcon: safeShowIcon, showClose: safeShowClose });

    if (!existing) {
      this._container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('is-visible'));
    } else {
      this._updateToastElement({ toast, icon: safeIcon, title: safeTitle, message: safeMessage, meta: safeMeta, variant, tone: safeTone, actionLabel, showIcon: safeShowIcon, showClose: safeShowClose });
    }

    // ------------
    // Ações
    // ------------
    this._bindCloseAction({ toast });
    this._bindRetryAction({ toast, actionLabel, onAction });

    // ------------
    // Auto-dismiss (não usar para alertas críticos)
    // ------------
    const shouldPersist = persistent || variant === 'error';
    if (!shouldPersist) {
      const ms = Number(durationMs) > 0 ? Number(durationMs) : DEFAULTS.DURATION_MS;
      this._armTimer({ toast, id, ms });
    } else {
      this._clearTimer(id, toast);
    }

    // ------------
    // Layout: quando houver toast de update persistente, centralizar
    // ------------
    this._syncContainerPresentation();
  }

  /**
   * Esconde um toast.
   * @param {HTMLElement} toast
   */
  hide(toast) {
    if (!toast || !toast.classList) return;

    toast.classList.remove('is-visible');
    const id = toast.getAttribute('data-toast-id');
    this._clearTimer(id, toast);

    // Remover após animação
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);

      // Após remover, recalcular modo do container
      this._syncContainerPresentation();
    }, 220);
  }

  // ============================================
  // Internals
  // ============================================

  _ensureContainer() {
    if (this._container && document.body.contains(this._container)) return;

    const existing = document.querySelector(SELECTORS.CONTAINER);
    if (existing) {
      this._container = existing;
      return;
    }

    const container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-label', 'Notificações');
    container.setAttribute('role', 'region');

    document.body.appendChild(container);
    this._container = container;
  }

  /**
   * Sincroniza o modo de apresentação do container.
   * - Se houver toast de update persistente, centraliza no meio da tela.
    * - Caso contrário, usa o modo padrão (toast superior).
   */
  _syncContainerPresentation() {
    if (!this._container) return;

    // ------------
    // Detectar toast de update (PWA) ativo
    // ------------
    const hasUpdateToast = Boolean(this._container.querySelector('.toast--tone-update'));

    if (hasUpdateToast) {
      this._container.classList.add('toast-container--center');

      // ------------
      // Requisito: não permitir clique fora
      // ------------
      this._enableOutsideClickBlock();
      return;
    }

    this._container.classList.remove('toast-container--center');
    this._disableOutsideClickBlock();
  }

  /**
   * Ativa o bloqueio de cliques fora do toast de update.
   * Mantém apenas o clique no botão "Recarregar" (e demais elementos dentro do toast).
   */
  _enableOutsideClickBlock() {
    if (typeof document === 'undefined') return;
    if (this._boundBlockOutsideUpdateClick) return;

    this._boundBlockOutsideUpdateClick = (event) => {
      if (!this._container) return;

      const updateToast = this._container.querySelector('.toast--tone-update');
      if (!updateToast) return;

      const target = event?.target;
      if (target instanceof Node && updateToast.contains(target)) {
        return;
      }

      // ------------
      // Bloquear clique fora do toast
      // ------------
      try {
        event.preventDefault?.();
      } catch {
        // Ignorar
      }

      try {
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
      } catch {
        // Ignorar
      }
    };

    // pointerdown cobre touch/mouse antes do click
    document.addEventListener('pointerdown', this._boundBlockOutsideUpdateClick, true);
    document.addEventListener('click', this._boundBlockOutsideUpdateClick, true);
  }

  /**
   * Desativa o bloqueio de cliques fora do toast de update.
   */
  _disableOutsideClickBlock() {
    if (typeof document === 'undefined') return;
    if (!this._boundBlockOutsideUpdateClick) return;

    document.removeEventListener('pointerdown', this._boundBlockOutsideUpdateClick, true);
    document.removeEventListener('click', this._boundBlockOutsideUpdateClick, true);
    this._boundBlockOutsideUpdateClick = null;
  }

  _createToastElement({ icon, title, message, meta, variant, tone, id, actionLabel, showIcon, showClose }) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${String(variant || 'info')}`;

    // ==================================================
    // Tom extra para casos especiais (ex.: update do PWA)
    // ==================================================
    if (tone) {
      toast.classList.add(`toast--tone-${tone}`);
    }

    toast.setAttribute('aria-atomic', 'true');

    // A11y: status (polite) para infos; alert para erros (sem aria-live extra)
    if (variant === 'error') {
      toast.setAttribute('role', 'alert');
    } else {
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
    }

    if (id) toast.setAttribute('data-toast-id', String(id));

    // --------------
    // Flags de UI
    // - Mantém os elementos sempre presentes para permitir updates por id
    //   (ex.: um toast criado sem ação pode ganhar ação depois)
    // --------------
    const hasAction = Boolean(actionLabel);
    const shouldShowIcon = showIcon !== false;
    const shouldShowClose = showClose !== false;

    toast.innerHTML = `
      <div class="toast__content">
        <div class="toast__icon" aria-hidden="true" style="display:${shouldShowIcon ? 'grid' : 'none'}"></div>

        <div class="toast__text">
          <div class="toast__title-row">
            <div class="toast__title"></div>
            <div class="toast__meta" aria-hidden="true"></div>
          </div>
          <div class="toast__message"></div>
        </div>

        <!-- Botão de fechar em estilo "ícone" (mais moderno) -->
        <button
          type="button"
          class="toast__close"
          aria-label="Fechar"
          style="display:${shouldShowClose ? 'grid' : 'none'}"
        >×</button>
      </div>

      <!-- Footer opcional: ação (mantida para casos importantes, ex.: update) -->
      <div class="toast__footer" style="display:${hasAction ? 'flex' : 'none'}">
        <button type="button" class="toast__action"></button>
      </div>
    `;

    const msgEl = toast.querySelector('.toast__message');
    if (msgEl) msgEl.textContent = message;

    // ------------
    // Título + meta (badges)
    // ------------
    if (shouldShowIcon) this._setToastIcon({ toast, icon, variant, tone });
    this._setToastTitle({ toast, title });
    this._setToastMeta({ toast, meta });

    const actionBtn = toast.querySelector('.toast__action');
    if (actionBtn) {
      // Ação pode não existir no momento da criação (display none)
      actionBtn.textContent = hasAction ? String(actionLabel) : '';
    }

    return toast;
  }

  _updateToastElement({ toast, icon, title, message, meta, variant, tone, actionLabel, showIcon, showClose }) {
    // Atualiza variante
    toast.classList.remove('toast--info', 'toast--success', 'toast--warning', 'toast--error');
    toast.classList.add(`toast--${String(variant || 'info')}`);

    // Atualiza tom extra
    try {
      const tonePrefix = 'toast--tone-';
      Array.from(toast.classList)
        .filter(cls => String(cls).startsWith(tonePrefix))
        .forEach(cls => toast.classList.remove(cls));
      if (tone) toast.classList.add(`toast--tone-${tone}`);
    } catch {
      // Ignorar
    }

    // Atualiza texto
    const msgEl = toast.querySelector('.toast__message');
    if (msgEl) msgEl.textContent = message;

    // Atualiza título + meta
    const iconEl = toast?.querySelector?.('.toast__icon');
    const shouldShowIcon = showIcon !== false;
    const shouldShowClose = showClose !== false;

    // Se for solicitado ocultar ícone (ex.: toast de update), não renderizar/mostrar.
    if (iconEl) {
      iconEl.style.display = shouldShowIcon ? '' : 'none';
      if (!shouldShowIcon) iconEl.textContent = '';
    }

    if (shouldShowIcon) this._setToastIcon({ toast, icon, variant, tone });
    this._setToastTitle({ toast, title });
    this._setToastMeta({ toast, meta });

    // --------------
    // Fechar
    // --------------
    const closeBtn = toast?.querySelector?.('.toast__close');
    if (closeBtn) {
      closeBtn.style.display = shouldShowClose ? 'grid' : 'none';
    }

    // Atualiza semântica
    if (variant === 'error') {
      toast.setAttribute('role', 'alert');
      toast.removeAttribute('aria-live');
    } else {
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
    }

    // --------------
    // Ação
    // --------------
    const actionBtn = toast.querySelector('.toast__action');
    if (actionBtn) {
      if (actionLabel) {
        actionBtn.textContent = String(actionLabel);
        actionBtn.style.display = '';
      } else {
        actionBtn.style.display = 'none';
      }
    }

    // Toggle do footer quando existir
    const footerEl = toast?.querySelector?.('.toast__footer');
    if (footerEl) {
      footerEl.style.display = actionLabel ? 'flex' : 'none';
    }
  }

  /**
   * Atualiza o ícone do toast (opcional).
   * - Se vier "icon", usa.
   * - Se não vier, decide automaticamente baseado em variant/tone.
   * @private
   */
  _setToastIcon({ toast, icon, variant, tone }) {
    const iconEl = toast?.querySelector?.('.toast__icon');
    if (!iconEl) return;

    const safeIcon = String(icon || '').trim();
    if (safeIcon) {
      iconEl.textContent = safeIcon;
      return;
    }

    // ==================================================
    // Ícones curtos e universais (sem depender de assets)
    // ==================================================
    if (String(tone || '').trim() === 'update') {
      iconEl.textContent = '⬆️';
      return;
    }

    const safeVariant = String(variant || 'info');
    const byVariant = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '⛔'
    };

    iconEl.textContent = byVariant[safeVariant] || 'ℹ️';
  }

  /**
   * Normaliza o meta para uma lista segura de strings.
   * @private
   */
  _normalizeMeta(meta) {
    if (Array.isArray(meta)) {
      return meta.map(v => String(v || '').trim()).filter(Boolean).slice(0, 4);
    }
    const single = String(meta || '').trim();
    return single ? [single] : [];
  }

  /**
   * Atualiza o título do toast (opcional).
   * @private
   */
  _setToastTitle({ toast, title }) {
    const titleEl = toast?.querySelector?.('.toast__title');
    const titleRow = toast?.querySelector?.('.toast__title-row');
    if (!titleEl || !titleRow) return;

    const safe = String(title || '').trim();
    titleEl.textContent = safe;
    titleEl.style.display = safe ? '' : 'none';

    // Se não tiver título e nem meta, esconder a linha inteira
    const metaEl = toast?.querySelector?.('.toast__meta');
    const hasMeta = metaEl && metaEl.children && metaEl.children.length > 0;
    titleRow.style.display = safe || hasMeta ? '' : 'none';
  }

  /**
   * Atualiza os "badges" de meta (opcional).
   * @private
   */
  _setToastMeta({ toast, meta }) {
    const metaEl = toast?.querySelector?.('.toast__meta');
    const titleRow = toast?.querySelector?.('.toast__title-row');
    if (!metaEl || !titleRow) return;

    metaEl.replaceChildren();

    const items = Array.isArray(meta) ? meta : this._normalizeMeta(meta);
    items.forEach((text) => {
      const pill = document.createElement('span');
      pill.className = 'toast__pill';
      pill.textContent = String(text);
      metaEl.appendChild(pill);
    });

    // Se não tiver título e nem meta, esconder a linha inteira
    const titleEl = toast?.querySelector?.('.toast__title');
    const hasTitle = Boolean(String(titleEl?.textContent || '').trim());
    titleRow.style.display = hasTitle || metaEl.children.length ? '' : 'none';
  }

  /**
   * Vincula (ou re-vincula) o botão de fechar, evitando listeners duplicados.
   * @param {{toast: HTMLElement}} params
   */
  _bindCloseAction({ toast }) {
    const closeBtn = toast?.querySelector?.('.toast__close');
    if (!closeBtn) return;

    const existing = this._closeHandlers.get(closeBtn);
    if (existing) {
      try {
        closeBtn.removeEventListener('click', existing);
      } catch {
        // Ignorar
      }
    }

    const handler = () => this.hide(toast);
    closeBtn.addEventListener('click', handler, { passive: true });
    this._closeHandlers.set(closeBtn, handler);
  }

  /**
   * Vincula (ou re-vincula) o botão de ação (ex.: "Tentar novamente").
   * @param {{toast: HTMLElement, actionLabel: string|null, onAction: Function|null}} params
   */
  _bindRetryAction({ toast, actionLabel, onAction }) {
    const actionBtn = toast?.querySelector?.('.toast__action');
    if (!actionBtn) return;

    const existing = this._actionHandlers.get(actionBtn);
    if (existing) {
      try {
        actionBtn.removeEventListener('click', existing);
      } catch {
        // Ignorar
      }
    }

    if (!actionLabel || typeof onAction !== 'function') return;

    const handler = () => {
      try {
        onAction();
      } catch {
        // Ignorar
      }
    };

    actionBtn.addEventListener('click', handler, { passive: true });
    this._actionHandlers.set(actionBtn, handler);
  }

  _armTimer({ toast, id, ms }) {
    this._clearTimer(id, toast);

    const key = id ? String(id) : toast;
    const timer = setTimeout(() => this.hide(toast), ms);
    this._timers.set(key, timer);
  }

  _clearTimer(id, toast) {
    const key = id ? String(id) : toast;
    const timer = this._timers.get(key);
    if (!timer) return;
    clearTimeout(timer);
    this._timers.delete(key);
  }
}

// ============================================
// Singleton
// ============================================

let _toastManagerInstance = null;

/**
 * Retorna instância única.
 * @returns {ToastManager}
 */
export function getToastManager() {
  // Não criar/escutar eventos de toast quando estiver desativado.
  if (!TOASTS_ENABLED) return NOOP_TOAST_MANAGER;
  if (!_toastManagerInstance) {
    _toastManagerInstance = new ToastManager();
  }
  return _toastManagerInstance;
}

/**
 * Helper para disparo por evento (para módulos que não devem importar o manager).
 * @param {Object} detail
 */
export function dispatchToast(detail) {
  try {
    // Não disparar eventos quando os toasts estiverem desativados.
    if (!TOASTS_ENABLED) return;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EVENTS.TOAST, { detail }));
  } catch {
    // Ignorar
  }
}
