import type { Appointment, BlockedSlot, Professional } from '../types';
import { fromMinutes, nowTimeSP, toMinutes, weekdayIndex } from './agendaDates';

/** Tamanho do "horário livre" contado nos indicadores do dia (minutos). */
export const FREE_SLOT_MINUTES = 30;

export interface DayStats {
  total: number;
  confirmed: number;
  pending: number;
  completed: number;
  cancelledOrNoShow: number;
  freeSlots: number;
}

/** Profissionais que trabalham no dia da semana de `date`. */
export const workingProfessionals = (date: string, professionals: Professional[]): Professional[] =>
  professionals.filter(p => p.workingDays.includes(weekdayIndex(date)));

export interface DayHours { open: string; close: string }

/**
 * Funcionamento do dia = do primeiro ao último expediente dos profissionais que trabalham nele.
 * TODO: o tenant ainda não tem horário de funcionamento próprio (proposta de schema pendente);
 * quando existir, troque só esta função.
 */
export function computeDayHours(date: string, professionals: Professional[]): DayHours | null {
  const working = workingProfessionals(date, professionals);
  if (working.length === 0) return null;
  return {
    open: fromMinutes(Math.min(...working.map(p => toMinutes(p.workingHours.start)))),
    close: fromMinutes(Math.max(...working.map(p => toMinutes(p.workingHours.end)))),
  };
}

export type BusinessState = 'open' | 'closed' | 'closed_today' | 'opens_later';

export interface BusinessStatus {
  state: BusinessState;
  label: string;
}

/** "Aberto", "Fechado", "Já fechou" ou "Abre às HH:mm" para o dia selecionado. */
export function computeBusinessStatus(
  date: string, today: string, hours: DayHours | null, tenantIsOpen: boolean, nowTime: string = nowTimeSP(),
): BusinessStatus {
  if (!tenantIsOpen || !hours) return { state: 'closed', label: 'Fechado' };
  if (date < today) return { state: 'closed', label: 'Fechado' };
  if (date > today) return { state: 'opens_later', label: `Abre às ${hours.open}` };
  const n = toMinutes(nowTime);
  if (n < toMinutes(hours.open)) return { state: 'opens_later', label: `Abre às ${hours.open}` };
  if (n >= toMinutes(hours.close)) return { state: 'closed_today', label: 'Já fechou' };
  return { state: 'open', label: 'Aberto' };
}

/** Intervalos ocupados (minutos) de um profissional no dia: agendamentos ativos + bloqueios. */
export function busyIntervals(date: string, professionalId: string, appointments: Appointment[], blocks: BlockedSlot[]): [number, number][] {
  const fromAppts = appointments
    .filter(a => a.date === date && a.professionalId === professionalId && a.status !== 'cancelled' && a.status !== 'no_show')
    .map(a => [toMinutes(a.startTime), toMinutes(a.endTime)] as [number, number]);
  const fromBlocks = blocks
    .filter(b => b.date === date && b.professionalId === professionalId)
    .map(b => [toMinutes(b.startTime), toMinutes(b.endTime)] as [number, number]);
  return [...fromAppts, ...fromBlocks];
}

/** Indicadores do dia. Horários livres = faixas de 30 min dentro do expediente, sem agendamento nem bloqueio e (hoje) ainda no futuro. */
export function computeDayStats(
  date: string, today: string, appointments: Appointment[], blocks: BlockedSlot[], professionals: Professional[],
  nowTime: string = nowTimeSP(),
): DayStats {
  const day = appointments.filter(a => a.date === date);
  const active = day.filter(a => a.status !== 'cancelled' && a.status !== 'no_show');

  let freeSlots = 0;
  if (date >= today) {
    const from = date === today ? toMinutes(nowTime) : 0;
    for (const p of workingProfessionals(date, professionals)) {
      const busy = busyIntervals(date, p.id, appointments, blocks);
      const start = toMinutes(p.workingHours.start);
      const end = toMinutes(p.workingHours.end);
      for (let t = start; t + FREE_SLOT_MINUTES <= end; t += FREE_SLOT_MINUTES) {
        if (t < from) continue;
        if (!busy.some(([s, e]) => t < e && t + FREE_SLOT_MINUTES > s)) freeSlots++;
      }
    }
  }

  return {
    total: active.length,
    confirmed: day.filter(a => a.status === 'confirmed').length,
    pending: day.filter(a => a.status === 'pending').length,
    completed: day.filter(a => a.status === 'completed').length,
    cancelledOrNoShow: day.filter(a => a.status === 'cancelled' || a.status === 'no_show').length,
    freeSlots,
  };
}
