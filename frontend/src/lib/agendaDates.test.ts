import { describe, expect, it } from 'vitest';
import {
  addDaysISO, agendaPeriod, dayNumber, fromMinutes, monthYearLabel, nowTimeSP, todaySP, toMinutes,
  weekdayIndex, weekdayLong, weekdayShort,
} from './agendaDates';

describe('fuso America/Sao_Paulo', () => {
  it('hoje é o dia de Brasília, não o do UTC (virada de dia)', () => {
    // 01:30 UTC de 13/11 ainda é 22:30 de 12/11 em Brasília
    expect(todaySP(new Date('2026-11-13T01:30:00Z'))).toBe('2026-11-12');
    expect(nowTimeSP(new Date('2026-11-13T01:30:00Z'))).toBe('22:30');
  });

  it('depois das 03:00 UTC já é o dia seguinte em Brasília', () => {
    expect(todaySP(new Date('2026-11-13T03:00:00Z'))).toBe('2026-11-13');
    expect(nowTimeSP(new Date('2026-11-13T03:00:00Z'))).toBe('00:00');
  });

  it('meia-noite de Brasília não vira "24:00"', () => {
    expect(nowTimeSP(new Date('2026-11-13T03:05:00Z'))).toBe('00:05');
  });
});

describe('aritmética de datas', () => {
  it('soma dias cruzando mês e ano', () => {
    expect(addDaysISO('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('respeita ano bissexto', () => {
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysISO('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('converte hora e minutos nos dois sentidos', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('00:00')).toBe(0);
    expect(fromMinutes(570)).toBe('09:30');
    expect(fromMinutes(0)).toBe('00:00');
  });
});

describe('rótulos', () => {
  it('dia da semana (0 = domingo)', () => {
    expect(weekdayIndex('2026-11-13')).toBe(5);
    expect(weekdayIndex('2026-11-15')).toBe(0);
  });

  it('nomes em português', () => {
    expect(weekdayShort('2026-11-13')).toBe('Sex');
    expect(weekdayShort('2026-11-14')).toBe('Sáb');
    expect(weekdayLong('2026-11-13')).toBe('Sexta-feira');
    expect(monthYearLabel('2026-11-13')).toBe('Novembro de 2026');
    expect(dayNumber('2026-11-03')).toBe('03');
  });
});

describe('agendaPeriod (janela de busca estável por mês)', () => {
  it('é a mesma para todos os dias do mês', () => {
    const first = agendaPeriod('2026-11-01');
    expect(agendaPeriod('2026-11-15')).toEqual(first);
    expect(agendaPeriod('2026-11-30')).toEqual(first);
  });

  it('cobre 7 dias antes do mês e 28 depois', () => {
    expect(agendaPeriod('2026-11-13')).toEqual({ start: '2026-10-25', end: '2026-12-28' });
  });

  it('funciona em dezembro (virada de ano) e fevereiro', () => {
    expect(agendaPeriod('2026-12-10')).toEqual({ start: '2026-11-24', end: '2027-01-28' });
    expect(agendaPeriod('2028-02-10')).toEqual({ start: '2028-01-25', end: '2028-03-28' });
  });

  it('inclui a faixa de dias (-7/+21) de qualquer dia do mês', () => {
    for (const d of ['2026-11-01', '2026-11-30']) {
      const { start, end } = agendaPeriod(d);
      expect(addDaysISO(d, -7) >= start).toBe(true);
      expect(addDaysISO(d, 21) <= end).toBe(true);
    }
  });
});
