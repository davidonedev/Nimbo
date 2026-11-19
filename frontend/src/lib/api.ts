// ─── Cliente HTTP base ────────────────────────────────────────────────────────
// Centraliza todas as chamadas à API REST.
// - Lê o token JWT do sessionStorage automaticamente
// - Lança erros estruturados com mensagem vinda do backend

import { OFFLINE_WRITE_MESSAGE, clearOfflineCaches, isOfflineWrite } from '../pwa/offline';
import { resolveApiBaseUrl } from './apiUrl';

// Aceita VITE_API_URL com ou sem o sufixo /api (ver apiUrl.ts)
const BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

/**
 * Tempo máximo esperando a resposta. O Render gratuito dorme por inatividade e a primeira chamada pode levar
 * de 50 a 90 s para ser atendida, então 90 s evita desistir antes de o servidor acordar.
 */
export const REQUEST_TIMEOUT_MS = 90_000;

const RETRY_STATUSES = new Set([502, 503, 504]); // o proxy não alcançou o servidor (acordando/reiniciando)

export const NETWORK_ERROR_MESSAGE =
  'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
export const TIMEOUT_ERROR_MESSAGE =
  'O servidor demorou demais para responder. Tente novamente em instantes.';
export const UNAVAILABLE_ERROR_MESSAGE =
  'O servidor está indisponível no momento (ele pode estar iniciando). Tente novamente em instantes.';

const SESSION_KEY = 'agendepro_session';

interface Session {
  token: string;
}

function getToken(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: Session = JSON.parse(raw);
    return session.token ?? null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: unknown) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
  void clearOfflineCaches(); // novo login: não herdar a agenda em cache de outra conta
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  void clearOfflineCaches(); // logout: apaga as leituras guardadas para uso offline
}

// ─── Erro tipado da API ───────────────────────────────────────────────────────
export interface ApiErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: ApiErrorDetail[]
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Opções extras por chamada (além do RequestInit do fetch). */
export interface RequestExtra {
  /** Tempo máximo esperando a resposta, em ms. Padrão: REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
  /**
   * Tentativas extras quando a chamada nem chegou ao servidor (falha de rede) ou o proxy respondeu
   * 502/503/504 (servidor acordando). NÃO repete em timeout nem em erro do servidor (4xx/500): nesses casos a
   * requisição pode já ter sido processada, e repetir um cadastro criaria duplicidade.
   */
  retries?: number;
  /** Espera antes da 1ª nova tentativa, em ms (cresce linearmente a cada tentativa). Padrão: 4000. */
  retryDelayMs?: number;
  /** Avisa a tela de que vai tentar de novo (para mostrar "estamos acordando o servidor"). */
  onRetry?: (attempt: number, totalRetries: number) => void;
  /** Cabeçalhos extras desta chamada (ex.: X-Device-Token do agendamento público). */
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** fetch com timeout; falhas de rede e timeout viram ApiError com mensagem em português (code NETWORK/TIMEOUT). */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) throw new ApiError(TIMEOUT_ERROR_MESSAGE, 0, 'TIMEOUT');
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

function fallbackMessage(status: number): string {
  if (RETRY_STATUSES.has(status)) return UNAVAILABLE_ERROR_MESSAGE;
  if (status >= 500) return 'Erro interno do servidor. Tente novamente em instantes.';
  return `Erro ${status}`;
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────
async function request<T>(
  path: string,
  options: RequestInit & RequestExtra = {}
): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, retries = 0, retryDelayMs = 4000, onRetry, ...init } = options;

  // Mudar agendamentos offline arriscaria conflito de horário: bloqueia antes de tentar
  if (isOfflineWrite(init.method, navigator.onLine)) throw new ApiError(OFFLINE_WRITE_MESSAGE, 0, 'OFFLINE');

  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchWithTimeout(`${BASE_URL}${path}`, { ...init, headers }, timeoutMs);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NETWORK' && attempt < retries) {
        onRetry?.(attempt + 1, retries);
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw err;
    }
    if (RETRY_STATUSES.has(res.status) && attempt < retries) {
      onRetry?.(attempt + 1, retries);
      await sleep(retryDelayMs * (attempt + 1));
      continue;
    }
    break;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      body.error ?? fallbackMessage(res.status),
      res.status,
      body.code,
      body.details
    );
  }

  // Todos os endpoints retornam { success: true, data: T }
  return (body.data ?? body) as T;
}

// ─── Métodos HTTP ─────────────────────────────────────────────────────────────
export const api = {
  get: <T>(path: string, extra?: RequestExtra) =>
    request<T>(path, { method: 'GET', ...extra }),

  post: <T>(path: string, body: unknown, extra?: RequestExtra) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      ...extra,
    }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
};
