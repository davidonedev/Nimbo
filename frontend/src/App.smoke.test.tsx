import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import App from './App';

/**
 * Teste de fumaça das telas do profissional, do portal público e de autenticação.
 * Usa o App de verdade (rotas, lazy chunks, contextos e serviços) e troca só o `fetch` por uma API
 * falsa com o MESMO formato que o backend devolve ({ success, data } e DTOs reais). Assim pegamos
 * tela branca, "Carregando…" eterno e campos que o back devolve nulos.
 */
vi.mock('./pwa/PwaHost', () => ({ PwaHost: () => null }));
vi.mock('./motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const TENANT_ID = 't1';
const PROF_ID = 'p1';
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const service = { id: 's1', tenantId: TENANT_ID, name: 'Corte feminino', description: null, price: 80, duration: 60, category: null, isActive: true };
const professionalDto = {
  id: PROF_ID, tenantId: TENANT_ID, name: 'Marina Souza', specialty: 'Cabeleireira', avatar: null, photoUrl: null, bio: null,
  workingHoursStart: '09:00', workingHoursEnd: '18:00', workingDays: [1, 2, 3, 4, 5],
  services: [{ professionalId: PROF_ID, serviceId: 's1' }], appointmentCount: null,
};
const tenantDto = {
  id: TENANT_ID, slug: 'studio', name: 'Studio Nimbo', ownerName: 'Dona', email: 'd@x.com', phone: null, address: null,
  status: 'active', plan: 'pro', monthlyPrice: 99, primaryColor: '#7c3aed', adminColor: null, logoUrl: null, bannerUrl: null,
  isOpen: true, minAdvanceMinutes: 0, whatsappApiUrl: null, whatsappApiKey: null, whatsappInstance: null, whatsappTemplate: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: null,
};
const publicTenantDto = { id: TENANT_ID, slug: 'studio', name: 'Studio Nimbo', primaryColor: '#7c3aed', logoUrl: null, bannerUrl: null, isOpen: true, status: 'active', address: null, phone: null, minAdvanceMinutes: 0 };
// O back permite cliente SEM telefone (reserva pública sem phone): a tela não pode quebrar com null.
const clientsDto = [
  { id: 'c1', tenantId: TENANT_ID, name: 'Ana Lima', email: 'ana@email.com', phone: '(11) 91111-1111', emailVerified: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: null, appointmentCount: 2 },
  { id: 'c2', tenantId: TENANT_ID, name: 'Bruno Sem Telefone', email: 'bruno@email.com', phone: null, emailVerified: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: null, appointmentCount: 1 },
];
const apptDto = (id: string, clientId: string, date: string, startTime: string, status = 'confirmed') => ({
  id, tenantId: TENANT_ID, clientId, professionalId: PROF_ID, serviceId: 's1', date, startTime, endTime: '10:00', status, price: 80, notes: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: null, client: { id: clientId, name: 'Ana Lima', phone: null }, professional: { id: PROF_ID, name: 'Marina Souza' }, service,
  paymentStatus: null, paymentId: null,
});

/** Corpo por método+caminho. Qualquer rota não prevista vira 404 (e o teste acusa). */
function respond(method: string, path: string): { status: number; body: unknown } {
  const ok = (data: unknown, status = 200) => ({ status, body: { success: true, data } });
  if (method === 'GET') {
    if (path === '/api/professional/me') return ok(professionalDto);
    if (path === '/api/professional/tenant') return ok(tenantDto);
    if (path === '/api/professional/clients') return ok(clientsDto);
    if (path === '/api/professional/professionals') return ok([professionalDto]);
    if (path === '/api/professional/services') return ok([service]);
    if (path === '/api/professional/products') return ok([]);
    if (path === '/api/professional/blocked-slots') return ok([]);
    if (path === '/api/professional/appointments') {
      return ok([apptDto('a1', 'c1', day(0), '09:00'), apptDto('a2', 'c2', day(0), '14:00', 'pending'), apptDto('a3', 'c1', day(2), '10:00')]);
    }
    if (path === '/api/public/login-data') return ok([]);
    if (path === '/api/public/studio') return ok(publicTenantDto);
    if (path === '/api/public/studio/services') return ok([service]);
    if (path === '/api/public/studio/professionals') return ok([{ ...professionalDto, appointmentCount: undefined }]);
    if (path === '/api/public/studio/products') return ok([]);
    if (path === '/api/public/studio/availability') return ok(['09:00', '10:00']);
    if (path === '/api/public/studio/my-appointments') return ok([apptDto('a1', 'c1', day(1), '09:00')]);
    if (path === '/api/public/studio/verify-email') return ok({ id: 'c1', name: 'Ana Lima', email: 'ana@email.com', phone: null });
  }
  return { status: 404, body: { success: false, error: `rota inesperada ${method} ${path}`, code: 'NOT_FOUND' } };
}

let unexpected: string[] = [];

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  unexpected = [];
  setViewportWidth(1280);
  Element.prototype.scrollIntoView = vi.fn(); // jsdom não implementa
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const { status, body } = respond((init?.method ?? 'GET').toUpperCase(), url.pathname);
    if (status === 404) unexpected.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const signIn = (role: string, extra: Record<string, unknown> = {}) =>
  sessionStorage.setItem('agendepro_session', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Marina Souza', email: 'm@x.com', role, tenantId: TENANT_ID, professionalId: PROF_ID, ...extra } }));
const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };
const T = { timeout: 10000 };

describe('telas do profissional montam com a API no formato real do back', { timeout: 60000 }, () => {
  const routes: [string, RegExp | string][] = [
    ['/professional', 'Olá, Marina'],
    ['/professional/dashboard', 'Olá, Marina'],
    ['/professional/clients', 'Clientes'],
    ['/professional/agenda', /Agenda|Hoje/],
    ['/professional/agenda-beta', /Agenda|Hoje|Semana/],
    ['/professional/services', /Serviços|Corte feminino/],
    ['/professional/revenue', /Faturamento|Receita|Ticket/],
    ['/professional/settings', /Disponibilidade|horário/i],
  ];

  for (const [path, expected] of routes) {
    it(`${path} abre`, async () => {
      signIn('professional');
      open(path);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), T);
      expect(screen.queryByText('Profissional não encontrado.')).toBeNull();
      expect(unexpected).toEqual([]);
    });
  }

  it('buscar por número funciona mesmo com cliente sem telefone', async () => {
    signIn('professional');
    open('/professional/clients');
    const box = await screen.findByLabelText(/Buscar cliente/, undefined, T);
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(box, { target: { value: '9111' } });
    expect(await screen.findByText('Ana Lima')).toBeTruthy();
    expect(screen.queryByText('Bruno Sem Telefone')).toBeNull();
  });
});

describe('falha ao carregar os dados do profissional', { timeout: 30000 }, () => {
  it('mostra o erro com "Tentar novamente" e "Sair", sem tela branca', async () => {
    signIn('professional');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Profissional não identificado no token', code: 'MISSING_PROFESSIONAL' }), { status: 400 })));
    open('/professional/dashboard');
    expect(await screen.findByRole('button', { name: 'Tentar novamente' }, T)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
  });

  it('sessão expirada (401) volta para o login', async () => {
    signIn('professional');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Token inválido', code: 'INVALID_TOKEN' }), { status: 401 })));
    open('/professional/dashboard');
    await waitFor(() => expect(window.location.pathname).toBe('/login'), T);
    expect(sessionStorage.getItem('agendepro_session')).toBeNull();
  });
});

describe('portal público do cliente', { timeout: 60000 }, () => {
  it('/:slug lista os serviços', async () => {
    open('/studio');
    await waitFor(() => expect(screen.getAllByText('Corte feminino').length).toBeGreaterThan(0), T);
    expect(unexpected).toEqual([]);
  });

  it('/:slug/booking abre o agendamento', async () => {
    open('/studio/booking');
    await waitFor(() => expect(screen.getAllByText(/Corte feminino|Marina Souza|Studio Nimbo/).length).toBeGreaterThan(0), T);
    expect(screen.queryByText('Barbearia não encontrada')).toBeNull();
    expect(unexpected).toEqual([]);
  });

  it('/:slug/register abre o cadastro', async () => {
    open('/studio/register');
    await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull(), T);
    expect(screen.queryByText('Barbearia não encontrada')).toBeNull();
    expect(document.body.textContent?.length).toBeGreaterThan(50);
  });

  it('/:slug/professional-register abre', async () => {
    open('/studio/professional-register');
    await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull(), T);
    expect(document.body.textContent?.length).toBeGreaterThan(50);
  });

  it('/:slug/my-appointments com cliente logado lista os agendamentos', async () => {
    localStorage.setItem('agendepro_client_studio', JSON.stringify({ id: 'c1', name: 'Ana Lima', email: 'ana@email.com' }));
    open('/studio/my-appointments');
    await waitFor(() => expect(screen.getAllByText(/Corte feminino/).length).toBeGreaterThan(0), T);
    expect(unexpected).toEqual([]);
  });

  it('/:slug/my-appointments sem sessão não fica em branco', async () => {
    open('/studio/my-appointments');
    await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull(), T);
    expect(document.body.textContent?.length).toBeGreaterThan(50);
  });

  it('/:slug/verify-email?token= valida o e-mail', async () => {
    open('/studio/verify-email?token=abc');
    await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull(), T);
    expect(document.body.textContent?.length).toBeGreaterThan(50);
    expect(unexpected).toEqual([]);
  });

  it('queda do servidor não vira "Barbearia não encontrada": oferece tentar de novo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Erro interno' }), { status: 500 })));
    open('/studio');
    expect(await screen.findByRole('button', { name: 'Tentar novamente' }, T)).toBeTruthy();
    expect(screen.queryByText('Barbearia não encontrada')).toBeNull();
  });

  it('falha só nos produtos não derruba o portal', async () => {
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.endsWith('/studio/products') ? new Response('{}', { status: 500 }) : base(input, init);
    }));
    open('/studio');
    await waitFor(() => expect(screen.getAllByText('Corte feminino').length).toBeGreaterThan(0), T);
  });

  it('/:slug inexistente mostra "não encontrada" em vez de tela branca', async () => {
    open('/nao-existe');
    expect(await screen.findByText('Barbearia não encontrada', undefined, T)).toBeTruthy();
  });
});

describe('autenticação e páginas institucionais', { timeout: 60000 }, () => {
  const routes: [string, RegExp][] = [
    ['/', /Nimbo/],
    ['/login', /Entrar|Login|senha/i],
    ['/signup', /Criar|Cadastr|conta/i],
    ['/forgot-password', /senha/i],
    ['/reset-password?token=abc', /senha/i],
    ['/confirm-email-change?token=abc', /e-mail|email/i],
    ['/access-help', /acesso|ajuda/i],
    ['/termos', /Termos/i],
    ['/privacidade', /Privacidade/i],
  ];
  for (const [path, expected] of routes) {
    it(`${path} abre`, async () => {
      open(path);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), T);
    });
  }

  it('rota desconhecida cai no login', async () => {
    open('/professional/nao-existe');
    await waitFor(() => expect(document.body.textContent?.length).toBeGreaterThan(20), T);
  });
});
