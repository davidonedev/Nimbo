import { useSyncExternalStore } from 'react';

/**
 * O servidor gratuito dorme e a primeira chamada pode levar mais de 1 minuto. Se uma chamada passa deste tempo sem
 * resposta, a tela mostra "estamos acordando o servidor" em vez de ficar parada em "Carregando…".
 */
export const SLOW_REQUEST_MS = 6_000;

let slow = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Chamado pelo cliente HTTP: devolve a função que encerra o acompanhamento (resposta, erro ou timeout). */
export function trackSlowRequest(): () => void {
  let counted = false;
  const timer = setTimeout(() => { counted = true; slow++; emit(); }, SLOW_REQUEST_MS);
  return () => {
    clearTimeout(timer);
    if (counted) { counted = false; slow = Math.max(0, slow - 1); emit(); }
  };
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** true enquanto alguma chamada está esperando há mais de {@link SLOW_REQUEST_MS}. */
export const useServerWaking = () => useSyncExternalStore(subscribe, () => slow > 0, () => false);

/** Só para testes. */
export const resetServerWaking = () => { slow = 0; emit(); };
