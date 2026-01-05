/**
 * Módulo: Formulário de Categorias
 * Responsabilidade: Gerenciar criação de categorias com seleção de cores, ícones e tipo
 */

import { colors, icons } from "./categoryPalette.js";
import { dispatchToast } from "./toastManager.js";
import { isToastHandledError } from "./toastHandledError.js";
import { runWithBusyButton } from "./domElements.js";

export class CategoryForm {
  constructor(elements) {
    this.elements = elements;
    this.saveCallback = null;
    this.typeButtons = Array.from(elements.typeOptions);
    this.selectedColor = colors[0];
    this.selectedIcon = icons[0];
    this.selectedType = "Entrada";
    this.editingId = null;
    this.handleSave = this._handleSave.bind(this);
    this.handleClose = this.close.bind(this);
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
    this.elements.saveButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.handleSave(e);
    });
    this.elements.closeButton.addEventListener("click", this.handleClose);
    this.reset();
  }

  /**
   * Abre o modal do formulário para criar categoria
   */
  open() {
    this.editingId = null;
    this.elements.formTitle.textContent = "Nova categoria";
    this._resetFields();
    this.elements.formSheet.classList.add("is-open");
    this.elements.formSheet.setAttribute("aria-hidden", "false");
  }

  /**
   * Abre o modal para editar categoria existente
    * Pré-preenche os campos com dados atuais (não reseta antes)
   */
  openEdit(id, data) {
    this.editingId = id;
    this.elements.formTitle.textContent = "Editar categoria";
    this.elements.nameInput.value = data.name || "";
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
   * Seleciona um tipo (Entrada ou Saída)
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
   * Reseta os campos do formulário
   * @private
   */
  _resetFields() {
    this.elements.nameInput.value = "";
    this.selectColor(colors[0]);
    this.selectIcon(icons[0]);
    this.selectType("Entrada");
  }

  /**
   * Handler do botão salvar
   * @private
   */
  async _handleSave() {
    const name = this.elements.nameInput.value.trim();
    if (!name) {
      // Toast superior: validação é uma ação importante.
      dispatchToast({
        variant: 'warning',
        title: 'Campo obrigatório',
        message: 'Informe o nome da categoria.',
        id: 'category-name-required'
      });

      this.elements.nameInput.focus();
      this.elements.nameInput.style.borderColor = "#ff6b6b";
      setTimeout(() => {
        this.elements.nameInput.style.borderColor = "";
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
            color: this.selectedColor,
            icon: this.selectedIcon,
            type: this.selectedType,
          });

          dispatchToast({
            variant: 'success',
            title: isEditing ? 'Categoria atualizada' : 'Categoria criada',
            message: `"${name}" salva com sucesso.`,
            id: isEditing ? `category-saved-${this.editingId}` : 'category-created'
          });
        } catch (error) {
          if (!isToastHandledError(error)) {
            dispatchToast({
              variant: 'error',
              title: 'Falha ao salvar',
              message: 'Não foi possível salvar a categoria.',
              id: 'category-save-error'
            });
          }

          // Evita erro não tratado no clique.
        }
      }
    );
  }
}
