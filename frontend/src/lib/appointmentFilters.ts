import type { Appointment, AppointmentStatus, Client } from '@/types';

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

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digits = (s: string) => s.replace(/\D/g, '');

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
