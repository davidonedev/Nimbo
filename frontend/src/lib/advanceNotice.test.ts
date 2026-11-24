import { describe, expect, it } from 'vitest';
import { ADVANCE_PRESETS, advanceError, earliestBooking, formatAdvance, isPreset, toMinutes } from './advanceNotice';

describe('formatAdvance', () => {
  it('escreve o tempo por extenso', () => {
    expect(formatAdvance(0)).toBe('Sem mínimo');
    expect(formatAdvance(30)).toBe('30 min');
    expect(formatAdvance(60)).toBe('1 hora');
    expect(formatAdvance(120)).toBe('2 horas');
    expect(formatAdvance(90)).toBe('1 h 30 min');
    expect(formatAdvance(1440)).toBe('1 dia');
  });
});

describe('opções e valores', () => {
  it('as opções prontas cobrem de "sem mínimo" até 1 dia, sem repetir', () => {
    const minutes = ADVANCE_PRESETS.map(p => p.minutes);
    expect(minutes).toEqual([0, 30, 60, 120, 180, 240, 720, 1440]);
    expect(new Set(minutes).size).toBe(minutes.length);
    expect(isPreset(60)).toBe(true);
    expect(isPreset(45)).toBe(false);
  });

  it('converte o que foi digitado em minutos', () => {
    expect(toMinutes('45', 'minutes')).toBe(45);
    expect(toMinutes('2', 'hours')).toBe(120);
    expect(toMinutes('1,5', 'hours')).toBe(90);
    expect(toMinutes('', 'minutes')).toBeNaN();
    expect(toMinutes('abc', 'minutes')).toBeNaN();
  });

  it('valida o intervalo de 0 a 24 horas', () => {
    expect(advanceError(0)).toBe('');
    expect(advanceError(1440)).toBe('');
    expect(advanceError(1441)).toMatch(/máximo é 24 horas/);
    expect(advanceError(-5)).toMatch(/negativo/);
    expect(advanceError(NaN)).toMatch(/número/);
  });
});

describe('earliestBooking (prévia)', () => {
  const now = { date: '2026-11-24', time: '14:20' };

  it('soma a antecedência ao horário de agora', () => {
    expect(earliestBooking(now, 60).sentence).toBe('Agora são 14:20: o primeiro horário que o cliente consegue marcar é hoje às 15:20.');
    expect(earliestBooking(now, 30).when).toBe('hoje às 14:50');
  });

  it('passando da meia-noite vira amanhã', () => {
    expect(earliestBooking({ date: '2026-11-24', time: '22:30' }, 180).when).toBe('amanhã às 01:30');
    expect(earliestBooking(now, 1440).when).toBe('amanhã às 14:20');
  });

  it('sem antecedência o cliente pode marcar já', () => {
    expect(earliestBooking(now, 0).sentence).toBe('Agora são 14:20: o cliente pode marcar um horário já a partir de agora.');
  });
});
