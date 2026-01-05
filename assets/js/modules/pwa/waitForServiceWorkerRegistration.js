/**
 * Módulo: waitForServiceWorkerRegistration
 * Responsabilidade: Aguardar o registro do Service Worker existir.
 *
 * Motivação:
 * - O registro do SW ocorre no index.html (script no fim do <body>).
 * - O app (main.js) inicia no DOMContentLoaded.
 * - Em alguns cenários de rede/cache/timing, getRegistration() pode retornar
 *   undefined por alguns instantes. Este helper evita perder o monitor.
 */

/**
 * Aguarda até existir um ServiceWorkerRegistration para a página atual.
 * @param {{ timeoutMs?: number, pollMs?: number }} [options]
 * @returns {Promise<ServiceWorkerRegistration | null>}
 */
export async function waitForServiceWorkerRegistration(options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  const pollMs = Number(options.pollMs) > 0 ? Number(options.pollMs) : 150;

  // ------------
  // Guardas
  // ------------
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  const startedAt = Date.now();

  // ------------
  // Tentar imediatamente e depois em polling leve
  // ------------
  // Observação: getRegistration() resolve com ServiceWorkerRegistration ou undefined.
  // ------------
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) return registration;
    } catch {
      // Ignorar
    }

    await new Promise(resolve => setTimeout(resolve, pollMs));
  }

  return null;
}
