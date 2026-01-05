/**
 * Módulo: Data Health - Normalização de Benefícios
 * Responsabilidade: Garantir que benefícios tenham números válidos e campos mínimos.
 */

import { getLimit, getUsed, getAvailable, normalizeReloadDay } from '../benefitUtils.js';

/**
 * Normaliza benefícios.
 * @param {unknown} rawItems
 * @returns {{ items: Array<object>, changed: boolean, issues: string[] }}
 */
export function normalizeBenefits(rawItems) {
  const issues = [];

  if (!Array.isArray(rawItems)) {
    return { items: [], changed: true, issues: ['Benefícios: dados não eram um array'] };
  }

  let changed = false;
  const items = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      changed = true;
      issues.push('Benefícios: item inválido removido');
      continue;
    }

    const next = { ...raw };

    // ID (não forçar troca para não quebrar referências)
    if (!Number.isFinite(Number.parseInt(String(next.id), 10))) {
      next.id = next.id ?? null;
      changed = true;
      issues.push('Benefícios: item com id inválido mantido como null');
    }

    // Nome
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

    // Números (mantém compatibilidade: pode ser string)
    const limit = Math.max(0, getLimit(next));
    const used = Math.max(0, getUsed(next));
    const available = Math.max(0, getAvailable(next));

    // Guardar como número (benefitStore já aceita número)
    if (Number.parseFloat(next.limit) !== limit) {
      next.limit = limit;
      changed = true;
    }
    if (Number.parseFloat(next.used) !== used) {
      next.used = used;
      changed = true;
    }
    if (Number.parseFloat(next.available) !== available) {
      next.available = available;
      changed = true;
    }

    // Dia de recarga
    const rd = normalizeReloadDay(next.reloadDay);
    if (next.reloadDay && !rd) {
      next.reloadDay = null;
      changed = true;
      issues.push('Benefícios: reloadDay inválido ajustado para null');
    }

    // Cor/ícone
    if (typeof next.color !== 'string') {
      next.color = String(next.color ?? '');
      changed = true;
    }
    if (typeof next.icon !== 'string') {
      next.icon = String(next.icon ?? '🎁');
      changed = true;
    }

    items.push(next);
  }

  return { items, changed, issues };
}
