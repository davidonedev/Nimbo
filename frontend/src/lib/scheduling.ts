import type { Appointment } from '@/types';

export function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Retorna data e hora atual no fuso de Brasília (America/Sao_Paulo). */
export function nowBrasilia(): { date: string; time: string } {
  const now = new Date();
  const datePart = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // "YYYY-MM-DD"
  const timePart = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }); // "HH:mm"
  return { date: datePart, time: timePart };
}

/** Retorna true se a data+hora escolhida já passou em Brasília. */
export function isPastInBrasilia(date: string, time: string): boolean {
  const { date: todayBR, time: nowTimeBR } = nowBrasilia();
  if (date < todayBR) return true;
  if (date === todayBR && time <= nowTimeBR) return true;
  return false;
}

export function isSlotConflict(
  date: string, profId: string, startTime: string, endTime: string,
  appointments: Appointment[], blockedSlots: { professionalId: string; date: string; startTime: string; endTime: string }[],
  excludeId?: string
): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const sMin = toMin(startTime), eMin = toMin(endTime);
  return (
    appointments.some(a =>
      a.id !== excludeId && a.professionalId === profId && a.date === date &&
      a.status !== 'cancelled' && sMin < toMin(a.endTime) && eMin > toMin(a.startTime)
    ) ||
    blockedSlots.some(b =>
      b.professionalId === profId && b.date === date &&
      sMin < toMin(b.endTime) && eMin > toMin(b.startTime)
    )
  );
}
