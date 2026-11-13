import type { BlockedSlot, Professional } from '../types';
import type { AgendaAppointment } from '../services/appointments.service';
import { toMinutes, weekdayIndex } from './agendaDates';

/** Altura de cada minuto na grade (px). 1,6 px/min = 96 px por hora. */
export const PX_PER_MIN = 1.6;
export type GridInterval = 15 | 30 | 60;

export interface GridRange { start: number; end: number } // minutos desde 00:00

/**
 * Faixa de horas da grade: do começo do primeiro expediente ao fim do último (de quem aparece no dia),
 * ampliada se houver agendamento ou bloqueio fora disso. Sem expediente nenhum, 08:00–18:00.
 */
export function computeGridRange(
  date: string, professionals: Professional[], appointments: AgendaAppointment[], blocks: BlockedSlot[],
): GridRange {
  const working = professionals.filter(p => p.workingDays.includes(weekdayIndex(date)));
  let start = working.length ? Math.min(...working.map(p => toMinutes(p.workingHours.start))) : 8 * 60;
  let end = working.length ? Math.max(...working.map(p => toMinutes(p.workingHours.end))) : 18 * 60;
  for (const a of appointments) {
    if (a.date !== date || a.status === 'cancelled') continue;
    start = Math.min(start, toMinutes(a.startTime));
    end = Math.max(end, toMinutes(a.endTime));
  }
  for (const b of blocks) {
    if (b.date !== date || isAllDayBlock(b)) continue;
    start = Math.min(start, toMinutes(b.startTime));
    end = Math.max(end, toMinutes(b.endTime));
  }
  return { start: Math.max(0, Math.floor(start / 60) * 60), end: Math.min(24 * 60, Math.ceil(end / 60) * 60) };
}

/** Bloqueio do dia inteiro (00:00 até o fim do dia). */
export const isAllDayBlock = (b: Pick<BlockedSlot, 'startTime' | 'endTime'>): boolean =>
  toMinutes(b.startTime) <= 0 && toMinutes(b.endTime) >= 23 * 60 + 59;

export const minutesToPx = (min: number, range: GridRange): number => (min - range.start) * PX_PER_MIN;

export interface OffArea { top: number; height: number; title: string }
export interface BlockArea { id: string; top: number; height: number; title: string; reason: string }
export interface CardLayout { appt: AgendaAppointment; top: number; height: number; lane: number; lanes: number }
export interface SlotCell { time: string; top: number; height: number }

export interface ColumnLayout {
  working: boolean;
  offAreas: OffArea[];
  blockAreas: BlockArea[];
  cards: CardLayout[];
  slots: SlotCell[];
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Distribui agendamentos que se sobrepõem lado a lado (faixas) dentro da coluna. */
export function layoutLanes(items: { start: number; end: number }[]): { lane: number; lanes: number }[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start || items[a].end - items[b].end);
  const result: { lane: number; lanes: number }[] = items.map(() => ({ lane: 0, lanes: 1 }));
  let cluster: number[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    const lanes = laneEnds.length || 1;
    for (const i of cluster) result[i].lanes = lanes;
    cluster = []; laneEnds = []; clusterEnd = -1;
  };

  for (const i of order) {
    if (cluster.length && items[i].start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex(end => end <= items[i].start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(items[i].end); } else laneEnds[lane] = items[i].end;
    result[i].lane = lane;
    cluster.push(i);
    clusterEnd = Math.max(clusterEnd, items[i].end);
  }
  closeCluster();
  return result;
}

/**
 * Monta uma coluna da grade para um profissional: áreas fora do expediente, bloqueios, cartões de agendamento
 * e as células clicáveis de horário livre (só dentro do expediente, sem agendamento nem bloqueio e não passadas).
 */
export function buildColumn(
  date: string, today: string, nowMinutes: number, professional: Professional,
  appointments: AgendaAppointment[], blocks: BlockedSlot[], interval: GridInterval, range: GridRange,
): ColumnLayout {
  const works = professional.workingDays.includes(weekdayIndex(date));
  const wStart = toMinutes(professional.workingHours.start);
  const wEnd = toMinutes(professional.workingHours.end);
  const full = (range.end - range.start) * PX_PER_MIN;

  const offAreas: OffArea[] = [];
  if (!works) {
    offAreas.push({ top: 0, height: full, title: `Folga: ${professional.name} não trabalha neste dia` });
  } else {
    if (wStart > range.start) offAreas.push({ top: 0, height: (wStart - range.start) * PX_PER_MIN, title: `Fora do expediente (começa às ${hhmm(wStart)})` });
    if (wEnd < range.end) offAreas.push({ top: (wEnd - range.start) * PX_PER_MIN, height: (range.end - wEnd) * PX_PER_MIN, title: `Fora do expediente (termina às ${hhmm(wEnd)})` });
  }

  const myBlocks = blocks.filter(b => b.date === date && b.professionalId === professional.id);
  const blockAreas: BlockArea[] = myBlocks.map(b => {
    const s = isAllDayBlock(b) ? range.start : Math.max(range.start, toMinutes(b.startTime));
    const e = isAllDayBlock(b) ? range.end : Math.min(range.end, toMinutes(b.endTime));
    const label = isAllDayBlock(b) ? 'Dia bloqueado' : `Bloqueado ${b.startTime}–${b.endTime}`;
    return { id: b.id, top: minutesToPx(s, range), height: Math.max(0, (e - s) * PX_PER_MIN), title: b.reason ? `${label}: ${b.reason}` : label, reason: b.reason ?? '' };
  });

  // cancelados liberam o horário e não aparecem na grade; faltas continuam ocupando
  const mine = appointments
    .filter(a => a.date === date && a.professionalId === professional.id && a.status !== 'cancelled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const spans = mine.map(a => ({ start: toMinutes(a.startTime), end: toMinutes(a.endTime) }));
  const lanes = layoutLanes(spans);
  const cards: CardLayout[] = mine.map((appt, i) => ({
    appt,
    top: minutesToPx(spans[i].start, range),
    height: Math.max(18, (spans[i].end - spans[i].start) * PX_PER_MIN),
    lane: lanes[i].lane,
    lanes: lanes[i].lanes,
  }));

  const busy: [number, number][] = [
    ...spans.map(s => [s.start, s.end] as [number, number]),
    ...myBlocks.map(b => (isAllDayBlock(b) ? [0, 24 * 60] : [toMinutes(b.startTime), toMinutes(b.endTime)]) as [number, number]),
  ];
  const slots: SlotCell[] = [];
  if (works) {
    const from = Math.max(wStart, range.start);
    for (let t = from; t + interval <= Math.min(wEnd, range.end); t += interval) {
      if (date < today || (date === today && t < nowMinutes)) continue; // passado não recebe agendamento novo
      if (busy.some(([s, e]) => t < e && t + interval > s)) continue;
      slots.push({ time: hhmm(t), top: minutesToPx(t, range), height: interval * PX_PER_MIN });
    }
  }

  return { working: works, offAreas, blockAreas, cards, slots };
}
