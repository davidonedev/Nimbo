import { useCallback, useEffect, useState } from 'react';
import type { BlockedSlot } from '../types';
import { listAgendaAppointmentsApi, type AgendaAppointment } from '../services/appointments.service';
import { listBlockedSlotsApi } from '../services/blockedSlots.service';
import type { AgendaApiScope } from '../services/appointments.service';

export interface AgendaPeriod {
  appointments: AgendaAppointment[];
  blocks: BlockedSlot[];
}

interface Entry { value: AgendaPeriod; version: number }

// Cache em memória por período. invalidateAgenda() marca tudo como desatualizado: os dados antigos
// continuam na tela (sem piscar) enquanto os hooks montados rebuscam em segundo plano.
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

/** Chame após criar, editar, cancelar ou reagendar. */
export function invalidateAgenda() {
  version++;
  inflight.clear();
  listeners.forEach(l => l());
}

function fetchPeriod(cacheKey: string, apiScope: AgendaApiScope, start: string, end: string): Promise<void> {
  const key = `${cacheKey}|${start}|${end}`;
  const pending = inflight.get(key);
  if (pending) return pending; // evita chamadas duplicadas (StrictMode, dois componentes)
  const v = version;
  const p = Promise.all([
    listAgendaAppointmentsApi({ startDate: start, endDate: end }, apiScope),
    listBlockedSlotsApi({ startDate: start, endDate: end }, apiScope),
  ]).then(([appointments, blocks]) => {
    cache.set(key, { value: { appointments, blocks }, version: v });
  }).finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

const REVALIDATE_MS = 60_000;

/**
 * Agendamentos e bloqueios só do período pedido. Períodos já vistos aparecem na hora; a tela só mostra
 * skeleton na primeira carga de um período. Revalida sozinho a cada minuto e após invalidateAgenda().
 */
export function useAgendaPeriod(cacheKey: string, apiScope: AgendaApiScope, start: string, end: string) {
  // cacheKey identifica perfil + tenant + profissional: logins diferentes na mesma aba nunca compartilham dados.
  const key = `${cacheKey}|${start}|${end}`;
  const [, setTick] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPeriod(cacheKey, apiScope, start, end)
      .then(() => setTick(t => t + 1))
      .catch(() => setErrorKey(key));
  }, [cacheKey, apiScope, start, end, key]);

  useEffect(() => {
    const entry = cache.get(key);
    if (!entry || entry.version !== version) load();
    listeners.add(load);
    const id = setInterval(load, REVALIDATE_MS);
    return () => { listeners.delete(load); clearInterval(id); };
  }, [key, load]);

  const entry = cache.get(key);
  const failed = errorKey === key && !entry;
  return {
    data: entry?.value ?? null,
    loading: !entry && !failed,
    error: failed,
    reload: () => { setErrorKey(null); load(); },
  };
}
