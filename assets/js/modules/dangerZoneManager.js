  /**
   * Módulo: Danger Zone Manager (Zona de Perigo)
   * Responsabilidade: Gerenciar todas as ações de dados sensíveis
   *

   *
   * Funcionalidades:
   * - Limpar dados seletivos (mantido)
   * - Export de dados (JSON)
   * - Import de dados (JSON) com recálculo de valores
   * - Backup automático antes de limpar com rollback
   * - Histórico de backups com gerenciamento
  * - Estatísticas do sistema (inclui tamanhos: Exportar | Importado)
   * - Reset de configurações
   * - Confirmação em duas etapas
   */
import { TIMINGS } from './constants.js';
import * as dateUtils from './dateUtils.js';
import { dispatchToast } from './toastManager.js';
import { createBackupEnvelope } from './backup/createBackupEnvelope.js';
import { parseBackupEnvelopeFromJsonText } from './backup/parseBackupEnvelope.js';
import { downloadTextFile } from './backup/downloadTextFile.js';
import { formatBackupPreviewMessage } from './backup/formatBackupPreviewMessage.js';
import { textToSafeHtml } from './backup/textToSafeHtml.js';
import { getAppMeta } from './backup/getAppMeta.js';
import { sanitizeBackupPayload } from './backup/sanitizeBackupPayload.js';
import { runDataHealthRepair } from './dataHealth/runDataHealthRepair.js';

export class DangerZoneManager {
  constructor(options) {
    this.stores = options.stores;
    this.elements = options.elements;
    this.confirmationModal = options.confirmationModal;
    this.gridRenderer = options.gridRenderer;
    this.statsManager = options.statsManager;
    this.transactionManager = options.transactionManager;

    // ==================================================
    // AUDITORIA (opcional)
    // ==================================================
    this.auditManager = options.auditManager || null;
    this.dangerZone = null;
    this.statsElements = {};
    this.confirmModal = null;

    this._isRefreshing = false;

    // ==================================================
    // TAMANHOS (UX)
    // - Exportar: estimativa do tamanho do arquivo que será exportado
    // - Importado: tamanho real do último arquivo importado
    // ==================================================
    this.LAST_IMPORTED_BYTES_KEY = 'finance-control:last-import-bytes';
    this._lastBackupBytes = 0;
    this._lastImportedBytes = this._readLastImportedBytesFromStorage();

    // ==================================================
    // UI: Modais independentes (Configurações)
    // ==================================================
    this._settingsModals = {};
    this._lastFocusedElementBeforeModal = null;
    this._activeSettingsModalKey = null;
    this._boundOnKeyDownEsc = null;

    // ==================================================
    // LOGS DO SISTEMA (ErrorHandler)
    // ==================================================
    this._boundOnSystemError = null;

    // Configurações de backup
    this.BACKUP_PREFIX = 'finance-control:backup:';
    this.MAX_BACKUPS = 5; // Manter últimos 5 backups
    this.AUTO_BACKUP_KEY = 'finance-control:auto-backup-last';

    // ==================================================
    // PWA: Higiene de caches
    // - CacheStorage é por origem, mas pode conter caches de outros apps na mesma origem.
    // - Aqui limitamos exclusão ao prefixo do nosso SW (ver sw.js: CACHE_PREFIX).
    // ==================================================
    this.APP_CACHE_PREFIX = 'controlefinanceiro-';
  }

  /**
   * Retorna o prefixo de escopo do app (para não desregistrar SW de outros apps na mesma origem).
   * @private
   */
  _getAppScopePrefixUrl() {
    try {
      return new URL('./', window.location.href).href;
    } catch {
      return '';
    }
  }

  /**
   * Remove apenas caches do app (por prefixo), preservando caches de outros apps na mesma origem.
   * @private
   */
  async _deleteOnlyAppCaches() {
    if (!('caches' in window)) return { deletedCount: 0 };

    const cacheNames = await caches.keys();
    const appCacheNames = cacheNames.filter(name => name && name.startsWith(this.APP_CACHE_PREFIX));
    await Promise.all(appCacheNames.map(name => caches.delete(name)));

    return { deletedCount: appCacheNames.length };
  }

  /**
   * Inicializa a Zona de Perigo
   */
  init() {
    this._renderDangerZone();
    this._updateStats();
    this._attachEventListeners();

    // ==================================================
    // LOGS DO SISTEMA: atualizar automaticamente quando um erro é capturado
    // ==================================================
    this._attachSystemLogsListener();
  }

  /**
   * Renderiza a interface da Zona de Perigo
   * @private
   */
  _renderDangerZone() {
    const configPanel = document.querySelector('.config-panel__body');
    if (!configPanel) {
      console.error('❌ Container de configurações não encontrado');
      return;
    }

    configPanel.innerHTML = `
      <div class="danger-zone">
        <!-- =============================== -->
        <!-- NOVO LAYOUT: CONFIGURAÇÕES -->
        <!-- =============================== -->
        <!-- Acessos rápidos (modais pequenos) -->
        <div class="settings-actions" aria-label="Central de configurações" role="list">
            <button class="settings-action" type="button" data-action="open-settings-modal" data-modal="resumo">
              <span class="settings-action__text">Resumo</span>
            </button>
            <div class="settings-divider" aria-hidden="true"></div>

            <button class="settings-action" type="button" data-action="open-settings-modal" data-modal="backup">
              <span class="settings-action__text">Backup</span>
            </button>
            <div class="settings-divider" aria-hidden="true"></div>

            <button class="settings-action settings-action--warning" type="button" data-action="open-settings-modal" data-modal="limpeza">
              <span class="settings-action__text">Gerenciar Limpeza</span>
            </button>
            <div class="settings-divider" aria-hidden="true"></div>

            <button class="settings-action settings-action--danger" type="button" data-action="open-settings-modal" data-modal="reset">
              <span class="settings-action__text">Acessar Reset</span>
            </button>
            <div class="settings-divider" aria-hidden="true"></div>

            <button class="settings-action" type="button" data-action="open-settings-modal" data-modal="logs">
              <span class="settings-action__text">Logs</span>
            </button>

            <button class="settings-action settings-action--tutorial" type="button" data-action="open-settings-modal" data-modal="tutorial">
              <span class="settings-action__text">💡 Como usar?</span>
            </button>
        </div>

        <!-- ================================================== -->
        <!-- MODAIS INDEPENDENTES (SEM MODAL-PAI) -->
        <!-- ================================================== -->

        <section id="dz-modal-resumo" class="modal" aria-hidden="true" data-modal="resumo">
          <div class="modal__overlay" data-action="close-settings-modal" data-modal="resumo" aria-hidden="true"></div>
          <div class="modal__container modal__container--settings-topic" role="dialog" aria-modal="true" aria-labelledby="dz-modal-resumo-title" aria-describedby="dz-modal-resumo-desc">
            <header class="modal__header">
              <h3 id="dz-modal-resumo-title" class="modal__title">Resumo</h3>
              <button class="modal__close" type="button" data-action="close-settings-modal" data-modal="resumo" aria-label="Fechar">✕</button>
            </header>
            <div class="modal__body">
              <p id="dz-modal-resumo-desc" class="settings-modal__desc">Visão rápida dos seus dados e tamanhos de backup (sem alterar nada).</p>
              <div class="settings-modal">
                <div class="summary-strip" role="list" aria-label="Resumo do sistema">
                  <div class="summary-pill" role="listitem">
                    <span class="summary-pill__label">Categorias</span>
                    <span class="summary-pill__value" id="dz-stat-categories">0</span>
                  </div>
                  <div class="summary-pill" role="listitem">
                    <span class="summary-pill__label">Benefícios</span>
                    <span class="summary-pill__value" id="dz-stat-benefits">0</span>
                  </div>
                  <div class="summary-pill" role="listitem">
                    <span class="summary-pill__label">Crédito</span>
                    <span class="summary-pill__value" id="dz-stat-credit">0</span>
                  </div>
                  <div class="summary-pill" role="listitem">
                    <span class="summary-pill__label">Débito</span>
                    <span class="summary-pill__value" id="dz-stat-debit">0</span>
                  </div>
                  <div class="summary-pill" role="listitem">
                    <span class="summary-pill__label">Transações</span>
                    <span class="summary-pill__value" id="dz-stat-transactions">0</span>
                  </div>
                  <div class="summary-pill" role="listitem">
                    <span class="summary-pill__label">Backup (Exportar)</span>
                    <span class="summary-pill__value" id="dz-stat-size-export">0 KB</span>
                  </div>
                  <div class="summary-pill" role="listitem">
                    <span class="summary-pill__label">Backup (Importado)</span>
                    <span class="summary-pill__value" id="dz-stat-size-imported">—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="dz-modal-backup" class="modal" aria-hidden="true" data-modal="backup">
          <div class="modal__overlay" data-action="close-settings-modal" data-modal="backup" aria-hidden="true"></div>
          <div class="modal__container modal__container--settings-topic" role="dialog" aria-modal="true" aria-labelledby="dz-modal-backup-title" aria-describedby="dz-modal-backup-desc">
            <header class="modal__header">
              <h3 id="dz-modal-backup-title" class="modal__title">Backup</h3>
              <button class="modal__close" type="button" data-action="close-settings-modal" data-modal="backup" aria-label="Fechar">✕</button>
            </header>
            <div class="modal__body">
              <p id="dz-modal-backup-desc" class="settings-modal__desc">Exporte um arquivo para guardar com segurança e importe quando precisar restaurar.</p>
              <div class="settings-modal">
                <div class="settings-modal__list">
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Exportar dados</span>
                      <span class="settings-modal__item-desc">Gera um arquivo com verificação de integridade.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--primary" data-action="export-all" type="button">Exportar</button>
                  </div>
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Importar backup</span>
                      <span class="settings-modal__item-desc">Mostra uma prévia antes de confirmar.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--primary" data-action="import-data" type="button">Importar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="dz-modal-limpeza" class="modal" aria-hidden="true" data-modal="limpeza">
          <div class="modal__overlay" data-action="close-settings-modal" data-modal="limpeza" aria-hidden="true"></div>
          <div class="modal__container modal__container--settings-topic" role="dialog" aria-modal="true" aria-labelledby="dz-modal-limpeza-title" aria-describedby="dz-modal-limpeza-desc">
            <header class="modal__header">
              <h3 id="dz-modal-limpeza-title" class="modal__title">Gerenciar Limpeza</h3>
              <button class="modal__close" type="button" data-action="close-settings-modal" data-modal="limpeza" aria-label="Fechar">✕</button>
            </header>
            <div class="modal__body">
              <p id="dz-modal-limpeza-desc" class="settings-modal__desc">Remove dados específicos para manter o app leve. Um backup automático é criado antes.</p>
              <div class="settings-modal">
                <div class="settings-modal__notice">
                  <span>⚠️ Esta ação é irreversível. Um backup automático será criado antes da limpeza.</span>
                </div>
                <div class="settings-modal__list">
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Limpar Categorias</span>
                      <span class="settings-modal__item-desc">Remove todas as categorias.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--warning" data-action="clear-categories" type="button">Limpar</button>
                  </div>
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Limpar Benefícios</span>
                      <span class="settings-modal__item-desc">Remove todos os benefícios.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--warning" data-action="clear-benefits" type="button">Limpar</button>
                  </div>
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Limpar Crédito</span>
                      <span class="settings-modal__item-desc">Remove todos os cartões.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--warning" data-action="clear-credit" type="button">Limpar</button>
                  </div>
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Limpar Débito</span>
                      <span class="settings-modal__item-desc">Remove todas as contas.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--warning" data-action="clear-debit" type="button">Limpar</button>
                  </div>
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Limpar Transações</span>
                      <span class="settings-modal__item-desc">Remove todos os lançamentos.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--warning" data-action="clear-transactions" type="button">Limpar</button>
                  </div>
                  <div class="settings-modal__item settings-modal__item--danger">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Limpar Tudo</span>
                      <span class="settings-modal__item-desc">Remove todos os dados do sistema.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--danger" data-action="clear-all" type="button">Limpar tudo</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="dz-modal-reset" class="modal" aria-hidden="true" data-modal="reset">
          <div class="modal__overlay" data-action="close-settings-modal" data-modal="reset" aria-hidden="true"></div>
          <div class="modal__container modal__container--settings-topic" role="dialog" aria-modal="true" aria-labelledby="dz-modal-reset-title" aria-describedby="dz-modal-reset-desc">
            <header class="modal__header">
              <h3 id="dz-modal-reset-title" class="modal__title">Acessar Reset</h3>
              <button class="modal__close" type="button" data-action="close-settings-modal" data-modal="reset" aria-label="Fechar">✕</button>
            </header>
            <div class="modal__body">
              <p id="dz-modal-reset-desc" class="settings-modal__desc">Ferramentas para limpar cache e, se necessário, resetar tudo (use com cuidado).</p>
              <div class="settings-modal">
                <div class="settings-modal__list">
                  <div class="settings-modal__item">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Limpar Cache</span>
                      <span class="settings-modal__item-desc">Remove o cache e força recarregamento.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--warning" data-action="clear-cache" type="button">Limpar</button>
                  </div>
                  <div class="settings-modal__item settings-modal__item--danger">
                    <div class="settings-modal__item-info">
                      <span class="settings-modal__item-title">Reset Completo</span>
                      <span class="settings-modal__item-desc">Apaga dados, cache e configurações.</span>
                    </div>
                    <button class="settings-modal__btn settings-modal__btn--danger" data-action="reset-app" type="button">Resetar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="dz-modal-logs" class="modal" aria-hidden="true" data-modal="logs">
          <div class="modal__overlay" data-action="close-settings-modal" data-modal="logs" aria-hidden="true"></div>
          <div class="modal__container modal__container--settings-topic" role="dialog" aria-modal="true" aria-labelledby="dz-modal-logs-title" aria-describedby="dz-modal-logs-desc">
            <header class="modal__header">
              <h3 id="dz-modal-logs-title" class="modal__title">Logs</h3>
              <button class="modal__close" type="button" data-action="close-settings-modal" data-modal="logs" aria-label="Fechar">✕</button>
            </header>
            <div class="modal__body">
              <p id="dz-modal-logs-desc" class="settings-modal__desc">Histórico de eventos e erros para ajudar a identificar problemas.</p>
              <div class="settings-modal">
                <div class="settings-modal__toolbar">
                  <button class="settings-modal__btn settings-modal__btn--warning" data-action="logs-clear" type="button">Limpar logs</button>
                </div>
                <div class="settings-modal__logs" id="system-log-root"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- Tutorial Modal -->
        <section id="dz-modal-tutorial" class="modal" aria-hidden="true" data-modal="tutorial">
          <div class="modal__overlay" data-action="close-settings-modal" data-modal="tutorial" aria-hidden="true"></div>
          <div class="modal__container modal__container--settings-topic" role="dialog" aria-modal="true" aria-labelledby="dz-modal-tutorial-title">
            <header class="modal__header">
              <h3 id="dz-modal-tutorial-title" class="modal__title">Guia de Uso</h3>
              <button class="modal__close" type="button" data-action="close-settings-modal" data-modal="tutorial" aria-label="Fechar">✕</button>
            </header>
            <div class="modal__body">
              <div class="tutorial-list">
                
                <div class="tutorial-step">
                  <div class="tutorial-step__header">
                    <div class="tutorial-step__number">1</div>
                    <h4 class="tutorial-step__title">Organize suas Categorias</h4>
                  </div>
                  <div class="tutorial-step__content">
                    O primeiro passo é definir seus grupos de gastos. Vá na aba <strong>Categorias</strong> e crie itens como "Alimentação", "Lazer" ou "Salário".
                    <div class="tutorial-example">
                      <div class="tut-card">🥗 Alimentação <span class="tut-badge">Saída</span></div>
                    </div>
                  </div>
                </div>

                <div class="tutorial-step">
                  <div class="tutorial-step__header">
                    <div class="tutorial-step__number">2</div>
                    <h4 class="tutorial-step__title">Cadastre suas Fontes</h4>
                  </div>
                  <div class="tutorial-step__content">
                    Configure onde seu dinheiro circula. Use as abas <strong>Benefícios</strong> para Vales, <strong>Crédito</strong> para Cartões e <strong>Débito</strong> para contas bancárias ou dinheiro físico.
                  </div>
                </div>

                <div class="tutorial-step">
                  <div class="tutorial-step__header">
                    <div class="tutorial-step__number">3</div>
                    <h4 class="tutorial-step__title">Registre no Extrato</h4>
                  </div>
                  <div class="tutorial-step__content">
                    Esta é a aba principal! Use o botão <strong>(+)</strong> para lançar novos gastos. O sistema atualizará os saldos de todas as suas contas automaticamente.
                    <div class="tutorial-example">
                      <div class="tut-card" style="border-left-color: #0ea5e9;">💰 Recebimento <span class="tut-badge" style="background: rgba(34, 197, 94, 0.2); color: #22c55e;">Entrada</span></div>
                    </div>
                  </div>
                </div>

                <div class="tutorial-step">
                  <div class="tutorial-step__header">
                    <div class="tutorial-step__number">4</div>
                    <h4 class="tutorial-step__title">Mantenha seu Backup</h4>
                  </div>
                  <div class="tutorial-step__content">
                    Como seus dados ficam salvos apenas no seu aparelho, lembre-se de vir aqui em <strong>Configurações</strong> e gerar um <strong>Backup</strong> regularmente para sua segurança.
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

      <!-- Modal de Confirmação -->
      <div class="danger-confirmation-modal" id="danger-confirm-modal" aria-hidden="true">
        <div class="danger-confirmation-modal__content">
          <div class="danger-confirmation-modal__header">
            <h3 class="danger-confirmation-modal__title" id="danger-confirm-title">
              ⚠️ Confirmar Ação
            </h3>
            <button class="danger-confirmation-modal__close" id="danger-confirm-close" type="button">
              ✕
            </button>
          </div>
          <div class="danger-confirmation-modal__body">
            <p class="danger-confirmation-modal__message" id="danger-confirm-message">
              Tem certeza que deseja continuar?
            </p>
            <div class="danger-confirmation-modal__warning" id="danger-confirm-warning" style="display: none;">
              ⚠️ Esta ação é irreversível!
            </div>
            <div class="danger-confirmation-modal__input-group" id="danger-confirm-input-group" style="display: none;">
              <label class="danger-confirmation-modal__label" for="danger-confirm-input">
                Digite <strong>CONFIRMAR</strong> para prosseguir:
              </label>
              <input
                type="text"
                class="danger-confirmation-modal__input"
                id="danger-confirm-input"
                placeholder="CONFIRMAR"
                autocomplete="off"
              />
            </div>
          </div>
          <div class="danger-confirmation-modal__footer">
            <button class="danger-card__button danger-card__button--secondary" id="danger-confirm-cancel" type="button">
              Cancelar
            </button>
            <button class="danger-card__button danger-card__button--danger" id="danger-confirm-ok" type="button">
              Confirmar
            </button>
          </div>
        </div>
      </div>
    `;

    // Salvar referências
    this.dangerZone = document.querySelector('.danger-zone');
    this.confirmModal = document.getElementById('danger-confirm-modal');

    // Modais independentes (Configurações)
    this._settingsModals = {
      resumo: document.getElementById('dz-modal-resumo'),
      backup: document.getElementById('dz-modal-backup'),
      limpeza: document.getElementById('dz-modal-limpeza'),
      reset: document.getElementById('dz-modal-reset'),
      logs: document.getElementById('dz-modal-logs'),
      tutorial: document.getElementById('dz-modal-tutorial')
    };

    this.statsElements = {
      categories: document.getElementById('dz-stat-categories'),
      benefits: document.getElementById('dz-stat-benefits'),
      credit: document.getElementById('dz-stat-credit'),
      debit: document.getElementById('dz-stat-debit'),
      transactions: document.getElementById('dz-stat-transactions'),
      sizeExport: document.getElementById('dz-stat-size-export'),
      sizeImported: document.getElementById('dz-stat-size-imported')
    };
  }

  /**
   * Atualiza as estatísticas do sistema
   * @private
   */
  _updateStats() {
    const stats = {
      categories: this.stores.categoryStore.count(),
      benefits: this.stores.benefitStore.count(),
      credit: this.stores.creditStore.count(),
      debit: this.stores.debitStore.count(),
      transactions: this.stores.transactionStore.count()
    };

    // ==================================================
    // Tamanho (aprox.): bytes reais (UTF-8)
    // - Objetivo: ficar próximo do tamanho do arquivo de backup
    // - Evita a métrica antiga (UTF-16 * 2) que inflava o número
    // ==================================================
    let totalBytes = 0;
    try {
      totalBytes = this._estimateCurrentBackupPayloadBytes();
    } catch (e) {
      console.warn('Erro ao calcular tamanho (UTF-8):', e);
      totalBytes = 0;
    }

    this._lastBackupBytes = totalBytes;

    // Atualizar DOM
    if (this.statsElements.categories) this.statsElements.categories.textContent = stats.categories;
    if (this.statsElements.benefits) this.statsElements.benefits.textContent = stats.benefits;
    if (this.statsElements.credit) this.statsElements.credit.textContent = stats.credit;
    if (this.statsElements.debit) this.statsElements.debit.textContent = stats.debit;
    if (this.statsElements.transactions) this.statsElements.transactions.textContent = stats.transactions;

    // ------------
    // Exibir Exportar | Importado
    // ------------
    this._updateSizeDisplay();
  }

  /**
   * Atualiza o texto/tooltip do campo de tamanho.
   * @private
   */
  _updateSizeDisplay() {
    const exportText = this._formatBytes(this._lastBackupBytes);
    const importedText = Number.isFinite(this._lastImportedBytes) ? this._formatBytes(this._lastImportedBytes) : '—';

    if (this.statsElements.sizeExport) {
      this.statsElements.sizeExport.textContent = exportText;
      this.statsElements.sizeExport.title = `Exportar (aprox.): ${exportText}`;
    }

    if (this.statsElements.sizeImported) {
      this.statsElements.sizeImported.textContent = importedText;
      this.statsElements.sizeImported.title = `Importado (último arquivo): ${importedText}`;
    }
  }

  /**
   * Lê do storage o tamanho do último arquivo importado (bytes).
   * @returns {number|null}
   * @private
   */
  _readLastImportedBytesFromStorage() {
    try {
      const raw = localStorage.getItem(this.LAST_IMPORTED_BYTES_KEY);
      if (raw == null) return null;

      const bytes = Number(raw);
      if (!Number.isFinite(bytes) || bytes < 0) return null;
      return bytes;
    } catch {
      return null;
    }
  }

  /**
   * Salva no storage o tamanho do último arquivo importado (bytes).
   * @param {number} bytes
   * @private
   */
  _setLastImportedBytes(bytes) {
    const safeBytes = Number(bytes);
    this._lastImportedBytes = Number.isFinite(safeBytes) && safeBytes >= 0 ? safeBytes : null;

    try {
      if (this._lastImportedBytes == null) {
        localStorage.removeItem(this.LAST_IMPORTED_BYTES_KEY);
      } else {
        localStorage.setItem(this.LAST_IMPORTED_BYTES_KEY, String(this._lastImportedBytes));
      }
    } catch {
      // Ignorar
    }

    this._updateSizeDisplay();
  }

  /**
   * Abre um modal de configurações (modais independentes).
   * @param {string} modalKey
   * @private
   */
  _openSettingsModal(modalKey) {
    const key = String(modalKey || '').trim();
    if (!key) return;

    const modal = this._settingsModals?.[key];
    if (!modal) return;

    // ------------
    // Garantir que apenas 1 modal fique aberto
    // ------------
    this._closeAllSettingsModals();

    // ------------
    // UX/A11Y: lembrar o foco para restaurar ao fechar
    // ------------
    this._lastFocusedElementBeforeModal = document.activeElement;

    // ------------
    // LOGS: renderizar ao abrir
    // ------------
    if (key === 'logs') {
      this._renderSystemLogs();
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    this._activeSettingsModalKey = key;

    // ------------
    // A11Y: mover foco para dentro do modal
    // ------------
    const closeButton = modal.querySelector('button[data-action="close-settings-modal"]');
    if (closeButton && typeof closeButton.focus === 'function') {
      closeButton.focus();
    }
  }

  /**
   * Fecha todos os modais de configurações.
   * @private
   */
  _closeAllSettingsModals() {
    const entries = Object.entries(this._settingsModals || {});
    for (const [, modal] of entries) {
      if (!modal) continue;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
    this._activeSettingsModalKey = null;
  }

  /**
   * Fecha um modal de configurações.
   * @param {string} modalKey
   * @private
   */
  _closeSettingsModal(modalKey) {
    const key = String(modalKey || '').trim();
    if (!key) return;

    const modal = this._settingsModals?.[key];
    if (!modal) return;

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');

    if (this._activeSettingsModalKey === key) {
      this._activeSettingsModalKey = null;
    }

    // ------------
    // UX/A11Y: devolver o foco para o botão que abriu
    // ------------
    const el = this._lastFocusedElementBeforeModal;
    this._lastFocusedElementBeforeModal = null;
    if (el && typeof el.focus === 'function') {
      el.focus();
    }
  }

  /**
   * Estima bytes UTF-8 de um texto.
   * @private
   */
  _estimateUtf8Bytes(text) {
    try {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text).length;
      }
    } catch {
      // fallback abaixo
    }

    // Fallback: Blob também reporta tamanho em bytes
    try {
      return new Blob([text]).size;
    } catch {
      return (text || '').length;
    }
  }

  /**
   * Formata bytes em KB/MB.
   * @private
   */
  _formatBytes(bytes) {
    const safe = Number.isFinite(bytes) ? bytes : 0;
    if (safe < 1024) return `${safe} B`;

    const kb = safe / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;

    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  /**
   * Estima o tamanho (bytes) do payload de backup sanitizado gerado a partir
   * dos dados atuais.
   * @private
   */
  _estimateCurrentBackupPayloadBytes() {
    // ------------
    // Monta payload parecido com o export (sem incluir auditoria)
    // ------------
    const appMeta = getAppMeta();
    const enriched = this._generateEnrichedSnapshot();

    const payload = {
      version: appMeta.version,
      build: appMeta.build,
      type: 'full-backup',
      summary: enriched.summary,
      data: enriched.data,
    };

    const sanitized = sanitizeBackupPayload(payload).payload;
    const jsonText = JSON.stringify(sanitized);
    return this._estimateUtf8Bytes(jsonText);
  }

  /**
   * Anexa event listeners
   * @private
   */
  _attachEventListeners() {
    if (!this.dangerZone) return;

    // Event delegation para botões de ação
    this.dangerZone.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.dataset.action;
      await this._handleAction(action, { actionBtn });
    });

    // Modal de confirmação
    const closeBtn = document.getElementById('danger-confirm-close');
    const cancelBtn = document.getElementById('danger-confirm-cancel');
    const okBtn = document.getElementById('danger-confirm-ok');

    if (closeBtn) closeBtn.addEventListener('click', () => this._closeConfirmModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeConfirmModal());
    if (okBtn) okBtn.addEventListener('click', () => this._executeConfirmedAction());

    // ==================================================
    // A11Y: fechar modal com ESC
    // ==================================================
    if (this._boundOnKeyDownEsc) {
      document.removeEventListener('keydown', this._boundOnKeyDownEsc);
    }

    this._boundOnKeyDownEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (!this._activeSettingsModalKey) return;
      e.preventDefault();
      this._closeSettingsModal(this._activeSettingsModalKey);
    };

    document.addEventListener('keydown', this._boundOnKeyDownEsc);
  }

  /**
   * Manipula ações dos botões
   * @private
   */
  async _handleAction(action, { actionBtn } = {}) {
    switch (action) {
      case 'open-settings-modal':
        this._openSettingsModal(actionBtn?.dataset?.modal);
        break;
      case 'close-settings-modal':
        this._closeSettingsModal(actionBtn?.dataset?.modal);
        break;
      case 'export-all':
        await this._exportAllData();
        break;
      case 'import-data':
        await this._importData();
        break;
      case 'clear-categories':
        this._showConfirmModal('categories');
        break;
      case 'clear-benefits':
        this._showConfirmModal('benefits');
        break;
      case 'clear-credit':
        this._showConfirmModal('credit');
        break;
      case 'clear-debit':
        this._showConfirmModal('debit');
        break;
      case 'clear-transactions':
        this._showConfirmModal('transactions');
        break;
      case 'clear-all':
        this._showConfirmModal('all');
        break;
      case 'clear-cache':
        this._showConfirmModal('cache');
        break;
      case 'reset-app':
        this._showConfirmModal('reset');
        break;
      case 'audit-clear':
        this.auditManager?.clear?.();
        this._showToast('✅ Histórico de auditoria limpo!', 'success');
        break;
      case 'logs-clear':
        this._clearSystemLogs();
        break;
    }
  }

  /**
   * Conecta o ErrorHandler global (quando disponível) para atualizar a UI de logs.
   * @private
   */
  _attachSystemLogsListener() {
    try {
      const errorHandler = window.__errorHandler;
      if (!errorHandler || typeof errorHandler.onError !== 'function') return;

      if (this._boundOnSystemError) return;

      this._boundOnSystemError = () => {
        // Re-render somente se o container existir (evita custo desnecessário)
        const root = document.getElementById('system-log-root');
        if (!root) return;
        this._renderSystemLogs();
      };

      errorHandler.onError(this._boundOnSystemError);
    } catch {
      // Ignorar
    }
  }

  /**
   * Renderiza logs do sistema usando o ErrorHandler global.
   * @private
   */
  _renderSystemLogs() {
    const root = document.getElementById('system-log-root');
    if (!root) return;

    const errorHandler = window.__errorHandler;
    const entries = errorHandler && typeof errorHandler.getHistory === 'function'
      ? errorHandler.getHistory({ limit: 60 })
      : [];

    root.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'audit-log';

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'audit-log__empty';
      empty.textContent = 'Sem erros/avisos recentes.';
      wrapper.appendChild(empty);
      root.appendChild(wrapper);
      return;
    }

    const list = document.createElement('div');
    list.className = 'audit-log__list';

    entries.forEach((entry) => {
      // ==================================================
      // Cada item recebe classes por severidade para permitir
      // destaque visual via CSS (AVISO/ERRO/CRÍTICO).
      // ==================================================
      const severityKey = this._getSystemLogSeverityKey(entry);

      const row = document.createElement('div');
      row.className = 'audit-log__item';

      if (severityKey) {
        row.classList.add(`audit-log__item--sev-${severityKey}`);
      }

      const time = document.createElement('span');
      time.className = 'audit-log__time';
      time.textContent = this._formatSystemLogTime(entry?.timestamp);

      const label = document.createElement('span');
      label.className = 'audit-log__label';

      // ------------ Badge (severidade)
      const badge = document.createElement('span');
      badge.className = `audit-log__badge audit-log__badge--${severityKey || 'info'}`;
      badge.textContent = this._getSystemLogSeverityLabel(severityKey);

      // ------------ Categoria (opcional)
      const categoryText = this._getSystemLogCategoryLabel(entry);
      const category = document.createElement('span');
      category.className = 'audit-log__meta';
      category.textContent = categoryText;

      // ------------ Mensagem
      const message = document.createElement('span');
      message.className = 'audit-log__message';
      message.textContent = this._getSystemLogMessage(entry);

      label.appendChild(badge);
      if (categoryText) label.appendChild(category);
      label.appendChild(message);

      row.appendChild(time);
      row.appendChild(label);
      list.appendChild(row);
    });

    wrapper.appendChild(list);
    root.appendChild(wrapper);
  }

  /**
   * Limpa o histórico do ErrorHandler e atualiza a UI.
   * @private
   */
  _clearSystemLogs() {
    try {
      window.__errorHandler?.clearHistory?.();
      this._renderSystemLogs();
      this._showToast('✅ Logs do sistema limpos!', 'success');
    } catch {
      this._showToast('❌ Não foi possível limpar os logs', 'error');
    }
  }

  /**
   * Formata data/hora do log (compacto).
   * @private
   */
  _formatSystemLogTime(iso) {
    try {
      const dt = iso ? new Date(iso) : null;
      if (!dt || Number.isNaN(dt.getTime())) return '';
      return dt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  /**
   * Formata a linha do log com severidade e mensagem.
   * @private
   */
  _formatSystemLogLabel(entry) {
    const severity = String(entry?.severity || '').toLowerCase();
    const category = String(entry?.category || '').toLowerCase();
    const message = String(entry?.message || '').trim();

    const severityLabelMap = {
      low: 'AVISO',
      medium: 'ERRO',
      high: 'ERRO',
      critical: 'CRÍTICO'
    };

    const sev = severityLabelMap[severity] || 'INFO';
    const cat = category ? ` (${category})` : '';
    return `[${sev}]${cat} ${message || 'Sem mensagem'}`;
  }

  /**
   * Normaliza a severidade para uma chave segura (low|medium|high|critical|info).
   * @private
   */
  _getSystemLogSeverityKey(entry) {
    const raw = String(entry?.severity || '').toLowerCase().trim();
    if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'critical') return raw;
    return 'info';
  }

  /**
   * Retorna o texto do badge de severidade.
   * @private
   */
  _getSystemLogSeverityLabel(severityKey) {
    const key = String(severityKey || '').toLowerCase();
    const map = {
      low: 'AVISO',
      medium: 'ERRO',
      high: 'ERRO',
      critical: 'CRÍTICO',
      info: 'INFO'
    };
    return map[key] || 'INFO';
  }

  /**
   * Retorna a categoria do erro (se existir) em formato amigável.
   * @private
   */
  _getSystemLogCategoryLabel(entry) {
    const category = String(entry?.category || '').toLowerCase().trim();
    if (!category) return '';

    // ==================================================
    // Tradução das categorias internas (ErrorHandler)
    // ==================================================
    const map = {
      network: 'Rede',
      storage: 'Armazenamento',
      validation: 'Validação',
      permission: 'Permissão',
      runtime: 'Execução',
      unknown: 'Desconhecido'
    };

    const label = map[category] || category;
    return `(${label})`;
  }

  /**
   * Formata uma URL de forma segura e curta para exibição.
   * @private
   */
  _formatSystemLogUrl(rawUrl) {
    try {
      if (!rawUrl) return '';

      // args[0] do fetch pode ser string, URL ou Request
      const urlString = typeof rawUrl === 'string'
        ? rawUrl
        : (rawUrl?.url ? String(rawUrl.url) : String(rawUrl));

      const url = new URL(urlString, window.location.href);
      // Mostrar só path + query (mais útil e discreto)
      return `${url.pathname}${url.search}`;
    } catch {
      try {
        return String(rawUrl || '').slice(0, 140);
      } catch {
        return '';
      }
    }
  }

  /**
   * Retorna a mensagem principal do log.
   * @private
   */
  _getSystemLogMessage(entry) {
    const rawMessage = String(entry?.message || '').trim();

    // ==================================================
    // Tradução de mensagens comuns (sem perder o contexto)
    // ==================================================
    let message = rawMessage;
    if (message === 'Failed to fetch') {
      message = 'Falha ao acessar a rede (fetch).';
    }

    // ------------
    // Service Worker: falhas de update (comum em deploy/GitHub Pages)
    // ------------
    if (
      message.includes('Failed to update a ServiceWorker for scope') &&
      message.includes('bad HTTP response code (404)')
    ) {
      message = 'Falha ao atualizar o Service Worker: o arquivo sw.js retornou 404.';
    }

    if (message === 'ResizeObserver loop completed with undelivered notifications.') {
      message = 'ResizeObserver: loop concluído com notificações pendentes.';
    }

    if (message === 'ResizeObserver loop limit exceeded') {
      message = 'ResizeObserver: limite de loop excedido.';
    }

    // ==================================================
    // Enriquecimento com metadados (quando disponíveis)
    // ==================================================
    const meta = entry?.metadata || {};
    const context = String(meta?.context || entry?.context || '').trim();
    const status = Number.isFinite(meta?.status) ? meta.status : null;
    const urlText = this._formatSystemLogUrl(meta?.url);

    if (status && urlText) {
      // Ex: Erro HTTP 404 em /caminho?x=1
      return `Erro HTTP ${status} em ${urlText}`;
    }

    if (urlText) {
      const base = message || 'Evento sem mensagem.';
      return `${base} (${urlText})`;
    }

    if (context && context !== 'unknown') {
      const base = message || 'Evento sem mensagem.';
      return `${base} (origem: ${context})`;
    }

    return message || 'Sem mensagem';
  }

  /**
   * Exporta todos os dados
    * Formato enriquecido com totais calculados e snapshot completo
   * @private
   */
  async _exportAllData() {
    try {
      const now = new Date();
      const localDateTime = dateUtils.formatDateTime(now);
      const enrichedData = this._generateEnrichedSnapshot();

      // ------------ Metadados do app
      const appMeta = getAppMeta();

      const payload = {
        version: appMeta.version,
        build: appMeta.build,
        exportDate: now.toISOString(),
        exportDateLocal: localDateTime,
        timestamp: Date.now(),
        type: 'full-backup',
        summary: enrichedData.summary,

        // Dados brutos
        data: enrichedData.data
      };

      // ------------ Sanitiza para export (remove campos "_" e deduplica por id)
      const sanitizedExport = sanitizeBackupPayload(payload).payload;

      console.log(`📦 Exportando backup - ${localDateTime}`);
      console.log('📊 Resumo:', enrichedData.summary);

      // ------------ Envelope com integridade (hash)
      const envelope = await createBackupEnvelope({ payload: sanitizedExport });
      const timestamp = Date.now();
      const filename = `controle-financeiro-backup-${timestamp}.json`;

      downloadTextFile({
        filename,
        text: JSON.stringify(envelope),
        mimeType: 'application/json',
      });

      if (envelope.warning) {
        this._showToast(`⚠️ ${envelope.warning}`, 'warning');
      }

      this._showToast('✅ Backup completo exportado!', 'success');

      // ==================================================
      // AUDITORIA
      // ==================================================
      this.auditManager?.log?.({
        action: 'backup',
        label: 'exportou backup',
        meta: { build: payload?.build, version: payload?.version }
      });
    } catch (error) {
      console.error('Erro ao exportar:', error);
      this._showToast('❌ Erro ao exportar dados', 'error');
    }
  }

  /**
   * Gera snapshot enriquecido com todos os totais calculados
    * Garante que todos os valores estão corretos no momento do backup
   * @private
   */
  _generateEnrichedSnapshot() {
    const { categoryStore, benefitStore, creditStore, debitStore, transactionStore } = this.stores;

    // ------------ Dados brutos (sem campos calculados "_")
    const benefits = benefitStore.getAll();
    const credit = creditStore.getAll();
    const debit = debitStore.getAll();
    const transactions = transactionStore.getAll();

    // ------------ Cálculos (somente para summary)
    const benefitsLimit = benefits.map(b => parseFloat(b.limit) || 0);
    const benefitsUsed = benefits.map(b => parseFloat(b.used) || 0);
    const benefitsAvailable = benefitsLimit.map((limit, idx) => limit - (benefitsUsed[idx] || 0));

    const creditLimit = credit.map(c => parseFloat(c.limit) || 0);
    const creditUsed = credit.map(c => parseFloat(c.used) || 0);
    const creditAvailable = creditLimit.map((limit, idx) => limit - (creditUsed[idx] || 0));

    const debitBalance = debit.map(d => parseFloat(d.balance) || 0);

    // Calcular totais
    const totalBenefitsLimit = benefitsLimit.reduce((sum, v) => sum + v, 0);
    const totalBenefitsUsed = benefitsUsed.reduce((sum, v) => sum + v, 0);
    const totalBenefitsAvailable = benefitsAvailable.reduce((sum, v) => sum + v, 0);

    const totalCreditLimit = creditLimit.reduce((sum, v) => sum + v, 0);
    const totalCreditUsed = creditUsed.reduce((sum, v) => sum + v, 0);
    const totalCreditAvailable = creditAvailable.reduce((sum, v) => sum + v, 0);

    const totalDebitBalance = debitBalance.reduce((sum, v) => sum + v, 0);

    const totalEntradas = transactions.filter(t => t.type === 'entrada').reduce((sum, t) => sum + (parseFloat(t.value) || 0), 0);
    const totalSaidas = transactions.filter(t => t.type === 'saida').reduce((sum, t) => sum + (parseFloat(t.value) || 0), 0);

    return {
      summary: {
        benefits: {
          count: benefits.length,
          totalLimit: totalBenefitsLimit,
          totalUsed: totalBenefitsUsed,
          totalAvailable: totalBenefitsAvailable
        },
        credit: {
          count: credit.length,
          totalLimit: totalCreditLimit,
          totalUsed: totalCreditUsed,
          totalAvailable: totalCreditAvailable
        },
        debit: {
          count: debit.length,
          totalBalance: totalDebitBalance
        },
        transactions: {
          count: transactions.length,
          totalEntradas: totalEntradas,
          totalSaidas: totalSaidas,
          saldo: totalEntradas - totalSaidas
        },
        categories: {
          count: categoryStore.count()
        },
        grandTotal: totalDebitBalance + totalCreditAvailable + totalBenefitsAvailable
      },
      data: {
        categories: categoryStore.getAll(),
        benefits,
        credit,
        debit,
        transactions: transactions
      }
    };
  }



  /**
   * Importa dados de arquivo JSON com backup e rollback automático
   * @private
   */
  async _importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // ------------
      // Guardar o tamanho real do arquivo selecionado
      // ------------
      this._setLastImportedBytes(file.size);

      // ==================================================
      // Rollback em memória (não aumenta o localStorage)
      // ==================================================
      let rollbackSnapshot = null;

      try {
        const text = await file.text();

        // ------------ Parse (novo + legado) + verificação de integridade quando disponível
        const parsed = await parseBackupEnvelopeFromJsonText(text);
        const data = parsed.payload;

        // ------------ Validação mínima
        if (!data?.data || typeof data.data !== 'object') {
          throw new Error('Formato de backup inválido');
        }

        // ------------ Sanitização (remove campos "_" e deduplica por id) + pré-visualização
        const sanitized = sanitizeBackupPayload(data);
        const sanitizedPayload = sanitized.payload;

        const previewText = formatBackupPreviewMessage({
          payload: sanitizedPayload,
          verified: parsed.verified,
          warning: parsed.warning,
        });
        const confirmImport = await this.confirmationModal.show(
          'Importar Backup',
          textToSafeHtml(previewText),
          'Importar',
          'Cancelar'
        );
        if (!confirmImport) {
          this._showToast('ℹ️ Importação cancelada.', 'info');
          return;
        }

        // ------------ Snapshot em memória para rollback (evita duplicar dados no storage)
        rollbackSnapshot = this._createInMemoryRollbackSnapshotForImport();
        if (!rollbackSnapshot) {
          throw new Error('Não foi possível preparar o rollback de segurança');
        }

        try {
          // Importar dados (ordem importa: contas primeiro, depois transações)
          console.log('📥 Iniciando importação de dados...');
          if (this.stores.benefitStore.setImportMode) {
            this.stores.benefitStore.setImportMode(true);
          }
          if (this.stores.benefitStore.stopAutoReloadCheck) {
            this.stores.benefitStore.stopAutoReloadCheck();
            console.log('⏸️ Auto-reload pausado durante importação');
          }

          // 1. Importar categorias
          this.stores.categoryStore.setAll(sanitized.data.categories);

          // 2. Importar contas de débito (Snapshot)
          this.stores.debitStore.setAll(sanitized.data.debit);

          // 3. Importar cartões de crédito (Snapshot)
          // (Usa setAll para preservar campos como "used")
          this.stores.creditStore.setAll(sanitized.data.credit);

          // 4. Importar benefícios (Snapshot)
          // (Usa setAll para preservar campos como "used")
          this.stores.benefitStore.setAll(sanitized.data.benefits);

          // 5. Importar transações (Snapshot)
          this.stores.transactionStore.setAll(sanitized.data.transactions);

          // Recalcular saúde dos dados após importação (conserta saldos de crédito e benefícios)
          runDataHealthRepair(this.stores);

          this._refreshUI();

          this._showToast('✅ Dados importados com sucesso!', 'success');

          // ==================================================
          // AUDITORIA
          // ==================================================
          this.auditManager?.log?.({
            action: 'backup',
            label: 'importou backup',
            meta: { verified: parsed?.verified, warning: parsed?.warning }
          });
        } catch (importError) {
          // Rollback automático em caso de erro
          console.error('❌ Erro ao importar, fazendo rollback...', importError);

          if (rollbackSnapshot) {
            const rollbackResult = await this._restoreFromSnapshotPayload(rollbackSnapshot);
            if (rollbackResult.success) {
              this._showToast('⚠️ Erro ao importar! Dados anteriores restaurados.', 'warning');
            } else {
              this._showToast('❌ ERRO CRÍTICO: Falha ao importar e restaurar!', 'error');
            }
          }

          throw importError;
        } finally {
          // Garantir que o auto-reload volte a funcionar após qualquer importação
          try {
            if (this.stores.benefitStore.setImportMode) {
              this.stores.benefitStore.setImportMode(false);
            }
            if (this.stores.benefitStore.startAutoReloadCheck) {
              this.stores.benefitStore.startAutoReloadCheck(TIMINGS.BENEFIT_RELOAD_CHECK);
              console.log('▶️ Auto-reload retomado após importação');
            }
          } catch (resumeError) {
            console.warn('⚠️ Falha ao retomar auto-reload após importação:', resumeError);
          }
        }
      } catch (error) {
        console.error('❌ Erro ao importar:', error);
        this._showToast('❌ Erro ao importar dados: ' + error.message, 'error');
      }
    };

    input.click();
  }

  /**
   * Cria um snapshot em memória do estado atual para rollback durante importação.
   * Não persiste no localStorage para evitar duplicação e aumento de tamanho.
   * @private
   * @returns {object|null}
   */
  _createInMemoryRollbackSnapshotForImport() {
    try {
      const now = new Date();
      const appMeta = getAppMeta();

      const snapshot = {
        version: appMeta.version,
        build: appMeta.build,
        exportDate: now.toISOString(),
        exportDateLocal: dateUtils.formatDateTime(now),
        timestamp: Date.now(),
        type: 'in-memory-rollback',
        action: 'before-import',
        data: {
          categories: this.stores.categoryStore.getAll(),
          benefits: this.stores.benefitStore.getAll(),
          credit: this.stores.creditStore.getAll(),
          debit: this.stores.debitStore.getAll(),
          transactions: this.stores.transactionStore.getAll(),
        },
      };

      // ------------ Sanitiza para manter o mesmo padrão dos backups
      return sanitizeBackupPayload(snapshot).payload;
    } catch (error) {
      console.error('❌ Falha ao criar snapshot de rollback em memória:', error);
      return null;
    }
  }

  /**
   * Restaura stores a partir de um payload (em memória) no mesmo formato de backup.
   * @private
   * @param {object} payload
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  async _restoreFromSnapshotPayload(payload) {
    try {
      const sanitized = sanitizeBackupPayload(payload);

      if (this.stores.benefitStore.setImportMode) {
        this.stores.benefitStore.setImportMode(true);
      }
      if (this.stores.benefitStore.stopAutoReloadCheck) {
        this.stores.benefitStore.stopAutoReloadCheck();
      }

      try {
        this.stores.categoryStore.setAll(sanitized.data.categories);
        this.stores.benefitStore.setAll(sanitized.data.benefits);
        this.stores.creditStore.setAll(sanitized.data.credit);
        this.stores.debitStore.setAll(sanitized.data.debit);
        this.stores.transactionStore.setAll(sanitized.data.transactions);
      } finally {
        // Retomar auto-reload do benefício com segurança
        try {
          if (this.stores.benefitStore.setImportMode) {
            this.stores.benefitStore.setImportMode(false);
          }
          if (this.stores.benefitStore.startAutoReloadCheck) {
            this.stores.benefitStore.startAutoReloadCheck(TIMINGS.BENEFIT_RELOAD_CHECK);
          }
        } catch (resumeError) {
          console.warn('⚠️ Falha ao retomar auto-reload após rollback:', resumeError);
        }
      }

      // Recalcular saúde dos dados após rollback (garante consistência)
      runDataHealthRepair(this.stores);

      this._refreshUI();
      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao restaurar snapshot em memória:', error);
      return { success: false, error };
    }
  }

  /**
   * Cria backup automático com timestamp e gerenciamento de histórico
   * @private
   * @param {string} actionType - Tipo de ação que gerou o backup
   * @returns {Promise<{success: boolean, backupKey?: string, error?: Error}>}
   */
  async _createAutoBackup(actionType = 'manual') {
    try {
      const timestamp = Date.now();
      const now = new Date();
      const appMeta = getAppMeta();
      const backupData = {
        version: appMeta.version,
        build: appMeta.build,
        exportDate: now.toISOString(),
        exportDateLocal: dateUtils.formatDateTime(now),
        timestamp: timestamp,
        type: 'auto-backup',
        action: actionType,
        data: {
          categories: this.stores.categoryStore.getAll(),
          benefits: this.stores.benefitStore.getAll(),
          credit: this.stores.creditStore.getAll(),
          debit: this.stores.debitStore.getAll(),
          transactions: this.stores.transactionStore.getAll()
        }
      };

      // ------------ Sanitiza auto-backup (evita persistir campos "_" e duplicações)
      const sanitizedAutoBackup = sanitizeBackupPayload(backupData).payload;

      // Gerar chave única do backup
      const backupKey = `${this.BACKUP_PREFIX}${actionType}:${timestamp}`;

      // Tentar salvar backup
      try {
        localStorage.setItem(backupKey, JSON.stringify(sanitizedAutoBackup));

        // Salvar referência do último backup
        localStorage.setItem(this.AUTO_BACKUP_KEY, backupKey);

        // Limpar backups antigos (manter apenas os últimos N)
        this._cleanOldBackups();

        console.log(`💾 Backup automático criado: ${backupKey}`);
        this._showToast(`💾 Backup criado: ${new Date(timestamp).toLocaleString()}`, 'info');

        return { success: true, backupKey };
      } catch (storageError) {
        // Se falhar por falta de espaço, tentar limpar backups e tentar novamente
        console.warn('⚠️ Espaço insuficiente, limpando backups antigos...');
        this._cleanOldBackups(true); // Forçar limpeza agressiva

        try {
          localStorage.setItem(backupKey, JSON.stringify(sanitizedAutoBackup));
          localStorage.setItem(this.AUTO_BACKUP_KEY, backupKey);
          console.log(`💾 Backup criado após limpeza: ${backupKey}`);
          return { success: true, backupKey };
        } catch (retryError) {
          throw new Error('Espaço insuficiente para criar backup');
        }
      }
    } catch (error) {
      console.error('❌ Erro ao criar backup automático:', error);
      this._showToast('❌ Falha ao criar backup de segurança', 'error');
      return { success: false, error };
    }
  }

  /**
   * Limpa backups antigos mantendo apenas os mais recentes
   * @private
   * @param {boolean} aggressive - Se true, limpa todos exceto o último
   */
  _cleanOldBackups(aggressive = false) {
    try {
      const backupKeys = [];

      // Encontrar todas as chaves de backup
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.BACKUP_PREFIX)) {
          // Extrair timestamp da chave
          const parts = key.split(':');
          const timestamp = parseInt(parts[parts.length - 1]);
          if (!isNaN(timestamp)) {
            backupKeys.push({ key, timestamp });
          }
        }
      }

      // Ordenar por timestamp (mais recente primeiro)
      backupKeys.sort((a, b) => b.timestamp - a.timestamp);

      // Determinar quantos manter
      const keepCount = aggressive ? 1 : this.MAX_BACKUPS;

      // Remover backups excedentes
      if (backupKeys.length > keepCount) {
        const toRemove = backupKeys.slice(keepCount);
        toRemove.forEach(({ key }) => {
          localStorage.removeItem(key);
          console.log(`🗑️ Backup removido: ${key}`);
        });

        console.log(`✅ ${toRemove.length} backup(s) antigo(s) removido(s)`);
      }
    } catch (error) {
      console.error('❌ Erro ao limpar backups antigos:', error);
    }
  }

  /**
   * Restaura dados de um backup específico
   * @private
   * @param {string} backupKey - Chave do backup a restaurar
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  async _restoreFromBackup(backupKey) {
    try {
      const backupData = localStorage.getItem(backupKey);

      if (!backupData) {
        throw new Error('Backup não encontrado');
      }

      // ------------ Aceita backup interno (legado) e envelope v2
      let data = JSON.parse(backupData);
      if (data && data.format === 'controle-financeiro-backup' && data.schemaVersion === 2) {
        const parsed = await parseBackupEnvelopeFromJsonText(backupData);
        data = parsed.payload;
      }

      // ------------ Sanitização (remove campos "_" e deduplica por id)
      const sanitized = sanitizeBackupPayload(data);
      data = sanitized.payload;

      // Validar estrutura do backup
      if (!data?.data || typeof data.data !== 'object') {
        throw new Error('Formato de backup inválido');
      }

      console.log(`🔄 Restaurando backup de: ${data.exportDate}`);

      // Criar backup do estado atual antes de restaurar
      await this._createAutoBackup('before-restore');

      // ------------ Restaurar cada store (substitutivo, sem usar add())
      // Motivo: add() pode recalcular/alterar campos (ex.: used=0) e gerar inconsistências.
      const restoreOperations = ['categorias', 'benefícios', 'crédito', 'débito', 'transações'];

      if (this.stores.benefitStore.setImportMode) {
        this.stores.benefitStore.setImportMode(true);
      }
      if (this.stores.benefitStore.stopAutoReloadCheck) {
        this.stores.benefitStore.stopAutoReloadCheck();
      }

      try {
        this.stores.categoryStore.setAll(sanitized.data.categories);
        this.stores.benefitStore.setAll(sanitized.data.benefits);
        this.stores.creditStore.setAll(sanitized.data.credit);
        this.stores.debitStore.setAll(sanitized.data.debit);
        this.stores.transactionStore.setAll(sanitized.data.transactions);
      } finally {
        // Retomar auto-reload do benefício com segurança
        try {
          if (this.stores.benefitStore.setImportMode) {
            this.stores.benefitStore.setImportMode(false);
          }
          if (this.stores.benefitStore.startAutoReloadCheck) {
            this.stores.benefitStore.startAutoReloadCheck(TIMINGS.BENEFIT_RELOAD_CHECK);
          }
        } catch (resumeError) {
          console.warn('⚠️ Falha ao retomar auto-reload após restore:', resumeError);
        }
      }

      // Recalcular saúde dos dados após restore (garante consistência)
      runDataHealthRepair(this.stores);

      this._refreshUI();

      const message = `✅ Backup restaurado: ${restoreOperations.join(', ')}`;
      console.log(message);
      this._showToast(message, 'success');

      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao restaurar backup:', error);
      this._showToast(`❌ Falha ao restaurar: ${error.message}`, 'error');
      return { success: false, error };
    }
  }

  /**
   * Lista todos os backups disponíveis
   * @returns {Array<{key: string, date: string, action: string, size: number}>}
   */
  listBackups() {
    const backups = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.BACKUP_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            backups.push({
              key: key,
              date: data.exportDate || 'Desconhecido',
              action: data.action || 'manual',
              timestamp: data.timestamp || 0,
              size: localStorage.getItem(key).length
            });
          } catch (parseError) {
            console.warn(`⚠️ Backup corrompido: ${key}`);
          }
        }
      }

      // Ordenar por timestamp (mais recente primeiro)
      backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('❌ Erro ao listar backups:', error);
    }

    return backups;
  }

  /**
   * Remove um backup específico
   * @param {string} backupKey - Chave do backup a remover
   * @returns {boolean}
   */
  removeBackup(backupKey) {
    try {
      if (localStorage.getItem(backupKey)) {
        localStorage.removeItem(backupKey);
        console.log(`🗑️ Backup removido: ${backupKey}`);
        this._showToast('🗑️ Backup removido com sucesso', 'success');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Erro ao remover backup:', error);
      this._showToast('❌ Erro ao remover backup', 'error');
      return false;
    }
  }

  /**
   * Mostra modal de confirmação
   * @private
   */
  _showConfirmModal(actionType) {
    if (!this.confirmModal) return;

    const title = document.getElementById('danger-confirm-title');
    const message = document.getElementById('danger-confirm-message');
    const warning = document.getElementById('danger-confirm-warning');
    const inputGroup = document.getElementById('danger-confirm-input-group');
    const input = document.getElementById('danger-confirm-input');

    // Configurar modal baseado na ação
    const configs = {
      categories: {
        title: '🗑️ Limpar Categorias',
        message: 'Deseja remover todas as categorias? Esta ação não pode ser desfeita.',
        requireInput: false
      },
      benefits: {
        title: '🗑️ Limpar Benefícios',
        message: 'Deseja remover todos os benefícios? Esta ação não pode ser desfeita.',
        requireInput: false
      },
      credit: {
        title: '🗑️ Limpar Crédito',
        message: 'Deseja remover todos os cartões de crédito? Esta ação não pode ser desfeita.',
        requireInput: false
      },
      debit: {
        title: '🗑️ Limpar Débito',
        message: 'Deseja remover todas as contas de débito? Esta ação não pode ser desfeita.',
        requireInput: false
      },
      transactions: {
        title: '🗑️ Limpar Transações',
        message: 'Deseja remover todas as transações? Esta ação não pode ser desfeita.',
        requireInput: false
      },
      all: {
        title: '💣 Limpar Tudo',
        message: 'Deseja remover TODOS os dados do sistema? Esta é uma ação IRREVERSÍVEL.',
        requireInput: true
      },
      cache: {
        title: '🔄 Limpar Cache',
        message: 'Deseja limpar o cache do PWA? O aplicativo será recarregado.',
        requireInput: false
      },
      reset: {
        title: '⚙️ Reset Completo',
        message: 'Deseja restaurar o aplicativo ao estado inicial? TODOS os dados e configurações serão perdidos.',
        requireInput: true
      }
    };

    const config = configs[actionType];
    if (!config) return;

    // Atualizar conteúdo
    if (title) title.textContent = config.title;
    if (message) message.textContent = config.message;
    if (warning) warning.style.display = 'block';
    if (inputGroup) inputGroup.style.display = config.requireInput ? 'block' : 'none';
    if (input) input.value = '';

    // Salvar ação pendente
    this._pendingAction = actionType;

    // Abrir modal
    this.confirmModal.classList.add('is-open');
    this.confirmModal.setAttribute('aria-hidden', 'false');
  }

  /**
   * Fecha modal de confirmação
   * @private
   */
  _closeConfirmModal() {
    if (!this.confirmModal) return;

    this.confirmModal.classList.remove('is-open');
    this.confirmModal.setAttribute('aria-hidden', 'true');
    this._pendingAction = null;
  }

  /**
   * Executa ação confirmada
   * @private
   */
  async _executeConfirmedAction() {
    if (!this._pendingAction) return;

    const input = document.getElementById('danger-confirm-input');
    const inputGroup = document.getElementById('danger-confirm-input-group');

    // Verificar se precisa de confirmação textual
    if (inputGroup && inputGroup.style.display !== 'none') {
      if (!input || input.value !== 'CONFIRMAR') {
        this._showToast('❌ Digite "CONFIRMAR" para prosseguir', 'error');
        return;
      }
    }

    // Executar ação (backup automático é criado dentro de cada método)
    switch (this._pendingAction) {
      case 'categories':
        await this._clearCategories();
        break;
      case 'benefits':
        await this._clearBenefits();
        break;
      case 'credit':
        await this._clearCredit();
        break;
      case 'debit':
        await this._clearDebit();
        break;
      case 'transactions':
        await this._clearTransactions();
        break;
      case 'all':
        await this._clearAll();
        break;
      case 'cache':
        await this._clearCache();
        break;
      case 'reset':
        await this._resetApp();
        break;
    }

    this._closeConfirmModal();
  }

  /**
    * Limpa categorias SEM backup
   * @private
   */
  async _clearCategories() {
    const result = await this._clearStore('categories', this.stores.categoryStore);
    if (result.success) {
      this._refreshUI();
      this._showToast('✅ Categorias removidas (sem backup)', 'success');
    }
  }

  /**
    * Limpa benefícios SEM backup
   * @private
   */
  async _clearBenefits() {
    const result = await this._clearStore('benefits', this.stores.benefitStore);
    if (result.success) {
      this._refreshUI();
      this._showToast('✅ Benefícios removidos (sem backup)', 'success');
    }
  }

  /**
    * Limpa crédito SEM backup
   * @private
   */
  async _clearCredit() {
    const result = await this._clearStore('credit', this.stores.creditStore);
    if (result.success) {
      this._refreshUI();
      this._showToast('✅ Cartões de crédito removidos (sem backup)', 'success');
    }
  }

  /**
    * Limpa débito SEM backup
   * @private
   */
  async _clearDebit() {
    const result = await this._clearStore('debit', this.stores.debitStore);
    if (result.success) {
      this._refreshUI();
      this._showToast('✅ Contas de débito removidas (sem backup)', 'success');
    }
  }

  /**
    * Limpa transações SEM backup
   * @private
   */
  async _clearTransactions() {
    const result = await this._clearStore('transactions', this.stores.transactionStore);
    if (result.success) {
      this._refreshUI();
      this._showToast('✅ Transações removidas (sem backup)', 'success');
    }
  }

  /**
    * Limpa TUDO COM backup automático
   * ÚNICA opção que cria backup
   * @private
   */
  async _clearAll() {
    const result = await this._clearAllWithBackup();
    if (result.success) {
      this._refreshUI();
      this._showToast(`✅ Todos os dados removidos (backup criado: ${result.backupKey})`, 'success');
    }
  }

  /**
    * Limpa store INDIVIDUAL sem backup
   * Usado para: categorias, benefícios, crédito, débito, transações
   * @private
   * @param {string} storeName - Nome do store a limpar
   * @param {Object} storeInstance - Instância do store
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  async _clearStore(storeName, storeInstance) {
    try {
      if (!storeInstance) {
        throw new Error('Store não fornecido');
      }

      console.log(`🗑️ Limpando ${storeName} (sem backup)`);
      storeInstance.clear();
      console.log(`✅ ${storeName} limpo com sucesso`);

      return { success: true };
    } catch (error) {
      console.error(`❌ Erro ao limpar ${storeName}:`, error);
      this._showToast(`❌ Erro ao limpar: ${error.message}`, 'error');
      return { success: false, error };
    }
  }

  /**
    * Limpa TUDO com backup automático
   * Usado APENAS para: Limpar Tudo
   * @private
   * @returns {Promise<{success: boolean, backupKey?: string, error?: Error}>}
   */
  async _clearAllWithBackup() {
    try {
      // 1. Criar backup automático APENAS ao limpar tudo
      console.log('💾 Criando backup antes de limpar tudo...');
      const backupResult = await this._createAutoBackup('clear-all');

      if (!backupResult.success) {
        throw new Error('Falha ao criar backup de segurança');
      }

      console.log(`💾 Backup criado: ${backupResult.backupKey}`);

      // 2. Executar limpeza de TODOS os stores
      try {
        this.stores.categoryStore.clear();
        this.stores.benefitStore.clear();
        this.stores.creditStore.clear();
        this.stores.debitStore.clear();
        this.stores.transactionStore.clear();

        console.log('✅ Todos os dados limpos com sucesso');
        return { success: true, backupKey: backupResult.backupKey };
      } catch (clearError) {
        // 3. Se falhar, fazer rollback automático
        console.error('❌ Erro ao limpar, fazendo rollback...', clearError);

        const rollbackResult = await this._restoreFromBackup(backupResult.backupKey);

        if (rollbackResult.success) {
          this._showToast('⚠️ Erro ao limpar! Dados restaurados do backup.', 'warning');
        } else {
          this._showToast('❌ ERRO CRÍTICO: Falha ao limpar e restaurar!', 'error');
        }

        return { success: false, error: clearError };
      }
    } catch (error) {
      console.error('❌ Erro ao limpar tudo:', error);
      this._showToast(`❌ Erro ao limpar: ${error.message}`, 'error');
      return { success: false, error };
    }
  }

  /**
   * Limpa cache do PWA
   * @private
   */
  async _clearCache() {
    try {
      // ==============================
      // Service Worker
      // (desregistrar antes de limpar)
      // ==============================
      await this._unregisterAllServiceWorkers();

      // ==============================
      // CacheStorage
      // (apagar SOMENTE caches do app)
      // ==============================
      await this._deleteOnlyAppCaches();

      this._showToast('✅ Cache e Service Worker limpos. Recarregando...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      this._showToast('❌ Falha ao limpar cache.', 'error', {
        id: 'danger-zone:clear-cache-failed',
        actionLabel: 'Tentar novamente',
        onAction: () => this._clearCache()
      });
    }
  }

  /**
   * Desregistra todos os Service Workers do escopo atual.
   * @private
   */
  async _unregisterAllServiceWorkers() {
    // ------------
    // Sem suporte
    // ------------
    if (!('serviceWorker' in navigator)) return;

    // ------------
    // Unregister
    // ------------
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (!registrations || registrations.length === 0) return;

      // ------------
      // Segurança: desregistrar apenas SW do escopo do app
      // ------------
      const appScopePrefixUrl = this._getAppScopePrefixUrl();

      await Promise.all(
        registrations.map(reg => {
          try {
            if (appScopePrefixUrl && typeof reg?.scope === 'string') {
              if (!reg.scope.startsWith(appScopePrefixUrl)) {
                return Promise.resolve(false);
              }
            }
            return reg.unregister();
          } catch (error) {
            console.warn('⚠️ Falha ao desregistrar um SW:', error);
            return Promise.resolve(false);
          }
        })
      );
    } catch (error) {
      console.warn('⚠️ Falha ao obter/desregistrar Service Workers:', error);
    }
  }

  /**
   * Reset completo do app - Remove TUDO incluindo backups
    * Remove backups também e zera localStorage
   * @private
   */
  async _resetApp() {
    try {
      console.log('🔥 Iniciando reset completo do sistema...');

      // Limpar todos os dados dos stores
      this.stores.categoryStore.clear();
      this.stores.benefitStore.clear();
      this.stores.creditStore.clear();
      this.stores.debitStore.clear();
      this.stores.transactionStore.clear();
      console.log('✅ Stores limpos');
      const allKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('finance-control:')) {
          allKeys.push(key);
        }
      }

      allKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
          console.log(`🗑️ Removido: ${key}`);
        } catch (error) {
          console.warn(`⚠️ Erro ao remover ${key}:`, error);
        }
      });
      console.log(`✅ ${allKeys.length} itens removidos do localStorage`);

      // Limpar caches do PWA (SOMENTE os caches do app)
      const cacheResult = await this._deleteOnlyAppCaches();
      console.log(`✅ ${cacheResult.deletedCount} caches do app removidos`);

      // Verificar tamanho final
      const finalSize = new Blob([JSON.stringify(localStorage)]).size;
      console.log(`📊 Tamanho final do localStorage: ${finalSize} bytes`);

      this._showToast('✅ Reset completo! Todos os dados removidos. Recarregando...', 'success');
      setTimeout(() => window.location.reload(true), 1500);
    } catch (error) {
      console.error('❌ Erro ao resetar:', error);
      this._showToast('❌ Falha ao resetar o app.', 'error', {
        id: 'danger-zone:reset-app-failed',
        actionLabel: 'Tentar novamente',
        onAction: () => this._resetApp()
      });
    }
  }

  /**
   * Atualiza interface após mudanças
   * @private
   */
  _refreshUI() {
    if (this._isRefreshing) return;
    this._isRefreshing = true;

    try {
      requestAnimationFrame(() => {
        try {
          if (this.gridRenderer) {
            this.gridRenderer.renderAll();
          }
          if (this.statsManager) {
            this.statsManager.updateBenefitStats();
            this.statsManager.updateCreditStats();
            this.statsManager.updateDebitStats();
            this.statsManager.updateExtratoStats();
          }
          this._updateStats();
        } finally {
          this._isRefreshing = false;
        }
      });
    } catch (error) {
      console.error('Erro ao atualizar UI:', error);
      this._isRefreshing = false;
    }
  }

  /**
   * Mostra toast notification com empilhamento vertical
    * Corrigido empilhamento com requestAnimationFrame
   * @private
   */
  _showToast(message, type = 'info', options = {}) {
    // Usar ToastManager global para evitar conflitos de CSS/empilhamento.
    const variant = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    dispatchToast({
      variant,
      message: String(message || '').trim() || 'Notificação',
      durationMs: Number(TIMINGS?.TOAST_DURATION) > 0 ? Number(TIMINGS.TOAST_DURATION) : 3000,

      // Ação opcional (ex.: retry)
      id: options?.id || null,
      actionLabel: options?.actionLabel || null,
      onAction: typeof options?.onAction === 'function' ? options.onAction : null,
      persistent: Boolean(options?.persistent)
    });
  }
}
