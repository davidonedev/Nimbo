import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SLOW_REQUEST_MS, resetServerWaking, trackSlowRequest, useServerWaking } from './serverWaking';

describe('trackSlowRequest', () => {
  beforeEach(() => { vi.useFakeTimers(); resetServerWaking(); });
  afterEach(() => { vi.useRealTimers(); resetServerWaking(); });

  it('chamada rápida nunca liga o aviso', () => {
    const { result } = renderHook(() => useServerWaking());
    const done = trackSlowRequest();
    act(() => { vi.advanceTimersByTime(SLOW_REQUEST_MS - 1); });
    done();
    act(() => { vi.advanceTimersByTime(SLOW_REQUEST_MS * 2); });
    expect(result.current).toBe(false);
  });

  it('chamada lenta liga o aviso e a resposta desliga', () => {
    const { result } = renderHook(() => useServerWaking());
    const done = trackSlowRequest();
    act(() => { vi.advanceTimersByTime(SLOW_REQUEST_MS + 1); });
    expect(result.current).toBe(true);
    act(() => { done(); });
    expect(result.current).toBe(false);
  });

  it('o aviso só some quando todas as chamadas lentas terminam', () => {
    const { result } = renderHook(() => useServerWaking());
    const a = trackSlowRequest();
    const b = trackSlowRequest();
    act(() => { vi.advanceTimersByTime(SLOW_REQUEST_MS + 1); });
    act(() => { a(); a(); }); // encerrar duas vezes não desconta a outra
    expect(result.current).toBe(true);
    act(() => { b(); });
    expect(result.current).toBe(false);
  });
});
