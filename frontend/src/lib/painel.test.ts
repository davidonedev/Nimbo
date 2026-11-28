import { describe, expect, it } from 'vitest';
import { computeOpenStatus } from './businessStatus';
import { dayNumber, deltaText, formatDayBR, relativeDayLabel, weekdayShort } from './painel';

describe('formatação do Painel', () => {
  it('formata dd/MM/aaaa sem deslocar o dia por fuso', () => {
    expect(formatDayBR('2026-11-12')).toBe('12/11/2026');
    expect(formatDayBR('2026-01-01')).toBe('01/01/2026');
  });

  it('dia da semana abreviado e número do dia', () => {
    expect(weekdayShort('2026-11-13')).toBe('Sex');
    expect(weekdayShort('2026-11-15')).toBe('Dom');
    expect(dayNumber('2026-11-05')).toBe('05');
  });

  it('rótulo relativo: Hoje, Amanhã ou dia da semana com data', () => {
    expect(relativeDayLabel('2026-11-13', '2026-11-13')).toBe('Hoje');
    expect(relativeDayLabel('2026-11-14', '2026-11-13')).toBe('Amanhã');
    expect(relativeDayLabel('2026-11-16', '2026-11-13')).toBe('seg, 16/11');
  });

  it('virada de mês no "Amanhã"', () => {
    expect(relativeDayLabel('2026-12-01', '2026-11-30')).toBe('Amanhã');
  });
});

describe('deltaText (novos clientes vs. 7 dias anteriores)', () => {
  it('sem cadastros nos dois períodos', () => {
    expect(deltaText(0, 0)).toBe('igual aos 7 dias anteriores');
  });

  it('período anterior vazio', () => {
    expect(deltaText(3, 0)).toBe('sem cadastros nos 7 dias anteriores');
  });

  it('crescimento, queda e igualdade', () => {
    expect(deltaText(5, 3)).toBe('+2 em relação aos 7 dias anteriores');
    expect(deltaText(2, 5)).toBe('-3 em relação aos 7 dias anteriores');
    expect(deltaText(4, 4)).toBe('igual aos 7 dias anteriores');
  });
});

describe('computeOpenStatus (Aberto/Fechado da navbar)', () => {
  const horario = [{ workingDays: [1, 2, 3, 4, 5], workingHours: { start: '08:00', end: '18:00' } }];
  const segunda = '2026-11-30'; // segunda-feira
  const sabado = '2026-11-28';

  it('sem expediente conhecido, segue o interruptor do portal do cliente (tenant.isOpen)', () => {
    expect(computeOpenStatus({ isOpen: true })).toBe(true);
    expect(computeOpenStatus({ isOpen: false })).toBe(false);
    expect(computeOpenStatus({ isOpen: true }, [], { date: segunda, time: '23:00' })).toBe(true);
  });

  it('dentro do expediente (8h–18h) fica Aberto, inclusive no almoço', () => {
    expect(computeOpenStatus({ isOpen: true }, horario, { date: segunda, time: '08:00' })).toBe(true);
    expect(computeOpenStatus({ isOpen: true }, horario, { date: segunda, time: '12:30' })).toBe(true);
    expect(computeOpenStatus({ isOpen: true }, horario, { date: segunda, time: '17:59' })).toBe(true);
  });

  it('passou das 18h (ou ainda não abriu) vira Fechado sozinho', () => {
    expect(computeOpenStatus({ isOpen: true }, horario, { date: segunda, time: '18:00' })).toBe(false);
    expect(computeOpenStatus({ isOpen: true }, horario, { date: segunda, time: '22:15' })).toBe(false);
    expect(computeOpenStatus({ isOpen: true }, horario, { date: segunda, time: '07:59' })).toBe(false);
  });

  it('em dia que ninguém trabalha fica Fechado', () => {
    expect(computeOpenStatus({ isOpen: true }, horario, { date: sabado, time: '10:00' })).toBe(false);
  });

  it('o interruptor desligado fecha mesmo dentro do expediente', () => {
    expect(computeOpenStatus({ isOpen: false }, horario, { date: segunda, time: '10:00' })).toBe(false);
  });

  it('com vários profissionais, basta um estar no expediente', () => {
    const dois = [...horario, { workingDays: [1, 2, 3, 4, 5], workingHours: { start: '14:00', end: '20:00' } }];
    expect(computeOpenStatus({ isOpen: true }, dois, { date: segunda, time: '19:00' })).toBe(true);
    expect(computeOpenStatus({ isOpen: true }, dois, { date: segunda, time: '20:00' })).toBe(false);
  });
});
