import { useEffect, useState } from 'react';
import { getChannelsApi, type NoticeScope } from '@/services/notifications.service';

const TTL_MS = 60_000;
const cache = new Map<NoticeScope, { value: boolean; at: number }>();

const fresh = (scope: NoticeScope) => {
  const hit = cache.get(scope);
  return hit && Date.now() - hit.at < TTL_MS ? hit.value : null;
};

/**
 * O envio automático pelo WhatsApp está ligado? Consulta ao abrir o modal de confirmação (e guarda por 1 minuto, para
 * pegar uma configuração recém-salva). `null` enquanto carrega ou se a consulta falhar: o texto fica neutro.
 */
export function useWhatsappAuto(scope: NoticeScope, active: boolean): boolean | null {
  const [fetched, setFetched] = useState<boolean | null>(null);

  useEffect(() => {
    if (!active || fresh(scope) !== null) return;
    let alive = true;
    getChannelsApi(scope)
      .then(c => { cache.set(scope, { value: c.whatsappAuto, at: Date.now() }); if (alive) setFetched(c.whatsappAuto); })
      .catch(() => { /* sem resposta: o texto fica neutro */ });
    return () => { alive = false; };
  }, [scope, active]);

  return fresh(scope) ?? fetched;
}

/** Só para testes: esquece o que foi consultado. */
export const resetWhatsappAutoCache = () => cache.clear();
