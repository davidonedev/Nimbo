import { ApiError } from './api';
import type { TenantSettingsPayload } from '../services/tenant.service';
import type { Tenant } from '../types';

type Key = keyof TenantSettingsPayload;

/**
 * Deixa só o que mudou em relação ao que está salvo. Assim uma aba nunca desfaz o que outra acabou de salvar
 * (as abas de Conta e Portal têm formulários separados) e não se regrava o que ninguém tocou.
 * Texto vazio é enviado como "" — é o que o backend entende como "limpar" (ausente = não mexe).
 */
export function onlyChanged(patch: TenantSettingsPayload, tenant: Tenant): TenantSettingsPayload {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as Key[]) {
    const next = patch[key];
    if (next === undefined) continue;
    const current = (tenant as unknown as Record<string, unknown>)[key];
    const same = typeof next === 'string' || next === null
      ? (current ?? '') === (next ?? '')
      : current === next;
    if (!same) out[key] = next === null ? '' : next;
  }
  return out as TenantSettingsPayload;
}

/** Mensagem para mostrar ao usuário: junta os detalhes de validação do backend quando existirem. */
export function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.details?.length) return err.details.map(d => d.message).join(' ');
  return err instanceof Error ? err.message : 'Não foi possível salvar. Tente novamente.';
}
