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
vi.mock('./motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const TENANT_ID = 't1';
const PROF_ID = 'p1';
const brDay = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const brToday = brDay(0);
const brTomorrow = brDay(1);
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
const publicTenantDto = { id: TENANT_ID, slug: 'studio', name: 'Studio Nimbo', primaryColor: '#7c3aed', logoUrl: null, bannerUrl: null, isOpen: true, status: 'active', address: null, phone: '(11) 98888-7777', minAdvanceMinutes: 0 };
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

/** Resposta do agendamento criado (mesmo formato do backend). */
const booked = {
  booking: {
    date: brToday, professionalId: PROF_ID, professionalName: 'Marina Souza', totalDuration: 60, totalPrice: 80,
    items: [{ id: 'x1', serviceId: 's1', serviceName: 'Corte feminino', startTime: '09:00', endTime: '10:00', price: 80 }],
  },
  client: { id: 'c9', name: 'Ana Lima', phone: '(11) 91111-1111' },
};

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
    if (path === '/api/public/studio') return ok(publicTenantDto);
    if (path === '/api/public/studio/services') return ok([service]);
    if (path === '/api/public/studio/professionals') {
      return ok([{ ...professionalDto, services: professionalLinked ? professionalDto.services : [], appointmentCount: undefined }]);
    }
    if (path === '/api/public/studio/products') return ok([]);
    if (path === '/api/public/studio/availability') return ok(['09:00', '10:00']);
    if (path === '/api/public/studio/book/possession') return ok({ recognized: false, fullName: null, phone: null, lastServiceId: null });
    if (path === '/api/public/studio/book/days') return ok([brToday, brTomorrow]);
    if (path === '/api/public/studio/book/slots') return ok(['09:00', '14:30', '19:00']);
    if (path === '/api/public/studio/my-appointments') return ok([apptDto('a1', 'c1', day(1), '09:00')]);
    if (path === '/api/public/studio/verify-email') return ok({ id: 'c1', name: 'Ana Lima', email: 'ana@email.com', phone: null });
  }
  if (method === 'POST') {
    if (path === '/api/public/studio/book' && bookMode === 'pending') {
      return ok({ kind: 'pending_confirmation', ...booked, confirmBy: new Date(Date.now() + 3 * 3600_000).toISOString() });
    }
    if (path === '/api/public/studio/book') {
      return ok({ kind: 'challenge_required', challengeId: 'ch1', maskedPhone: '(11) •••••-••11', expiresAt: '2030-01-01T00:00:00Z' });
    }
    if (path === '/api/public/studio/book/verify') return ok({ kind: 'booked', ...booked, deviceToken: 'tok' });
    if (path === '/api/public/studio/book/client-confirmed') return ok({ confirmed: 1 });
  }
  return { status: 404, body: { success: false, error: `rota inesperada ${method} ${path}`, code: 'NOT_FOUND' } };
}

let unexpected: string[] = [];
let posted: string[] = [];
/** 'challenge' = estabelecimento com WhatsApp (código); 'pending' = sem código (reserva pendente + confirmação pelo WhatsApp). */
let bookMode: 'challenge' | 'pending' = 'challenge';
/** false = o profissional existe, mas ninguém o vinculou a nenhum serviço (caso do Max Barber). */
let professionalLinked = true;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  unexpected = [];
  posted = [];
  bookMode = 'challenge';
  professionalLinked = true;
  setViewportWidth(1280);
  Element.prototype.scrollIntoView = vi.fn(); // jsdom não implementa
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const { status, body } = respond((init?.method ?? 'GET').toUpperCase(), url.pathname);
    if (status === 404) unexpected.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if ((init?.method ?? 'GET').toUpperCase() === 'POST') posted.push(url.pathname);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const signIn = (role: string, extra: Record<string, unknown> = {}) =>
  sessionStorage.setItem('agendepro_session', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Marina Souza', email: 'm@x.com', role, tenantId: TENANT_ID, professionalId: PROF_ID, ...extra } }));
const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };
const T = { timeout: 25000 }; // telas `lazy`: a 1ª carga sob uma suíte cheia pode demorar

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
  it('/:slug abre o agendamento padrão com os serviços (categoria nula não quebra)', async () => {
    open('/studio');
    expect(await screen.findByText('Qual serviço você quer agendar?', undefined, T)).toBeTruthy();
    expect(screen.getAllByText('Corte feminino').length).toBeGreaterThan(0);
    expect(screen.getByText(/R\$\s?80,00/)).toBeTruthy();
    expect(unexpected).toEqual([]);
  });

  it('profissional sem serviço vinculado: o cliente vê um aviso claro, e não uma lista que não dá para agendar', async () => {
    professionalLinked = false;
    open('/studio');
    expect(await screen.findByText(/O agendamento online deste estabelecimento ainda não está disponível/, undefined, T)).toBeTruthy();
    expect(screen.queryByText('Corte feminino')).toBeNull();
    const phoneLinks = screen.getAllByRole('link', { name: '(11) 98888-7777' });
    expect(phoneLinks.length).toBeGreaterThan(0);
    expect(phoneLinks.some(a => a.getAttribute('href') === 'tel:11988887777')).toBe(true);
  });

  it('link direto de um serviço que ninguém atende explica o problema do serviço, sem falar em "juntos"', async () => {
    professionalLinked = false;
    open('/studio/horario?s=s1');
    expect(await screen.findByText(/Este serviço ainda não tem profissional disponível para agendamento online/, undefined, T)).toBeTruthy();
    expect(screen.queryByText(/faz todos esses serviços juntos/)).toBeNull();
  });

  it('com o profissional vinculado o serviço aparece e o agendamento segue normal', async () => {
    open('/studio');
    expect(await screen.findByText('Qual serviço você quer agendar?', undefined, T)).toBeTruthy();
    expect(screen.getAllByText('Corte feminino').length).toBeGreaterThan(0);
    expect(screen.queryByText(/ainda não está disponível/)).toBeNull();
  });

  it('/:slug/booking (link antigo) cai no agendamento novo', async () => {
    open('/studio/booking');
    expect(await screen.findByText('Qual serviço você quer agendar?', undefined, T)).toBeTruthy();
    expect(window.location.pathname).toBe('/studio');
    expect(unexpected).toEqual([]);
  });

  /** Serviço → horário → dados (nome + celular) e envia; devolve para o teste seguir na tela seguinte. */
  async function fillAndSubmitBooking() {
    const { fireEvent } = await import('@testing-library/react');
    open('/studio');
    fireEvent.click(await screen.findByText('Corte feminino', undefined, T));
    expect(await screen.findByText('Escolha data e horário', undefined, T)).toBeTruthy();
    expect(window.location.search).toContain('s=s1');
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }, T));
    expect(await screen.findByText('Seus dados', undefined, T)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } });
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '11911111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
  }

  it('com WhatsApp do estabelecimento: serviço → horário → dados → código → confirmado', async () => {
    const { fireEvent } = await import('@testing-library/react');
    await fillAndSubmitBooking();

    expect(await screen.findByText('Confirme seu número', undefined, T)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Pedido enviado!', undefined, T)).toBeTruthy();
    expect(localStorage.getItem('nimbo_device_studio')).toBe('tok'); // aparelho reconhecido para a próxima vez
    expect(unexpected).toEqual([]);
  });

  it('sem código automático: reserva pendente, botão do WhatsApp do estabelecimento e aviso ao servidor ao tocar', async () => {
    const { fireEvent } = await import('@testing-library/react');
    bookMode = 'pending';
    await fillAndSubmitBooking();

    expect(await screen.findByText('Falta só um passo!', undefined, T)).toBeTruthy();
    expect(screen.queryByText('Confirme seu número')).toBeNull(); // sem tela de código
    expect(localStorage.getItem('nimbo_device_studio')).toBeNull(); // celular não verificado: aparelho NÃO é reconhecido
    const link = screen.getByRole('link', { name: /Confirmar no WhatsApp/ });
    expect(link.getAttribute('href')).toContain('https://wa.me/5511988887777?text=');

    fireEvent.click(link);
    expect(await screen.findByText(/Pronto, Ana!/, undefined, T)).toBeTruthy();
    expect(posted).toContain('/api/public/studio/book/client-confirmed');
    expect(screen.getByRole('link', { name: /Abrir o WhatsApp de novo/ })).toBeTruthy();
    expect(unexpected).toEqual([]);
  });

  it('/:slug/register abre o cadastro', async () => {
    open('/studio/register');
    await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull(), T);
    expect(screen.queryByText('Barbearia não encontrada')).toBeNull();
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
