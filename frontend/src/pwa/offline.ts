/** Cache do service worker com as leituras autenticadas (agenda, clientes…). Nome definido em vite.config.ts. */
export const API_CACHE_NAME = 'nimbo-api-v1';

/**
 * Apaga as respostas autenticadas guardadas para uso offline. Chamado no login e no logout:
 * o cache não distingue usuários, então ninguém herda a agenda de quem usou o aparelho antes.
 */
export async function clearOfflineCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(API_CACHE_NAME);
  } catch { /* cache indisponível (modo privado etc.): nada a limpar */ }
}

export const OFFLINE_WRITE_MESSAGE =
  'Sem conexão. Para evitar conflito de horário, criar ou alterar agendamentos só funciona online.';

/** Mudanças (POST/PUT/PATCH/DELETE) não podem ser feitas offline. */
export const isOfflineWrite = (method: string | undefined, online: boolean): boolean =>
  !online && !!method && method.toUpperCase() !== 'GET';
