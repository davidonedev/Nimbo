import { describe, expect, it } from 'vitest';
import { dayNavLabel } from './dayNavLabel';

// Terça-feira, 24/11/2026
const now = new Date(2026, 10, 24, 15, 30);
const at = (d: number, m = 10) => new Date(2026, m, d);

describe('dayNavLabel (dia)', () => {
  it('hoje, amanhã e ontem', () => {
    expect(dayNavLabel(at(24), now, 'day')).toBe('Hoje');
    expect(dayNavLabel(at(25), now, 'day')).toBe('Amanhã');
    expect(dayNavLabel(at(23), now, 'day')).toBe('Ontem');
  });

  it('depois de amanhã mostra o dia da semana e a data por extenso', () => {
    expect(dayNavLabel(at(26), now, 'day')).toBe('Quinta-feira, 26 de novembro');
    expect(dayNavLabel(at(1, 11), now, 'day')).toBe('Terça-feira, 1 de dezembro');
    expect(dayNavLabel(at(21), now, 'day')).toBe('Sábado, 21 de novembro');
  });

  it('a hora do dia não muda o rótulo', () => {
    expect(dayNavLabel(new Date(2026, 10, 24, 23, 59), new Date(2026, 10, 24, 0, 1), 'day')).toBe('Hoje');
  });
});

describe('dayNavLabel (semana)', () => {
  it('esta semana, próxima e passada (a semana começa na segunda)', () => {
    expect(dayNavLabel(at(23), now, 'week')).toBe('Esta semana'); // segunda
    expect(dayNavLabel(at(28), now, 'week')).toBe('Esta semana'); // sábado
    expect(dayNavLabel(at(22), now, 'week')).toBe('Semana passada'); // domingo ainda é a semana de 16/11
    expect(dayNavLabel(at(30), now, 'week')).toBe('Próxima semana');
    expect(dayNavLabel(at(17), now, 'week')).toBe('Semana passada');
  });

  it('semanas mais distantes mostram segunda a sábado', () => {
    expect(dayNavLabel(at(7, 11), now, 'week')).toBe('7 de dez – 12 de dez');
    expect(dayNavLabel(at(2, 10), now, 'week')).toBe('2 de nov – 7 de nov');
  });
});
