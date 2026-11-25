import type { Appointment } from '@/types';

/**
 * Regra ÚNICA do que é um pedido "aguardando confirmação": pendente, de hoje em diante e com o prazo ainda valendo.
 * A caixa "Aguardando confirmação" e os contadores de "Pendentes" usam esta função, para nunca divergirem
 * (pedido de horário já passado ou com prazo vencido não é mais algo a decidir; o servidor o cancela sozinho).
 *
 * @param todayIso data de hoje em Brasília (yyyy-MM-dd)
 * @param nowMs    agora, em ms (padrão: Date.now())
 */
export function isAwaitingConfirmation(
  a: Pick<Appointment, 'status' | 'date' | 'confirmBy'>,
  todayIso: string,
  nowMs: number = Date.now(),
): boolean {
  if (a.status !== 'pending') return false;
  if (a.date < todayIso) return false;
  return !a.confirmBy || new Date(a.confirmBy).getTime() > nowMs;
}

export function countAwaitingConfirmation(
  appointments: readonly Pick<Appointment, 'status' | 'date' | 'confirmBy'>[],
  todayIso: string,
  nowMs: number = Date.now(),
): number {
  return appointments.filter(a => isAwaitingConfirmation(a, todayIso, nowMs)).length;
}
