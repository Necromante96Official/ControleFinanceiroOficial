/**
 * Módulo: Handlers de Salvamento
 * Responsabilidade: Processar salvamento de categorias, benefícios, crédito, débito e transações
 */

import { dispatchToast } from './toastManager.js';
import { createToastHandledError } from './toastHandledError.js';

/**
 * Classe para gerenciar handlers de salvamento
 */
export class SaveHandlers {
  constructor(options) {
    this.stores = options.stores;
    this.forms = options.forms;
    this.gridRenderer = options.gridRenderer;
    this.statsManager = options.statsManager;
    this.transactionManager = options.transactionManager;
  }

  /**
   * Configurações para cada tipo de entidade
   */
  _getEntityConfig(entityType) {
    const configs = {
      category: {
        storeKey: 'categoryStore',
        formKey: 'categoryForm',
        entityName: 'categoria',
        entityNameEdit: 'Categoria',
        updateFields: ['name', 'color', 'icon', 'type'],
        renderMethod: () => this.gridRenderer.renderCategoryCards(),
        statsMethod: null
      },
      benefit: {
        storeKey: 'benefitStore',
        formKey: 'benefitForm',
        entityName: 'benefício',
        entityNameEdit: 'Benefício',
        updateFields: ['name', 'limit', 'available', 'reloadDay', 'color', 'icon', 'type'],
        renderMethod: () => this.gridRenderer.renderBenefitCards(),
        statsMethod: () => this.statsManager.updateBenefitStats()
      },
      credit: {
        storeKey: 'creditStore',
        formKey: 'creditForm',
        entityName: 'cartão de crédito',
        entityNameEdit: 'Cartão de crédito',
        updateFields: ['name', 'limit', 'dueDay', 'color', 'icon'],
        renderMethod: () => this.gridRenderer.renderCreditCards(),
        statsMethod: () => this.statsManager.updateCreditStats()
      },
      debit: {
        storeKey: 'debitStore',
        formKey: 'debitForm',
        entityName: 'conta de débito',
        entityNameEdit: 'Conta de débito',
        updateFields: ['name', 'balance', 'color', 'icon'],
        renderMethod: () => this.gridRenderer.renderDebitCards(),
        statsMethod: () => this.statsManager.updateDebitStats()
      }
    };
    return configs[entityType];
  }

  /**
   * Método genérico para salvar entidades (category, benefit, credit, debit)
   */
  _handleSave(entityType, payload) {
    const config = this._getEntityConfig(entityType);
    if (!config) {
      dispatchToast({
        variant: 'error',
        title: 'Ação não suportada',
        message: `Tipo de entidade desconhecido: ${String(entityType)}`,
        id: `save-unknown-entity-${String(entityType)}`
      });

      throw createToastHandledError(`Tipo de entidade desconhecido: ${String(entityType)}`);
    }

    try {
      const store = this.stores[config.storeKey];
      const form = this.forms[config.formKey];

      console.log(`💾 Salvando ${config.entityName}:`, payload);

      if (!payload || !payload.name) {
        // Validação extra: evita sucesso falso caso o form não valide.
        dispatchToast({
          variant: 'warning',
          title: 'Campo obrigatório',
          message: `Informe o nome da ${config.entityName}.`,
          id: `save-${entityType}-name-required`
        });

        throw createToastHandledError('Payload inválido: nome é obrigatório');
      }

      if (payload.id && payload.id > 0) {
        console.log(`📝 Editando ${config.entityName} ID ${payload.id}`);

        // Extrai apenas os campos relevantes para update
        const updateData = {};
        config.updateFields.forEach(field => {
          if (payload[field] !== undefined) {
            updateData[field] = payload[field];
          }
        });

        const result = store.update(payload.id, updateData);
        if (!result) {
          dispatchToast({
            variant: 'warning',
            title: `${config.entityNameEdit} não encontrada`,
            message: `Não foi possível atualizar: ID ${payload.id} não existe.`,
            id: `save-${entityType}-not-found-${payload.id}`
          });

          throw createToastHandledError(`${config.entityNameEdit} com ID ${payload.id} não encontrado(a)`);
        } else {
          console.log(`✏️ ${config.entityNameEdit} atualizado(a) com sucesso:`, result);
        }
      } else {
        console.log(`➕ Criando novo(a) ${config.entityName}`);
        const result = store.add(payload);
        if (!result) {
          dispatchToast({
            variant: 'error',
            title: `Falha ao criar ${config.entityName}`,
            message: 'Não foi possível concluir o salvamento.',
            id: `save-${entityType}-create-failed`
          });

          throw createToastHandledError(`Falha ao criar ${config.entityName}`);
        }
        console.log(`✨ Novo(a) ${config.entityName} criado(a):`, result);
      }

      form.close();
      config.renderMethod();
      if (config.statsMethod) {
        config.statsMethod();
      }
      console.log(`✅ ${config.entityNameEdit} salvo(a) com sucesso`);
    } catch (error) {
      console.error(`❌ Erro ao salvar ${config.entityName}:`, error);

      // Propaga o erro para evitar toast de sucesso no formulário.
      throw error;
    }
  }

  // Handlers públicos que delegam ao método genérico
  handleSaveCategory(payload) { this._handleSave('category', payload); }
  handleSaveBenefit(payload) { this._handleSave('benefit', payload); }
  handleSaveCredit(payload) { this._handleSave('credit', payload); }
  handleSaveDebit(payload) { this._handleSave('debit', payload); }

  /**
   * Handler para transação (lógica especial com revertValues/applyValues)
   */
  handleSaveTransaction(payload) {
    try {
      const { transactionStore } = this.stores;
      const { transactionForm } = this.forms;

      console.log("💾 Salvando transação:", payload);

      if (!payload || !payload.name) {
        dispatchToast({
          variant: 'warning',
          title: 'Campo obrigatório',
          message: 'Informe o nome do lançamento.',
          id: 'transaction-name-required'
        });

        throw createToastHandledError('Payload inválido: nome é obrigatório');
      }

      if (payload.id && payload.id > 0) {
        // ==================================================
        // SEGURANÇA: edição atômica (reverte antigo -> atualiza -> aplica novo)
        // - Se qualquer etapa falhar, restaura tudo.
        // ==================================================
        const currentTransaction = transactionStore.findById(payload.id);
        if (!currentTransaction) {
          dispatchToast({
            variant: 'warning',
            title: 'Lançamento não encontrado',
            message: `Não foi possível editar: ID ${payload.id} não existe.`,
            id: `transaction-not-found-${payload.id}`
          });

          throw createToastHandledError(`Transação com ID ${payload.id} não encontrada`);
        }

        // Sempre usar o store atual como fonte de verdade
        const oldTransactionSnapshot = { ...currentTransaction };

        console.log("🔄 Revertendo valores da transação atual (antes de editar)");
        const reverted = this.transactionManager.revertValues(oldTransactionSnapshot);
        if (!reverted) {
          dispatchToast({
            variant: 'warning',
            title: 'Edição cancelada',
            message: 'Não foi possível reverter valores do lançamento anterior.',
            id: `transaction-revert-failed-${payload.id}`
          });

          throw createToastHandledError('Falha ao reverter valores da transação.');
        }

        console.log(`📝 Editando transação ID ${payload.id}`);
        const updatedTransaction = transactionStore.update(payload.id, {
          name: payload.name,
          type: payload.type,
          categoryId: payload.categoryId,
          categoryName: payload.categoryName,
          categoryIcon: payload.categoryIcon,
          categoryColor: payload.categoryColor,
          paymentMethod: payload.paymentMethod,
          sourceId: payload.sourceId,
          targetId: payload.targetId,
          value: payload.value,
          date: payload.date,
        });

        if (!updatedTransaction) {
          dispatchToast({
            variant: 'error',
            title: 'Falha ao atualizar',
            message: 'Rollback executado para evitar inconsistência.',
            id: `transaction-update-failed-${payload.id}`
          });

          this.transactionManager.applyValues(oldTransactionSnapshot);
          throw createToastHandledError(`Falha ao atualizar transação ID ${payload.id}.`);
        }

        const applied = this.transactionManager.applyValues(updatedTransaction);
        if (!applied) {
          dispatchToast({
            variant: 'error',
            title: 'Falha ao aplicar valores',
            message: 'Rollback completo executado para evitar inconsistência.',
            id: `transaction-apply-failed-${payload.id}`
          });

          // Restaurar dados originais
          transactionStore.update(payload.id, oldTransactionSnapshot);

          // Restaurar valores originais
          this.transactionManager.applyValues(oldTransactionSnapshot);
          throw createToastHandledError('Falha ao aplicar valores da transação editada.');
        }

        console.log("✏️ Transação atualizada com sucesso:", updatedTransaction);
      } else {
        console.log(`➕ Criando nova transação`);
        const created = transactionStore.add(payload);

        const applied = this.transactionManager.applyValues(created);
        if (!applied) {
          dispatchToast({
            variant: 'error',
            title: 'Falha ao criar lançamento',
            message: 'Lançamento removido para evitar inconsistência.',
            id: 'transaction-create-apply-failed'
          });

          transactionStore.remove(created.id);
          throw createToastHandledError('Falha ao aplicar valores da transação nova.');
        }

        console.log("✨ Nova transação criada:", created);
      }

      transactionForm.close();
      this.gridRenderer.renderTransactions();
      this.gridRenderer.renderDebitCards();
      this.gridRenderer.renderCreditCards();
      this.gridRenderer.renderBenefitCards();
      this.statsManager.updateAll();

      console.log("✅ Transação salva com sucesso");
    } catch (error) {
      console.error("❌ Erro ao salvar transação:", error);

      // Propaga o erro para evitar toast de sucesso no formulário.
      throw error;
    }
  }

  /**
   * Registra todos os callbacks nos formulários
   */
  registerCallbacks() {
    const { categoryForm, benefitForm, creditForm, debitForm, transactionForm } = this.forms;

    categoryForm.onSave((payload) => this.handleSaveCategory(payload));
    benefitForm.onSave((payload) => this.handleSaveBenefit(payload));
    creditForm.onSave((payload) => this.handleSaveCredit(payload));
    debitForm.onSave((payload) => this.handleSaveDebit(payload));
    transactionForm.onSave((payload) => this.handleSaveTransaction(payload));
  }
}
