import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Datas da Agenda: sempre "yyyy-MM-dd" e horas "HH:mm" no fuso do estabelecimento (America/Sao_Paulo). */
export const ZONE = 'America/Sao_Paulo';

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false });

/** Dia de hoje em Brasília (não no fuso do navegador). */
export const todaySP = (now: Date = new Date()): string => dateFmt.format(now);

/** Hora atual em Brasília, "HH:mm". */
export const nowTimeSP = (now: Date = new Date()): string => timeFmt.format(now).replace('24:', '00:');

export const addDaysISO = (iso: string, n: number): string => format(addDays(parseISO(iso), n), 'yyyy-MM-dd');

export const weekdayIndex = (iso: string): number => parseISO(iso).getDay(); // 0 = domingo

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const fromMinutes = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export const dayNumber = (iso: string): string => iso.split('-')[2];

/** "Sex", "Sáb"… */
export function weekdayShort(iso: string): string {
  const s = format(parseISO(iso), 'EEEE', { locale: ptBR }).slice(0, 3);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const weekdayLong = (iso: string): string => {
  const s = format(parseISO(iso), 'EEEE', { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const monthYearLabel = (iso: string): string => {
  const s = format(parseISO(iso), "MMMM 'de' yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const monthLong = (iso: string): string => format(parseISO(iso), 'MMMM', { locale: ptBR });

/**
 * Janela de busca estável por mês: vale para todos os dias do mês, então navegar dentro do mês não refaz a
 * chamada. Cobre a faixa de dias (-7/+21), a semana e as 6 semanas da visão Mês.
 */
export function agendaPeriod(iso: string): { start: string; end: string } {
  const monthStart = `${iso.slice(0, 8)}01`;
  const nextMonthStart = format(addDays(parseISO(monthStart), 32), 'yyyy-MM-01');
  const monthEnd = addDaysISO(nextMonthStart, -1);
  return { start: addDaysISO(monthStart, -7), end: addDaysISO(monthEnd, 28) };
}
