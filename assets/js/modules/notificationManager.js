/**
 * Notification Manager - Gerenciamento de Notificações do Sistema
 *
 * Gerencia permissões e envio de notificações do navegador,
 * com verificações de suporte e permissões.
 *

 */

import * as dateUtils from './dateUtils.js';
import { clampToZero, parseMoneyToNumber } from './moneyUtils.js';

/** Notificações do sistema (Notification API) desativadas no momento (solicitado). */
const SYSTEM_NOTIFICATIONS_ENABLED = false;

const NOTIFICATION_LOG_KEY = "finance-control:notif:credit-due";
const NOTIFICATION_PERMISSION_KEY = "finance-control:notif:permission";
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

export class NotificationManager {
  /**
   * Verifica se notificações são suportadas pelo navegador
   * @returns {boolean} true se suportadas
   */
  static isSupported() {
    return SYSTEM_NOTIFICATIONS_ENABLED && typeof window !== "undefined" && "Notification" in window;
  }

  /**
   * Obtém status atual da permissão de notificação
   * @returns {'granted'|'denied'|'default'|'unsupported'} Status da permissão
   */
  static getPermissionStatus() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Verifica se permissões estão concedidas
    * Método adicionado para verificação simples
   * @returns {boolean} true se permissões estão concedidas
   */
  static hasPermission() {
    return this.isSupported() && Notification.permission === 'granted';
  }

  /**
   * Verifica se permissões foram negadas
    * Método adicionado para feedback ao usuário
   * @returns {boolean} true se permissões foram negadas
   */
  static isPermissionDenied() {
    return this.isSupported() && Notification.permission === 'denied';
  }

  /**
   * Garante que permissões de notificação estão concedidas
    * Verificações mais robustas com feedback claro
   * @returns {Promise<boolean>} true se permissões concedidas
   */
  static async ensurePermission() {
    // Notificações desativadas: não solicitar permissão, não notificar.
    if (!SYSTEM_NOTIFICATIONS_ENABLED) return false;

    if (!this.isSupported()) {
      console.warn('⚠️ Notificações não são suportadas por este navegador');
      return false;
    }
    if (Notification.permission === "granted") {
      console.log('✅ Permissões de notificação já concedidas');
      return true;
    }
    if (Notification.permission === "denied") {
      console.warn('⚠️ Permissões de notificação foram negadas pelo usuário');
      localStorage.setItem(NOTIFICATION_PERMISSION_KEY, "denied");
      return false;
    }

    // Verifica localStorage para não solicitar repetidamente
    const lastRequest = localStorage.getItem(NOTIFICATION_PERMISSION_KEY);
    if (lastRequest === "denied") {
      console.warn('⚠️ Permissões de notificação foram negadas anteriormente');
      return false;
    }
    try {
      console.log('🔔 Solicitando permissões de notificação...');
      const result = await Notification.requestPermission();
      localStorage.setItem(NOTIFICATION_PERMISSION_KEY, result);

      if (result === 'granted') {
        console.log('✅ Permissões de notificação concedidas!');
        return true;
      } else {
        console.warn(`⚠️ Permissões de notificação ${result}`);
        return false;
      }
    } catch (error) {
      console.error("❌ Erro ao solicitar permissão de notificação:", error);
      return false;
    }
  }

  static getNotificationLog() {
    try {
      const stored = localStorage.getItem(NOTIFICATION_LOG_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn("Falha ao ler log de notificações", error);
      return {};
    }
  }

  static saveNotificationLog(log) {
    try {
      localStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify(log));
    } catch (error) {
      console.warn("Falha ao salvar log de notificações", error);
    }
  }

  static getTodayToken() {
    // Usa data LOCAL para evitar troca de dia por UTC
    return dateUtils.getLocalISODateString();
  }

  static hasNotifiedToday(cardId) {
    const log = this.getNotificationLog();
    return log[String(cardId)] === this.getTodayToken();
  }

  static markNotified(cardId) {
    const log = this.getNotificationLog();
    log[String(cardId)] = this.getTodayToken();
    this.saveNotificationLog(log);
  }

  /**
   * Envia notificação de vencimento de cartão de crédito
    * Verificações robustas de permissão antes de enviar
   * @param {Object} card - Cartão de crédito
   * @param {number} daysUntilDue - Dias até o vencimento
   * @returns {boolean} true se notificação foi enviada
   */
  static sendCreditNotification(card, daysUntilDue) {
    // Notificações desativadas: não enviar.
    if (!SYSTEM_NOTIFICATIONS_ENABLED) return false;

    if (!this.isSupported()) {
      console.warn('⚠️ Notificações não suportadas');
      return false;
    }
    if (!this.hasPermission()) {
      console.warn(`⚠️ Sem permissão para notificações (status: ${this.getPermissionStatus()})`);
      return false;
    }

    // Monta conteúdo da notificação
    const title = daysUntilDue === 0
      ? `Cartão ${card.name} vence hoje!`
      : `Cartão ${card.name} vence em ${daysUntilDue} dia(s)`;

    const bodyParts = [];
    // Compatibilidade: valores podem vir como string com vírgula (ex.: "1.200,00")
    const used = clampToZero(parseMoneyToNumber(card?.used));
    const limit = clampToZero(parseMoneyToNumber(card?.limit));

    if (used > 0) bodyParts.push(`Fatura atual: ${currencyFormatter.format(used)}`);
    if (limit > 0) {
      const available = Math.max(limit - used, 0);
      bodyParts.push(`Disponível: ${currencyFormatter.format(available)}`);
    }
    const body = bodyParts.join(" | ");
    try {
      new Notification(title, {
        body,
        icon: "assets/logo/logo.png",
        badge: "assets/logo/logo.png",
        tag: `credit-due-${card.id}`,
        renotify: false,
        silent: false,
        data: { cardId: card.id }
      });
      console.log(`🔔 Notificação enviada: ${title}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar notificação:', error);
      return false;
    }
  }

  /**
   * Verifica vencimentos de cartões e envia notificações
    * Verificações robustas com logs informativos
   * @param {Object} creditStore - Store de cartões de crédito
   * @param {number} daysThreshold - Dias de antecedência para notificar (padrão: 5)
   * @returns {Promise<Object>} Estatísticas de notificações enviadas
   */
  static async checkCreditDueDates(creditStore, daysThreshold = 5) {
    const stats = { checked: 0, sent: 0, skipped: 0, errors: 0, rateLimited: false };

    // Notificações desativadas: não checar/solicitar permissão/emitir nada.
    if (!SYSTEM_NOTIFICATIONS_ENABLED) return stats;

    const RATE_LIMIT_MS = 60000; // 1 minuto entre verificações
    const RATE_LIMIT_KEY = 'finance-control:notif:last-check';

    try {
      const lastCheck = parseInt(localStorage.getItem(RATE_LIMIT_KEY) || '0');
      const now = Date.now();
      const timeSinceLastCheck = now - lastCheck;

      if (timeSinceLastCheck < RATE_LIMIT_MS) {
        const remainingTime = Math.ceil((RATE_LIMIT_MS - timeSinceLastCheck) / 1000);
        console.log(`⏱️ Rate limit: verificação muito recente. Aguarde ${remainingTime}s`);
        stats.rateLimited = true;
        return stats;
      }

      // Atualizar timestamp da última verificação
      localStorage.setItem(RATE_LIMIT_KEY, now.toString());
    } catch (storageError) {
      console.warn('⚠️ Não foi possível verificar rate limit:', storageError);
      // Continuar sem rate limiting se localStorage falhar
    }
    if (!creditStore) {
      console.warn('⚠️ CreditStore não fornecido');
      return stats;
    }

    if (!this.isSupported()) {
      console.warn('⚠️ Notificações não são suportadas por este navegador');
      return stats;
    }
    const hasPermission = await this.ensurePermission();
    if (!hasPermission) {
      console.warn('⚠️ Permissões de notificação não concedidas - verificação cancelada');
      return stats;
    }

    // Processa cada cartão
    const cards = creditStore.getAll();
    console.log(`🔔 Verificando ${cards.length} cartão(ões) para notificações...`);

    cards.forEach((card) => {
      stats.checked++;

      // Validações básicas
      if (!card || !card.dueDay) {
        stats.skipped++;
        return;
      }

      // Só notifica se tem valor usado
      const used = clampToZero(parseMoneyToNumber(card?.used));
      if (used <= 0) {
        stats.skipped++;
        return;
      }

      // Calcula dias até vencimento
      const daysUntilDue = creditStore.getDaysUntilDue(card);
      if (typeof daysUntilDue !== "number") {
        stats.skipped++;
        return;
      }

      // Verifica se está dentro do threshold
      if (daysUntilDue < 0 || daysUntilDue > daysThreshold) {
        stats.skipped++;
        return;
      }

      // Verifica se já notificou hoje
      if (this.hasNotifiedToday(card.id)) {
        stats.skipped++;
        return;
      }

      // Envia notificação
      const sent = this.sendCreditNotification(card, daysUntilDue);
      if (sent) {
        this.markNotified(card.id);
        stats.sent++;
      } else {
        stats.errors++;
      }
    });

    // Log final
    console.log(`🔔 Verificação concluída: ${stats.sent} notificação(ões) enviada(s), ${stats.skipped} ignorado(s), ${stats.errors} erro(s)`);
    return stats;
  }
}
