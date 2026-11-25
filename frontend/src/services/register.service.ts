import { api, type RequestExtra } from '../lib/api';
import { storeDeviceTokenFrom } from './booking.service';

// ─── Shared result type ───────────────────────────────────────────────────────

export interface ClientSessionData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /** Token do aparelho (resposta do login). O serviço o guarda e o remove da sessão devolvida. */
  deviceToken?: string | null;
}

// ─── Register (email + password) ─────────────────────────────────────────────

export interface ClientRegisterPayload {
  name: string;
  email: string;
  /** Celular (WhatsApp) obrigatório: os avisos do agendamento saem por lá. */
  phone: string;
  password: string;
}

export async function registerClientApi(
  slug: string,
  payload: ClientRegisterPayload,
): Promise<ClientSessionData> {
  return storeDeviceTokenFrom(slug, await api.post<ClientSessionData>(`/public/${slug}/register/client`, payload));
}

// ─── Login (email + password) ─────────────────────────────────────────────────

export async function clientLoginApi(
  slug: string,
  email: string,
  password: string,
): Promise<ClientSessionData> {
  return storeDeviceTokenFrom(slug, await api.post<ClientSessionData>(`/public/${slug}/login/client`, { email, password }));
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export async function googleAuthClientApi(
  slug: string,
  accessToken: string,
): Promise<ClientSessionData> {
  return storeDeviceTokenFrom(slug, await api.post<ClientSessionData>(`/public/${slug}/auth/google`, { accessToken }));
}

// ─── Professional register ────────────────────────────────────────────────────

export interface ProfessionalRegisterPayload {
  name: string;
  email: string;
  password: string;
  specialty: string;
  bio?: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
}

export async function registerProfessionalApi(
  slug: string,
  payload: ProfessionalRegisterPayload,
): Promise<{ name: string; email: string }> {
  return api.post(`/public/${slug}/register/professional`, payload);
}

// ─── Registro público de negócio (cria tenant + tenant_admin) ─────────────────

export interface BusinessRegisterPayload {
  ownerName:    string;
  email:        string;
  password:     string;
  phone?:       string;
  businessName: string;
  address?:     string;
  slug?:        string;
}

export async function registerBusinessApi(
  payload: BusinessRegisterPayload,
  extra?: RequestExtra,
): Promise<{ message: string; slug: string }> {
  return api.post('/public/register/business', payload, extra);
}
