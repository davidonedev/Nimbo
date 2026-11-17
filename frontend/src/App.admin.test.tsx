import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { LEGACY_ADMIN_REDIRECTS } from '@/config/legacyRoutes';
import App from './App';

/**
 * Teste de fumaça das telas do dono (/admin/**) e do super admin (/super/**): monta o <App/> inteiro,
 * com contextos, rotas aninhadas e lazy-loading reais, e só troca a rede (fetch) por respostas no formato do backend.
 * Pega tela branca, "Carregando…" eterno, rota sem Outlet/index, redirecionamento em loop e item de menu sem rota.
 */

vi.mock('./pwa/PwaHost', () => ({ PwaHost: () => null }));
vi.mock('./motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));
vi.mock('./pages/LoginPage', () => ({ default: () => <p>tela de login</p> }));

const today = new Date().toISOString().slice(0, 10);
const TENANT = {
  id: 't1', slug: 'studio-nimbo', name: 'Studio Nimbo', ownerName: 'Dona', email: 'dona@x.com', phone: '(11) 90000-0000', address: 'Rua A, 1',
  status: 'active', plan: 'pro', monthlyPrice: 99, createdAt: '2026-01-01T00:00:00.000Z', primaryColor: '#7c3aed', adminColor: null,
  logoUrl: null, bannerUrl: null, isOpen: true, minAdvanceMinutes: 60,
};
const PROFESSIONAL = {
  id: 'p1', tenantId: 't1', name: 'Marina Souza', specialty: 'Cabeleireira', avatar: 'MS', bio: '', photoUrl: null,
  workingHoursStart: '08:00', workingHoursEnd: '18:00', workingDays: [1, 2, 3, 4, 5], services: [{ serviceId: 's1' }],
};
const SERVICE = { id: 's1', tenantId: 't1', name: 'Corte feminino', description: '', price: 80, duration: 60, category: 'Cabelo', isActive: true };
const CLIENT = { id: 'c1', tenantId: 't1', name: 'Ana Lima', email: 'ana@x.com', phone: '(11) 91111-1111', createdAt: '2026-01-01T00:00:00.000Z' };
const APPOINTMENT = {
  id: 'a1', tenantId: 't1', clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: today, startTime: '09:00', endTime: '10:00',
  status: 'confirmed', price: 80, createdAt: '2026-01-01T00:00:00.000Z',
  client: { id: 'c1', name: 'Ana Lima', phone: '(11) 91111-1111' }, service: { id: 's1', name: 'Corte feminino', duration: 60 }, professional: { id: 'p1', name: 'Marina Souza' },
};
const PRODUCT = {
  id: 'pr1', tenantId: 't1', name: 'Shampoo', price: 30, stock: 5, lowStockThreshold: 2, category: 'Cabelo', isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const COUNTS = { professionals: 1, services: 1, clients: 1, appointments: 1 };
const PLAN = (plan: string) => ({ id: plan, plan, displayName: plan, defaultPrice: 99, maxProfessionals: -1, maxServices: -1, features: ['Agenda'], updatedAt: '2026-01-01T00:00:00.000Z' });
const ACCESS_HELP = {
  id: 'h1', requesterType: 'professional', name: 'Fulano', contact: 'f@x.com', barbershop: 'Studio', message: null, tenantId: 't1', tenantName: 'Studio Nimbo',
  target: 'tenant', status: 'pending', resolvedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Variantes de dados: o backend devolve `null` em campo opcional (não `undefined`) e uma conta nova vem com tudo vazio.
 * Tela que só funciona com o cenário "completo" quebra para o usuário real.
 */
type Variant = 'completo' | 'campos nulos' | 'conta nova';
let variant: Variant = 'completo';
const NULLABLE = {
  tenant: { phone: null, address: null, adminColor: null, logoUrl: null, bannerUrl: null },
  client: { phone: null },
  service: { description: null, category: null },
  professional: { bio: null, avatar: null, photoUrl: null },
  product: { category: null, description: null, imageUrl: null },
  appointment: { notes: null, client: { id: 'c1', name: 'Ana Lima', phone: null } },
};
const pick = <T extends object>(full: T, nulls: object): T => (variant === 'campos nulos' ? { ...full, ...nulls } : full);
const list = <T,>(items: T[]): T[] => (variant === 'conta nova' ? [] : items);

/** Respostas por rota da API (o que cada endpoint devolve hoje no backend). */
const routes = (): [RegExp, unknown][] => [
  [/\/admin\/me$/, pick(TENANT, NULLABLE.tenant)],
  [/\/admin\/professionals$/, list([pick(PROFESSIONAL, NULLABLE.professional)])],
  [/\/admin\/services$/, list([pick(SERVICE, NULLABLE.service)])],
  [/\/admin\/clients/, list([pick(CLIENT, NULLABLE.client)])],
  [/\/admin\/appointments/, list([pick(APPOINTMENT, NULLABLE.appointment)])],
  [/\/admin\/blocked-slots/, list([{ id: 'b1', tenantId: 't1', professionalId: 'p1', date: today, startTime: '12:00', endTime: '13:00', reason: 'Almoço', professional: { id: 'p1', name: 'Marina Souza' } }])],
  [/\/admin\/products$/, list([pick(PRODUCT, NULLABLE.product)])],
  [/\/admin\/product-categories$/, [{ id: 'pc1', tenantId: 't1', name: 'Cabelo', createdAt: '2026-01-01' }]],
  [/\/admin\/service-categories$/, [{ id: 'sc1', tenantId: 't1', name: 'Cabelo', createdAt: '2026-01-01' }]],
  [/\/admin\/categories/, []],
  [/\/admin\/dashboard\/summary$/, {
    today, clients: { total: 1, last7Days: 1, previous7Days: 0 }, cancellations: { total: 1, cancelled: 0, noShow: 0 },
    week: list([{ date: today, count: 1 }]),
    upcoming: list([{ id: 'a1', date: today, startTime: '09:00', clientName: 'Ana Lima', serviceName: 'Corte feminino', professionalName: 'Marina Souza', status: 'confirmed' }]),
    trial: { state: 'none', totalDays: 14, usedDays: 0, remainingDays: 14, endsAt: null },
  }],
  [/\/admin\/revenue/, { total: 80, count: 1, byDate: { [today]: 80 }, byService: [{ name: 'Corte feminino', revenue: 80, count: 1 }], byProfessional: [{ name: 'Marina Souza', revenue: 80, count: 1 }] }],
  [/\/admin\/reminders\/absent-clients/, list([{
    id: 'c1', name: 'Ana Lima', phone: variant === 'campos nulos' ? null : '(11) 91111-1111', email: 'ana@x.com', createdAt: '2026-01-01',
    lastAppointmentDate: null, lastServiceName: null, daysMissing: null,
  }])],
  [/\/admin\/access-help$/, [ACCESS_HELP]],
  [/\/super\/access-help$/, [{ ...ACCESS_HELP, target: 'super_admin', requesterType: 'tenant_admin' }]],
  [/\/super\/metrics$/, {
    totals: { tenants: 1, professionals: 1, clients: 1, appointments: 1, completedAppointments: 1 },
    tenantsByStatus: { active: 1, trial: 0, suspended: 0 }, tenantsByPlan: { pro: 1 }, revenue: { total: 80, mrr: 99 },
  }],
  [/\/super\/tenants\/t1$/, {
    ...TENANT, _count: COUNTS, professionals: [{ id: 'p1', name: 'Marina Souza', specialty: 'Cabeleireira', _count: { appointments: 1 } }],
    services: [{ id: 's1', name: 'Corte feminino', price: 80, duration: 60, category: 'Cabelo' }],
    appointmentStats: { today: { count: 1, revenue: 80 }, month: { count: 1, revenue: 80 }, year: { count: 1, revenue: 80 } },
  }],
  [/\/super\/tenants$/, list([{ ...pick(TENANT, NULLABLE.tenant), _count: COUNTS }])],
  [/\/super\/plans$/, [PLAN('basic'), PLAN('pro'), PLAN('enterprise')]],
  [/\/super\/users$/, [{ id: 'u2', name: 'Dona', email: 'dona@x.com', role: 'tenant_admin', tenantId: 't1', tenant: { name: 'Studio Nimbo', slug: 'studio-nimbo' } }]],
];

const unmatched: string[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  // PATCH /admin/settings devolve o tenant já com o que foi enviado (como o backend)
  if (init?.method === 'PATCH' && /\/admin\/settings$/.test(url)) {
    return { ok: true, status: 200, json: async () => ({ success: true, data: { ...TENANT, ...JSON.parse(String(init.body)) } }) } as Response;
  }
  const hit = routes().find(([re]) => re.test(url.split('?')[0]) || re.test(url));
  if (!hit) unmatched.push(url);
  const status = hit ? 200 : 404;
  return { ok: hit != null, status, json: async () => (hit ? { success: true, data: hit[1] } : { error: 'rota sem mock' }) } as Response;
});

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}; // jsdom não implementa

const signIn = (role: string) =>
  sessionStorage.setItem('agendepro_session', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Dona Souza', email: 'dona@x.com', role, tenantId: 't1' } }));
const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };

/** Telas do tenant_admin: URL → o que precisa aparecer quando a tela montou. */
const ADMIN_SCREENS: [string, string | RegExp][] = [
  ['/admin/dashboard', 'Painel'],
  ['/admin/agenda', 'Agenda'],
  ['/admin/agenda-beta', /./],
  ['/admin/appointments', 'Agendamentos'],
  ['/admin/clients', 'Clientes'],
  ['/admin/professionals', 'Profissionais'],
  ['/admin/services', 'Serviços'],
  ['/admin/services/products', 'Produtos'],
  ['/admin/reports', 'Faturamento'],
  ['/admin/settings', 'Configurações da Conta'],
  ['/admin/settings/portal', 'Portal do Cliente'],
  ['/admin/settings/schedule', 'Disponibilidade de Horários'],
  ['/admin/settings/blocks', 'Bloqueios'],
  ['/admin/settings/reminders', /Lembretes/],
  ['/admin/settings/access-help', /Pedidos de acesso/],
];

const SUPER_SCREENS: [string, string | RegExp][] = [
  ['/super/dashboard', 'Visão Geral da Plataforma'],
  ['/super/tenants', 'Tenants'],
  ['/super/tenants/t1', 'Studio Nimbo'],
  ['/super/metrics', 'Métricas da Plataforma'],
  ['/super/plans', /Planos/],
  ['/super/account', 'Minha conta'],
  ['/super/access-help', /Pedidos de acesso/],
];

async function expectMounted(expected: string | RegExp) {
  // Cabeçalho da tela (nível 1 ou 2) ou, para regex genérica, qualquer conteúdo dentro do <main>
  const heading = await screen.findAllByRole('heading', { name: expected }, { timeout: 15000 }).catch(() => null);
  if (!heading) {
    throw new Error(`a tela não montou; conteúdo do <main>: ${document.querySelector('main')?.textContent?.slice(0, 300) ?? '(sem <main>)'}`);
  }
  const main = document.querySelector('main');
  expect(main, 'o layout precisa ter <main>').not.toBeNull();
  await waitFor(() => {
    expect(screen.queryByText(/carregando/i), 'ficou em "Carregando…"').toBeNull();
    expect(screen.queryByRole('alert'), 'a tela mostrou um alerta de erro').toBeNull();
  }, { timeout: 15000 });
}

describe.each<Variant>(['completo', 'campos nulos', 'conta nova'])('telas do admin e do super admin — dados: %s', { timeout: 60000 }, (v) => {
  beforeEach(() => {
    variant = v;
    sessionStorage.clear(); localStorage.clear(); unmatched.length = 0;
    setViewportWidth(1280);
    vi.stubGlobal('fetch', fakeFetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  describe('/admin/**', () => {
    it.each(ADMIN_SCREENS)('%s monta', async (path, expected) => {
      signIn('tenant_admin');
      open(path);
      await expectMounted(expected);
      expect(window.location.pathname).toBe(path);
      expect(unmatched, 'chamadas à API sem resposta no mock').toEqual([]);
    });

    it('/admin abre o Painel', async () => {
      signIn('tenant_admin');
      open('/admin');
      await expectMounted('Painel');
      expect(window.location.pathname).toBe('/admin/dashboard');
    });

    it.each(Object.entries(LEGACY_ADMIN_REDIRECTS))('URL antiga /admin/%s redireciona para %s e a tela monta', async (from, to) => {
      signIn('tenant_admin');
      open(`/admin/${from}`);
      await waitFor(() => expect(window.location.pathname).toBe(to), { timeout: 15000 });
      await expectMounted(/./);
    });

    it('Clientes: lista e busca funcionam mesmo com cliente sem telefone', async () => {
      signIn('tenant_admin');
      open('/admin/clients');
      if (variant === 'conta nova') { await expectMounted('Clientes'); return; }
      expect(await screen.findByText('Ana Lima', {}, { timeout: 15000 })).toBeTruthy();
      fireEvent.change(screen.getByPlaceholderText(/buscar por nome/i), { target: { value: '9111' } });
      fireEvent.change(screen.getByPlaceholderText(/buscar por nome/i), { target: { value: 'ana' } });
      expect(screen.getByText('Ana Lima')).toBeTruthy();
    });

    it('Lembretes: lista e busca funcionam mesmo com cliente sem telefone', async () => {
      signIn('tenant_admin');
      open('/admin/settings/reminders');
      if (variant === 'conta nova') { await expectMounted(/Lembretes/); return; }
      expect(await screen.findByText('Ana Lima', {}, { timeout: 15000 })).toBeTruthy();
      fireEvent.change(screen.getByPlaceholderText(/buscar cliente/i), { target: { value: '9111' } });
      fireEvent.change(screen.getByPlaceholderText(/buscar cliente/i), { target: { value: 'ana' } });
      expect(screen.getByText('Ana Lima')).toBeTruthy();
    });

    it('cada item do menu do dono leva a uma tela que existe', async () => {
      const { navItemsFor } = await import('@/config/navigation');
      for (const item of navItemsFor('tenant_admin')) {
        expect(ADMIN_SCREENS.map(([p]) => p), `${item.label} (${item.to}) sem rota testada`).toContain(item.to);
      }
    });

    it('menu do celular: abre o "Mais" e navega', async () => {
      setViewportWidth(390);
      signIn('tenant_admin');
      open('/admin/dashboard');
      await expectMounted('Painel');
      expect(screen.getAllByRole('link', { name: /agenda/i }).length).toBeGreaterThan(0);
    });
  });

  describe('/super/**', () => {
    it.each(SUPER_SCREENS)('%s monta', async (path, expected) => {
      signIn('super_admin');
      open(path);
      await expectMounted(expected);
      expect(window.location.pathname).toBe(path);
    });

    it('/super abre o Painel', async () => {
      signIn('super_admin');
      open('/super');
      await expectMounted('Visão Geral da Plataforma');
      expect(window.location.pathname).toBe('/super/dashboard');
    });

    it('cada item do menu do super admin leva a uma tela que existe', async () => {
      const { navItemsFor } = await import('@/config/navigation');
      for (const item of navItemsFor('super_admin')) {
        expect(SUPER_SCREENS.map(([p]) => p), `${item.label} (${item.to}) sem rota testada`).toContain(item.to);
      }
    });
  });

  it('o admin não entra no /super e vice-versa', async () => {
    signIn('tenant_admin');
    open('/super/dashboard');
    expect(await screen.findByText('tela de login')).toBeTruthy();
  });
});

/** Navbar do admin: status Aberto/Fechado, "+ Novo" e busca — com o app real. */
describe('navbar do admin', { timeout: 60000 }, () => {
  beforeEach(() => {
    variant = 'completo';
    sessionStorage.clear(); localStorage.clear(); unmatched.length = 0;
    setViewportWidth(1280);
    vi.stubGlobal('fetch', fakeFetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const statusBadge = () => screen.getAllByRole('status').find(el => /^(Aberto|Fechado)/.test((el.textContent ?? '').trim()))!;

  it('o interruptor do portal do cliente muda o status do navbar na hora, sem precisar salvar', async () => {
    signIn('tenant_admin');
    open('/admin/settings/portal');
    const toggle = await screen.findByRole('switch', { name: 'Estabelecimento aberto' }, { timeout: 15000 });
    await waitFor(() => expect(statusBadge().textContent).toContain('Aberto'));

    fireEvent.click(toggle);
    await waitFor(() => expect(statusBadge().textContent).toContain('Fechado'), { timeout: 5000 });
    expect(screen.getByText(/Fechado — sem agendamentos/)).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: 'Estabelecimento aberto' }));
    await waitFor(() => expect(statusBadge().textContent).toContain('Aberto'), { timeout: 5000 });
  });

  it('o status do navbar não depende do expediente dos profissionais (só do interruptor)', async () => {
    signIn('tenant_admin');
    open('/admin/dashboard');
    await expectMounted('Painel');
    // Painel aberto + interruptor ligado = "Aberto", mesmo fora do horário do profissional
    expect(statusBadge().textContent).toContain('Aberto');
  });

  it('"+ Novo" da navbar abre o diálogo de novo agendamento', async () => {
    signIn('tenant_admin');
    open('/admin/dashboard');
    await expectMounted('Painel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo agendamento' })[0]);
    const dialog = await screen.findByRole('dialog', {}, { timeout: 15000 });
    expect(dialog.textContent).toContain('Novo Agendamento');
    expect(screen.getByRole('button', { name: 'Criar Agendamento' }).hasAttribute('disabled')).toBe(true); // falta cliente, serviço…
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a busca acha cliente sem acento/caixa e abre a tela de Clientes já filtrada', async () => {
    signIn('tenant_admin');
    open('/admin/dashboard');
    await expectMounted('Painel');
    const box = screen.getByRole('combobox', { name: 'Buscar' }) as HTMLInputElement;
    await waitFor(() => expect(box).toBeTruthy());
    fireEvent.change(box, { target: { value: 'ANA lím' } });
    const options = await screen.findAllByRole('option');
    expect(options.some(o => (o.textContent ?? '').includes('Ana Lima'))).toBe(true);
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(window.location.pathname).toBe('/admin/clients'));
    expect(decodeURIComponent(window.location.search)).toBe('?q=Ana Lima');
    // a tela de destino já abre filtrada pelo mesmo texto
    expect(await screen.findByDisplayValue('Ana Lima')).toBeTruthy();
  });

  it('Ctrl+K foca a busca e Esc limpa o texto', async () => {
    signIn('tenant_admin');
    open('/admin/dashboard');
    await expectMounted('Painel');
    const box = screen.getByRole('combobox', { name: 'Buscar' }) as HTMLInputElement;
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: 'corte' } });
    expect((await screen.findAllByRole('option')).some(o => (o.textContent ?? '').includes('Corte feminino'))).toBe(true);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('');
  });

  it('sem resultado, a busca avisa em vez de ficar muda', async () => {
    signIn('tenant_admin');
    open('/admin/dashboard');
    await expectMounted('Painel');
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar' }), { target: { value: 'zzzxyz' } });
    expect(await screen.findByText(/Nenhum resultado para/)).toBeTruthy();
  });

  it('no celular, a lupa abre a folha de busca e o resultado leva à tela', async () => {
    setViewportWidth(390);
    signIn('tenant_admin');
    open('/admin/dashboard');
    await expectMounted('Painel');
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 15000 });
    expect(dialog.textContent).toContain('Buscar');
    const box = within(dialog).getByRole('combobox', { name: 'Buscar' });
    fireEvent.change(box, { target: { value: 'marina' } });
    // o agendamento também cita a Marina no subtítulo: escolhe o item cujo TÍTULO é o profissional
    const option = (await within(dialog).findAllByRole('option')).find(o => o.querySelector('span')?.textContent === 'Marina Souza')!;
    fireEvent.click(option);
    await waitFor(() => expect(window.location.pathname).toBe('/admin/professionals'));
  });
});
