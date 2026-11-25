import { api } from '../lib/api';
import { deviceHeaders, storeDeviceTokenFrom } from './booking.service';
import type { Tenant, Service, Professional, Appointment } from '../types';

// Normaliza professional do backend para tipo frontend
function normalizeProfessional(p: Record<string, unknown>): Professional {
  const services = (p.services as { serviceId: string }[] | undefined) ?? [];
  return {
    id:         p.id as string,
    tenantId:   p.tenantId as string,
    name:       p.name as string,
    specialty:  p.specialty as string,
    avatar:     (p.avatar as string) ?? '',
    photoUrl:   p.photoUrl as string | undefined,
    bio:        (p.bio as string) ?? '',
    services:   services.map((s) => s.serviceId),
    workingHours: {
      start: (p.workingHoursStart as string) ?? '08:00',
      end:   (p.workingHoursEnd   as string) ?? '18:00',
    },
    workingDays: (p.workingDays as number[]) ?? [1, 2, 3, 4, 5],
  };
}

// ─── Dados públicos do tenant ─────────────────────────────────────────────────
export async function getPublicTenantApi(slug: string): Promise<Tenant> {
  return api.get<Tenant>(`/public/${slug}`);
}

export async function getPublicServicesApi(slug: string): Promise<Service[]> {
  return api.get<Service[]>(`/public/${slug}/services`);
}

export async function getPublicProfessionalsApi(
  slug: string,
  serviceId?: string,
): Promise<Professional[]> {
  const query = serviceId ? `?serviceId=${serviceId}` : '';
  const data = await api.get<Record<string, unknown>[]>(`/public/${slug}/professionals${query}`);
  return data.map(normalizeProfessional);
}

// ─── Disponibilidade — suporta um ou múltiplos serviços ──────────────────────
export async function getAvailableSlotsApi(
  slug: string,
  params: { professionalId: string; serviceIds: string[]; date: string },
): Promise<string[]> {
  const qs = new URLSearchParams({
    professionalId: params.professionalId,
    serviceIds:     params.serviceIds.join(','),
    date:           params.date,
  }).toString();
  return api.get<string[]>(`/public/${slug}/availability?${qs}`);
}

// ─── Agendamentos do cliente no portal público ────────────────────────────────
export interface PublicAppointment extends Appointment {
  professional?:  { id: string; name: string; specialty: string };
  service?:       { id: string; name: string; duration: number; price: number };
  paymentStatus?: string;
  paymentId?:     string;
}

export async function getClientAppointmentsApi(
  slug: string,
  clientId: string,
): Promise<PublicAppointment[]> {
  return api.get<PublicAppointment[]>(`/public/${slug}/my-appointments?clientId=${clientId}`, { headers: deviceHeaders(slug) });
}

// ─── Cancelar agendamento pelo cliente ────────────────────────────────────────
export async function cancelPublicAppointmentApi(
  slug: string,
  appointmentId: string,
  clientId: string,
): Promise<void> {
  await api.patch(`/public/${slug}/appointments/${appointmentId}/cancel`, { clientId }, { headers: deviceHeaders(slug) });
}

// ─── Reagendar agendamento pelo cliente ───────────────────────────────────────

export async function reschedulePublicAppointmentApi(
  slug: string,
  appointmentId: string,
  payload: { clientId: string; date: string; startTime: string },
): Promise<void> {
  await api.patch(`/public/${slug}/appointments/${appointmentId}/reschedule`, payload, { headers: deviceHeaders(slug) });
}

// ─── Pagamento Pix via Mercado Pago ───────────────────────────────────────────

export interface PixPaymentData {
  paymentId:     string;
  qrCode:        string;
  qrCodeBase64:  string;
  status:        string;
  expiresAt:     string;
}

export async function createPixPaymentApi(
  slug: string,
  appointmentId: string,
  clientId: string,
): Promise<PixPaymentData> {
  return api.post<PixPaymentData>(
    `/public/${slug}/appointments/${appointmentId}/pay/pix`,
    { clientId },
  );
}

export async function getPaymentStatusApi(
  slug: string,
  appointmentId: string,
  clientId: string,
): Promise<{ status: string | null; paymentId: string | null }> {
  return api.get(
    `/public/${slug}/appointments/${appointmentId}/payment-status?clientId=${clientId}`,
  );
}

// ─── Verificação de e-mail ────────────────────────────────────────────────────

export interface ClientSessionData {
  id:     string;
  name:   string;
  email:  string;
  phone?: string;
  /** Token do aparelho (resposta da verificação). O serviço o guarda e o remove da sessão devolvida. */
  deviceToken?: string | null;
}

export async function verifyClientEmailApi(
  slug: string,
  token: string,
): Promise<ClientSessionData> {
  return storeDeviceTokenFrom(slug, await api.get<ClientSessionData>(`/public/${slug}/verify-email?token=${encodeURIComponent(token)}`));
}

export async function resendVerificationEmailApi(
  slug: string,
  email: string,
): Promise<void> {
  await api.post(`/public/${slug}/resend-verification`, { email });
}
