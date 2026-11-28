import { useEffect, useState } from 'react';
import { nowBrasilia } from '@/lib/scheduling';
import type { BrasiliaNow } from '@/lib/businessStatus';

/** Data e hora de Brasília, atualizadas a cada 30 s (o selo Aberto/Fechado muda sozinho na hora de abrir ou fechar). */
export function useBrasiliaNow(intervalMs = 30_000): BrasiliaNow {
  const [now, setNow] = useState<BrasiliaNow>(() => nowBrasilia());
  useEffect(() => {
    const id = setInterval(() => setNow(nowBrasilia()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
