import { describe, expect, it } from 'vitest';
import type { Appointment, BlockedSlot, Professional } from '../types';
import { computeBusinessStatus, computeDayHours, computeDayStats, workingProfessionals } from './agendaStats';

const prof = (over: Partial<Professional> = {}): Professional => ({
  id: 'p1', tenantId: 't', name: 'Ana', specialty: '', avatar: '', bio: '', services: [],
  workingHours: { start: '09:00', end: '12:00' }, workingDays: [1, 2, 3, 4, 5], ...over,
});

const appt = (id: string, start: string, end: string, status: Appointment['status'], over: Partial<Appointment> = {}): Appointment => ({
  id, tenantId: 't', clientId: 'c', professionalId: 'p1', serviceId: 's', date: '2026-11-13',
  startTime: start, endTime: end, status, price: 50, createdAt: '2026-11-01T00:00:00Z', ...over,
});

const FRI = '2026-11-13';
const SAT = '2026-11-14';
const SUN = '2026-11-15';
const bia = prof({ id: 'p2', name: 'Bia', workingHours: { start: '10:00', end: '14:00' }, workingDays: [1, 2, 3, 4, 5, 6] });

describe('workingProfessionals / computeDayHours', () => {
  it('lista só quem trabalha no dia da semana', () => {
    expect(workingProfessionals(FRI, [prof(), bia]).map(p => p.id)).toEqual(['p1', 'p2']);
    expect(workingProfessionals(SAT, [prof(), bia]).map(p => p.id)).toEqual(['p2']);
    expect(workingProfessionals(SUN, [prof(), bia])).toEqual([]);
  });

  it('funcionamento = primeiro começo até o último fim', () => {
    expect(computeDayHours(FRI, [prof(), bia])).toEqual({ open: '09:00', close: '14:00' });
    expect(computeDayHours(SAT, [prof(), bia])).toEqual({ open: '10:00', close: '14:00' });
  });

  it('sem ninguém trabalhando, não há funcionamento', () => {
    expect(computeDayHours(SUN, [prof(), bia])).toBeNull();
    expect(computeDayHours(FRI, [])).toBeNull();
  });
});

describe('computeBusinessStatus', () => {
  const hours = { open: '09:00', close: '18:00' };

  it('"Fechado" quando o portal está fechado ou não há expediente', () => {
    expect(computeBusinessStatus(FRI, FRI, hours, false, '10:00')).toEqual({ state: 'closed', label: 'Fechado' });
    expect(computeBusinessStatus(FRI, FRI, null, true, '10:00')).toEqual({ state: 'closed', label: 'Fechado' });
  });

  it('dia passado é "Fechado"', () => {
    expect(computeBusinessStatus('2026-11-12', FRI, hours, true, '10:00').label).toBe('Fechado');
  });

  it('dia futuro mostra a hora em que abre', () => {
    expect(computeBusinessStatus(SAT, FRI, hours, true, '23:00')).toEqual({ state: 'opens_later', label: 'Abre às 09:00' });
  });

  it('hoje, antes de abrir: "Abre às"', () => {
    expect(computeBusinessStatus(FRI, FRI, hours, true, '08:59')).toEqual({ state: 'opens_later', label: 'Abre às 09:00' });
  });

  it('hoje, dentro do expediente: "Aberto" (abertura inclusive, fechamento exclusivo)', () => {
    expect(computeBusinessStatus(FRI, FRI, hours, true, '09:00').state).toBe('open');
    expect(computeBusinessStatus(FRI, FRI, hours, true, '17:59').state).toBe('open');
    expect(computeBusinessStatus(FRI, FRI, hours, true, '18:00')).toEqual({ state: 'closed_today', label: 'Já fechou' });
  });
});

describe('computeDayStats', () => {
  const day = [
    appt('a', '09:00', '09:30', 'completed'),
    appt('b', '09:30', '10:00', 'cancelled'),
    appt('c', '10:00', '10:30', 'confirmed'),
    appt('d', '10:30', '11:00', 'no_show'),
    appt('e', '11:00', '11:30', 'pending'),
  ];

  it('conta cada status e agrupa cancelados e faltas', () => {
    const s = computeDayStats(FRI, FRI, day, [], [prof()], '08:00');
    expect(s).toMatchObject({ total: 3, confirmed: 1, pending: 1, completed: 1, cancelledOrNoShow: 2 });
  });

  it('só conta os agendamentos do dia selecionado', () => {
    const outro = [...day, appt('x', '10:00', '10:30', 'confirmed', { date: SAT })];
    expect(computeDayStats(FRI, FRI, outro, [], [prof()], '08:00').total).toBe(3);
  });

  it('horários livres: faixas de 30 min sem agendamento ativo (cancelado e falta liberam)', () => {
    // 6 faixas (09:00–12:00); ocupadas: 09:00 (concluído), 10:00 (confirmado), 11:00 (pendente)
    expect(computeDayStats(FRI, FRI, day, [], [prof()], '08:00').freeSlots).toBe(3);
  });

  it('hoje, não conta faixas que já passaram', () => {
    // às 10:15: sobram 10:30, 11:00 (ocupada) e 11:30 -> 2 livres
    expect(computeDayStats(FRI, FRI, day, [], [prof()], '10:15').freeSlots).toBe(2);
  });

  it('bloqueios tiram faixas livres', () => {
    const blocks: BlockedSlot[] = [{ id: 'b', tenantId: 't', professionalId: 'p1', date: FRI, startTime: '09:30', endTime: '10:00' }];
    expect(computeDayStats(FRI, FRI, day, blocks, [prof()], '08:00').freeSlots).toBe(2);
  });

  it('dia passado não tem horários livres', () => {
    expect(computeDayStats(FRI, '2026-11-20', day, [], [prof()], '08:00').freeSlots).toBe(0);
  });

  it('dia de folga não tem horários livres', () => {
    expect(computeDayStats(SUN, FRI, [], [], [prof()], '08:00').freeSlots).toBe(0);
  });

  it('soma as faixas livres de todos os profissionais do dia', () => {
    // Ana 6 faixas + Bia (10:00–14:00) 8 faixas, sem agendamentos
    expect(computeDayStats(FRI, '2026-11-12', [], [], [prof(), bia], '08:00').freeSlots).toBe(14);
  });
});
