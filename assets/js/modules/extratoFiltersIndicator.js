/**
 * Módulo: Indicador de Filtros do Extrato
 * Responsabilidade: Marcar o botão "Filtros" quando há filtros ativos
 *
 * Observação de acessibilidade:
 * - NÃO usa aria-pressed (isso transformaria o botão em toggle).
 * - Atualiza aria-label apenas para informar "ativos".
 */

/**
 * Classe para controlar o indicador visual de filtros ativos
 */
export class ExtratoFiltersIndicator {
  constructor(options) {
    this.openButton = options.openButton;
    this.elements = options.elements;
  }

  /**
   * Inicializa listeners e aplica o estado inicial
   */
  init() {
    if (!this.openButton || !this.elements) return;

    const controls = this._getFilterControls();

    // ------------
    // Listener de mudança
    // ------------
    controls.forEach((control) => {
      control.addEventListener('change', () => this.refresh());
    });

    // Estado inicial
    this.refresh();
  }

  /**
   * Recalcula e atualiza o estado do botão
   */
  refresh() {
    if (!this.openButton) return;

    const hasActiveFilters = this._hasActiveFilters();

    this.openButton.classList.toggle('is-active', hasActiveFilters);
    this.openButton.dataset.hasActiveFilters = hasActiveFilters ? 'true' : 'false';

    // Acessibilidade: nome do botão informa quando existem filtros ativos
    this.openButton.setAttribute('aria-label', hasActiveFilters ? 'Filtros (ativos)' : 'Filtros');
  }

  /**
   * Retorna a lista de controles que impactam o indicador
   * @private
   */
  _getFilterControls() {
    const {
      extratoFilterType,
      extratoFilterCategory,
      extratoFilterAccountType,
      extratoFilterAccountId,
      extratoFilterDate,
      extratoFilterMonthInput,
      extratoFilterYear,
    } = this.elements;

    return [
      extratoFilterType,
      extratoFilterCategory,
      extratoFilterAccountType,
      extratoFilterAccountId,
      extratoFilterDate,
      extratoFilterMonthInput,
      extratoFilterYear,
    ].filter(Boolean);
  }

  /**
   * Verifica se existe algum filtro fora do padrão
   * Padrões atuais no HTML:
   * - Período: all
   * - Categoria: all
   * - Tipo: all
   * - Conta/Cartão/Benefício: all
   *
   * @private
   */
  _hasActiveFilters() {
    const {
      extratoFilterType,
      extratoFilterCategory,
      extratoFilterAccountType,
      extratoFilterAccountId,
    } = this.elements;

    // ------------
    // Período
    // ------------
    if (extratoFilterType && extratoFilterType.value && extratoFilterType.value !== 'all') {
      return true;
    }

    // ------------
    // Categoria (inclui opções especiais, ex: __invoice_payment)
    // ------------
    if (extratoFilterCategory && extratoFilterCategory.value && extratoFilterCategory.value !== 'all') {
      return true;
    }

    // ------------
    // Tipo de conta
    // ------------
    if (extratoFilterAccountType && extratoFilterAccountType.value && extratoFilterAccountType.value !== 'all') {
      return true;
    }

    // ------------
    // Conta/Cartão/Benefício
    // ------------
    if (extratoFilterAccountId && extratoFilterAccountId.value && extratoFilterAccountId.value !== 'all') {
      return true;
    }

    return false;
  }
}
