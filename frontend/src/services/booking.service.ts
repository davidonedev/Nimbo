/**
 * Agendamento público por celular (tela padrão de todos os tenants).
 * Nome + Celular; na 1ª vez o cliente confirma um código de 6 dígitos enviado por WhatsApp e o aparelho fica
 * "reconhecido" (token guardado no navegador, enviado em X-Device-Token) para agendar sem pedir código de novo.
 */
import { api } from '../lib/api';

export interface BookedItem {
  id: string;
  serviceId: string;
  serviceName: string;
  startTime: string;
  endTime: string;
  price: number;
}

export interface BookedSummary {
  date: string; // yyyy-MM-dd
  professionalId: string;
  professionalName: string;
  totalDuration: number;
  totalPrice: number;
  items: BookedItem[];
}

export interface BookedClient {
  id: string;
  name: string;
  phone: string | null;
}

export type BookResult =
  | { kind: 'challenge_required'; challengeId: string; maskedPhone: string; expiresAt: string }
  | { kind: 'booked'; booking: BookedSummary; client: BookedClient; deviceToken?: string | null }
  /** Estabelecimento sem código automático: horário reservado como pendente; o cliente confirma pelo WhatsApp dele. */
  | { kind: 'pending_confirmation'; booking: BookedSummary; client: BookedClient; confirmBy: string | null };

export interface BookPayload {
  name: string;
  phone: string;
  serviceIds: string[];
  professionalId: string | null; // null = qualquer profissional
  date: string;
  startTime: string;
  notes?: string;
  /** Token do captcha (Cloudflare Turnstile), quando o site tem a chave configurada. */
  captchaToken?: string;
}

export interface Possession {
  recognized: boolean;
  fullName: string | null;
  phone: string | null;
  lastServiceId: string | null;
}

// ─── Aparelho reconhecido (um token por estabelecimento) ─────────────────────────

const deviceKey = (slug: string) => `nimbo_device_${slug}`;

export function getDeviceToken(slug: string): string | null {
  try {
    return localStorage.getItem(deviceKey(slug));
  } catch {
    return null;
  }
}

export function saveDeviceToken(slug: string, token: string) {
  try {
    localStorage.setItem(deviceKey(slug), token);
  } catch {
    /* navegador bloqueou o armazenamento: o cliente só terá de confirmar o código de novo */
  }
}

function deviceHeaders(slug: string): Record<string, string> {
  const token = getDeviceToken(slug);
  return token ? { 'X-Device-Token': token } : {};
}

// ─── Chamadas ────────────────────────────────────────────────────────────────────

export function getSlotsApi(slug: string, p: { serviceIds: string[]; date: string; professionalId?: string | null }) {
  const qs = new URLSearchParams({ serviceIds: p.serviceIds.join(','), date: p.date });
  if (p.professionalId) qs.set('professionalId', p.professionalId);
  return api.get<string[]>(`/public/${slug}/book/slots?${qs}`);
}

export function getDaysApi(
  slug: string,
  p: { serviceIds: string[]; from: string; count: number; professionalId?: string | null },
) {
  const qs = new URLSearchParams({ serviceIds: p.serviceIds.join(','), from: p.from, count: String(p.count) });
  if (p.professionalId) qs.set('professionalId', p.professionalId);
  return api.get<string[]>(`/public/${slug}/book/days?${qs}`);
}

export function getPossessionApi(slug: string) {
  return api.get<Possession>(`/public/${slug}/book/possession`, { headers: deviceHeaders(slug) });
}

export async function bookApi(slug: string, payload: BookPayload): Promise<BookResult> {
  return api.post<BookResult>(`/public/${slug}/book`, payload, { headers: deviceHeaders(slug) });
}

export async function verifyBookApi(slug: string, challengeId: string, code: string): Promise<BookResult> {
  const result = await api.post<BookResult>(`/public/${slug}/book/verify`, { challengeId, code });
  if (result.kind === 'booked' && result.deviceToken) saveDeviceToken(slug, result.deviceToken);
  return result;
}

/**
 * O cliente tocou em "Confirmar no WhatsApp": o horário deixa de ter prazo e fica reservado até o estabelecimento
 * confirmar. `confirmed` = quantos horários foram marcados (0 se já tinham expirado ou sido decididos).
 */
export function clientConfirmedApi(slug: string, appointmentIds: string[]) {
  return api.post<{ confirmed: number }>(`/public/${slug}/book/client-confirmed`, { appointmentIds });
}

export function resendCodeApi(slug: string, challengeId: string) {
  return api.post<{ maskedPhone: string; expiresAt: string }>(`/public/${slug}/book/resend`, { challengeId });
}
