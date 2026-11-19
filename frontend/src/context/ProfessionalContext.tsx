/**
 * ProfessionalContext — portal do profissional.
 * Carrega agendamentos, serviços e dados do tenant via API.
 * Expõe a mesma interface que antes para os componentes.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Appointment, Client, Professional, Service, Tenant } from '../types';
import { useAuth } from './AuthContext';

import {
  listProfAppointmentsApi,
  createProfAppointmentApi,
  updateProfAppointmentStatusApi,
  type CreateAppointmentPayload,
} from '../services/appointments.service';
import { listProfServicesApi, createProfServiceApi, updateProfServiceApi, deleteProfServiceApi } from '../services/services.service';
import type { ServicePayload } from '../services/services.service';
import { updateProfessionalMeApi, type UpdateMePayload } from '../services/professionals.service';
import { api, ApiError } from '../lib/api';
import { Button } from '@/components/ui/button';

interface ProfessionalContextType {
  professional: Professional;
  appointments: Appointment[];
  clients: Client[];
  allClients: Client[];
  services: Service[];
  tenant: Tenant;
  loading: boolean;
  refresh: () => Promise<void>;
  addAppointment:          (payload: CreateAppointmentPayload) => Promise<Appointment>;
  updateAppointmentStatus: (apptId: string, status: Appointment['status']) => Promise<void>;
  cancelAppointment:       (apptId: string) => Promise<void>;
  updateMySchedule:        (payload: UpdateMePayload) => Promise<void>;
  addService:    (payload: ServicePayload) => Promise<Service>;
  updateService: (id: string, patch: Partial<ServicePayload>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
}

const ProfessionalContext = createContext<ProfessionalContextType | null>(null);

export function ProfessionalProvider({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  // `logout` muda de identidade a cada render do AuthProvider; a ref evita refazer a carga por causa disso.
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; });

  const [professional, setProfessional] = useState<Professional | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allClients, setAllClients]     = useState<Client[]>([]);
  const [services, setServices]         = useState<Service[]>([]);
  const [tenant, setTenant]             = useState<Tenant | null>(null);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState<string | null>(null);

  const normalizeProfessional = (p: Record<string, unknown>): Professional => {
    const services = (p.services as { serviceId: string }[] | undefined) ?? [];
    return {
      id: p.id as string,
      tenantId: p.tenantId as string,
      name: p.name as string,
      specialty: p.specialty as string,
      avatar: (p.avatar as string) ?? '',
      photoUrl: p.photoUrl as string | undefined,
      bio: (p.bio as string) ?? '',
      services: services.map((s) => s.serviceId),
      workingHours: {
        start: (p.workingHoursStart as string) ?? '08:00',
        end: (p.workingHoursEnd as string) ?? '18:00',
      },
      workingDays: (p.workingDays as number[]) ?? [1, 2, 3, 4, 5],
    };
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [apts, svcs, profRaw, t, cls] = await Promise.all([
        listProfAppointmentsApi(),
        listProfServicesApi(),
        api.get<Record<string, unknown>>('/professional/me'),
        api.get<Tenant>('/professional/tenant'),
        api.get<Client[]>('/professional/clients'),
      ]);
      // Defesa em profundidade: o back já devolve só os dele, mas nunca mostramos agendamento de colega.
      setAppointments(apts.filter((a) => a.professionalId === (profRaw.id as string)));
      setServices(svcs);
      setProfessional(normalizeProfessional(profRaw));
      setTenant(t);
      setAllClients(cls);
    } catch (err) {
      // Sessão vencida/revogada: volta para o login (o guard da rota redireciona quando o usuário some).
      if (err instanceof ApiError && err.status === 401) { logoutRef.current(); return; }
      setLoadError(err instanceof ApiError && err.status > 0
        ? err.message
        : 'Não foi possível conectar ao servidor. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'professional') refresh();
  }, [user, refresh]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (loadError || !professional || !tenant) {
    return (
      <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">Não foi possível carregar o seu painel</p>
        <p className="max-w-sm text-sm text-muted-foreground">{loadError ?? 'Profissional não encontrado.'}</p>
        <div className="flex gap-2">
          <Button onClick={() => { void refresh(); }}>Tentar novamente</Button>
          <Button variant="outline" onClick={logout}>Sair</Button>
        </div>
      </div>
    );
  }

  // Clientes que têm agendamentos com este profissional
  const clientIds = new Set(appointments.map((a) => a.clientId));
  const clients = allClients.filter((c) => clientIds.has(c.id));

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const addAppointment = async (payload: CreateAppointmentPayload): Promise<Appointment> => {
    const appt = await createProfAppointmentApi(payload);
    setAppointments((prev) => [...prev, appt]);
    return appt;
  };

  const updateAppointmentStatus = async (apptId: string, status: Appointment['status']) => {
    await updateProfAppointmentStatusApi(apptId, status);
    setAppointments((prev) => prev.map((a) => (a.id === apptId ? { ...a, status } : a)));
  };

  const cancelAppointment = (apptId: string) => updateAppointmentStatus(apptId, 'cancelled');

  const updateMySchedule = async (payload: UpdateMePayload) => {
    const updated = await updateProfessionalMeApi(payload);
    setProfessional(updated);
  };

  const addService = async (payload: ServicePayload): Promise<Service> => {
    const svc = await createProfServiceApi(payload);
    setServices((prev) => [...prev, svc]);
    return svc;
  };

  const updateService = async (id: string, patch: Partial<ServicePayload>) => {
    const updated = await updateProfServiceApi(id, patch);
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
  };

  const deleteService = async (id: string) => {
    await deleteProfServiceApi(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <ProfessionalContext.Provider
      value={{
        professional,
        appointments,
        clients,
        allClients,
        services,
        tenant,
        loading,
        refresh,
        addAppointment,
        updateAppointmentStatus,
        cancelAppointment,
        updateMySchedule,
        addService,
        updateService,
        deleteService,
      }}
    >
      {children}
    </ProfessionalContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfessional() {
  const ctx = useContext(ProfessionalContext);
  if (!ctx) throw new Error('useProfessional must be inside ProfessionalProvider');
  return ctx;
}
