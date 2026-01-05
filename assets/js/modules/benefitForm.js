/**
 * Módulo: Formulário de Benefícios
 * Responsabilidade: Gerenciar criação/edição de benefícios
 */

import { colors, icons } from "./categoryPalette.js";
import { formatCurrencyInput, parseCurrencyInput, formatCurrencySimple } from "./currencyFormatter.js";
import { formatMoneyToFixedString } from "./moneyUtils.js";
import { dispatchToast } from "./toastManager.js";
import { isToastHandledError } from "./toastHandledError.js";
import { runWithBusyButton } from "./domElements.js";

export class BenefitForm {
  constructor(elements) {
    this.elements = elements;
    this.saveCallback = null;
    this.typeButtons = Array.from(elements.typeOptions);
    this.selectedColor = colors[0];
    this.selectedIcon = icons[0];
    this.selectedType = "Vale-Alimentação";
    this.editingId = null;
  }

  /**
   * Inicializa o formulário
   */
  init() {
    this._renderColorOptions();
    this._renderIconOptions();

    this.typeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        this.selectType(button.dataset.value);
      });
    });

    // Listener de formatação automática para campo de limite
    this.elements.limitInput.addEventListener("input", (e) => {
      const formatted = formatCurrencyInput(e.target.value);
      e.target.value = formatted;
    });

    // Opção para editar manualmente o "Livre"
    if (this.elements.availableInput) {
      this.elements.availableInput.addEventListener("input", (e) => {
        const formatted = formatCurrencyInput(e.target.value);
        e.target.value = formatted;
      });
    }

    this.elements.saveButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await this._handleSave(e);
    });
    this.elements.closeButton.addEventListener("click", this.close.bind(this));
    this.reset();
  }

  /**
   * Abre o modal do formulário para criar benefício
   */
  open() {
    this.editingId = null;
    this.elements.formTitle.textContent = "Novo benefício";
    this._resetFields();
    this.elements.formSheet.classList.add("is-open");
    this.elements.formSheet.setAttribute("aria-hidden", "false");
  }

  /**
   * Abre o modal para editar benefício existente
    * Pré-preenche os campos com dados atuais
   */
  openEdit(id, data) {
    this.editingId = id;
    this.elements.formTitle.textContent = "Editar benefício";
    this.elements.nameInput.value = data.name || "";
    this.elements.limitInput.value = this._formatAmountForDisplay(data.limit || 0);
    if (this.elements.availableInput) {
      const hasAvailable = data.available !== undefined && data.available !== null && String(data.available).trim() !== '';
      this.elements.availableInput.value = hasAvailable ? this._formatAmountForDisplay(data.available) : '';
    }
    this.elements.reloadDayInput.value = data.reloadDay || 1;
    this.selectColor(data.color || colors[0]);
    this.selectIcon(data.icon || icons[0]);
    this.selectType(data.type || "Entrada");

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
   * Seleciona um tipo de benefício
   */
  selectType(type) {
    this.selectedType = type;
    this.typeButtons.forEach((button) => {
      const isActive = button.dataset.value === type;
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
    if (this.elements.availableInput) {
      this.elements.availableInput.value = "";
    }
    this.elements.reloadDayInput.value = "5";
    this.selectColor(colors[0]);
    this.selectIcon(icons[0]);
    this.selectType("Vale-Alimentação");
  }

  /**
   * Handler do botão salvar
   * @private
   */
  async _handleSave() {
    const name = this.elements.nameInput.value.trim();
    const limit = this._parseAmount(this.elements.limitInput.value);

    // "Livre" é opcional: se vazio, não altera (edição) e no create o store define padrão.
    const availableRaw = this.elements.availableInput ? String(this.elements.availableInput.value || '').trim() : '';
    const available = availableRaw ? this._parseAmount(availableRaw) : undefined;

    const reloadDay = parseInt(this.elements.reloadDayInput.value) || 5;

    // Validação com feedback visual
    if (!name) {
      // Toast superior: validação é uma ação importante.
      dispatchToast({
        variant: 'warning',
        title: 'Campo obrigatório',
        message: 'Informe o nome do benefício.',
        id: 'benefit-name-required'
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
        id: 'benefit-limit-invalid'
      });

      this.elements.limitInput.focus();
      this.elements.limitInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.limitInput.style.borderColor = "";
      }, 2000);
      return;
    }

    if (available !== undefined) {
      if (!Number.isFinite(available) || available < 0) {
        dispatchToast({
          variant: 'warning',
          title: 'Valor inválido',
          message: 'O campo “Livre” não pode ser negativo.',
          id: 'benefit-available-invalid'
        });

        this.elements.availableInput?.focus();
        if (this.elements.availableInput) {
          this.elements.availableInput.style.borderColor = "#ff6b6b";
          setTimeout(() => {
            this.elements.availableInput.style.borderColor = "";
          }, 2000);
        }
        return;
      }
    }

    if (reloadDay < 1 || reloadDay > 31) {
      dispatchToast({
        variant: 'warning',
        title: 'Dia inválido',
        message: 'Informe um dia de recarga entre 1 e 31.',
        id: 'benefit-reload-day-invalid'
      });

      this.elements.reloadDayInput.focus();
      this.elements.reloadDayInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.reloadDayInput.style.borderColor = "";
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
            available: available !== undefined ? formatMoneyToFixedString(available) : undefined,
            reloadDay,
            color: this.selectedColor,
            icon: this.selectedIcon,
            type: this.selectedType,
          });

          dispatchToast({
            variant: 'success',
            title: isEditing ? 'Benefício atualizado' : 'Benefício criado',
            message: `"${name}" salvo com sucesso.`,
            id: isEditing ? `benefit-saved-${this.editingId}` : 'benefit-created'
          });
        } catch (error) {
          if (!isToastHandledError(error)) {
            dispatchToast({
              variant: 'error',
              title: 'Falha ao salvar',
              message: 'Não foi possível salvar o benefício.',
              id: 'benefit-save-error'
            });
          }

          // Evita erro não tratado no clique.
        }
      }
    );
  }
}
