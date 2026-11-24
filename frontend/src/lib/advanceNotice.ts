/** Antecedência mínima para o cliente agendar: opções, textos e a prévia "a partir de que horas o cliente consegue marcar". */

export const MAX_ADVANCE_MINUTES = 1440; // 24 h, o mesmo limite do backend

export interface AdvancePreset {
  minutes: number;
  label: string;
  hint: string;
}

export const ADVANCE_PRESETS: AdvancePreset[] = [
  { minutes: 0, label: 'Sem mínimo', hint: 'Pode marcar para agora' },
  { minutes: 30, label: '30 minutos', hint: 'Meia hora antes' },
  { minutes: 60, label: '1 hora', hint: 'O mais comum' },
  { minutes: 120, label: '2 horas', hint: 'Tempo para se preparar' },
  { minutes: 180, label: '3 horas', hint: 'Meio período' },
  { minutes: 240, label: '4 horas', hint: 'Mais folga' },
  { minutes: 720, label: '12 horas', hint: 'Só com meio dia de aviso' },
  { minutes: 1440, label: '1 dia', hint: 'Só para o dia seguinte' },
];

export const isPreset = (minutes: number) => ADVANCE_PRESETS.some(p => p.minutes === minutes);

/** 0 → "Sem mínimo"; 90 → "1 h 30 min"; 1440 → "1 dia". */
export function formatAdvance(minutes: number): string {
  if (minutes <= 0) return 'Sem mínimo';
  if (minutes === 1440) return '1 dia';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 hora' : `${h} horas`;
  return `${h} h ${m} min`;
}

export type AdvanceUnit = 'minutes' | 'hours';

/** Valor digitado + unidade → minutos (NaN se vazio ou inválido). */
export function toMinutes(amount: string, unit: AdvanceUnit): number {
  const n = Number(amount.replace(',', '.'));
  if (amount.trim() === '' || !Number.isFinite(n)) return NaN;
  return Math.round(unit === 'hours' ? n * 60 : n);
}

/** Mensagem de erro do valor personalizado, ou '' se estiver certo. */
export function advanceError(minutes: number): string {
  if (!Number.isFinite(minutes)) return 'Informe um número.';
  if (minutes < 0) return 'O valor não pode ser negativo.';
  if (minutes > MAX_ADVANCE_MINUTES) return 'O máximo é 24 horas (1 dia).';
  return '';
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "Agora são 14:20: o primeiro horário que o cliente consegue marcar é hoje às 15:20."
 * `now` é a data e hora de Brasília ("YYYY-MM-DD", "HH:mm"); sem antecedência, qualquer horário a partir de agora serve.
 */
export function earliestBooking(now: { date: string; time: string }, minutes: number): { when: string; sentence: string } {
  const [y, mo, d] = now.date.split('-').map(Number);
  const [h, mi] = now.time.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, mi);
  const earliest = new Date(start.getTime() + Math.max(0, minutes) * 60_000);
  const sameDay = earliest.getFullYear() === start.getFullYear() && earliest.getMonth() === start.getMonth() && earliest.getDate() === start.getDate();
  const hhmm = `${pad(earliest.getHours())}:${pad(earliest.getMinutes())}`;
  const when = minutes <= 0 ? `a partir de agora (${now.time})` : `${sameDay ? 'hoje' : 'amanhã'} às ${hhmm}`;
  return {
    when,
    sentence: minutes <= 0
      ? `Agora são ${now.time}: o cliente pode marcar um horário já a partir de agora.`
      : `Agora são ${now.time}: o primeiro horário que o cliente consegue marcar é ${when}.`,
  };
}
