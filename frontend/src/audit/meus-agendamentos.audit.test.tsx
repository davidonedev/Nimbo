import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import App from '../App';
import { brDate } from './fakeBackend';

/**
 * F4: "Meus agendamentos" no fluxo novo (/:slug). API falsa por fetch: confere o que é enviado (X-Device-Token, corpo)
 * e as mensagens para o cliente (prazo, horário ocupado, aparelho não confirmado, estado vazio).
 */
vi.mock('../pwa/PwaHost', () => ({ PwaHost: () => null }));
vi.mock('../motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const T = { timeout: 25000 };
const SERVICE = { id: 's1', tenantId: 't1', name: 'Corte feminino', description: null, price: 80, duration: 60, category: null, isActive: true };
const PRO = {
  id: 'p1', tenantId: 't1', name: 'Marina Souza', specialty: 'Cabeleireira', avatar: null, photoUrl: null, bio: null,
  workingHoursStart: '09:00', workingHoursEnd: '18:00', workingDays: [0, 1, 2, 3, 4, 5, 6], services: [{ professionalId: 'p1', serviceId: 's1' }], appointmentCount: null,
};
const PUBLIC_TENANT = { id: 't1', slug: 'studio', name: 'Studio Nimbo', primaryColor: '#7c3aed', logoUrl: null, bannerUrl: null, isOpen: true, status: 'active', address: 'Rua A, 1', phone: '(11) 98888-7777', minAdvanceMinutes: 0 };

const appt = (id: string, date: string, startTime: string, status: string) => ({
  id, tenantId: 't1', clientId: 'c1', professionalId: 'p1', serviceId: 's1', date, startTime, endTime: '11:00', status, price: 80, createdAt: '',
  professional: { id: 'p1', name: 'Marina Souza', specialty: 'Cabeleireira' },
  service: { id: 's1', name: 'Corte feminino', duration: 60, price: 80 },
});

// Daqui a 30 min (em Brasília): dentro da última hora, sem cancelar nem remarcar.
const soon = new Date(Date.now() + 30 * 60_000);
const soonDate = soon.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const soonTime = soon.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });

let list: ReturnType<typeof appt>[] = [];
let listFail: { status: number; code: string; error: string } | null = null;
let patchFail: { status: number; code: string; error: string } | null = null;
let recognized = true;
let calls: { method: string; path: string; body: Record<string, unknown> | null; headers: Record<string, string> }[] = [];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  localStorage.setItem('nimbo_device_studio', 'tok-conhecido');
  calls = []; listFail = null; patchFail = null; recognized = true;
  list = [
    appt('up1', brDate(5), '10:00', 'confirmed'),
    appt('up2', brDate(8), '15:00', 'pending'),
    appt('soon', soonDate, soonTime, 'confirmed'),
    appt('old1', brDate(-3), '09:00', 'cancelled'),
    appt('old2', brDate(-10), '09:00', 'completed'),
  ];
  setViewportWidth(390);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(new Headers(init?.headers as HeadersInit | undefined).entries());
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null, headers });
    const ok = (data: unknown) => json({ success: true, data });
    if (method === 'GET') {
      if (path === '/public/studio') return ok(PUBLIC_TENANT);
      if (path === '/public/studio/services') return ok([SERVICE]);
      if (path === '/public/studio/professionals') return ok([PRO]);
      if (path === '/public/studio/products') return ok([]);
      if (path === '/public/studio/book/possession') {
        return ok(recognized
          ? { recognized: true, fullName: 'Ana Lima', phone: '(11) 91111-1111', lastServiceId: 's1' }
          : { recognized: false, fullName: null, phone: null, lastServiceId: null });
      }
      if (path === '/public/studio/book/days') return ok([brDate(1), brDate(2)]);
      if (path === '/public/studio/book/slots') return ok(['09:00', '14:30']);
      if (path === '/public/studio/book/my-appointments') return listFail ? json({ success: false, ...listFail }, listFail.status) : ok(list);
    }
    if (method === 'POST' && path === '/public/studio/book') {
      return ok({
        kind: 'booked', deviceToken: null,
        booking: { date: brDate(1), professionalId: 'p1', professionalName: 'Marina Souza', totalDuration: 60, totalPrice: 80, items: [{ id: 'x1', serviceId: 's1', serviceName: 'Corte feminino', startTime: '09:00', endTime: '10:00', price: 80 }] },
        client: { id: 'c1', name: 'Ana Lima', phone: '(11) 91111-1111' },
      });
    }
    if (method === 'PATCH') {
      if (patchFail) return json({ success: false, ...patchFail }, patchFail.status);
      const id = path.split('/')[4];
      if (path.endsWith('/cancel')) list = list.map(a => (a.id === id ? { ...a, status: 'cancelled' } : a));
      if (path.endsWith('/reschedule')) list = list.map(a => (a.id === id ? { ...a, date: String(init?.body && JSON.parse(String(init.body)).date), status: 'pending' } : a));
      return ok({});
    }
    return json({ success: false, error: 'rota inesperada', code: 'NOT_FOUND' }, 404);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const open = (path = '/studio/meus-agendamentos') => { window.history.pushState({}, '', path); return render(<App />); };
const card = (name: RegExp) => screen.getAllByRole('listitem').find(li => name.test(li.textContent ?? ''))!;

describe('Meus agendamentos (/:slug/meus-agendamentos, 390px)', { timeout: 90000 }, () => {
  it('lista próximos e histórico, manda X-Device-Token e esconde cancelar/remarcar na última hora', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Meus agendamentos' }, T)).toBeTruthy();
    expect(await screen.findByText('Próximos', undefined, T)).toBeTruthy();
    expect(screen.getByText('Histórico')).toBeTruthy();
    const get = calls.find(c => c.path === '/public/studio/book/my-appointments')!;
    expect(get.headers['x-device-token']).toBe('tok-conhecido');

    expect(screen.getAllByRole('button', { name: /Remarcar/ })).toHaveLength(2); // up1 e up2; "soon" não
    expect(screen.getAllByRole('button', { name: /^Cancelar/ })).toHaveLength(2);
    expect(within(card(/Aguardando confirmação/)).getByRole('button', { name: /Remarcar/ })).toBeTruthy();
    expect(screen.getByText(/Faltam menos de 1 hora/)).toBeTruthy();
    expect(screen.getByText('Cancelado')).toBeTruthy();
    expect(screen.getByText('Concluído')).toBeTruthy();
  });

  it('cancelar pede confirmação, envia PATCH com o token e avisa que o horário foi liberado', async () => {
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: /^Cancelar/ }, T))[0]);
    expect(screen.getByText(/Cancelar este agendamento\?/)).toBeTruthy();
    expect(calls.some(c => c.method === 'PATCH')).toBe(false); // só confirma no 2º toque
    fireEvent.click(screen.getByRole('button', { name: 'Manter horário' }));
    expect(screen.queryByText(/Cancelar este agendamento\?/)).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /^Cancelar/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    expect(await screen.findByText(/Agendamento cancelado\. O horário foi liberado\./, undefined, T)).toBeTruthy();
    const patch = calls.find(c => c.method === 'PATCH')!;
    expect(patch.path).toBe('/public/studio/appointments/up1/cancel');
    expect(patch.headers['x-device-token']).toBe('tok-conhecido');
  });

  it('prazo vencido no servidor: mensagem amigável, sem "Erro 400"', async () => {
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: /^Cancelar/ }, T))[0]);
    patchFail = { status: 400, code: 'CANCELLATION_WINDOW_EXPIRED', error: 'Erro 400' };
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    expect(await screen.findByText(/O prazo para cancelar já passou/, undefined, T)).toBeTruthy();
    expect(screen.queryByText('Erro 400')).toBeNull();
  });

  it('remarcar um confirmado: escolhe dia e horário, confirma e avisa que pedimos nova confirmação', async () => {
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: /Remarcar/ }, T))[0]); // up1 (confirmado)
    expect(await screen.findByRole('heading', { name: 'Remarcar horário' }, T)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '14:30' }, T));
    expect(screen.getByRole('group', { name: 'Confirmar remarcação' })).toBeTruthy();
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remarcação' }));

    expect(await screen.findByText(/Pedimos uma nova confirmação ao estabelecimento\./, undefined, T)).toBeTruthy();
    const patch = calls.find(c => c.method === 'PATCH')!;
    expect(patch.path).toBe('/public/studio/appointments/up1/reschedule');
    expect(patch.body).toEqual({ date: brDate(1), startTime: '14:30' });
    expect(patch.headers['x-device-token']).toBe('tok-conhecido');
    const slots = calls.filter(c => c.path === '/public/studio/book/slots').pop()!;
    expect(slots.method).toBe('GET');
  });

  it('remarcar e o horário já foi ocupado (409): avisa e volta a escolher horário', async () => {
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: /Remarcar/ }, T))[0]);
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }, T));
    patchFail = { status: 409, code: 'SCHEDULE_CONFLICT', error: 'Conflito' };
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remarcação' }));
    expect(await screen.findByText('Esse horário acabou de ser ocupado. Escolha outro horário.', undefined, T)).toBeTruthy();
    expect(await screen.findByRole('button', { name: '14:30' }, T)).toBeTruthy();
  });

  it('403 DEVICE_REQUIRED: pede para confirmar o celular e leva ao início do fluxo', async () => {
    listFail = { status: 403, code: 'DEVICE_REQUIRED', error: 'Aparelho não reconhecido' };
    open();
    expect(await screen.findByText('Confirme seu celular para gerenciar seus agendamentos.', undefined, T)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o início' }));
    expect(await screen.findByText('Corte feminino', undefined, T)).toBeTruthy();
    expect(window.location.pathname).toBe('/studio');
  });

  it('sem agendamentos: estado vazio com o caminho para agendar', async () => {
    list = [];
    open();
    expect(await screen.findByText('Você ainda não tem agendamentos aqui.', undefined, T)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Novo agendamento/ })).toBeTruthy();
  });

  it('o cabeçalho mostra o link "Meus agendamentos" só quando o aparelho é reconhecido', async () => {
    open('/studio');
    const link = await screen.findByRole('link', { name: /Meus agendamentos/ }, T);
    expect(link.getAttribute('href')).toBe('/studio/meus-agendamentos');
  });

  it('a tela "Agendamento confirmado!" oferece "Ver meus agendamentos"', async () => {
    open('/studio');
    fireEvent.click(await screen.findByText('Corte feminino', undefined, T));
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }, T));
    await screen.findByText('Seus dados', undefined, T);
    await waitFor(() => expect((screen.getByLabelText(/Nome completo/) as HTMLInputElement).value).toBe('Ana Lima'), T);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByText('Agendamento confirmado!', undefined, T)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Ver meus agendamentos/ });
    expect(link.getAttribute('href')).toBe('/studio/meus-agendamentos');
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Meus agendamentos' }, T)).toBeTruthy();
  });

  it('aparelho não reconhecido: sem link no cabeçalho', async () => {
    recognized = false;
    open('/studio');
    await screen.findByText('Corte feminino', undefined, T);
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByRole('link', { name: /Meus agendamentos/ })).toBeNull();
  });
});
