import { describe, expect, it } from 'vitest';
import { NIMBO_BLUE, accentOnDark, luminance, readableOn } from './bookingColor';

describe('accentOnDark', () => {
  it('cor ausente ou inválida cai no azul da Nimbo (já ajustado para o fundo escuro)', () => {
    const brand = accentOnDark(NIMBO_BLUE);
    expect(accentOnDark(null)).toBe(brand);
    expect(accentOnDark('')).toBe(brand);
    expect(accentOnDark('roxo')).toBe(brand);
    expect(luminance(brand)).toBeGreaterThanOrEqual(0.14);
  });
  it('cor com contraste suficiente fica como está (só normaliza para minúsculas)', () => {
    expect(accentOnDark('#C2410C')).toBe('#c2410c');
    expect(accentOnDark('#F97316')).toBe('#f97316');
  });
  it('cor um pouco escura (ex.: roxo) é clareada só o suficiente, mantendo o tom', () => {
    const out = accentOnDark('#7c3aed');
    expect(out).not.toBe('#7c3aed');
    expect(luminance(out)).toBeGreaterThanOrEqual(0.14);
    expect(luminance(out)).toBeLessThan(0.2);
  });
  it('cor escura demais é clareada até aparecer sobre o fundo escuro', () => {
    const lifted = accentOnDark('#1a1a2e');
    expect(lifted).not.toBe('#1a1a2e');
    expect(luminance(lifted)).toBeGreaterThanOrEqual(0.14);
  });
  it('preto puro também é resolvido', () => {
    expect(luminance(accentOnDark('#000000'))).toBeGreaterThanOrEqual(0.14);
  });
});

describe('readableOn', () => {
  it('texto claro sobre cor escura e escuro sobre cor clara', () => {
    expect(readableOn('#1a1a2e')).toBe('#ffffff');
    expect(readableOn('#facc15')).toBe('#111111');
  });
});
