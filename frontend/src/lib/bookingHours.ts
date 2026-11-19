import type { Professional } from '../types';

type Hours = Pick<Professional, 'workingDays' | 'workingHours'>;

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** A semana do salão começa na segunda: Seg…Sáb, Dom. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "09:00" → "9h" · "09:30" → "9h30". */
export function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** [1,2,3,4,5,6] → "Seg–Sáb" · [1,3,5] → "Seg, Qua e Sex" · [1,2] → "Seg e Ter". */
export function weekdaysLabel(days: number[]): string {
  const set = new Set(days);
  const runs: number[][] = [];
  for (const d of WEEK_ORDER) {
    if (!set.has(d)) continue;
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev !== undefined && WEEK_ORDER.indexOf(d) === WEEK_ORDER.indexOf(prev) + 1) last.push(d);
    else runs.push([d]);
  }
  const parts = runs.flatMap(run =>
    run.length >= 3 ? [`${DAY_NAMES[run[0]]}–${DAY_NAMES[run[run.length - 1]]}`] : run.map(d => DAY_NAMES[d]),
  );
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** "Seg–Sáb, 9h–18h" a partir dos profissionais (união dos dias; menor abertura e maior fechamento). */
export function businessHoursLabel(professionals: Hours[]): string | null {
  if (professionals.length === 0) return null;
  const days = [...new Set(professionals.flatMap(p => p.workingDays))];
  if (days.length === 0) return null;
  const start = professionals.map(p => p.workingHours.start).sort()[0];
  const end = professionals.map(p => p.workingHours.end).sort().slice(-1)[0];
  return `${weekdaysLabel(days)}, ${formatHour(start)}–${formatHour(end)}`;
}

export type OpenStatus =
  | { kind: 'open'; label: string }        // aberto agora (com horário de fechar)
  | { kind: 'closed-now'; label: string }  // fora do expediente: ainda dá para agendar outro dia
  | { kind: 'paused'; label: string };     // dono desligou o agendamento (isOpen = false)

/** Selo "Aberto agora · fecha 18h". `now` já deve estar no horário de Brasília (ver nowBrasilia em lib/scheduling). */
export function openStatus(isOpen: boolean, professionals: Hours[], now: { dayOfWeek: number; time: string }): OpenStatus {
  if (!isOpen) return { kind: 'paused', label: 'Fechado no momento' };
  const minutes = toMinutes(now.time);
  const working = professionals.filter(
    p => p.workingDays.includes(now.dayOfWeek) && toMinutes(p.workingHours.start) <= minutes && minutes < toMinutes(p.workingHours.end),
  );
  if (working.length === 0) return { kind: 'closed-now', label: 'Fechado agora' };
  const closing = working.map(p => p.workingHours.end).sort().slice(-1)[0];
  return { kind: 'open', label: `Aberto agora · fecha ${formatHour(closing)}` };
}
