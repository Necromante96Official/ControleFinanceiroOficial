/**
 * Módulo: renderUpdatesEntriesHtml
 * Responsabilidade: Renderizar as atualizações (modelo) em HTML seguro.
 */

import { escapeHtml } from '../backup/escapeHtml.js';

/**
 * @typedef {{
 *  title: string,
 *  meta: string,
 *  divider: string,
 *  items: string[]
 * }} UpdateEntry
 */

/**
 * Renderiza as atualizações como HTML.
 * @param {UpdateEntry[]} entries
 * @param {{ author?: string, whatsappDisplay?: string, whatsappHref?: string }} [options]
 * @returns {string}
 */
export function renderUpdatesEntriesHtml(entries, options) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeOptions = options && typeof options === 'object' ? options : {};

  const author = escapeHtml(safeOptions.author || '');
  const whatsappDisplay = escapeHtml(safeOptions.whatsappDisplay || '');
  const whatsappHref = escapeHtml(safeOptions.whatsappHref || '');

  if (safeEntries.length === 0) {
    return `
      <p class="updates__empty">
        Ainda não existe nenhum histórico registrado.<br />
        Adicione novas entradas em <strong>assets/changelog/updates.md</strong>.
      </p>
    `;
  }

  return safeEntries
    .map((entry, index) => {
      const title = escapeHtml(entry.title || 'Atualização');
      const meta = escapeHtml(entry.meta || '');
      const divider = escapeHtml(entry.divider || '------------------------');

      // ------------
      // Suporte: exibir somente na atualização mais recente
      // (a lista vem ordenada do mais novo para o mais antigo)
      // ------------
      const shouldRenderSupport = index === 0;

      const itemsHtml = (entry.items || [])
        .map(item => `<li class="updates__item">${escapeHtml(item)}</li>`)
        .join('');

      return `
        <article class="updates__entry">
          <header class="updates__header">
            <h4 class="updates__title">${title}</h4>
            ${meta ? `<p class="updates__meta">${meta}</p>` : ''}
            ${author ? `<p class="updates__author">Desenvolvido por ${author}</p>` : ''}

            <div class="updates__divider">${divider}</div>

            ${shouldRenderSupport
              ? `
            <div class="updates__support">
              <p class="updates__support-title">Ajuda e suporte:</p>
              ${whatsappHref && whatsappDisplay
                ? `<a class="updates__support-link" href="${whatsappHref}" target="_blank" rel="noopener noreferrer">WhatsApp: ${whatsappDisplay}</a>`
                : ''}
            </div>

            <div class="updates__divider">${divider}</div>
              `.trim()
              : ''}
          </header>

          ${itemsHtml ? `<ul class="updates__items">${itemsHtml}</ul>` : ''}
        </article>
      `;
    })
    .join('');
}
