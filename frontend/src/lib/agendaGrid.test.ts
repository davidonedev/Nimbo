import { describe, expect, it } from 'vitest';
import type { BlockedSlot, Professional } from '../types';
import type { AgendaAppointment } from '../services/appointments.service';
import { PX_PER_MIN, buildColumn, computeGridRange, isAllDayBlock, layoutLanes, type GridRange } from './agendaGrid';

const prof = (over: Partial<Professional> = {}): Professional => ({
  id: 'p1', tenantId: 't', name: 'Ana', specialty: '', avatar: '', bio: '', services: [],
  workingHours: { start: '09:00', end: '12:00' }, workingDays: [1, 2, 3, 4, 5], ...over,
});

const appt = (id: string, start: string, end: string, status: AgendaAppointment['status'] = 'confirmed', over: Partial<AgendaAppointment> = {}): AgendaAppointment => ({
  id, tenantId: 't', clientId: 'c', professionalId: 'p1', serviceId: 's', date: '2026-11-13',
  startTime: start, endTime: end, status, price: 50, createdAt: '2026-11-01T00:00:00Z', ...over,
});

const block = (start: string, end: string, over: Partial<BlockedSlot> = {}): BlockedSlot => ({
  id: 'b1', tenantId: 't', professionalId: 'p1', date: '2026-11-13', startTime: start, endTime: end, ...over,
});

const FRI = '2026-11-13'; // sexta (profissional trabalha)
const SAT = '2026-11-14'; // sábado (folga)
const range: GridRange = { start: 540, end: 720 }; // 09:00–12:00

describe('layoutLanes (agendamentos sobrepostos lado a lado)', () => {
  it('sem sobreposição, cada um ocupa a coluna inteira', () => {
    expect(layoutLanes([{ start: 540, end: 570 }, { start: 600, end: 630 }])).toEqual([{ lane: 0, lanes: 1 }, { lane: 0, lanes: 1 }]);
  });

  it('dois que se sobrepõem dividem a coluna', () => {
    expect(layoutLanes([{ start: 540, end: 600 }, { start: 570, end: 630 }])).toEqual([{ lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }]);
  });

  it('reaproveita a faixa quando o anterior já terminou', () => {
    expect(layoutLanes([{ start: 540, end: 600 }, { start: 560, end: 620 }, { start: 600, end: 660 }]))
      .toEqual([{ lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 2 }]);
  });

  it('grupos independentes não afetam a largura um do outro', () => {
    expect(layoutLanes([{ start: 540, end: 600 }, { start: 550, end: 610 }, { start: 700, end: 760 }]))
      .toEqual([{ lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 1 }]);
  });

  it('mantém a ordem original dos itens mesmo recebendo fora de ordem', () => {
    expect(layoutLanes([{ start: 570, end: 630 }, { start: 540, end: 600 }])).toEqual([{ lane: 1, lanes: 2 }, { lane: 0, lanes: 2 }]);
  });

  it('lista vazia', () => {
    expect(layoutLanes([])).toEqual([]);
  });

  it('agendamentos encostados (fim = início) não se sobrepõem', () => {
    expect(layoutLanes([{ start: 540, end: 570 }, { start: 570, end: 600 }])).toEqual([{ lane: 0, lanes: 1 }, { lane: 0, lanes: 1 }]);
  });
});

describe('isAllDayBlock', () => {
  it('só 00:00 até o fim do dia conta como dia inteiro', () => {
    expect(isAllDayBlock({ startTime: '00:00', endTime: '23:59' })).toBe(true);
    expect(isAllDayBlock({ startTime: '12:00', endTime: '13:00' })).toBe(false);
    expect(isAllDayBlock({ startTime: '00:00', endTime: '12:00' })).toBe(false);
  });
});

describe('computeGridRange', () => {
  it('vai do primeiro expediente ao último, arredondando para a hora', () => {
    expect(computeGridRange(FRI, [prof({ workingHours: { start: '09:15', end: '17:30' } })], [], [])).toEqual({ start: 540, end: 1080 });
  });

  it('usa o menor começo e o maior fim entre os profissionais do dia', () => {
    const list = [prof(), prof({ id: 'p2', workingHours: { start: '08:00', end: '18:00' } })];
    expect(computeGridRange(FRI, list, [], [])).toEqual({ start: 480, end: 1080 });
  });

  it('sem expediente no dia, usa 08:00–18:00', () => {
    expect(computeGridRange(SAT, [prof()], [], [])).toEqual({ start: 480, end: 1080 });
  });

  it('amplia para caber agendamento fora do expediente', () => {
    expect(computeGridRange(FRI, [prof()], [appt('a', '07:30', '08:00')], [])).toEqual({ start: 420, end: 720 });
    expect(computeGridRange(FRI, [prof()], [appt('a', '12:30', '13:15')], [])).toEqual({ start: 540, end: 840 });
  });

  it('ignora cancelados e agendamentos de outros dias', () => {
    const list = [appt('a', '07:00', '07:30', 'cancelled'), appt('b', '06:00', '06:30', 'confirmed', { date: '2026-11-14' })];
    expect(computeGridRange(FRI, [prof()], list, [])).toEqual({ start: 540, end: 720 });
  });

  it('bloqueio de dia inteiro não estica a grade', () => {
    expect(computeGridRange(FRI, [prof()], [], [block('00:00', '23:59')])).toEqual({ start: 540, end: 720 });
  });
});

describe('buildColumn', () => {
  const build = (appts: AgendaAppointment[] = [], blocks: BlockedSlot[] = [], opts: { date?: string; today?: string; now?: number; interval?: 15 | 30 | 60; p?: Professional; r?: GridRange } = {}) =>
    buildColumn(opts.date ?? FRI, opts.today ?? '2026-11-12', opts.now ?? 0, opts.p ?? prof(), appts, blocks, opts.interval ?? 30, opts.r ?? range);

  it('dia futuro, sem nada: um horário livre a cada 30 min dentro do expediente', () => {
    const col = build();
    expect(col.working).toBe(true);
    expect(col.slots.map(s => s.time)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
    expect(col.offAreas).toEqual([]);
  });

  it('muda a quantidade de horários com o intervalo', () => {
    expect(build([], [], { interval: 60 }).slots).toHaveLength(3);
    expect(build([], [], { interval: 15 }).slots).toHaveLength(12);
  });

  it('posiciona o cartão pela hora e pela duração', () => {
    const [card] = build([appt('a', '10:00', '10:45')]).cards;
    expect(card.top).toBeCloseTo((600 - 540) * PX_PER_MIN);
    expect(card.height).toBeCloseTo(45 * PX_PER_MIN);
  });

  it('horário ocupado deixa de ser clicável', () => {
    const times = build([appt('a', '10:00', '10:30')]).slots.map(s => s.time);
    expect(times).not.toContain('10:00');
    expect(times).toHaveLength(5);
  });

  it('agendamento longo bloqueia todas as faixas que ele cobre', () => {
    const times = build([appt('a', '09:30', '10:30')]).slots.map(s => s.time);
    expect(times).toEqual(['09:00', '10:30', '11:00', '11:30']);
  });

  it('cancelado libera o horário e some da grade', () => {
    const col = build([appt('a', '10:00', '10:30', 'cancelled')]);
    expect(col.cards).toHaveLength(0);
    expect(col.slots.map(s => s.time)).toContain('10:00');
  });

  it('falta (no_show) continua ocupando o horário', () => {
    const col = build([appt('a', '10:00', '10:30', 'no_show')]);
    expect(col.cards).toHaveLength(1);
    expect(col.slots.map(s => s.time)).not.toContain('10:00');
  });

  it('só considera os agendamentos do próprio profissional e do dia', () => {
    const col = build([appt('a', '10:00', '10:30', 'confirmed', { professionalId: 'outro' }), appt('b', '10:00', '10:30', 'confirmed', { date: '2026-11-14' })]);
    expect(col.cards).toHaveLength(0);
    expect(col.slots).toHaveLength(6);
  });

  it('agendamentos sobrepostos viram faixas lado a lado', () => {
    const col = build([appt('a', '10:00', '10:30'), appt('b', '10:15', '10:45')]);
    expect(col.cards.map(c => [c.lane, c.lanes])).toEqual([[0, 2], [1, 2]]);
  });

  it('bloqueio vira área hachurada e tira os horários da faixa', () => {
    const col = build([], [block('09:00', '10:00', { reason: 'Médico' })]);
    expect(col.blockAreas).toHaveLength(1);
    expect(col.blockAreas[0].top).toBe(0);
    expect(col.blockAreas[0].height).toBeCloseTo(60 * PX_PER_MIN);
    expect(col.blockAreas[0].title).toContain('Médico');
    expect(col.slots.map(s => s.time)).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('bloqueio de outro profissional não afeta esta coluna', () => {
    expect(build([], [block('09:00', '10:00', { professionalId: 'outro' })]).slots).toHaveLength(6);
  });

  it('bloqueio de dia inteiro não deixa nenhum horário livre', () => {
    const col = build([], [block('00:00', '23:59')]);
    expect(col.slots).toHaveLength(0);
    expect(col.blockAreas[0].title).toContain('Dia bloqueado');
  });

  it('dia de folga: sem horários e coluna inteira hachurada com explicação', () => {
    const col = build([], [], { date: SAT });
    expect(col.working).toBe(false);
    expect(col.slots).toHaveLength(0);
    expect(col.offAreas).toHaveLength(1);
    expect(col.offAreas[0].title).toContain('Folga');
    expect(col.offAreas[0].height).toBeCloseTo((range.end - range.start) * PX_PER_MIN);
  });

  it('faixa maior que o expediente hachura antes e depois, explicando o motivo', () => {
    const col = build([], [], { r: { start: 480, end: 780 } });
    expect(col.offAreas).toHaveLength(2);
    expect(col.offAreas[0]).toMatchObject({ top: 0, title: expect.stringContaining('09:00') });
    expect(col.offAreas[1].top).toBeCloseTo((720 - 480) * PX_PER_MIN);
    expect(col.offAreas[1].title).toContain('12:00');
  });

  it('hoje, horários que já passaram não ficam clicáveis', () => {
    const col = build([], [], { today: FRI, now: 615 }); // 10:15
    expect(col.slots.map(s => s.time)).toEqual(['10:30', '11:00', '11:30']);
  });

  it('dia passado não recebe novos agendamentos', () => {
    expect(build([], [], { today: '2026-11-20' }).slots).toHaveLength(0);
  });

  it('cartão curto tem altura mínima legível', () => {
    expect(build([appt('a', '10:00', '10:05')]).cards[0].height).toBeGreaterThanOrEqual(18);
  });
});
