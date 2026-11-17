import { describe, expect, it } from 'vitest';
import { isOfflineWrite } from './offline';

describe('isOfflineWrite', () => {
  it('offline bloqueia qualquer mudança', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) expect(isOfflineWrite(m, false)).toBe(true);
  });
  it('offline ainda permite leitura', () => {
    expect(isOfflineWrite('GET', false)).toBe(false);
    expect(isOfflineWrite(undefined, false)).toBe(false);
  });
  it('online nunca bloqueia', () => {
    expect(isOfflineWrite('POST', true)).toBe(false);
  });
});
