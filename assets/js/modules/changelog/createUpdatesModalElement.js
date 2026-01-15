/**
 * Módulo: createUpdatesModalElement
 * Responsabilidade: Criar o elemento DOM do modal de Histórico de Atualizações.
 */

import { createUpdatesModalMarkup } from './createUpdatesModalMarkup.js';

/**
 * Cria o elemento do modal de histórico.
 * @returns {HTMLElement}
 */
export function createUpdatesModalElement() {
  const modal = document.createElement('section');
  modal.id = 'updates-modal';
  modal.className = 'modal';
  modal.setAttribute('aria-hidden', 'true');

  // ------------
  // Render base (conteúdo será preenchido via manager)
  // ------------
  modal.innerHTML = createUpdatesModalMarkup({
    title: 'Histórico de Atualizações',
  });

  return modal;
}
