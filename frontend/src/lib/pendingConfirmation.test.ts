import { describe, expect, it } from 'vitest';
import { countAwaitingConfirmation, isAwaitingConfirmation } from './pendingConfirmation';

const TODAY = '2030-05-10';
const NOW = new Date('2030-05-10T15:00:00Z').getTime();
const a = (over: Record<string, unknown>) => ({ status: 'pending', date: TODAY, confirmBy: null, ...over }) as never;

describe('isAwaitingConfirmation (regra única da caixa e do contador)', () => {
  it('pendente de hoje ou futuro, sem prazo ou com prazo valendo, conta', () => {
    expect(isAwaitingConfirmation(a({}), TODAY, NOW)).toBe(true);
    expect(isAwaitingConfirmation(a({ date: '2030-06-01' }), TODAY, NOW)).toBe(true);
    expect(isAwaitingConfirmation(a({ confirmBy: '2030-05-10T15:30:00Z' }), TODAY, NOW)).toBe(true);
  });
  it('data passada, prazo vencido ou outro status não contam', () => {
    expect(isAwaitingConfirmation(a({ date: '2030-05-09' }), TODAY, NOW)).toBe(false);
    expect(isAwaitingConfirmation(a({ confirmBy: '2030-05-10T14:59:00Z' }), TODAY, NOW)).toBe(false);
    expect(isAwaitingConfirmation(a({ confirmBy: '2030-05-10T15:00:00Z' }), TODAY, NOW)).toBe(false);
    for (const status of ['confirmed', 'completed', 'cancelled', 'no_show']) {
      expect(isAwaitingConfirmation(a({ status }), TODAY, NOW)).toBe(false);
    }
  });
  it('o contador bate com a caixa: 14 pendentes no banco, 1 de horário passado => 13', () => {
    const list = Array.from({ length: 13 }, (_, i) => a({ date: '2030-05-11', id: String(i) }));
    list.push(a({ date: '2030-05-01' }));
    expect(list.filter(x => x.status === 'pending')).toHaveLength(14);
    expect(countAwaitingConfirmation(list, TODAY, NOW)).toBe(13);
  });
});
