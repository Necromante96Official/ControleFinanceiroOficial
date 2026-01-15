/**
 * Módulo: parseUpdatesMarkdown
 * Responsabilidade: Converter o texto do updates.md em um modelo simples (título, meta, itens).
 */

/**
 * @typedef {{
 *  title: string,
 *  meta: string,
 *  divider: string,
 *  items: string[]
 * }} UpdateEntry
 */

/**
 * Extrai as atualizações a partir do arquivo updates.md.
 * Regras:
 * - Ignora o cabeçalho de instruções até o primeiro separador "---".
 * - Cada atualização segue o padrão:
 *   # Título
 *   ## Build X | Versão Y
 *   ### ------------------------
 *   - item
 *   - item
 * @param {string} markdown
 * @returns {UpdateEntry[]}
 */
export function parseUpdatesMarkdown(markdown) {
  // ------------
  // Normalização básica
  // ------------
  const raw = typeof markdown === 'string' ? markdown : '';
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  // ------------
  // Pular instruções até o primeiro "---"
  // ------------
  const firstDividerIndex = lines.findIndex(line => line.trim() === '---');
  const contentLines = firstDividerIndex >= 0 ? lines.slice(firstDividerIndex + 1) : lines;

  const entries = [];

  /** @type {UpdateEntry | null} */
  let current = null;

  const pushCurrent = () => {
    if (!current) return;

    const hasAnyContent =
      (current.title && current.title.trim().length > 0) ||
      (current.meta && current.meta.trim().length > 0) ||
      current.items.length > 0;

    if (hasAnyContent) {
      entries.push(current);
    }

    current = null;
  };

  for (const originalLine of contentLines) {
    const line = originalLine.trim();

    // Ignorar linhas vazias
    if (!line) continue;

    // Novo bloco de atualização
    if (line.startsWith('# ')) {
      pushCurrent();

      current = {
        title: line.replace(/^#\s+/, '').trim(),
        meta: '',
        divider: '',
        items: [],
      };

      continue;
    }

    // Se ainda não tem bloco, ignora
    if (!current) continue;

    // Meta (build/versão)
    if (line.startsWith('## ')) {
      current.meta = line.replace(/^##\s+/, '').trim();
      continue;
    }

    // Linha separadora
    if (line.startsWith('### ')) {
      current.divider = line.replace(/^###\s+/, '').trim();
      continue;
    }

    // Itens
    if (line.startsWith('- ')) {
      current.items.push(line.replace(/^-\s+/, '').trim());
      continue;
    }
  }

  pushCurrent();

  return entries;
}
