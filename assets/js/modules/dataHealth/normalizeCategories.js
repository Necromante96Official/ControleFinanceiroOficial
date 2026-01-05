/**
 * Módulo: Data Health - Normalização de Categorias
 * Responsabilidade: Garantir que categorias tenham formato mínimo seguro.
 */

/**
 * Normaliza categorias.
 * @param {unknown} rawItems
 * @returns {{ items: Array<object>, changed: boolean, issues: string[] }}
 */
export function normalizeCategories(rawItems) {
  const issues = [];

  if (!Array.isArray(rawItems)) {
    return { items: [], changed: true, issues: ['Categorias: dados não eram um array'] };
  }

  let changed = false;
  const items = [];

  // ------------
  // Filtrar e normalizar itens
  // ------------
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      changed = true;
      issues.push('Categorias: item inválido removido');
      continue;
    }

    const next = { ...raw };

    // ID (não forçar troca para não quebrar referências)
    if (!Number.isFinite(Number.parseInt(String(next.id), 10))) {
      next.id = next.id ?? null;
      changed = true;
      issues.push('Categorias: item com id inválido mantido como null');
    }

    // Campos mínimos
    if (typeof next.name !== 'string') {
      next.name = String(next.name ?? '').trim();
      changed = true;
    } else {
      const trimmed = next.name.trim();
      if (trimmed !== next.name) {
        next.name = trimmed;
        changed = true;
      }
    }

    if (typeof next.icon !== 'string') {
      next.icon = String(next.icon ?? '📝');
      changed = true;
    }

    if (typeof next.color !== 'string') {
      next.color = String(next.color ?? '');
      changed = true;
    }

    if (typeof next.type !== 'string') {
      // Mantém compatibilidade (entrada/saida)
      next.type = String(next.type ?? '');
      changed = true;
    }

    items.push(next);
  }

  return { items, changed, issues };
}
