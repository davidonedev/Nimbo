import { useSyncExternalStore } from 'react';
import { BREAKPOINTS, breakpointFor, type Breakpoint } from '@/lib/breakpoints';

const QUERIES = [`(min-width: ${BREAKPOINTS.tablet}px)`, `(min-width: ${BREAKPOINTS.desktop}px)`];

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const lists = QUERIES.map(q => window.matchMedia(q));
  lists.forEach(l => l.addEventListener('change', onChange));
  return () => lists.forEach(l => l.removeEventListener('change', onChange));
}

const snapshot = (): Breakpoint => (typeof window === 'undefined' ? 'desktop' : breakpointFor(window.innerWidth));

/** Faixa de tela atual. Reage a rotação e redimensionamento; sem janela (teste/servidor), assume desktop. */
export function useBreakpoint(): { breakpoint: Breakpoint; isMobile: boolean; isTablet: boolean; isDesktop: boolean } {
  const breakpoint = useSyncExternalStore(subscribe, snapshot, () => 'desktop' as Breakpoint);
  return { breakpoint, isMobile: breakpoint === 'mobile', isTablet: breakpoint === 'tablet', isDesktop: breakpoint === 'desktop' };
}
