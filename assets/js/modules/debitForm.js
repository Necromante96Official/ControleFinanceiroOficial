/**
 * Módulo: Formulário de Cartões de Débito / Dinheiro
 * Responsabilidade: Gerenciar criação/edição de cartões de débito
 */

import { colors, icons } from "./categoryPalette.js";
import { formatCurrencyInput, parseCurrencyInput, formatCurrencySimple } from "./currencyFormatter.js";
import { formatMoneyToFixedString } from "./moneyUtils.js";
import { dispatchToast } from "./toastManager.js";
import { isToastHandledError } from "./toastHandledError.js";
import { runWithBusyButton } from "./domElements.js";

export class DebitForm {
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

    // Listener de formatação automática para campo de saldo
    this.elements.balanceInput.addEventListener("input", (e) => {
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
    this.elements.formTitle.textContent = "Nova conta / dinheiro";
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
    this.elements.formTitle.textContent = "Editar conta";
    this.elements.nameInput.value = data.name || "";
    this.elements.balanceInput.value = this._formatAmountForDisplay(data.balance || 0);
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
   * Converte valor formatado (1.2.0.20 ou 12.0.20) para número
   * @private
   */
  _parseAmount(value) {
    return parseCurrencyInput(value);
  }

  /**
   * Formata número para exibição (1200 -> "1.2.0.20")
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
    this.elements.balanceInput.value = "";
    this.selectColor(colors[0]);
    this.selectIcon(icons[0]);
  }

  /**
   * Handler do botão salvar
   * @private
   */
  async _handleSave() {
    const name = this.elements.nameInput.value.trim();
    const balance = this._parseAmount(this.elements.balanceInput.value);

    // Validação com feedback visual
    if (!name) {
      // Toast superior: validação é uma ação importante.
      dispatchToast({
        variant: 'warning',
        title: 'Campo obrigatório',
        message: 'Informe o nome da conta.',
        id: 'debit-name-required'
      });

      this.elements.nameInput.focus();
      this.elements.nameInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.nameInput.style.borderColor = "";
      }, 2000);
      return;
    }

    if (balance < 0) {
      dispatchToast({
        variant: 'warning',
        title: 'Valor inválido',
        message: 'O saldo não pode ser negativo.',
        id: 'debit-balance-invalid'
      });

      this.elements.balanceInput.focus();
      this.elements.balanceInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.balanceInput.style.borderColor = "";
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
            balance: formatMoneyToFixedString(balance),
            color: this.selectedColor,
            icon: this.selectedIcon,
          });

          dispatchToast({
            variant: 'success',
            title: isEditing ? 'Conta atualizada' : 'Conta criada',
            message: `"${name}" salva com sucesso.`,
            id: isEditing ? `debit-saved-${this.editingId}` : 'debit-created'
          });
        } catch (error) {
          if (!isToastHandledError(error)) {
            dispatchToast({
              variant: 'error',
              title: 'Falha ao salvar',
              message: 'Não foi possível salvar a conta.',
              id: 'debit-save-error'
            });
          }

          // Evita erro não tratado no clique.
        }
      }
    );
  }
}
