import { api } from '../lib/api';
import type { Appointment } from '../types';

// ─── Normaliza resposta do backend → tipo frontend ────────────────────────────
// O backend inclui { client, professional, service } aninhados — removemos para
// manter compatibilidade com o formato usado pelos componentes (lookup por ID).
function normalize(a: Record<string, unknown>): Appointment {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { client: _c, professional: _p, service: _s, ...rest } = a;
  return rest as unknown as Appointment;
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export interface AppointmentFilters {
  date?: string;
  startDate?: string;
  endDate?: string;
  professionalId?: string;
  status?: string;
}

/** Admin e profissional usam o mesmo contrato; o backend limita o profissional à própria agenda. */
export type AgendaApiScope = 'admin' | 'professional';

export async function listAppointmentsApi(filters: AppointmentFilters = {}, scope: AgendaApiScope = 'admin'): Promise<Appointment[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await api.get<Record<string, unknown>[]>(`/${scope}/appointments${query}`);
  return data.map(normalize);
}

export interface CreateAppointmentPayload {
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  professionalId: string;
  serviceId: string;
  date: string;
  startTime: string;
  notes?: string;
}

export async function createAppointmentApi(payload: CreateAppointmentPayload): Promise<Appointment> {
  const data = await api.post<Record<string, unknown>>('/admin/appointments', payload);
  return normalize(data);
}

export async function updateAppointmentStatusApi(
  id: string,
  status: Appointment['status']
): Promise<Appointment> {
  const data = await api.patch<Record<string, unknown>>(`/admin/appointments/${id}/status`, { status });
  return normalize(data);
}

export interface BulkConfirmResult {
  confirmed: number;
  skipped: number;
  confirmedIds: string[];
}

/** Confirma de uma vez os agendamentos pendentes escolhidos (os que não estão mais pendentes são ignorados). */
export async function bulkConfirmAppointmentsApi(ids: string[]): Promise<BulkConfirmResult> {
  return api.post<BulkConfirmResult>('/admin/appointments/bulk-confirm', { ids });
}

export async function deleteAppointmentApi(id: string): Promise<void> {
  return api.delete(`/admin/appointments/${id}`);
}

// ─── Professional ─────────────────────────────────────────────────────────────
export async function createProfAppointmentApi(payload: CreateAppointmentPayload): Promise<Appointment> {
  const data = await api.post<Record<string, unknown>>('/professional/appointments', payload);
  return normalize(data);
}

export async function listProfAppointmentsApi(filters: AppointmentFilters = {}): Promise<Appointment[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await api.get<Record<string, unknown>[]>(`/professional/appointments${query}`);
  return data.map(normalize);
}

export async function updateProfAppointmentStatusApi(
  id: string,
  status: Appointment['status']
): Promise<Appointment> {
  const data = await api.patch<Record<string, unknown>>(`/professional/appointments/${id}/status`, { status });
  return normalize(data);
}

// ─── Agenda (admin e profissional) ────────────────────────────────────────────
/** Agendamento com cliente, serviço e profissional resumidos (o backend já os envia aninhados). */
export interface AgendaAppointment extends Appointment {
  client?: { id: string; name: string; phone?: string | null };
  service?: { id: string; name: string; duration?: number };
  professional?: { id: string; name: string };
}

export async function listAgendaAppointmentsApi(filters: AppointmentFilters = {}, scope: AgendaApiScope = 'admin'): Promise<AgendaAppointment[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const query = params.toString() ? `?${params.toString()}` : '';
  return api.get<AgendaAppointment[]>(`/${scope}/appointments${query}`);
}
