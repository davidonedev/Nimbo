/**
 * Backend falso e COM ESTADO para os testes de auditoria do fluxo de agendamento.
 * Nenhuma rede real: troca o `fetch` por respostas no formato do backend ({ success, data }) e guarda cada chamada
 * para o teste conferir endpoint e corpo. Os status mudam de verdade quando a tela chama PATCH/POST.
 */
import { vi } from 'vitest';

export interface Call { method: string; path: string; query: string; body: Record<string, unknown> | null }

export const TENANT_ID = 't1';
export const PROF_ID = 'p1';
export const SERVICE_ID = 's1';

export const brDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const SERVICE = { id: SERVICE_ID, tenantId: TENANT_ID, name: 'Corte feminino', description: null, price: 80, duration: 60, category: null, isActive: true };
const PROFESSIONAL = {
  id: PROF_ID, tenantId: TENANT_ID, name: 'Marina Souza', specialty: 'Cabeleireira', avatar: null, photoUrl: null, bio: null,
  workingHoursStart: '08:00', workingHoursEnd: '18:00', workingDays: [0, 1, 2, 3, 4, 5, 6], services: [{ professionalId: PROF_ID, serviceId: SERVICE_ID }],
};
const TENANT = {
  id: TENANT_ID, slug: 'studio', name: 'Studio Nimbo', ownerName: 'Dona', email: 'dona@x.com', phone: '(11) 98888-7777', address: 'Rua A, 1',
  status: 'active', plan: 'pro', monthlyPrice: 99, primaryColor: '#7c3aed', adminColor: null, logoUrl: null, bannerUrl: null,
  isOpen: true, minAdvanceMinutes: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: null,
};
const CLIENTS = [
  { id: 'c1', tenantId: TENANT_ID, name: 'Ana Lima', email: 'teste+ana@exemplo.com', phone: '(11) 91111-1111', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'c2', tenantId: TENANT_ID, name: 'Bruno Costa', email: 'teste+bruno@exemplo.com', phone: '(11) 92222-2222', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'c3', tenantId: TENANT_ID, name: 'Carla Dias', email: 'teste+carla@exemplo.com', phone: '(11) 93333-3333', createdAt: '2026-01-01T00:00:00Z' },
];

export type ApptStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export interface Appt {
  id: string; tenantId: string; clientId: string; professionalId: string; serviceId: string;
  date: string; startTime: string; endTime: string; status: ApptStatus; price: number; notes: null;
  confirmBy: string | null; clientConfirmedAt: string | null; createdAt: string;
  client: { id: string; name: string; phone: string }; professional: { id: string; name: string };
  service: typeof SERVICE;
}

export function appt(id: string, clientId: 'c1' | 'c2' | 'c3', date: string, startTime: string, status: ApptStatus, extra: Partial<Appt> = {}): Appt {
  const c = CLIENTS.find(x => x.id === clientId)!;
  return {
    id, tenantId: TENANT_ID, clientId, professionalId: PROF_ID, serviceId: SERVICE_ID, date, startTime, endTime: '23:59', status, price: 80, notes: null,
    confirmBy: null, clientConfirmedAt: null, createdAt: '2026-01-01T00:00:00Z',
    client: { id: c.id, name: c.name, phone: c.phone }, professional: { id: PROF_ID, name: 'Marina Souza' }, service: SERVICE, ...extra,
  };
}

export interface Backend {
  calls: Call[];
  unexpected: string[];
  appointments: Appt[];
  /** Falha o próximo PATCH de status com este HTTP (para testar o estado de erro da tela). */
  failNextStatusWith: number | null;
  patches: () => Call[];
}

export function installAdminBackend(seed: Appt[]): Backend {
  const be: Backend = {
    calls: [], unexpected: [], appointments: seed.map(a => ({ ...a })), failNextStatusWith: null,
    patches: () => be.calls.filter(c => c.method === 'PATCH' && /\/status$/.test(c.path)),
  };

  const ok = (data: unknown, status = 200) =>
    new Response(JSON.stringify({ success: true, data }), { status, headers: { 'Content-Type': 'application/json' } });
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ success: false, error, code: 'ERR' }), { status, headers: { 'Content-Type': 'application/json' } });

  const summary = () => {
    const cancelled = be.appointments.filter(a => a.status === 'cancelled').length;
    const noShow = be.appointments.filter(a => a.status === 'no_show').length;
    return {
      today: brDate(0),
      clients: { total: CLIENTS.length, last7Days: 0, previous7Days: 0 },
      cancellations: { total: cancelled + noShow, cancelled, noShow },
      week: [],
      upcoming: be.appointments
        .filter(a => a.status === 'pending' || a.status === 'confirmed')
        .map(a => ({ id: a.id, date: a.date, startTime: a.startTime, clientName: a.client.name, serviceName: a.service.name, professionalName: 'Marina Souza', status: a.status })),
      trial: { state: 'none', totalDays: 14, usedDays: 0, remainingDays: 14, endsAt: null },
    };
  };

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    be.calls.push({ method, path, query: url.search, body });

    if (method === 'GET') {
      if (path === '/admin/me') return ok(TENANT);
      if (path === '/admin/professionals') return ok([PROFESSIONAL]);
      if (path === '/admin/services') return ok([SERVICE]);
      if (path === '/admin/clients') return ok(CLIENTS);
      if (path === '/admin/appointments') return ok(be.appointments);
      if (path === '/admin/blocked-slots' || path === '/admin/products') return ok([]);
      if (path === '/admin/product-categories' || path === '/admin/service-categories') return ok([]);
      if (path === '/admin/dashboard/summary') return ok(summary());
    }
    const patch = /^\/admin\/appointments\/([^/]+)\/status$/.exec(path);
    if (method === 'PATCH' && patch) {
      if (be.failNextStatusWith) {
        const st = be.failNextStatusWith; be.failNextStatusWith = null;
        return fail(st, 'Falha simulada');
      }
      const a = be.appointments.find(x => x.id === patch[1]);
      if (!a) return fail(404, 'Agendamento não encontrado');
      // Espelha AppointmentStatus.canTransitionTo do backend: concluído e cancelado são finais; falta só vira cancelado.
      const next = body?.status as ApptStatus;
      const allowed: Record<ApptStatus, ApptStatus[]> = {
        pending: ['confirmed', 'completed', 'no_show', 'cancelled'],
        confirmed: ['completed', 'no_show', 'cancelled'],
        no_show: ['cancelled'],
        completed: [],
        cancelled: [],
      };
      if (!allowed[a.status].includes(next)) {
        return fail(409, 'Este agendamento não pode mudar para esse status. Atualize a tela.');
      }
      a.status = next;
      if (a.status !== 'pending') a.confirmBy = null;
      return ok(a);
    }
    if (method === 'POST' && path === '/admin/appointments/bulk-confirm') {
      const ids = (body?.ids as string[]) ?? [];
      const done = be.appointments.filter(a => ids.includes(a.id) && a.status === 'pending');
      done.forEach(a => { a.status = 'confirmed'; a.confirmBy = null; });
      return ok({ confirmed: done.length, skipped: ids.length - done.length, confirmedIds: done.map(a => a.id) });
    }
    be.unexpected.push(`${method} ${path}`);
    return fail(404, `rota inesperada ${method} ${path}`);
  }));

  return be;
}

export const signInAsTenantAdmin = () =>
  sessionStorage.setItem('agendepro_session', JSON.stringify({
    token: 't', user: { id: 'u1', name: 'Dona Souza', email: 'dona@x.com', role: 'tenant_admin', tenantId: TENANT_ID },
  }));
