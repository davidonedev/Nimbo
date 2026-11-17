/** Endereço da API quando VITE_API_URL não está definida (desenvolvimento local). */
export const DEFAULT_API_URL = 'http://localhost:3333/api';

/**
 * Monta a URL base da API a partir de VITE_API_URL. Todas as rotas do backend ficam sob `/api`, mas é fácil
 * configurar a variável só com o domínio (`https://nimbo-api.onrender.com`): as chamadas iriam para `/auth/login`
 * e `/public/...`, que não existem, e voltariam 401/404. Por isso: tira espaços e barras do fim e acrescenta
 * `/api` quando faltar. Com `/api` já presente (ex.: `http://localhost:3333/api`) nada muda.
 */
export function resolveApiBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return DEFAULT_API_URL;
  return /\/api$/i.test(value) ? value : `${value}/api`;
}
