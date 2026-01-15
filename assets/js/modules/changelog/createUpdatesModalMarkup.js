/**
 * Módulo: createUpdatesModalMarkup
 * Responsabilidade: Gerar o HTML do modal de Histórico de Atualizações.
 */

/**
 * Cria o markup do modal de histórico.
 * @param {{ title: string }} params
 * @returns {string}
 */
export function createUpdatesModalMarkup({ title }) {
  return `
    <div class="modal__overlay" data-action="close-updates-modal" aria-hidden="true"></div>
    <div
      class="modal__container modal__container--updates"
      role="dialog"
      aria-modal="true"
      aria-labelledby="updates-modal-title"
    >
      <header class="modal__header">
        <h3 id="updates-modal-title" class="modal__title">${title}</h3>
        <button class="modal__close" type="button" data-action="close-updates-modal" aria-label="Fechar">✕</button>
      </header>

      <div class="modal__body">
        <div id="updates-modal-content" class="updates__content" aria-label="Lista de atualizações"></div>
      </div>
    </div>
  `;
}
