/**
 * Sound Settings Manager
 * Responsabilidade: renderizar e controlar a opção de volume do som de clique.
 *
 * Observação:
 * - A UI é renderizada dentro da aba Configurações (container da Danger Zone).
 */

import { getClickSoundVolume, setClickSoundVolume } from "./clickSoundManager.js";

// ==============================
// HELPERS
// ==============================

/**
 * Converte volume 0..1 em porcentagem 0..100.
 * @param {number} volume
 * @returns {number}
 */
function volumeToPercent(volume) {
  const safe = Number.isFinite(volume) ? volume : 0;
  return Math.max(0, Math.min(100, Math.round(safe * 100)));
}

/**
 * Converte porcentagem 0..100 em volume 0..1.
 * @param {number} percent
 * @returns {number}
 */
function percentToVolume(percent) {
  const safe = Number.isFinite(percent) ? percent : 0;
  return Math.max(0, Math.min(1, safe / 100));
}

export class SoundSettingsManager {
  constructor() {
    this._initialized = false;
  }

  /**
   * Inicializa a opção de volume na aba Configurações.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    const configPanelBody = document.querySelector(".config-panel__body");
    if (!configPanelBody) return;

    const dangerZoneRoot = configPanelBody.querySelector(".danger-zone");
    if (!dangerZoneRoot) return;

    // ------------
    // Evitar duplicar renderização
    // ------------
    if (dangerZoneRoot.querySelector('[data-sound-settings]')) return;

    // ------------
    // Alvo: no layout novo, o Resumo usa .danger-zone__stats-grid dentro do tópico "resumo"
    // (mantém fallback para o layout antigo .danger-zone__stats)
    // ------------
    const resumoTopic = dangerZoneRoot.querySelector('.danger-zone__topic[data-topic="resumo"]');
    const statsGrid = resumoTopic?.querySelector('.danger-zone__stats-grid') || null;
    const legacyStats = dangerZoneRoot.querySelector('.danger-zone__stats');
    const insertAfterEl = statsGrid || legacyStats;
    if (!insertAfterEl) return;

    // ------------
    // Renderização
    // ------------
    const currentPercent = volumeToPercent(getClickSoundVolume());

    const html = `
      <div class="danger-zone__section sound-settings" data-sound-settings>
        <h3 class="danger-zone__section-title">🔊 Som</h3>
        <p class="danger-zone__section-description">Personalize o volume do som de clique.</p>

        <div class="sound-settings__card">
          <div class="sound-settings__row">
            <label class="sound-settings__label" for="click-sound-volume">Volume do clique</label>
            <span id="click-sound-volume-value" class="sound-settings__value">${currentPercent}%</span>
          </div>

          <input
            id="click-sound-volume"
            class="sound-settings__range"
            type="range"
            min="0"
            max="100"
            step="1"
            value="${currentPercent}"
            aria-label="Volume do som de clique"
          />

          <p class="sound-settings__hint">0% desativa o som.</p>
        </div>
      </div>
    `;

    insertAfterEl.insertAdjacentHTML("afterend", html);

    // ------------
    // Eventos
    // ------------
    const range = dangerZoneRoot.querySelector("#click-sound-volume");
    const valueEl = dangerZoneRoot.querySelector("#click-sound-volume-value");

    if (!(range instanceof HTMLInputElement)) return;

    range.addEventListener("input", () => {
      const percent = Number(range.value);
      const normalized = percentToVolume(percent);

      if (valueEl) valueEl.textContent = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;

      // Persistência e aplicação imediata ficam por conta do clickSoundManager
      setClickSoundVolume(normalized);
    });
  }
}
