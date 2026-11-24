import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, clientMatches, filterAppointments, hasActiveFilters, statusActionsFor, statusErrorMessage } from './appointmentFilters';
import { ApiError } from './api';
import type { Appointment } from '@/types';

const clients = [
  { id: 'c1', name: 'João Pereira', email: 'joao@mail.com', phone: '(11) 98888-7777' },
  { id: 'c2', name: 'Maria Souza', email: 'maria@mail.com', phone: '(21) 97777-1234' },
];
const mk = (id: string, o: Partial<Appointment>): Appointment => ({
  id, tenantId: 't', clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-11-10',
  startTime: '09:00', endTime: '09:30', status: 'confirmed', price: 50, createdAt: '', ...o,
});
const appts = [
  mk('a1', { date: '2026-11-10', startTime: '09:00' }),
  mk('a2', { date: '2026-11-12', startTime: '10:00', clientId: 'c2', professionalId: 'p2', serviceId: 's2', status: 'pending' }),
  mk('a3', { date: '2026-11-12', startTime: '15:00', status: 'cancelled', serviceId: 's2' }),
  mk('a4', { date: '2026-11-20', startTime: '08:00', clientId: 'c2', status: 'completed' }),
];
const ids = (f: Partial<typeof EMPTY_FILTERS>) => filterAppointments(appts, clients, { ...EMPTY_FILTERS, ...f }).map(a => a.id);

describe('filterAppointments', () => {
  it('sem filtros, devolve tudo do mais recente para o mais antigo', () => {
    expect(ids({})).toEqual(['a4', 'a3', 'a2', 'a1']);
  });

  it('filtra por período, inclusive nas pontas', () => {
    expect(ids({ dateFrom: '2026-11-12', dateTo: '2026-11-12' })).toEqual(['a3', 'a2']);
    expect(ids({ dateFrom: '2026-11-13' })).toEqual(['a4']);
    expect(ids({ dateTo: '2026-11-10' })).toEqual(['a1']);
  });

  it('filtra por status', () => {
    expect(ids({ status: 'pending' })).toEqual(['a2']);
    expect(ids({ status: 'cancelled' })).toEqual(['a3']);
  });

  it('filtra por profissional e por serviço', () => {
    expect(ids({ professionalId: 'p2' })).toEqual(['a2']);
    expect(ids({ serviceId: 's2' })).toEqual(['a3', 'a2']);
  });

  it('combina os filtros (E lógico)', () => {
    expect(ids({ serviceId: 's2', status: 'pending' })).toEqual(['a2']);
    expect(ids({ serviceId: 's2', professionalId: 'p9' })).toEqual([]);
  });

  it('busca por nome, e-mail e telefone do cliente', () => {
    expect(ids({ search: 'maria' })).toEqual(['a4', 'a2']);
    expect(ids({ search: 'joao@mail' })).toEqual(['a3', 'a1']);
    expect(ids({ search: '98888' })).toEqual(['a3', 'a1']);
    expect(ids({ search: '(21) 97777' })).toEqual(['a4', 'a2']);
  });

  it('a busca ignora acento e maiúsculas', () => {
    expect(ids({ search: 'JOAO PEREIRA' })).toEqual(['a3', 'a1']);
    expect(ids({ search: 'joão' })).toEqual(['a3', 'a1']);
  });

  it('não altera a lista original', () => {
    const copy = appts.map(a => a.id);
    ids({});
    expect(appts.map(a => a.id)).toEqual(copy);
  });
});

describe('clientMatches / hasActiveFilters', () => {
  it('busca vazia combina com qualquer um; cliente ausente só com busca vazia', () => {
    expect(clientMatches(undefined, '')).toBe(true);
    expect(clientMatches(undefined, 'x')).toBe(false);
  });
  it('detecta filtros ativos', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, status: 'pending' })).toBe(true);
  });
});

describe('statusActionsFor', () => {
  const labels = (s: Parameters<typeof statusActionsFor>[0]) => statusActionsFor(s).map(a => a.label);
  it('pendente: confirmar, concluir, marcar falta, cancelar', () => {
    expect(labels('pending')).toEqual(['Confirmar', 'Concluir', 'Marcar falta', 'Cancelar']);
  });
  it('confirmado: concluir, marcar falta, cancelar', () => {
    expect(labels('confirmed')).toEqual(['Concluir', 'Marcar falta', 'Cancelar']);
  });
  it('concluído e cancelado: sem ações; falta: só cancelar', () => {
    expect(labels('completed')).toEqual([]);
    expect(labels('cancelled')).toEqual([]);
    expect(labels('no_show')).toEqual(['Cancelar']);
  });
});

describe('statusErrorMessage', () => {
  it('409 mostra a explicação do servidor', () => {
    const msg = 'Este agendamento está cancelado e não pode passar para confirmado. Atualize a tela.';
    expect(statusErrorMessage(new ApiError(msg, 409, 'INVALID_STATUS_TRANSITION'))).toBe(msg);
  });
  it('outros erros usam a mensagem genérica', () => {
    const generic = 'Não foi possível atualizar o agendamento. Tente novamente.';
    expect(statusErrorMessage(new ApiError('Erro interno', 500))).toBe(generic);
    expect(statusErrorMessage(new Error('rede'))).toBe(generic);
  });
});
