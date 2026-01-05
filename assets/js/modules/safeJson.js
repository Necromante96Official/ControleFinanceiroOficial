/**
 * Módulo: Safe JSON
 * Responsabilidade: Fornecer métodos seguros para manipulação de JSON com recuperação de falhas
 * 
 * Este utilitário evita que a aplicação trave caso os dados no storage estejam corrompidos
 * ou incompletos (ex: falha de escrita no LocalStorage).
 */

export const SafeJson = {
  /**
   * Realiza o parse de um JSON com tratamentos de erro e fallback
   * @param {string} jsonString - String JSON para converter
   * @param {*} defaultValue - Valor retornado em caso de erro (padrão: null)
   * @returns {*} Dados convertidos ou defaultValue
   */
  parse(jsonString, defaultValue = null) {
    if (!jsonString || typeof jsonString !== 'string') {
      return defaultValue;
    }

    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('❌ SafeJson: Erro crítico no parse:', error.message);
      
      // Tentativa de reparo heurístico para erro de truncamento
      // (Comum quando o LocalStorage atinge o limite e corta o final da string)
      if (error.message.includes('Unexpected end') || error.message.includes('terminated')) {
        return this._attemptRepairTruncated(jsonString, defaultValue);
      }
      
      return defaultValue;
    }
  },

  /**
   * Tenta reparar um JSON truncado fechando colchetes e chaves abertos
   * @private
   */
  _attemptRepairTruncated(jsonString, defaultValue) {
    console.warn('🛠️ SafeJson: Tentando reparo de JSON truncado...');
    
    let repaired = jsonString.trim();
    
    // Contagem simples de estruturas abertas
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closedBrackets = (repaired.match(/\]/g) || []).length;
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closedBraces = (repaired.match(/\}/g) || []).length;

    try {
      // Se houver chaves/colchetes sobrando no final (ex: vírgula pendente), remover
      if (repaired.endsWith(',')) {
        repaired = repaired.slice(0, -1);
      }

      // Fechar chaves primeiro (objetos internos)
      if (openBraces > closedBraces) {
        repaired += '}'.repeat(openBraces - closedBraces);
      }
      
      // Fechar colchetes por último (o array principal)
      if (openBrackets > closedBrackets) {
        repaired += ']'.repeat(openBrackets - closedBrackets);
      }

      return JSON.parse(repaired);
    } catch (e) {
      console.error('❌ SafeJson: Falha ao reparar JSON:', e.message);
      
      // Fallback final: extração via Regex de objetos que sobraram (mais avançado)
      // Se for um array de objetos, tenta pegar o que estiver completo
      try {
        const matches = jsonString.match(/\{"id":.*?\}/g);
        if (matches && matches.length > 0) {
          console.log(`✅ SafeJson: Extraídos ${matches.length} itens via Regex do JSON corrompido`);
          return matches.map(m => {
            try { return JSON.parse(m); } catch { return null; }
          }).filter(Boolean);
        }
      } catch {
        // Ignorar falha no regex
      }
      
      return defaultValue;
    }
  }
};
