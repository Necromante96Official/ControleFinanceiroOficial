/**
 * Módulo: Gerenciador de Transações (Valores)
 * Responsabilidade: Aplicar e reverter valores de transações nas contas
 *

 *                  Verifica isLinkedPayment PRIMEIRO para evitar caír na lógica genérica
 *                  Logs detalhados com ID da transação para diagnóstico

 *                  Reconhece pagamentos de fatura como DUAS transações separadas mas vinculadas

 *                  Referências antigas ficam desatualizadas após update()
 *                  Solução: Sempre buscar dados atualizados após cada operação

 *

 * - ELIMINA DUPLICAÇÃO: Verifica linkedTransactionId/metadata.linkedPayment ANTES da lógica genérica
 * - Logs aprimorados: Inclui ID da transação, tipo, método de pagamento e status de vínculo
 * - Confirmação após cada operação: Mostra valores atualizados para debug
 *

 * - Detecta transações vinculadas por linkedTransactionId ou metadata.linkedPayment
 * - ENTRADA no crédito vinculada = Pagamento Recebido (reduz usado)
 * - SAÍDA no débito vinculada = Pagamento de Fatura (desconta saldo)
 * - Mantém compatibilidade com paymentMethod='pagar-credito' (versões antigas)
 *

 * - Lógica completamente isolada: NUNCA chamar creditStore.registerPayment() diretamente
 * - Todos os valores aplicados/revertidos APENAS via TransactionManager
 * - Proteção contra duplicação: verificar valores antes de aplicar
 * - Logs detalhados com valores antes/depois
 * - Tratamento de erros robusto com rollback
 */

/**
 * Classe para gerenciar aplicação/reversão de valores de transações
 */
import { formatMoneyToFixedString } from './moneyUtils.js';

export class TransactionManager {
  constructor(stores) {
    this.debitStore = stores.debitStore;
    this.creditStore = stores.creditStore;
    this.benefitStore = stores.benefitStore;
  }

  /**
   * Força um valor exato em um campo (usado para rollback seguro).
   * @private
   * @param {'debit'|'credit'|'benefit'} storeType
   * @param {number} id
   * @param {string} field
   * @param {number} value
   * @param {{ allowNegative?: boolean, logAction?: string }} options
   * @returns {boolean}
   */
  _setFieldValue(storeType, id, field, value, options = {}) {
    const { allowNegative = false, logAction = '' } = options;

    const store = this._getStore(storeType);
    if (!store) {
      console.warn(`⚠️ Store não encontrado: ${storeType}`);
      return false;
    }

    const account = store.getById(id);
    if (!account) {
      console.warn(`⚠️ Conta não encontrada: ${storeType} ID ${id}`);
      return false;
    }

    const currentValue = parseFloat(account[field]) || 0;
    let newValue = Number.parseFloat(value);
    if (!Number.isFinite(newValue)) newValue = 0;

    // Validação de saldo negativo (para campo 'used', nunca permitir negativo)
    if (field === 'used' || !allowNegative) {
      newValue = Math.max(0, newValue);
    }

    const updateResult = store.update(id, { [field]: newValue });
    if (!updateResult) {
      console.error(`❌ Falha ao definir ${storeType} ID ${id} campo ${field}`);
      return false;
    }

    if (logAction) {
      console.log(`${logAction} (${field}: ${formatMoneyToFixedString(currentValue)} → ${formatMoneyToFixedString(newValue)})`);
    }

    return true;
  }

  /**
   * Atualiza o saldo de uma conta
   * @private
   * @param {string} storeType - Tipo do store ('debit', 'credit', 'benefit')
   * @param {number} id - ID da conta
   * @param {string} field - Campo a atualizar ('balance' ou 'used')
   * @param {number} delta - Valor a adicionar (positivo) ou subtrair (negativo)
   * @param {Object} options - Opções adicionais
   * @returns {boolean} Sucesso da operação
   */
  _updateBalance(storeType, id, field, delta, options = {}) {
    const { allowNegative = false, logAction = '' } = options;

    // Obter store e conta
    const store = this._getStore(storeType);
    if (!store) {
      console.warn(`⚠️ Store não encontrado: ${storeType}`);
      return false;
    }

    const account = store.getById(id);
    if (!account) {
      console.warn(`⚠️ Conta não encontrada: ${storeType} ID ${id}`);
      return false;
    }

    // Calcular novo valor
    const currentValue = parseFloat(account[field]) || 0;
    let newValue = currentValue + delta;

    // Validação de saldo negativo (para campo 'used', nunca permitir negativo)
    if (field === 'used' || !allowNegative) {
      newValue = Math.max(0, newValue);
    }

    // Atualizar no store
    const updateResult = store.update(id, { [field]: newValue });

    if (!updateResult) {
      console.error(`❌ Falha ao atualizar ${storeType} ID ${id} campo ${field}`);
      return false;
    }

    // Log se especificado
    if (logAction) {
      const sign = delta >= 0 ? '+' : '';
      console.log(`${logAction} ${sign}${formatMoneyToFixedString(delta)} em ${account.name} (${field}: ${formatMoneyToFixedString(currentValue)} → ${formatMoneyToFixedString(newValue)})`);
    }

    return true;
  }

  /**
   * Obtém o store pelo tipo
   * @private
   */
  _getStore(type) {
    switch (type) {
      case 'debit': return this.debitStore;
      case 'credit': return this.creditStore;
      case 'benefit': return this.benefitStore;
      default: return null;
    }
  }

  /**
   * Aplica os valores de uma transação nas contas
   * @param {Object} transaction - Transação a aplicar
   * @returns {boolean} Sucesso da operação
   */
  applyValues(transaction) {
    const paymentMethod = transaction.paymentMethod || transaction.category;
    const { type, sourceId, targetId, value, linkedTransactionId, metadata } = transaction;

    if (!value || value <= 0) {
      console.warn('⚠️ Valor inválido para aplicar:', value);
      return false;
    }

    console.log("🔄 Aplicando valores:", {
      id: transaction.id,
      type,
      paymentMethod,
      sourceId,
      targetId,
      value,
      linkedTransactionId,
      hasMetadata: !!metadata
    });
    // CRÍTICO: Verificar PRIMEIRO se é PAGAMENTO DE FATURA vinculado para evitar processamento duplo.
    // - linkedTransactionId pode existir em outros fluxos (ex.: transferência), então NÃO pode ser o único critério.
    // - Mantém retrocompatibilidade: pagamentos antigos podem não ter metadata.linkedPayment.
    const isLinkedPayment = !!(
      (metadata && metadata.linkedPayment) ||
      (linkedTransactionId !== undefined && transaction.categoryName === 'Pagamento de Fatura')
    );

    if (isLinkedPayment) {
      console.log('🔗 TRANSAÇÃO VINCULADA detectada - Processamento especial');

      if (type === 'entrada' && paymentMethod === 'credito') {
        // Pagamento de fatura: ENTRADA no crédito (reduz o usado)
        console.log('💳 Pagamento Recebido (entrada crédito vinculada) - Reduzindo usado');
        const success = this._updateBalance('credit', sourceId, 'used', -value, {
          logAction: '💳 Pagamento Recebido (reduz usado)'
        });

        if (success) {
          const card = this.creditStore.getById(sourceId);
          console.log(`✅ Crédito atualizado: usado ${card.used} / limite ${card.limit}`);
        }

        return success;
      }

      if (type === 'saida' && paymentMethod === 'debito') {
        // Pagamento de fatura: SAÍDA no débito (desconta o pagamento)
        console.log('💵 Pagamento de Fatura (saída débito vinculada) - Descontando saldo');
        const success = this._updateBalance('debit', sourceId, 'balance', -value, {
          // Regra: pagamento de fatura não pode deixar débito negativo
          allowNegative: false,
          logAction: '💵 Pagamento de Fatura'
        });

        if (success) {
          const account = this.debitStore.getById(sourceId);
          console.log(`✅ Débito atualizado: saldo ${account.balance}`);
        }

        return success;
      }

      console.warn('⚠️ Transação vinculada com tipo/método inesperado:', { type, paymentMethod });
      return false;
    }

    // ==================================================
    // TRANSFERÊNCIA (lançamento único)
    // - Registra um único lançamento (não é entrada/saída)
    // - Move saldo entre duas contas de débito
    // - NÃO permite saldo negativo na origem
    // ==================================================
    // Transferência como LANÇAMENTO ÚNICO (novo): identificada por type/paymentMethod.
    // Importante: transferências antigas (2 lançamentos) usam metadata.isTransfer e precisam continuar no fluxo normal.
    const isTransfer = paymentMethod === 'transferencia' || type === 'transferencia';
    if (isTransfer) {
      const sourceAccount = this.debitStore.getById(sourceId);
      const targetAccount = this.debitStore.getById(targetId);

      if (!sourceAccount) {
        console.error('❌ Transferência: conta de origem não encontrada:', sourceId);
        return false;
      }
      if (!targetAccount) {
        console.error('❌ Transferência: conta de destino não encontrada:', targetId);
        return false;
      }
      if (sourceId === targetId) {
        console.warn('⚠️ Transferência: origem e destino são iguais');
        return false;
      }

      const transferValue = Math.max(0, parseFloat(value) || 0);
      if (!transferValue || transferValue <= 0) {
        console.warn('⚠️ Transferência: valor inválido:', value);
        return false;
      }

      const sourceBeforeValue = parseFloat(sourceAccount.balance) || 0;
      const targetBeforeValue = parseFloat(targetAccount.balance) || 0;

      // 1) Debitar origem (sem negativo)
      const debitSuccess = this._updateBalance('debit', sourceId, 'balance', -transferValue, {
        allowNegative: false,
        logAction: '🔄💵 Transferência (saída origem)'
      });

      if (!debitSuccess) {
        console.warn('⚠️ Transferência: falha ao debitar origem, operação cancelada');
        return false;
      }

      // 2) Creditar destino
      const creditSuccess = this._updateBalance('debit', targetId, 'balance', +transferValue, {
        allowNegative: true,
        logAction: '🔄💵 Transferência (entrada destino)'
      });

      if (!creditSuccess) {
        console.warn('⚠️ Transferência: falha ao creditar destino, fazendo rollback da origem');
        this._setFieldValue('debit', sourceId, 'balance', sourceBeforeValue, {
          allowNegative: true,
          logAction: '↩️ Rollback origem (transferência)'
        });
        this._setFieldValue('debit', targetId, 'balance', targetBeforeValue, {
          allowNegative: true,
          logAction: '↩️ Rollback destino (transferência)'
        });
        return false;
      }

      return true;
    }

    // TRATAMENTO ESPECIAL LEGADO: Pagamento de fatura (lógica clara e direta)
    // Conceito: É uma SAÍDA do débito que PAGA (reduz) o usado do crédito
    // MANTIDO PARA COMPATIBILIDADE com versões antigas (paymentMethod='pagar-credito')
    if (paymentMethod === 'pagar-credito') {
      // 1. Verificar existência das contas
      const debitAccount = this.debitStore.getById(sourceId);
      const creditCard = this.creditStore.getById(targetId);

      if (!debitAccount) {
        console.error('❌ Conta de débito não encontrada:', sourceId);
        return false;
      }
      if (!creditCard) {
        console.error('❌ Cartão de crédito não encontrado:', targetId);
        return false;
      }

      // 2. Calcular valores
      const debitoBefore = debitAccount.balance;
      const creditoUsedBefore = creditCard.used;
      const creditoDisponivel = creditCard.limit - creditCard.used;

      console.log('📊 ANTES do Pagamento:');
      console.log(`  💵 Débito "${debitAccount.name}": saldo R$ ${formatMoneyToFixedString(debitoBefore)}`);
      console.log(`  💳 Crédito "${creditCard.name}": limite R$ ${formatMoneyToFixedString(creditCard.limit)} | usado R$ ${formatMoneyToFixedString(creditoUsedBefore)} | disponível R$ ${formatMoneyToFixedString(creditoDisponivel)}`);
      console.log(`  💰 Valor a pagar: R$ ${formatMoneyToFixedString(value)}`);

      // 3. Aplicar SAÍDA no débito (desconta o valor)
      // ==================================================
      // SEGURANÇA: aplicação atômica com rollback
      // - Se uma etapa falhar, desfaz a anterior.
      // ==================================================
      const debitBeforeValue = parseFloat(debitAccount.balance) || 0;
      const creditUsedBeforeValue = parseFloat(creditCard.used) || 0;

      const debitSuccess = this._updateBalance('debit', sourceId, 'balance', -value, {
        logAction: '💵 Saída pagamento fatura'
      });

      if (!debitSuccess) {
        console.warn('⚠️ Pagamento fatura: falha ao debitar, operação cancelada');
        return false;
      }

      const creditSuccess = this._updateBalance('credit', targetId, 'used', -value, {
        logAction: '💳 Reduz usado (fatura paga)'
      });

      if (!creditSuccess) {
        console.warn('⚠️ Pagamento fatura: falha ao reduzir usado, fazendo rollback do débito');
        this._setFieldValue('debit', sourceId, 'balance', debitBeforeValue, {
          allowNegative: true,
          logAction: '↩️ Rollback débito (pagamento fatura)'
        });
        this._setFieldValue('credit', targetId, 'used', creditUsedBeforeValue, {
          logAction: '↩️ Rollback crédito (pagamento fatura)'
        });
        return false;
      }

      // 5. Log valores DEPOIS
      const debitoAfter = this.debitStore.getById(sourceId);
      const creditoAfter = this.creditStore.getById(targetId);
      const creditoDisponivelAfter = creditoAfter.limit - creditoAfter.used;

      console.log('📊 DEPOIS do Pagamento:');
      console.log(`  💵 Débito "${debitoAfter.name}": saldo R$ ${formatMoneyToFixedString(debitoAfter.balance)} (${debitoBefore > debitoAfter.balance ? '-' : '+'}R$ ${formatMoneyToFixedString(Math.abs(debitoBefore - debitoAfter.balance))})`);
      console.log(`  💳 Crédito "${creditoAfter.name}": limite R$ ${formatMoneyToFixedString(creditoAfter.limit)} | usado R$ ${formatMoneyToFixedString(creditoAfter.used)} | disponível R$ ${formatMoneyToFixedString(creditoDisponivelAfter)}`);
      console.log(`  ✅ Pagamento aplicado com sucesso!`);

      return debitSuccess && creditSuccess;
    }

    if (type === 'entrada') {
      if (paymentMethod === 'debito') {
        // Entrada em débito: adiciona ao saldo
        return this._updateBalance('debit', sourceId, 'balance', +value, {
          logAction: '💵 Entrada'
        });
      } else if (paymentMethod === 'credito') {
        // Usado quando fatura é paga: entrada "virtual" que libera o limite
        return this._updateBalance('credit', sourceId, 'used', -value, {
          logAction: '💳 Entrada (reduz usado)'
        });
      }
    } else if (type === 'saida') {
      if (paymentMethod === 'debito') {
        // Saída de débito: subtrai do saldo
        return this._updateBalance('debit', sourceId, 'balance', -value, {
          // Transferência entre débitos NÃO pode deixar saldo negativo.
          // Demais saídas seguem permitindo negativo (cheque especial).
          allowNegative: !(transaction?.metadata?.isTransfer),
          logAction: '💵'
        });
      } else if (paymentMethod === 'credito') {
        // Saída de crédito: adiciona ao "usado"
        return this._updateBalance('credit', sourceId, 'used', +value, {
          logAction: '💳'
        });
      } else if (paymentMethod === 'beneficio') {
        // Saída de benefício: adiciona ao "usado" e reduz o "livre" (saldo disponível)
        const result = this.benefitStore.useValue(sourceId, value);
        if (!result?.success) {
          console.warn('⚠️ Benefício: saldo insuficiente para aplicar saída', {
            sourceId,
            value,
            available: result?.available,
            error: result?.error
          });
          return false;
        }
        console.log(`🎁 Saída benefício aplicada: -${formatMoneyToFixedString(value)} (livre atualizado)`);
        return true;
      }
    }

    return false;
  }

  /**
   * Reverte os valores de uma transação (para exclusão ou edição)
    * Suporte a transações vinculadas de pagamento de fatura
   * @param {Object} transaction - Transação a reverter
   * @returns {boolean} Sucesso da operação
   */
  revertValues(transaction) {
    const paymentMethod = transaction.paymentMethod || transaction.category;
    const { type, sourceId, targetId, value, linkedTransactionId, metadata } = transaction;

    if (!value || value <= 0) {
      console.warn('⚠️ Valor inválido para reverter:', value);
      return false;
    }

    console.log("↩️ Revertendo valores:", {
      id: transaction.id,
      type,
      paymentMethod,
      sourceId,
      targetId,
      value,
      linkedTransactionId,
      hasMetadata: !!metadata
    });
    // CRÍTICO: Verificar PRIMEIRO se é PAGAMENTO DE FATURA vinculado para evitar reversão dupla.
    // - linkedTransactionId pode existir em outros fluxos (ex.: transferência), então NÃO pode ser o único critério.
    // - Mantém retrocompatibilidade: pagamentos antigos podem não ter metadata.linkedPayment.
    const isLinkedPayment = !!(
      (metadata && metadata.linkedPayment) ||
      (linkedTransactionId !== undefined && transaction.categoryName === 'Pagamento de Fatura')
    );

    if (isLinkedPayment) {
      console.log('🔗 TRANSAÇÃO VINCULADA detectada - Reversão especial');

      if (type === 'entrada' && paymentMethod === 'credito') {
        // Reverter pagamento recebido: AUMENTA o usado do crédito
        console.log('💳 Revertendo Pagamento Recebido (entrada crédito vinculada) - Aumentando usado');
        const success = this._updateBalance('credit', sourceId, 'used', +value, {
          logAction: '💳 Reverter Pagamento Recebido (aumenta usado)'
        });

        if (success) {
          const card = this.creditStore.getById(sourceId);
          console.log(`✅ Crédito revertido: usado ${card.used} / limite ${card.limit}`);
        }

        return success;
      }

      if (type === 'saida' && paymentMethod === 'debito') {
        // Reverter pagamento: DEVOLVE o valor ao débito
        console.log('💵 Revertendo Pagamento de Fatura (saída débito vinculada) - Devolvendo saldo');
        const success = this._updateBalance('debit', sourceId, 'balance', +value, {
          logAction: '💵 Reverter Pagamento de Fatura'
        });

        if (success) {
          const account = this.debitStore.getById(sourceId);
          console.log(`✅ Débito revertido: saldo ${account.balance}`);
        }

        return success;
      }

      console.warn('⚠️ Transação vinculada com tipo/método inesperado ao reverter:', { type, paymentMethod });
      return false;
    }

    // ==================================================
    // TRANSFERÊNCIA (lançamento único)
    // - Reverte a movimentação entre contas
    // - Segurança: NÃO permite deixar o destino negativo
    //   (se o destino já foi usado depois, a remoção é bloqueada)
    // ==================================================
    // Transferência como LANÇAMENTO ÚNICO (novo): identificada por type/paymentMethod.
    // Importante: transferências antigas (2 lançamentos) usam metadata.isTransfer e precisam continuar no fluxo normal.
    const isTransfer = paymentMethod === 'transferencia' || type === 'transferencia';
    if (isTransfer) {
      const sourceAccount = this.debitStore.getById(sourceId);
      const targetAccount = this.debitStore.getById(targetId);

      if (!sourceAccount) {
        console.error('❌ Estorno transferência: conta de origem não encontrada:', sourceId);
        return false;
      }
      if (!targetAccount) {
        console.error('❌ Estorno transferência: conta de destino não encontrada:', targetId);
        return false;
      }
      if (sourceId === targetId) {
        console.warn('⚠️ Estorno transferência: origem e destino são iguais');
        return false;
      }

      const transferValue = Math.max(0, parseFloat(value) || 0);
      if (!transferValue || transferValue <= 0) {
        console.warn('⚠️ Estorno transferência: valor inválido:', value);
        return false;
      }

      const sourceBeforeValue = parseFloat(sourceAccount.balance) || 0;
      const targetBeforeValue = parseFloat(targetAccount.balance) || 0;

      // 1) Retirar do destino (sem permitir negativo)
      const targetSuccess = this._updateBalance('debit', targetId, 'balance', -transferValue, {
        allowNegative: false,
        logAction: '↩️🔄💵 Estorno transferência (retira destino)'
      });

      if (!targetSuccess) {
        console.warn('⚠️ Estorno transferência: destino sem saldo suficiente para estornar');
        return false;
      }

      // 2) Devolver para a origem
      const sourceSuccess = this._updateBalance('debit', sourceId, 'balance', +transferValue, {
        allowNegative: true,
        logAction: '↩️🔄💵 Estorno transferência (devolve origem)'
      });

      if (!sourceSuccess) {
        console.warn('⚠️ Estorno transferência: falha ao devolver origem, fazendo rollback');
        this._setFieldValue('debit', sourceId, 'balance', sourceBeforeValue, {
          allowNegative: true,
          logAction: '↩️ Rollback origem (estorno transferência)'
        });
        this._setFieldValue('debit', targetId, 'balance', targetBeforeValue, {
          allowNegative: true,
          logAction: '↩️ Rollback destino (estorno transferência)'
        });
        return false;
      }

      return true;
    }

    // TRATAMENTO ESPECIAL LEGADO: Reverter pagamento de fatura
    // Conceito: Reverter a SAÍDA do débito e restaurar o usado do crédito
    // MANTIDO PARA COMPATIBILIDADE com versões antigas (paymentMethod='pagar-credito')
    if (paymentMethod === 'pagar-credito') {
      // 1. Verificar existência das contas
      const debitAccount = this.debitStore.getById(sourceId);
      const creditCard = this.creditStore.getById(targetId);

      if (!debitAccount) {
        console.error('❌ Conta de débito não encontrada para reverter:', sourceId);
        return false;
      }
      if (!creditCard) {
        console.error('❌ Cartão de crédito não encontrado para reverter:', targetId);
        return false;
      }

      // 2. Valores atuais
      const debitoBefore = debitAccount.balance;
      const creditoUsedBefore = creditCard.used;

      console.log('📊 ANTES da Reversão:');
      console.log(`  💵 Débito "${debitAccount.name}": saldo R$ ${formatMoneyToFixedString(debitoBefore)}`);
      console.log(`  💳 Crédito "${creditCard.name}": usado R$ ${formatMoneyToFixedString(creditoUsedBefore)}`);
      console.log(`  ↩️ Valor a reverter: R$ ${formatMoneyToFixedString(value)}`);

      // 3. REVERTER: devolve ao débito (+value)
      // ==================================================
      // SEGURANÇA: reversão atômica com rollback
      // - Se uma etapa falhar, desfaz a anterior.
      // ==================================================
      const debitBeforeValue = parseFloat(debitAccount.balance) || 0;
      const creditUsedBeforeValue = parseFloat(creditCard.used) || 0;

      const debitSuccess = this._updateBalance('debit', sourceId, 'balance', +value, {
        allowNegative: true,
        logAction: '↩️💵 Estorna pagamento (devolve)'
      });

      if (!debitSuccess) {
        console.warn('⚠️ Reversão pagamento fatura: falha ao devolver no débito');
        return false;
      }

      const creditSuccess = this._updateBalance('credit', targetId, 'used', +value, {
        logAction: '↩️💳 Restaura usado (fatura volta)'
      });

      if (!creditSuccess) {
        console.warn('⚠️ Reversão pagamento fatura: falha ao restaurar usado, fazendo rollback do débito');
        this._setFieldValue('debit', sourceId, 'balance', debitBeforeValue, {
          allowNegative: true,
          logAction: '↩️ Rollback débito (reversão fatura)'
        });
        this._setFieldValue('credit', targetId, 'used', creditUsedBeforeValue, {
          logAction: '↩️ Rollback crédito (reversão fatura)'
        });
        return false;
      }

      // 5. Log valores DEPOIS
      const debitoAfter = this.debitStore.getById(sourceId);
      const creditoAfter = this.creditStore.getById(targetId);

      console.log('📊 DEPOIS da Reversão:');
      console.log(`  💵 Débito "${debitoAfter.name}": saldo R$ ${formatMoneyToFixedString(debitoAfter.balance)} (+R$ ${formatMoneyToFixedString(value)})`);
      console.log(`  💳 Crédito "${creditoAfter.name}": usado R$ ${formatMoneyToFixedString(creditoAfter.used)} (restaurado)`);
      console.log(`  ✅ Reversão aplicada com sucesso!`);

      return debitSuccess && creditSuccess;
    }

    if (type === 'entrada') {
      if (paymentMethod === 'debito') {
        // Reverter entrada em débito: subtrai do saldo
        return this._updateBalance('debit', sourceId, 'balance', -value, {
          allowNegative: true,
          logAction: '↩️💵 Reverte entrada'
        });
      } else if (paymentMethod === 'credito') {
        // Usado quando remove pagamento: cancela a entrada que liberou o limite
        return this._updateBalance('credit', sourceId, 'used', +value, {
          logAction: '↩️💳 Reverte entrada (aumenta usado)'
        });
      }
    } else if (type === 'saida') {
      if (paymentMethod === 'debito') {
        // Reverter saída de débito: devolve ao saldo
        return this._updateBalance('debit', sourceId, 'balance', +value, {
          logAction: '↩️💵'
        });
      } else if (paymentMethod === 'credito') {
        // Reverter saída de crédito: remove do "usado"
        return this._updateBalance('credit', sourceId, 'used', -value, {
          logAction: '↩️💳'
        });
      } else if (paymentMethod === 'beneficio') {
        // Reverter saída de benefício: reduz "usado" e devolve para o "livre"
        const result = this.benefitStore.refundValue(sourceId, value);
        if (!result?.success) {
          console.warn('⚠️ Benefício: falha ao estornar saída', { sourceId, value });
          return false;
        }
        console.log(`↩️🎁 Estorno benefício aplicado: +${formatMoneyToFixedString(result.refunded ?? value)} (livre atualizado)`);
        return true;
      }
    }

    return false;
  }

  /**
   * Obtém o nome da origem da transação
   * @param {Object} transaction - Transação
   * @returns {string} Nome da origem
   */
  getSourceName(transaction) {
    const source = this._getSource(transaction);
    return source ? source.name : 'Desconhecido';
  }

  /**
   * Obtém o ícone da origem da transação
   * @param {Object} transaction - Transação
   * @returns {string} Ícone da origem
   */
  getSourceIcon(transaction) {
    const source = this._getSource(transaction);
    return source ? source.icon : '💰';
  }

  /**
   * Obtém a cor da origem da transação
   * @param {Object} transaction - Transação
   * @returns {string} Cor da origem
   */
  getSourceColor(transaction) {
    const source = this._getSource(transaction);
    return source ? source.color : '#1fc2c0';
  }

  /**
   * Obtém a origem da transação
   * @private
   */
  _getSource(transaction) {
    const paymentMethod = transaction.paymentMethod || transaction.category;

    switch (paymentMethod) {
      case 'debito':
      case 'pagar-credito':
      case 'transferencia':
        return this.debitStore.getById(transaction.sourceId);
      case 'credito':
        return this.creditStore.getById(transaction.sourceId);
      case 'beneficio':
        return this.benefitStore.getById(transaction.sourceId);
      default:
        return null;
    }
  }
}
