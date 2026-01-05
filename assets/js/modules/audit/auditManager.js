/**
 * Módulo: Auditoria - Manager
 * Responsabilidade: Registrar e manter as últimas ações do usuário
 */

import { AUDIT_MAX_ENTRIES } from './auditConstants.js';
import { loadAuditEntries, saveAuditEntries, clearAuditEntries } from './auditStorage.js';
import { createAuditEntry } from './createAuditEntry.js';
import { dispatchAuditUpdated } from './dispatchAuditUpdated.js';
import { formatCurrencyDisplay } from '../currencyFormatter.js';

export class AuditManager {
  constructor(options = {}) {
    this.maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : AUDIT_MAX_ENTRIES;

    // Estado em memória
    this._entries = loadAuditEntries();

    // Flag simples para silenciar logs (uso interno se necessário)
    this._muted = false;
  }

  /**
   * Retorna entradas em ordem (mais recente primeiro).
   * @returns {Array}
   */
  getEntries() {
    return [...this._entries].sort((a, b) => (b?.tsIso || '').localeCompare(a?.tsIso || ''));
  }

  /**
   * Limpa o histórico.
   */
  clear() {
    this._entries = [];
    clearAuditEntries();
    dispatchAuditUpdated(this.getEntries());
  }

  /**
   * Ativa/desativa modo silencioso.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = !!muted;
  }

  /**
   * Registra uma entrada.
   * @param {{ action: any, label: string, meta?: any, tsIso?: string }} input
   */
  log(input) {
    if (this._muted) return;

    const entry = createAuditEntry(input);
    if (!entry.label) return;

    // Inserir no começo
    this._entries.unshift(entry);

    // Limitar tamanho
    if (this._entries.length > this.maxEntries) {
      this._entries = this._entries.slice(0, this.maxEntries);
    }

    saveAuditEntries(this._entries);
    dispatchAuditUpdated(this.getEntries());
  }

  /**
   * Registra ações CRUD simples.
   * @param {{ action: 'criou'|'editou'|'removeu', entityKey: string, item: any }} input
   */
  logEntityAction(input) {
    const action = input?.action;
    const entityKey = input?.entityKey;
    const item = input?.item || {};

    const name = String(item?.name || item?.title || item?.sourceName || item?.categoryName || '').trim();
    const id = item?.id;

    // ------------
    // Rótulos (simples e direto)
    // ------------
    const entityLabelMap = {
      categoria: 'Categoria',
      beneficio: 'Benefício',
      credito: 'Crédito',
      debito: 'Débito',
      transacao: 'Transação'
    };

    const entityLabel = entityLabelMap[entityKey] || 'Item';
    const suffix = name ? `: ${name}` : (id !== undefined ? `: #${id}` : '');

    this.log({
      action,
      label: `${action} ${entityLabel}${suffix}`,
      meta: { entityKey, id }
    });
  }

  /**
   * Registra uma transferência.
   * @param {{ fromName: string, toName: string, value: number }} input
   */
  logTransfer(input) {
    const fromName = String(input?.fromName || '').trim();
    const toName = String(input?.toName || '').trim();
    const value = Number(input?.value) || 0;

    const label = `transferiu de ${fromName || 'origem'} → ${toName || 'destino'} (${formatCurrencyDisplay(value)})`;

    this.log({
      action: 'transferiu',
      label,
      meta: { fromName, toName, value }
    });
  }

  /**
   * Registra um pagamento de fatura.
   * @param {{ creditCardName: string, debitAccountName: string, value: number, isPartial?: boolean }} input
   */
  logInvoicePayment(input) {
    const creditCardName = String(input?.creditCardName || '').trim();
    const debitAccountName = String(input?.debitAccountName || '').trim();
    const value = Number(input?.value) || 0;
    const isPartial = !!input?.isPartial;

    const partialLabel = isPartial ? ' (parcial)' : '';
    const label = `pagou fatura${partialLabel}: ${creditCardName || 'cartão'} com ${debitAccountName || 'conta'} (${formatCurrencyDisplay(value)})`;

    this.log({
      action: 'pagou',
      label,
      meta: { creditCardName, debitAccountName, value, isPartial }
    });
  }
}
