import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

/** matchMedia falso: a janela do jsdom não tem layout, então o teste define a largura. */
export function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}
