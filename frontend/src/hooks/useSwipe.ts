import { useRef } from 'react';
import type { TouchEvent } from 'react';
import { swipeDirection } from '@/lib/swipe';

/** Props de toque para detectar swipe horizontal num elemento; ignora gestos que começam em campos e rolagens verticais. */
export function useSwipe(onSwipe: (dir: 1 | -1) => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!enabled) return {};
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dir = swipeDirection(t.clientX - s.x, t.clientY - s.y);
      if (dir) onSwipe(dir);
    },
  };
}
