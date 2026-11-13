/**
 * Breakpoints do app, num lugar só. Seguem os do Tailwind (md = 768, lg = 1024) para que
 * as classes `md:`/`lg:` e os hooks concordem sobre o que é celular, tablet e desktop.
 */
export const BREAKPOINTS = { tablet: 768, desktop: 1024 } as const;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const breakpointFor = (width: number): Breakpoint =>
  width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'mobile';

/** Alvo de toque mínimo (px) recomendado por iOS/Android. */
export const MIN_TOUCH_TARGET = 44;
