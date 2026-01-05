/**
 * Módulo: getWaitingServiceWorkerMeta
 * Responsabilidade: Buscar version/build do Service Worker em "waiting".
 * - Usa MessageChannel para receber resposta (mesmo antes do SW controlar a página).
 */

/**
 * Solicita metadados (versão/build) para o SW em waiting.
 * @param {ServiceWorker} waitingWorker
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{version: string, build: string} | null>}
 */
export async function getWaitingServiceWorkerMeta(waitingWorker, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 1200;

  // ------------
  // Guardas de compatibilidade
  // ------------
  if (!waitingWorker) return null;
  if (typeof MessageChannel === 'undefined') return null;
  if (typeof waitingWorker.postMessage !== 'function') return null;

  return await new Promise(resolve => {
    let done = false;

    const finish = value => {
      if (done) return;
      done = true;
      resolve(value);
    };

    const channel = new MessageChannel();

    const timeoutId = setTimeout(() => {
      try {
        channel.port1.onmessage = null;
        channel.port1.close();
      } catch {
        // Ignorar
      }
      finish(null);
    }, timeoutMs);

    channel.port1.onmessage = event => {
      clearTimeout(timeoutId);

      const data = event?.data;
      const version = data?.version;
      const build = data?.build;

      if (typeof version === 'string' && typeof build === 'string') {
        finish({ version, build });
        return;
      }

      finish(null);
    };

    try {
      // ------------
      // Transferir port2 para o SW e ouvir a resposta no port1
      // ------------
      waitingWorker.postMessage({ type: 'GET_APP_META' }, [channel.port2]);
    } catch {
      clearTimeout(timeoutId);
      finish(null);
    }
  });
}
