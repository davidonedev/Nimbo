import type { Appointment, AppointmentStatus, Client } from '@/types';

/**
 * No portal do profissional só existe o que é DELE. O back já filtra, mas as telas filtram de novo
 * por aqui: se um dia a API devolver agendamento ou cliente de colega, ele não aparece.
 */

export const ownAppointments = (appointments: readonly Appointment[], professionalId: string): Appointment[] =>
  appointments.filter(a => a.professionalId === professionalId);

/** Clientes que têm ao menos um agendamento dele (dos `clients` recebidos, nunca de outros). */
export const ownClients = (clients: readonly Client[], own: readonly Appointment[]): Client[] => {
  const ids = new Set(own.map(a => a.clientId));
  return clients.filter(c => ids.has(c.id));
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

export const STATUS_BADGE: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_show: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export const STATUS_ORDER: readonly AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

export const countByStatus = (appointments: readonly Appointment[]): Record<AppointmentStatus, number> => {
  const counts: Record<AppointmentStatus, number> = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
  for (const a of appointments) counts[a.status] += 1;
  return counts;
};

/** Data e hora de início ordenáveis como texto (YYYY-MM-DD + HH:mm). */
export const startKey = (a: Pick<Appointment, 'date' | 'startTime'>) => `${a.date} ${a.startTime}`;
