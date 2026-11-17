/** Distância mínima (px) para contar como arrastar, e quanto o gesto pode "torcer" na vertical. */
export const SWIPE_MIN_DX = 60;
export const SWIPE_MAX_DY = 40;

/** Direção de um gesto de arrastar: 1 = para a esquerda (avançar), -1 = para a direita (voltar), 0 = não é swipe. */
export function swipeDirection(dx: number, dy: number): 1 | -1 | 0 {
  if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dy) > SWIPE_MAX_DY) return 0;
  return dx < 0 ? 1 : -1;
}
