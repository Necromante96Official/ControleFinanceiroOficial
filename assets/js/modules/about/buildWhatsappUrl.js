/**
 * Módulo: buildWhatsappUrl
 * Responsabilidade: Montar a URL de contato do WhatsApp.
 */

import { SUPPORT_WHATSAPP_E164 } from '../appMeta/appMetaConstants.js';

/**
 * Monta a URL para abrir conversa no WhatsApp.
 * @param {string} [phoneE164] - Número no formato E.164 sem '+' (ex: 5551999999999)
 * @returns {string}
 */
export function buildWhatsappUrl(phoneE164 = SUPPORT_WHATSAPP_E164) {
  const normalized = String(phoneE164 ?? '').replace(/\s+/g, '');
  return `https://wa.me/${normalized}`;
}
