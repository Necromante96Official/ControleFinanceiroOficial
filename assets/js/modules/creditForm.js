/**
 * Módulo: Formulário de Cartões de Crédito
 * Responsabilidade: Gerenciar criação/edição de cartões de crédito
 */

import { colors, icons } from "./categoryPalette.js";
import { formatCurrencyInput, parseCurrencyInput, formatCurrencySimple } from "./currencyFormatter.js";
import { formatMoneyToFixedString } from "./moneyUtils.js";
import { dispatchToast } from "./toastManager.js";
import { isToastHandledError } from "./toastHandledError.js";
import { runWithBusyButton } from "./domElements.js";

export class CreditForm {
  constructor(elements) {
    this.elements = elements;
    this.saveCallback = null;
    this.selectedColor = colors[0];
    this.selectedIcon = icons[0];
    this.editingId = null;
  }

  /**
   * Inicializa o formulário
   */
  init() {
    this._renderColorOptions();
    this._renderIconOptions();

    // Listener de formatação automática para campo de limite
    this.elements.limitInput.addEventListener("input", (e) => {
      const formatted = formatCurrencyInput(e.target.value);
      e.target.value = formatted;
    });
    this.elements.saveButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await this._handleSave(e);
    });
    this.elements.closeButton.addEventListener("click", this.close.bind(this));
    this.reset();
  }

  /**
   * Abre o modal do formulário para criar cartão
   */
  open() {
    this.editingId = null;
    this.elements.formTitle.textContent = "Novo cartão de crédito";
    this._resetFields();
    this.elements.formSheet.classList.add("is-open");
    this.elements.formSheet.setAttribute("aria-hidden", "false");
  }

  /**
   * Abre o modal para editar cartão existente
    * Pré-preenche os campos com dados atuais
   */
  openEdit(id, data) {
    this.editingId = id;
    this.elements.formTitle.textContent = "Editar cartão";
    this.elements.nameInput.value = data.name || "";
    this.elements.limitInput.value = this._formatAmountForDisplay(data.limit || 0);
    this.elements.dueDayInput.value = data.dueDay || 10;
    this.selectColor(data.color || colors[0]);
    this.selectIcon(data.icon || icons[0]);

    this.elements.formSheet.classList.add("is-open");
    this.elements.formSheet.setAttribute("aria-hidden", "false");
  }

  /**
   * Fecha o modal do formulário
   */
  close() {
    this.editingId = null;
    this.elements.formSheet.classList.remove("is-open");
    this.elements.formSheet.setAttribute("aria-hidden", "true");
    this._resetFields();
  }

  /**
   * Reseta o formulário
   */
  reset() {
    this._resetFields();
  }

  /**
   * Seleciona uma cor
   */
  selectColor(color) {
    this.selectedColor = color;
    this.elements.colorOptions.querySelectorAll(".color-option").forEach((button) => {
      const isActive = button.dataset.value === color;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-checked", isActive);
    });
  }

  /**
   * Seleciona um ícone
   */
  selectIcon(icon) {
    this.selectedIcon = icon;
    this.elements.iconOptions.querySelectorAll(".icon-option").forEach((button) => {
      const isActive = button.dataset.value === icon;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-checked", isActive);
    });
  }

  /**
   * Define callback para quando salvar
   */
  onSave(callback) {
    this.saveCallback = callback;
  }

  /**
   * Renderiza opções de cores
   * @private
   */
  _renderColorOptions() {
    this.elements.colorOptions.innerHTML = "";
    colors.forEach((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-option";
      button.dataset.value = color;
      button.style.setProperty("--color", color);
      button.addEventListener("click", () => this.selectColor(color));
      this.elements.colorOptions.appendChild(button);
    });
    this.selectColor(this.selectedColor);
  }

  /**
   * Renderiza opções de ícones
   * @private
   */
  _renderIconOptions() {
    this.elements.iconOptions.innerHTML = "";
    icons.forEach((icon) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-option";
      button.dataset.value = icon;
      button.textContent = icon;
      button.addEventListener("click", () => this.selectIcon(icon));
      this.elements.iconOptions.appendChild(button);
    });
    this.selectIcon(this.selectedIcon);
  }

  /**
   * Converte valor formatado (1.200,00 ou 1200.00) para número
   * @private
   */
  _parseAmount(value) {
    return parseCurrencyInput(value);
  }

  /**
   * Formata número para exibição (1200 -> "1.200,00")
   * @private
   */
  _formatAmountForDisplay(value) {
    return formatCurrencySimple(value);
  }

  /**
   * Reseta os campos do formulário
   * @private
   */
  _resetFields() {
    this.elements.nameInput.value = "";
    this.elements.limitInput.value = "";
    this.elements.dueDayInput.value = "10";
    this.selectColor(colors[0]);
    this.selectIcon(icons[0]);
  }

  /**
   * Handler do botão salvar
   * @private
   */
  async _handleSave() {
    const name = this.elements.nameInput.value.trim();
    const limit = this._parseAmount(this.elements.limitInput.value);
    const dueDay = parseInt(this.elements.dueDayInput.value) || 10;

    // Validação com feedback visual
    if (!name) {
      // Toast superior: validação é uma ação importante.
      dispatchToast({
        variant: 'warning',
        title: 'Campo obrigatório',
        message: 'Informe o nome do cartão.',
        id: 'credit-name-required'
      });

      this.elements.nameInput.focus();
      this.elements.nameInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.nameInput.style.borderColor = "";
      }, 2000);
      return;
    }

    if (limit <= 0) {
      dispatchToast({
        variant: 'warning',
        title: 'Valor inválido',
        message: 'Informe um limite maior que zero.',
        id: 'credit-limit-invalid'
      });

      this.elements.limitInput.focus();
      this.elements.limitInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.limitInput.style.borderColor = "";
      }, 2000);
      return;
    }

    if (dueDay < 1 || dueDay > 31) {
      dispatchToast({
        variant: 'warning',
        title: 'Dia inválido',
        message: 'Informe um vencimento entre 1 e 31.',
        id: 'credit-due-day-invalid'
      });

      this.elements.dueDayInput.focus();
      this.elements.dueDayInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.dueDayInput.style.borderColor = "";
      }, 2000);
      return;
    }

    const isEditing = Boolean(this.editingId);

    await runWithBusyButton(
      {
        button: this.elements.saveButton,
        container: this.elements.formSheet,
        busyText: 'Processando...'
      },
      async () => {
        try {
          this.saveCallback?.({
            id: this.editingId,
            name,
            limit: formatMoneyToFixedString(limit),
            dueDay,
            color: this.selectedColor,
            icon: this.selectedIcon,
          });

          dispatchToast({
            variant: 'success',
            title: isEditing ? 'Cartão atualizado' : 'Cartão criado',
            message: `"${name}" salvo com sucesso.`,
            id: isEditing ? `credit-saved-${this.editingId}` : 'credit-created'
          });
        } catch (error) {
          if (!isToastHandledError(error)) {
            dispatchToast({
              variant: 'error',
              title: 'Falha ao salvar',
              message: 'Não foi possível salvar o cartão.',
              id: 'credit-save-error'
            });
          }

          // Evita erro não tratado no clique.
        }
      }
    );
  }
}
