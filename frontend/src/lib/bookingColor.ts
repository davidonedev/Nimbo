const HEX = /^#[0-9a-fA-F]{6}$/;

/** Cor de destaque padrão da Nimbo (azul da marca). */
export const NIMBO_BLUE = '#293ffb';

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const parse = (hex: string): [number, number, number] =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Luminância relativa WCAG (0 = preto, 1 = branco). */
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Preto ou branco, o que ler melhor sobre a cor. */
export function readableOn(hex: string): '#111111' | '#ffffff' {
  return luminance(hex) > 0.4 ? '#111111' : '#ffffff';
}

/**
 * Cor de destaque do tenant ajustada para o fundo escuro da tela de agendamento: inválida vira o azul da Nimbo e
 * as muito escuras (ex.: azul-marinho) são clareadas até terem contraste mínimo ~3:1 com o cartão (#12141c),
 * senão botões, chips e o passo atual ficariam invisíveis.
 */
export function accentOnDark(input: string | null | undefined): string {
  const hex = typeof input === 'string' && HEX.test(input) ? input.toLowerCase() : NIMBO_BLUE;
  const MIN_LUMINANCE = 0.14;
  if (luminance(hex) >= MIN_LUMINANCE) return hex;
  const [r, g, b] = parse(hex);
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mix = (c: number) => Math.round(c + (255 - c) * t);
    const out = `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    if (luminance(out) >= MIN_LUMINANCE) return out;
  }
  return '#ffffff';
}
