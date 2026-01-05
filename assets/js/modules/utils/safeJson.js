/**
 * Utilitário: Safe JSON Parse
 * Responsabilidade: Fornecer métodos seguros para manipulação de JSON com recuperação de falhas.
 */

export const SafeJson = {
  /**
   * Tenta converter uma string para objeto de forma segura.
   * @param {string|null} jsonString - A string JSON a ser processada.
   * @param {*} defaultValue - Valor retornado em caso de falha.
   * @param {Function} [validator=null] - Função opcional para validar o esquema.
   * @returns {*} O objeto processado ou o valor padrão.
   */
  parse(jsonString, defaultValue = null, validator = null) {
    if (!jsonString || typeof jsonString !== 'string') {
      return defaultValue;
    }

    try {
      const parsed = JSON.parse(jsonString);

      // ------------
      // Validação opcional pós-parse
      // ------------
      if (validator && typeof validator === 'function') {
        if (validator(parsed)) {
          return parsed;
        }
        console.warn('⚠️ Validação de esquema falhou para o JSON parseado.');
        return defaultValue;
      }

      return parsed;
    } catch (error) {
      console.error('❌ Erro crítico no SafeJson.parse:', error.message);
      
      // ------------
      // Recuperação básica: Tentar identificar se é um erro de truncamento
      // ------------
      if (error.message.includes('Unexpected end of JSON input')) {
        return this._attemptRepairTruncated(jsonString, defaultValue);
      }

      return defaultValue;
    }
  },

  /**
   * Tenta reparar JSONs truncados (comum em falhas de escrita/quota).
   * @private
   */
  _attemptRepairTruncated(jsonString, defaultValue) {
    console.warn('🛠️ Tentando reparo heurístico em JSON truncado...');
    
    // Tentativa simples de fechar colchetes ou chaves
    const openBrackets = (jsonString.match(/\[/g) || []).length;
    const closedBrackets = (jsonString.match(/\]/g) || []).length;
    const openBraces = (jsonString.match(/\{/g) || []).length;
    const closedBraces = (jsonString.match(/\}/g) || []).length;

    let repaired = jsonString;
    
    try {
      if (openBraces > closedBraces) repaired += '}'.repeat(openBraces - closedBraces);
      if (openBrackets > closedBrackets) repaired += ']'.repeat(openBrackets - closedBrackets);
      
      return JSON.parse(repaired);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Converte objeto para string com tratamento de erros.
   */
  stringify(value, defaultValue = '') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.error('❌ Erro ao converter para JSON string:', error);
      return defaultValue;
    }
  }
};
