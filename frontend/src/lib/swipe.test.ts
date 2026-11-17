import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

describe('swipeDirection', () => {
  it('arrastar para a esquerda avança, para a direita volta', () => {
    expect(swipeDirection(-80, 5)).toBe(1);
    expect(swipeDirection(80, -5)).toBe(-1);
  });
  it('gesto curto não conta', () => {
    expect(swipeDirection(-59, 0)).toBe(0);
    expect(swipeDirection(60, 0)).toBe(-1);
  });
  it('gesto muito inclinado é rolagem, não swipe', () => {
    expect(swipeDirection(-100, 41)).toBe(0);
    expect(swipeDirection(-100, -40)).toBe(1);
  });
});
