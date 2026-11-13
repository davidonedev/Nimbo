import { describe, expect, it } from 'vitest';
import { breakpointFor } from './breakpoints';

describe('breakpointFor', () => {
  it('celular até 767 px, tablet de 768, desktop a partir de 1024', () => {
    expect(breakpointFor(320)).toBe('mobile');
    expect(breakpointFor(767)).toBe('mobile');
    expect(breakpointFor(768)).toBe('tablet');
    expect(breakpointFor(1023)).toBe('tablet');
    expect(breakpointFor(1024)).toBe('desktop');
    expect(breakpointFor(1920)).toBe('desktop');
  });
});
