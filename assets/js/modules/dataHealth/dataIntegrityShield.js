/**
 * Módulo: Data Integrity Shield
 * Responsabilidade: Implementar reparo preventivo, detecção de corrupção e estratégias de recuperação.
 */

import { SafeJson } from '../utils/safeJson.js';
import safeStorage from '../safeStorage.js';

export const DataIntegrityShield = {
  /**
   * Executa uma auditoria preventiva em todas as chaves críticas no carregamento.
   * @param {Array<string>} keys - Lista de chaves do LocalStorage para verificar.
   */
  async runPreventiveCheck(keys) {
    console.log('🛡️ Iniciando Data Integrity Shield...');
    
    const results = {
      checked: 0,
      repaired: 0,
      corrupted: []
    };

    for (const key of keys) {
      results.checked++;
      const rawData = safeStorage.getItem(key);
      
      if (!rawData) continue;

      // 1. Verificar integridade estrutural (Safe Parse)
      const parsed = SafeJson.parse(rawData, null);

      if (parsed === null) {
        // 2. Tentar recuperação (Heurística)
        const recovered = this._attemptHeuristicRecovery(key, rawData);
        
        if (recovered) {
          safeStorage.setItem(key, recovered);
          results.repaired++;
          console.log(`✅ Chave [${key}] recuperada com sucesso.`);
        } else {
          results.corrupted.push(key);
          console.warn(`🚨 Chave [${key}] está corrompida e é irrecuperável.`);
        }
      }
    }

    return results;
  },

  /**
   * Estratégia de recuperação de dados corrompidos.
   * @private
   */
  _attemptHeuristicRecovery(key, rawData) {
    // ------------
    // Se for uma lista de transações, talvez possamos extrair itens válidos via Regex
    // ------------
    if (rawData.includes('"id":') && rawData.includes('[')) {
      try {
        // Tentar extrair apenas objetos individuais que pareçam íntegros
        const objectMatches = rawData.match(/\{"id":.*?\}/g);
        if (objectMatches && objectMatches.length > 0) {
          const validItems = objectMatches
            .map(item => SafeJson.parse(item, null))
            .filter(item => item !== null);
          
          if (validItems.length > 0) return validItems;
        }
      } catch (e) {
        return null;
      }
    }
    
    return null;
  },

  /**
   * Implementa o 'Data Repair' preventivo focado em tipos de dados.
   * Limpa NaNs, converte strings para números onde necessário e remove duplicatas.
   */
  performDataNormalization(data) {
    if (!data) return data;

    // Normalização recursiva de tipos
    if (Array.isArray(data)) {
      return data.map(item => this.performDataNormalization(item));
    }

    if (typeof data === 'object') {
      const normalizedObject = {};
      for (const [key, value] of Object.entries(data)) {
        // Reparar NaNs que podem ter sido salvos incorretamente
        if (typeof value === 'number' && isNaN(value)) {
          normalizedObject[key] = 0;
        } 
        // Reparar strings que deveriam ser números
        else if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('value')) {
          const num = parseFloat(value);
          normalizedObject[key] = isNaN(num) ? 0 : num;
        }
        else {
          normalizedObject[key] = this.performDataNormalization(value);
        }
      }
      return normalizedObject;
    }

    return data;
  }
};
