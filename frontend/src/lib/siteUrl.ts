/**
 * Endereço público do site, mostrado ao dono como "o link dos seus clientes" (ex.: nimbo-dusky.vercel.app/barbearia-x).
 * Vem do próprio navegador, então vale para o domínio atual e para o novo, sem mexer no código.
 * VITE_PUBLIC_HOST permite fixar um valor (sem https://).
 */
export const SITE_HOST: string =
  ((import.meta.env.VITE_PUBLIC_HOST as string | undefined) ?? '').trim() ||
  (typeof window !== 'undefined' ? window.location.host : 'nimbo.app');

export const SITE_LINK_PREFIX = `${SITE_HOST}/`;
