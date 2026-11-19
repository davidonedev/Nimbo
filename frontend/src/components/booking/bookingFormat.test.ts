import { describe, expect, it } from 'vitest';
import { formatDuration, initials, priceLabel, totalOf, whenLabel } from './bookingFormat';
import type { Service } from '@/types';

describe('formatDuration', () => {
  it('formata minutos, horas cheias e horas com minutos', () => {
    expect(formatDuration(15)).toBe('15 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(125)).toBe('2h05');
  });
});

describe('priceLabel', () => {
  it('sem preço vira "A consultar"', () => {
    expect(priceLabel(0)).toBe('A consultar');
    expect(priceLabel(null)).toBe('A consultar');
    expect(priceLabel(undefined)).toBe('A consultar');
  });
  it('com preço usa moeda brasileira', () => {
    expect(priceLabel(45)).toMatch(/R\$\s?45,00/);
  });
});

describe('totalOf', () => {
  it('soma duração e preço (preço ausente conta zero)', () => {
    const s = (duration: number, price: number | null) => ({ duration, price }) as unknown as Service;
    expect(totalOf([s(30, 35), s(60, 70), s(15, null)])).toEqual({ minutes: 105, price: 105 });
    expect(totalOf([])).toEqual({ minutes: 0, price: 0 });
  });
});

describe('whenLabel / initials', () => {
  it('descreve o dia por extenso, em português', () => {
    expect(whenLabel('2026-11-20', '10:00')).toBe('sexta-feira, 20 de novembro às 10:00');
  });
  it('pega as iniciais de até duas palavras', () => {
    expect(initials('Barber Kings')).toBe('BK');
    expect(initials('  maria  da silva ')).toBe('MD');
    expect(initials('Nimbo')).toBe('N');
  });
});
