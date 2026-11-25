/**
 * Agendamento público por celular (tela padrão de todos os tenants).
 * Nome + Celular; na 1ª vez o cliente confirma um código de 6 dígitos enviado por WhatsApp e o aparelho fica
 * "reconhecido" (token guardado no navegador, enviado em X-Device-Token) para agendar sem pedir código de novo.
 */
import { api } from '../lib/api';
import type { PublicAppointment } from './public.service';

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
  /** Nulo no modo pendente: sem prova de posse do celular, o servidor não devolve o id do cadastro. */
  id: string | null;
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

export function deviceHeaders(slug: string): Record<string, string> {
  const token = getDeviceToken(slug);
  return token ? { 'X-Device-Token': token } : {};
}

/**
 * Login do portal antigo (e-mail, Google, verificação de e-mail): a resposta traz o `deviceToken` do aparelho.
 * Guarda-o (para o X-Device-Token das próximas chamadas) e devolve a sessão SEM o token, que não deve ir para o
 * armazenamento da sessão do cliente.
 */
export function storeDeviceTokenFrom<T extends { deviceToken?: string | null }>(slug: string, data: T): Omit<T, 'deviceToken'> {
  const { deviceToken, ...rest } = data;
  if (deviceToken) saveDeviceToken(slug, deviceToken);
  return rest;
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

// ─── Meus agendamentos (aparelho reconhecido) ────────────────────────────────────

/** Agendamento do cliente (mesmo formato do portal antigo: profissional e serviço aninhados). */
export type MyAppointment = PublicAppointment;

/** Lista os agendamentos do cliente deste aparelho. 403 DEVICE_REQUIRED = aparelho ainda não confirmou o celular. */
export function listMyAppointmentsApi(slug: string) {
  return api.get<MyAppointment[]>(`/public/${slug}/book/my-appointments`, { headers: deviceHeaders(slug) });
}

/** Cancela (até 1 h antes). 400 CANCELLATION_WINDOW_EXPIRED = passou do prazo. */
export async function cancelMyAppointmentApi(slug: string, appointmentId: string): Promise<void> {
  await api.patch(`/public/${slug}/appointments/${appointmentId}/cancel`, {}, { headers: deviceHeaders(slug) });
}

/** Remarca (até 1 h antes). 409 SCHEDULE_CONFLICT = horário ocupado; 400 RESCHEDULE_WINDOW_EXPIRED = passou do prazo. */
export async function rescheduleMyAppointmentApi(
  slug: string,
  appointmentId: string,
  p: { date: string; startTime: string },
): Promise<void> {
  await api.patch(`/public/${slug}/appointments/${appointmentId}/reschedule`, p, { headers: deviceHeaders(slug) });
}

export function resendCodeApi(slug: string, challengeId: string) {
  return api.post<{ maskedPhone: string; expiresAt: string }>(`/public/${slug}/book/resend`, { challengeId });
}
