/**
 * Módulo: createAboutModalElement
 * Responsabilidade: Criar o elemento DOM do modal "Sobre".
 */

import { createAboutModalMarkup } from './createAboutModalMarkup.js';

/**
 * Cria o elemento do modal "Sobre".
 * @param {{
 *  buildDisplay: string,
 *  versionNumber: string,
 *  author: string,
 *  whatsappUrl: string,
 *  whatsappDisplay: string
 * }} params
 * @returns {HTMLElement}
 */
export function createAboutModalElement(params) {
  const modal = document.createElement('section');
  modal.id = 'about-modal';
  modal.className = 'modal';
  modal.setAttribute('aria-hidden', 'true');

  // ------------
  // Render do conteúdo interno
  // ------------
  modal.innerHTML = createAboutModalMarkup(params);

  return modal;
}
