import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { canChange, isManageable, manageError, minutesUntil } from './manageErrors';

describe('manageError: mensagens amigáveis', () => {
  it('403 DEVICE_REQUIRED pede para confirmar o celular', () => {
    const e = manageError(new ApiError('Forbidden', 403, 'DEVICE_REQUIRED'), 'load');
    expect(e.deviceRequired).toBe(true);
    expect(e.message).toBe('Confirme seu celular para gerenciar seus agendamentos.');
  });
  it('prazo de cancelamento e de remarcação vencidos', () => {
    expect(manageError(new ApiError('x', 400, 'CANCELLATION_WINDOW_EXPIRED'), 'cancel').message).toMatch(/prazo para cancelar/);
    expect(manageError(new ApiError('x', 400, 'RESCHEDULE_WINDOW_EXPIRED'), 'reschedule').message).toMatch(/prazo para remarcar/);
  });
  it('409 = horário ocupado, e marca conflito para recarregar os horários', () => {
    const e = manageError(new ApiError('Conflito', 409, 'SCHEDULE_CONFLICT'), 'reschedule');
    expect(e.conflict).toBe(true);
    expect(e.message).toBe('Esse horário acabou de ser ocupado. Escolha outro horário.');
  });
  it('remarcar refaz a validação: antecedência mínima, mesmo horário e estabelecimento fechado mostram a frase do servidor', () => {
    const advance = 'Esse horário fica dentro da antecedência mínima de 120 minutos do estabelecimento. Escolha um horário mais à frente.';
    expect(manageError(new ApiError(advance, 400, 'MIN_ADVANCE'), 'reschedule').message).toBe(advance);
    expect(manageError(new ApiError('Escolha um horário diferente do atual.', 400, 'SAME_SLOT'), 'reschedule').message).toBe('Escolha um horário diferente do atual.');
    expect(manageError(new ApiError('Este estabelecimento está fechado para novos agendamentos.', 403, 'CLOSED'), 'reschedule').message).toMatch(/fechado/);
  });
  it('INVALID_DATE, rede fora e erro desconhecido nunca mostram texto técnico', () => {
    expect(manageError(new ApiError('x', 400, 'INVALID_DATE'), 'reschedule').message).toMatch(/data/);
    expect(manageError(new ApiError('Sem conexão.', 0, 'NETWORK'), 'cancel').message).toBe('Sem conexão.');
    expect(manageError(new Error('boom'), 'cancel').message).toBe('Não foi possível cancelar. Tente novamente.');
    expect(manageError(new ApiError('Erro 400', 400), 'load').message).toBe('Não foi possível carregar seus agendamentos. Tente novamente.');
  });
});

describe('prazo de 1 hora (horário de Brasília)', () => {
  const now = new Date('2030-05-10T12:00:00-03:00').getTime();
  it('minutesUntil', () => {
    expect(minutesUntil('2030-05-10', '13:30', now)).toBe(90);
    expect(minutesUntil('2030-05-10', '11:00', now)).toBe(-60);
  });
  it('só dá para alterar pendente/confirmado com 1 h ou mais de antecedência', () => {
    const base = { date: '2030-05-10' };
    expect(canChange({ ...base, startTime: '13:00', status: 'confirmed' }, now)).toBe(true);
    expect(canChange({ ...base, startTime: '12:59', status: 'confirmed' }, now)).toBe(false);
    expect(isManageable({ ...base, startTime: '12:59', status: 'pending' }, now)).toBe(true); // ainda é "próximo"
    expect(isManageable({ ...base, startTime: '11:00', status: 'pending' }, now)).toBe(false); // já passou: histórico
    expect(canChange({ ...base, startTime: '15:00', status: 'cancelled' }, now)).toBe(false);
    expect(canChange({ ...base, startTime: '15:00', status: 'completed' }, now)).toBe(false);
  });
});
