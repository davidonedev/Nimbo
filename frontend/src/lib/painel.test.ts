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
  it('segue o interruptor do portal do cliente (tenant.isOpen)', () => {
    expect(computeOpenStatus({ isOpen: true })).toBe(true);
    expect(computeOpenStatus({ isOpen: false })).toBe(false);
  });
});
