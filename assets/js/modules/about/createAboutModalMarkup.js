/**
 * Módulo: createAboutModalMarkup
 * Responsabilidade: Gerar o HTML do modal "Sobre".
 */

/**
 * Cria o markup do modal "Sobre".
 * @param {{
 *  buildDisplay: string,
 *  versionNumber: string,
 *  author: string,
 *  whatsappUrl: string,
 *  whatsappDisplay: string
 * }} params
 * @returns {string}
 */
export function createAboutModalMarkup({
  buildDisplay,
  versionNumber,
  author,
  whatsappUrl,
  whatsappDisplay,
}) {
  return `
    <div class="modal__overlay" data-action="close-about-modal" aria-hidden="true"></div>
    <div
      class="modal__container modal__container--about"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <header class="modal__header">
        <h3 id="about-modal-title" class="modal__title">Sobre</h3>
        <button class="modal__close" type="button" data-action="close-about-modal" aria-label="Fechar">✕</button>
      </header>

      <div class="modal__body">
        <p class="about__meta">Build ${buildDisplay} - Versão ${versionNumber}</p>
        <p class="about__text">Desenvolvido por ${author}.</p>
        <p class="about__text">Ajuda e suporte:</p>
        <a
          class="about__link"
          href="${whatsappUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp: ${whatsappDisplay}
        </a>
      </div>
    </div>
  `;
}
