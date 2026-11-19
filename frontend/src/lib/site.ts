/**
 * Endereço público do site (o domínio próprio, ex.: https://seudominio.com). Vem de VITE_SITE_URL (defina na Vercel);
 * sem a variável usa o endereço em que a página está aberta (localhost em desenvolvimento, o .vercel.app num preview).
 * Todo texto que mostra o link do estabelecimento ("seudominio.com/barber-kings") sai daqui, sem domínio fixo no código.
 */

/** VITE_SITE_URL normalizado: com https:// quando faltar o protocolo e sem barra no final. Vazio se não definida. */
function configuredUrl(): string {
  const raw = String(import.meta.env.VITE_SITE_URL ?? '').trim();
  if (!raw) return '';
  return (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '');
}

/** URL base do site, sem barra final ("https://seudominio.com"). */
export function siteUrl(): string {
  return configuredUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
}

/** Valor de {@link siteUrl} na carga do módulo (use a função se precisar do valor atual). */
export const SITE_URL = siteUrl();

/** Host sem protocolo, para mostrar na tela: "seudominio.com" (ou "localhost:5173" em desenvolvimento). */
export function siteHost(): string {
  return siteUrl().replace(/^https?:\/\//i, '');
}

/** Link público de um estabelecimento, sem protocolo: "seudominio.com/barber-kings". */
export function tenantLink(slug: string): string {
  return `${siteHost()}/${slug}`;
}
