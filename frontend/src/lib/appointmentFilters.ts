import { addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import type { Appointment, AppointmentStatus, Client } from '@/types';
import { digitsOf as digits, normalizeText as normalize } from '@/lib/text';
import { ApiError } from '@/lib/api';

/** Mensagem para uma troca de status que falhou. O 409 traz a explicação do servidor (ex.: "já está cancelado"). */
export function statusErrorMessage(err: unknown): string {
  if (err instanceof ApiError && (err.status === 409 || err.status === 400)) return err.message;
  return 'Não foi possível atualizar o agendamento. Tente novamente.';
}

export interface AppointmentFilters {
  /** Texto livre: nome, e-mail ou telefone do cliente. */
  search: string;
  /** Início do período (YYYY-MM-DD), inclusive. Vazio = sem limite. */
  dateFrom: string;
  /** Fim do período (YYYY-MM-DD), inclusive. Vazio = sem limite. */
  dateTo: string;
  status: AppointmentStatus | 'all';
  professionalId: string | 'all';
  serviceId: string | 'all';
}

export const EMPTY_FILTERS: AppointmentFilters = {
  search: '', dateFrom: '', dateTo: '', status: 'all', professionalId: 'all', serviceId: 'all',
};

export const hasActiveFilters = (f: AppointmentFilters): boolean =>
  (Object.keys(EMPTY_FILTERS) as (keyof AppointmentFilters)[]).some(k => f[k] !== EMPTY_FILTERS[k]);


/** O cliente combina com a busca? Nome e e-mail ignoram acento e caixa; telefone compara só os dígitos. */
export function clientMatches(client: Pick<Client, 'name' | 'email' | 'phone'> | undefined, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (!client) return false;
  if (normalize(client.name).includes(q) || normalize(client.email ?? '').includes(q)) return true;
  const qDigits = digits(query);
  return qDigits.length > 0 && digits(client.phone ?? '').includes(qDigits);
}

/** Aplica os filtros e ordena do mais recente para o mais antigo. Não altera a lista recebida. */
export function filterAppointments(
  appointments: readonly Appointment[],
  clients: readonly Pick<Client, 'id' | 'name' | 'email' | 'phone'>[],
  f: AppointmentFilters,
): Appointment[] {
  const clientById = new Map(clients.map(c => [c.id, c]));
  return appointments
    .filter(a => {
      if (f.status !== 'all' && a.status !== f.status) return false;
      if (f.professionalId !== 'all' && a.professionalId !== f.professionalId) return false;
      if (f.serviceId !== 'all' && a.serviceId !== f.serviceId) return false;
      if (f.dateFrom && a.date < f.dateFrom) return false;
      if (f.dateTo && a.date > f.dateTo) return false;
      return clientMatches(clientById.get(a.clientId), f.search);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
}

export interface StatusAction { status: AppointmentStatus; label: string }

/** Ações de status disponíveis para cada situação (as mesmas do detalhe da agenda). */
export function statusActionsFor(status: AppointmentStatus): StatusAction[] {
  const actions: StatusAction[] = [];
  if (status === 'pending') actions.push({ status: 'confirmed', label: 'Confirmar' });
  if (status === 'pending' || status === 'confirmed') actions.push({ status: 'completed', label: 'Concluir' });
  if (status !== 'cancelled' && status !== 'completed') {
    if (status !== 'no_show') actions.push({ status: 'no_show', label: 'Marcar falta' });
    actions.push({ status: 'cancelled', label: 'Cancelar' });
  }
  return actions;
}

/** Atalhos de período da tela Agendamentos. */
export type PeriodPreset = 'today' | 'tomorrow' | 'week' | 'month';

export const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'tomorrow', label: 'Amanhã' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
];

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Intervalo (YYYY-MM-DD, inclusive) de um atalho. A semana vai de segunda a domingo. */
export function periodRange(key: PeriodPreset, todayIso: string): { dateFrom: string; dateTo: string } {
  const today = parseISO(todayIso);
  if (key === 'today') return { dateFrom: todayIso, dateTo: todayIso };
  if (key === 'tomorrow') { const d = iso(addDays(today, 1)); return { dateFrom: d, dateTo: d }; }
  if (key === 'week') return { dateFrom: iso(startOfWeek(today, { weekStartsOn: 1 })), dateTo: iso(endOfWeek(today, { weekStartsOn: 1 })) };
  return { dateFrom: iso(startOfMonth(today)), dateTo: iso(endOfMonth(today)) };
}

/** Qual atalho corresponde ao período atual dos filtros (null = período livre ou vazio). */
export function activePeriodPreset(f: Pick<AppointmentFilters, 'dateFrom' | 'dateTo'>, todayIso: string): PeriodPreset | null {
  if (!f.dateFrom && !f.dateTo) return null;
  return PERIOD_PRESETS.find(p => {
    const r = periodRange(p.key, todayIso);
    return r.dateFrom === f.dateFrom && r.dateTo === f.dateTo;
  })?.key ?? null;
}

/** Quantos agendamentos há em cada status, respeitando todos os filtros menos o de status (os números dos chips). */
export function statusCounts(
  appointments: readonly Appointment[],
  clients: readonly Pick<Client, 'id' | 'name' | 'email' | 'phone'>[],
  f: AppointmentFilters,
): Record<AppointmentStatus | 'all', number> {
  const counts: Record<AppointmentStatus | 'all', number> = { all: 0, pending: 0, confirmed: 0, completed: 0, no_show: 0, cancelled: 0 };
  for (const a of filterAppointments(appointments, clients, { ...f, status: 'all' })) { counts.all += 1; counts[a.status] += 1; }
  return counts;
}
