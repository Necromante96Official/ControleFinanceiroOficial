/**
 * ToastHandledError
 * Responsabilidade: Padronizar erros que já tiveram toast exibido.
 *
 * Objetivo:
 * - Evitar toasts duplicados (ex.: módulo interno mostra toast específico
 *   e o formulário mostra um toast genérico no catch).
 */

const TOAST_HANDLED_FLAG = '__toastHandled';

/**
 * Cria um erro marcado como "toast já exibido".
 * @param {string} message
 * @param {unknown} [cause]
 * @returns {Error}
 */
export function createToastHandledError(message, cause) {
  const error = new Error(message);
  error[TOAST_HANDLED_FLAG] = true;

  // Compatível com navegadores modernos; ignora silenciosamente se não suportar.
  try {
    if (cause !== undefined) error.cause = cause;
  } catch {
    // Ignorar
  }

  return error;
}

/**
 * Marca um erro existente como "toast já exibido".
 * @param {unknown} error
 * @returns {unknown}
 */
export function markToastHandledError(error) {
  if (error && typeof error === 'object') {
    try {
      error[TOAST_HANDLED_FLAG] = true;
    } catch {
      // Ignorar
    }
  }
  return error;
}

/**
 * Verifica se o erro já teve toast exibido.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isToastHandledError(error) {
  return Boolean(error && typeof error === 'object' && error[TOAST_HANDLED_FLAG] === true);
}
