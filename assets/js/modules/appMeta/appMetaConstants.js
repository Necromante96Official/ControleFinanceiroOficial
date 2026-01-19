/**
 * Módulo: appMetaConstants
 * Responsabilidade: Centralizar metadados fixos do app (versão/build/autor/suporte).
 */

// ================================
// Metadados do App
// ================================

/** Versão do aplicativo (somente números e pontos). */
export const APP_VERSION = '1.0.3';

/** Build do aplicativo (formato com pontos para cache/versionamento). */
// Build incremental (ex.: 308, 309, 310...) usado para cache/versionamento.
export const APP_BUILD = '263';



/** Autor exibido na UI. */
export const APP_AUTHOR = 'Necromante96Official';

// ================================
// Suporte
// ================================

/**
 * WhatsApp em formato E.164 sem '+' (usado em https://wa.me/<numero>).
 * Exemplo: 55 (BR) + 51 (DDD) + 986506459.
 */
export const SUPPORT_WHATSAPP_E164 = '5551986506459';

/** Texto de exibição do WhatsApp. */
export const SUPPORT_WHATSAPP_DISPLAY = '+55 51 98650-6459';
