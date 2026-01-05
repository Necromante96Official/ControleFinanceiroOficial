/**
 * Módulo: Armazenamento de Benefícios
 * Responsabilidade: Gerenciar estado dos benefícios (CRUD + recarga automática) com persistência em localStorage
 * Estende BaseStore para funcionalidades comuns
 *

 */

import { BaseStore } from './baseStore.js';
import * as dateUtils from './dateUtils.js';
import {
  getAvailable,
  getLimit,
  getUsed,
  normalizeReloadDay,
  computeMostRecentReloadDateISO,
} from './benefitUtils.js';

const STORAGE_KEY = "finance-control:benefits";

export class BenefitStore extends BaseStore {
  constructor(initialBenefits = []) {
    super(STORAGE_KEY, 'benefits', initialBenefits);
    this.autoReloadInterval = null;
    this._importMode = false;

    // ==================================================
    // MIGRAÇÃO / COMPATIBILIDADE (livre acumulável)
    // ==================================================
    // - Versões antigas não tinham "available".
    // - Versões antigas setavam lastReloadDate = today() na criação, bloqueando recarga no dia.
    this._migrateBenefitFields();
  }

  /**
   * Sobrescreve setAll() para garantir compatibilidade com dados importados.
   * - Importações antigas podem não ter "available".
   * - Pode existir lastReloadDate inconsistente em backups antigos.
   * @param {Array} items
   */
  setAll(items) {
    super.setAll(items);
    this._migrateBenefitFields();
  }

  /**
   * Sobrescreve reload() para garantir migração em dados já existentes.
   * @returns {boolean}
   */
  reload() {
    const ok = super.reload();
    if (ok) {
      this._migrateBenefitFields();
    }
    return ok;
  }

  /**
   * Migra campos legados para suportar "livre" acumulável.
   * - Garante benefit.available
   * - Corrige lastReloadDate inicial quando igual ao createdAt
   * @private
   */
  _migrateBenefitFields() {
    let changed = false;

    this._items.forEach((benefit) => {
      if (!benefit) return;

      // ------------
      // Garantir números básicos
      // ------------
      const limit = getLimit(benefit);
      const used = getUsed(benefit);

      // Se não existir available, cria a partir do legado (limit - used)
      if (!Number.isFinite(Number.parseFloat(benefit.available))) {
        benefit.available = Math.max(limit - used, 0);
        changed = true;
      }

      // ------------
      // Corrigir lastReloadDate inicial (para recarga funcionar no dia)
      // ------------
      const reloadDay = normalizeReloadDay(benefit.reloadDay);
      if (!reloadDay) return;

      // Se não tiver lastReloadDate, calcula a recarga mais recente
      if (!benefit.lastReloadDate) {
        // Usar referência de ontem para não "marcar como recarregado" no próprio dia
        // quando o campo não existia em versões antigas.
        const reference = new Date();
        reference.setDate(reference.getDate() - 1);
        benefit.lastReloadDate = computeMostRecentReloadDateISO(reloadDay, reference);
        changed = true;
        return;
      }

      // Caso típico do bug: lastReloadDate = data de criação
      // (conta como "recarregado este mês" e bloqueia a recarga real)
      try {
        const createdKey = benefit.createdAt ? dateUtils.getLocalISODateString(benefit.createdAt) : '';
        const lastReloadKey = dateUtils.getLocalISODateString(benefit.lastReloadDate);

        if (createdKey && lastReloadKey && createdKey === lastReloadKey) {
          benefit.lastReloadDate = computeMostRecentReloadDateISO(reloadDay, benefit.createdAt);
          changed = true;
        }
      } catch {
        // Ignorar
      }
    });

    if (changed) {
      this._saveToStorage();
      console.log('🔄 BenefitStore: migração de campos aplicada');
    }
  }

  /**

   */
  setImportMode(enabled) {
    this._importMode = enabled;
    console.log(`📥 BenefitStore: Modo importação ${enabled ? 'ATIVADO' : 'DESATIVADO'}`);
  }

  /**
   * Sobrescreve add() para adicionar campos específicos de benefícios

   */
  add(benefitPayload) {
    const nextId = this._generateNextId();

    // Remove id do payload para evitar sobrescrever nextId
    const { id, ...cleanPayload } = benefitPayload;

    // ------------
    // Inicialização consistente de recarga
    // ------------
    const reloadDay = normalizeReloadDay(cleanPayload.reloadDay);
    const limit = Number.parseFloat(cleanPayload.limit) || 0;
    const availableFromPayload = Number.parseFloat(cleanPayload.available);
    const initialAvailable = Number.isFinite(availableFromPayload)
      ? Math.max(0, availableFromPayload)
      : Math.max(0, limit);
    const initialLastReloadDate = reloadDay
      ? computeMostRecentReloadDateISO(reloadDay, new Date())
      : dateUtils.today();

    const newBenefit = {
      id: nextId,
      ...cleanPayload,
      used: 0,
      // Livre (saldo disponível): começa com o limite do mês atual
      available: initialAvailable,
      // Armazenar como data (sem horário) para evitar efeitos de timezone na lógica mensal
      lastReloadDate: initialLastReloadDate,
      createdAt: dateUtils.now(),
    };

    this._items.push(newBenefit);
    this._saveToStorage();
    return newBenefit;
  }

  /**
   * Calcula valor total de todos os benefícios
   */
  getTotalBalance() {
    return this._items.reduce((sum, b) => sum + getLimit(b), 0);
  }

  /**
   * Calcula valor utilizado em todos os benefícios
   */
  getTotalUsed() {
    return this._items.reduce((sum, b) => sum + getUsed(b), 0);
  }

  /**
   * Calcula valor disponível em todos os benefícios
   */
  getTotalAvailable() {
    return this._items.reduce((sum, b) => sum + getAvailable(b), 0);
  }

  /**
   * Usa valor de um benefício específico
   * @param {number} benefitId - ID do benefício
   * @param {number} amount - Valor a usar
   * @returns {Object} - { success, error?, available?, benefit? }
   */
  useValue(benefitId, amount) {
    const benefit = this.findById(benefitId);

    if (!benefit) {
      return {
        success: false,
        error: 'BENEFIT_NOT_FOUND',
        message: `Benefício com ID ${benefitId} não encontrado`
      };
    }

    const used = getUsed(benefit);
    const available = getAvailable(benefit);
    const newUsed = used + amount;

    if (amount <= 0) {
      return {
        success: false,
        error: 'INVALID_AMOUNT',
        message: 'O valor deve ser maior que zero',
        available
      };
    }

    if (amount > available) {
      return {
        success: false,
        error: 'EXCEEDS_LIMIT',
        message: `Valor ultrapassa o saldo disponível`,
        available,
        requested: amount,
        excess: amount - available
      };
    }

    // Atualiza usado + disponível (livre)
    this.update(benefitId, {
      used: newUsed,
      available: Math.max(0, available - amount)
    });

    return {
      success: true,
      benefit: this.findById(benefitId),
      previousAvailable: available,
      newAvailable: Math.max(0, available - amount)
    };
  }

  /**
   * Estorna uso de benefício (reversão de transação).
   * @param {number} benefitId
   * @param {number} amount
   * @returns {{ success: boolean, refunded?: number }}
   */
  refundValue(benefitId, amount) {
    const benefit = this.findById(benefitId);
    if (!benefit) return { success: false };

    const used = getUsed(benefit);
    const available = getAvailable(benefit);

    const requested = Number.parseFloat(amount);
    if (!Number.isFinite(requested) || requested <= 0) {
      return { success: false };
    }

    // Só estorna o que realmente foi usado (protege contra inconsistência)
    const refunded = Math.min(requested, used);

    this.update(benefitId, {
      used: Math.max(0, used - refunded),
      available: Math.max(0, available + refunded)
    });

    return { success: true, refunded };
  }

  /**
   * Faz recarga automática mensal de um benefício

   */
  reloadBenefit(benefitId) {
    const benefit = this.findById(benefitId);
    if (!benefit) return null;

    // ==================================================
    // RECARGA (ACUMULÁVEL)
    // ==================================================
    // Regra: no dia de recarga, o "usado" zera e o "livre" recebe +limite.
    const limit = getLimit(benefit);
    const currentAvailable = getAvailable(benefit);

    this.update(benefitId, {
      used: 0,
      available: Math.max(0, currentAvailable + limit),
      // Armazenar como data (sem horário) para manter comparações consistentes
      lastReloadDate: dateUtils.today(),
    });

    return benefit;
  }

  /**
   * Verifica se um benefício precisa de recarga
   * Lógica corrigida: funciona mesmo se o app for aberto após o dia de recarga
   * @private
   */
  _needsReload(benefit, today) {
    if (!benefit.reloadDay) return false;

    // Normalizar/validar o dia de recarga
    const reloadDayRaw = normalizeReloadDay(benefit.reloadDay);
    if (!reloadDayRaw) return false;

    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Ajuste para meses com menos dias (ex.: reloadDay=31 em fevereiro -> recarrega no último dia)
    const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const effectiveReloadDay = Math.min(reloadDayRaw, lastDayOfCurrentMonth);

    // Data de recarga deste mês (00:00 local)
    const expectedReloadDate = new Date(currentYear, currentMonth, effectiveReloadDay);
    expectedReloadDate.setHours(0, 0, 0, 0);

    // Hoje (00:00 local)
    const todayKey = new Date(today);
    todayKey.setHours(0, 0, 0, 0);

    // Ainda não chegou no dia de recarga
    if (todayKey.getTime() < expectedReloadDate.getTime()) return false;

    // Última recarga (00:00 local)
    let lastReload = new Date(benefit.lastReloadDate || benefit.createdAt || 0);
    if (Number.isNaN(lastReload.getTime())) {
      lastReload = new Date(0);
    }
    lastReload.setHours(0, 0, 0, 0);

    // Regra: só recarrega se ainda NÃO recarregou no ciclo deste mês.
    // Ou seja, lastReload precisa ser anterior à data de recarga deste mês.
    return lastReload.getTime() < expectedReloadDate.getTime();
  }

  /**
   * Verifica e processa recargas automáticas necessárias
   * Lógica inteligente: considera se o dia de recarga já passou no mês atual

   */
  processAutoReloads() {
    if (this._importMode) {
      console.log('⏸️ Auto-reload bloqueado: modo importação ativo');
      return 0;
    }

    const today = new Date();
    let reloadedCount = 0;

    this._items.forEach((benefit) => {
      if (this._needsReload(benefit, today)) {
        this.reloadBenefit(benefit.id);
        reloadedCount++;
        console.log(`✅ Benefício "${benefit.name}" recarregado automaticamente (dia ${benefit.reloadDay})`);
      }
    });

    return reloadedCount;
  }

  /**
   * Inicia verificação periódica de recargas automáticas
   * CORREÇÃO: Limpa interval existente antes de criar novo (previne múltiplos intervals)
   */
  startAutoReloadCheck(intervalMs = 60000) {
    // CORREÇÃO: Parar interval existente antes de iniciar novo
    this.stopAutoReloadCheck();

    // Processar recargas imediatamente ao iniciar (não esperar o primeiro intervalo)
    try {
      const reloaded = this.processAutoReloads();
      if (reloaded > 0) {
        console.log(`✅ ${reloaded} benefício(s) recarregado(s) na inicialização`);
      }
    } catch (error) {
      console.warn("⚠️ Erro ao verificar recargas na inicialização:", error);
    }

    this.autoReloadInterval = setInterval(() => {
      try {
        this.processAutoReloads();
      } catch (error) {
        console.warn("⚠️ Erro ao verificar recargas automáticas:", error);
      }
    }, intervalMs);

    console.log(`✅ Verificação automática iniciada (a cada ${intervalMs}ms)`);
  }

  /**
   * Para a verificação periódica
   */
  stopAutoReloadCheck() {
    if (this.autoReloadInterval) {
      clearInterval(this.autoReloadInterval);
      this.autoReloadInterval = null; // CORREÇÃO: Limpar referência
      console.log("⏹️ Verificação automática parada");
    }
  }

  // clear() é herdado de BaseStore
}
