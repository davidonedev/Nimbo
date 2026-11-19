import { describe, expect, it } from 'vitest';
import { businessHoursLabel, formatHour, openStatus, weekdaysLabel } from './bookingHours';

const pro = (days: number[], start = '09:00', end = '18:00') => ({ workingDays: days, workingHours: { start, end } });

describe('formatHour', () => {
  it('omite os minutos quando é hora cheia', () => {
    expect(formatHour('09:00')).toBe('9h');
    expect(formatHour('18:30')).toBe('18h30');
    expect(formatHour('08:05')).toBe('8h05');
  });
});

describe('weekdaysLabel', () => {
  it('resume sequência de 3+ dias com travessão, começando na segunda', () => {
    expect(weekdaysLabel([1, 2, 3, 4, 5, 6])).toBe('Seg–Sáb');
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Seg–Dom');
  });
  it('lista dias soltos', () => {
    expect(weekdaysLabel([1, 3, 5])).toBe('Seg, Qua e Sex');
    expect(weekdaysLabel([1, 2])).toBe('Seg e Ter');
    expect(weekdaysLabel([6])).toBe('Sáb');
    expect(weekdaysLabel([])).toBe('');
  });
});

describe('businessHoursLabel', () => {
  it('une dias e pega a menor abertura e o maior fechamento', () => {
    expect(businessHoursLabel([pro([1, 2, 3, 4, 5], '09:00', '17:00'), pro([1, 2, 3, 4, 5, 6], '10:00', '18:00')])).toBe('Seg–Sáb, 9h–18h');
  });
  it('sem profissionais não mostra horário', () => {
    expect(businessHoursLabel([])).toBeNull();
  });
});

describe('openStatus', () => {
  const pros = [pro([1, 2, 3, 4, 5, 6])];
  it('aberto agora mostra a hora de fechar', () => {
    expect(openStatus(true, pros, { dayOfWeek: 4, time: '14:20' })).toEqual({ kind: 'open', label: 'Aberto agora · fecha 18h' });
  });
  it('fora do expediente ou em dia sem atendimento aparece como fechado agora', () => {
    expect(openStatus(true, pros, { dayOfWeek: 4, time: '19:00' }).kind).toBe('closed-now');
    expect(openStatus(true, pros, { dayOfWeek: 0, time: '10:00' }).kind).toBe('closed-now');
  });
  it('agendamento pausado pelo dono vira "paused"', () => {
    expect(openStatus(false, pros, { dayOfWeek: 4, time: '10:00' }).kind).toBe('paused');
  });
});
