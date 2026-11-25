import { ApiError } from '@/lib/api';

export type ManageAction = 'load' | 'cancel' | 'reschedule';

export interface ManageError {
  message: string;
  /** O aparelho ainda não confirmou o celular: a tela leva o cliente de volta ao início do fluxo. */
  deviceRequired: boolean;
  /** O horário escolhido foi ocupado por outra pessoa: a tela recarrega os horários. */
  conflict: boolean;
}

export const DEVICE_REQUIRED_MESSAGE = 'Confirme seu celular para gerenciar seus agendamentos.';

/** Traduz os erros da API de "meus agendamentos" em mensagens amigáveis (nunca "Erro 400"). */
export function manageError(err: unknown, action: ManageAction): ManageError {
  const code = err instanceof ApiError ? err.code : undefined;
  const status = err instanceof ApiError ? err.status : 0;
  const base = { deviceRequired: false, conflict: false };

  if (code === 'DEVICE_REQUIRED') return { ...base, deviceRequired: true, message: DEVICE_REQUIRED_MESSAGE };
  if (code === 'CANCELLATION_WINDOW_EXPIRED') {
    return { ...base, message: 'O prazo para cancelar já passou (é preciso pelo menos 1 hora de antecedência). Fale com o estabelecimento.' };
  }
  if (code === 'RESCHEDULE_WINDOW_EXPIRED') {
    return { ...base, message: 'O prazo para remarcar já passou (é preciso pelo menos 1 hora de antecedência). Fale com o estabelecimento.' };
  }
  if (status === 409 || code === 'SCHEDULE_CONFLICT') {
    return { ...base, conflict: true, message: 'Esse horário acabou de ser ocupado. Escolha outro horário.' };
  }
  if (code === 'INVALID_DATE') return { ...base, message: 'Essa data não está disponível. Escolha outra data.' };
  // Sem rede / servidor fora: a API já devolve uma frase em português.
  if (err instanceof ApiError && (status === 0 || status >= 500)) return { ...base, message: err.message };
  if (action === 'load') return { ...base, message: 'Não foi possível carregar seus agendamentos. Tente novamente.' };
  if (action === 'cancel') return { ...base, message: 'Não foi possível cancelar. Tente novamente.' };
  return { ...base, message: 'Não foi possível remarcar. Tente novamente.' };
}

/** Faltam menos de 1 hora (ou já passou)? Horário de Brasília (UTC-3). */
export function minutesUntil(date: string, time: string, nowMs: number = Date.now()): number {
  return Math.floor((new Date(`${date}T${time}:00-03:00`).getTime() - nowMs) / 60000);
}

export const MIN_ADVANCE_MINUTES = 60;

export function isManageable(a: { status: string; date: string; startTime: string }, nowMs: number = Date.now()): boolean {
  return (a.status === 'pending' || a.status === 'confirmed') && minutesUntil(a.date, a.startTime, nowMs) > 0;
}

export function canChange(a: { status: string; date: string; startTime: string }, nowMs: number = Date.now()): boolean {
  return isManageable(a, nowMs) && minutesUntil(a.date, a.startTime, nowMs) >= MIN_ADVANCE_MINUTES;
}

export const RESCHEDULE_REQUESTS_CONFIRMATION = 'Pedimos uma nova confirmação ao estabelecimento.';
