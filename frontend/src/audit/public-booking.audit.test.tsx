import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import App from '../App';
import { brDate } from './fakeBackend';

/**
 * AUDITORIA (Fase 2 · A1/B6): fluxo público do cliente (/:slug) com a API falsa. Mede quantos toques/campos até concluir
 * e confere o que é enviado ao backend. Nenhum WhatsApp é enviado: o link wa.me só é aberto pelo navegador do cliente.
 */
vi.mock('../motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const T = { timeout: 25000 };
const SERVICE = { id: 's1', tenantId: 't1', name: 'Corte feminino', description: null, price: 80, duration: 60, category: null, isActive: true };
const PRO = {
  id: 'p1', tenantId: 't1', name: 'Marina Souza', specialty: 'Cabeleireira', avatar: null, photoUrl: null, bio: null,
  workingHoursStart: '09:00', workingHoursEnd: '18:00', workingDays: [0, 1, 2, 3, 4, 5, 6], services: [{ professionalId: 'p1', serviceId: 's1' }], appointmentCount: null,
};
const PUBLIC_TENANT = { id: 't1', slug: 'studio', name: 'Studio Nimbo', primaryColor: '#7c3aed', logoUrl: null, bannerUrl: null, isOpen: true, status: 'active', address: 'Rua A, 1', phone: '(11) 98888-7777', minAdvanceMinutes: 0 };
const booked = {
  booking: { date: brDate(1), professionalId: 'p1', professionalName: 'Marina Souza', totalDuration: 60, totalPrice: 80, items: [{ id: 'x1', serviceId: 's1', serviceName: 'Corte feminino', startTime: '09:00', endTime: '10:00', price: 80 }] },
  client: { id: 'c9', name: 'Ana Lima', phone: '(11) 91111-1111' },
};

type Mode = 'challenge' | 'pending' | 'recognized' | 'slot_taken';
let mode: Mode = 'challenge';
let calls: { method: string; path: string; body: Record<string, unknown> | null; headers: Record<string, string> }[] = [];
let unexpected: string[] = [];
let touches = 0; // toques (cliques) + campos digitados: o esforço do cliente

const tap = (el: Element) => { touches += 1; fireEvent.click(el); };
const typeInto = (el: Element, value: string) => { touches += 1; fireEvent.change(el, { target: { value } }); };

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  calls = []; unexpected = []; touches = 0; mode = 'challenge';
  setViewportWidth(390);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
  Element.prototype.scrollIntoView = vi.fn();
  const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(new Headers(init?.headers as HeadersInit | undefined).entries());
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null, headers });
    if (method === 'GET') {
      if (path === '/public/studio') return ok(PUBLIC_TENANT);
      if (path === '/public/studio/services') return ok([SERVICE]);
      if (path === '/public/studio/professionals') return ok([PRO]);
      if (path === '/public/studio/products') return ok([]);
      if (path === '/public/studio/book/possession') {
        return ok(mode === 'recognized'
          ? { recognized: true, fullName: 'Ana Lima', phone: '(11) 91111-1111', lastServiceId: 's1' }
          : { recognized: false, fullName: null, phone: null, lastServiceId: null });
      }
      if (path === '/public/studio/book/days') return ok([brDate(1), brDate(2)]);
      if (path === '/public/studio/book/slots') return ok(['09:00', '14:30']);
    }
    if (method === 'POST' && path === '/public/studio/book') {
      if (mode === 'slot_taken') {
        return new Response(JSON.stringify({ success: false, error: 'Esse horário acabou de ser reservado. Escolha outro.', code: 'CONFLICT' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      if (mode === 'recognized') return ok({ kind: 'booked', ...booked, deviceToken: null });
      if (mode === 'pending') return ok({ kind: 'pending_confirmation', ...booked, confirmBy: new Date(Date.now() + 3 * 3_600_000).toISOString() });
      return ok({ kind: 'challenge_required', challengeId: 'ch1', maskedPhone: '(11) •••••-••11', expiresAt: '2030-01-01T00:00:00Z' });
    }
    if (method === 'POST' && path === '/public/studio/book/verify') return ok({ kind: 'booked', ...booked, deviceToken: 'tok' });
    if (method === 'POST' && path === '/public/studio/book/client-confirmed') return ok({ confirmed: 1 });
    unexpected.push(`${method} ${path}`);
    return new Response(JSON.stringify({ success: false, error: 'rota inesperada', code: 'NOT_FOUND' }), { status: 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const open = () => { window.history.pushState({}, '', '/studio'); return render(<App />); };

async function chooseServiceAndTime() {
  tap(await screen.findByText('Corte feminino', undefined, T));
  expect(await screen.findByText('Escolha data e horário', undefined, T)).toBeTruthy();
  tap(await screen.findByRole('button', { name: '09:00' }, T));
  expect(await screen.findByText('Seus dados', undefined, T)).toBeTruthy();
}

describe('fluxo público /:slug (390px)', { timeout: 90000 }, () => {
  it('com código por WhatsApp: serviço → horário → dados → código → confirmado; mede o esforço do cliente', async () => {
    open();
    await chooseServiceAndTime();
    typeInto(screen.getByLabelText(/Nome completo/), 'Ana Lima');
    typeInto(screen.getByLabelText(/Celular/), '11911111111');
    tap(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByText('Confirme seu número', undefined, T)).toBeTruthy();
    typeInto(screen.getByLabelText('Código'), '123456');
    tap(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Agendamento confirmado!', undefined, T)).toBeTruthy();

    const book = calls.find(c => c.path === '/public/studio/book')!;
    expect(book.body).toMatchObject({ name: 'Ana Lima', serviceIds: ['s1'], startTime: '09:00', date: brDate(1) });
    expect(String(book.body!.phone).replace(/\D/g, '')).toContain('11911111111');
    expect(calls.find(c => c.path === '/public/studio/book/verify')!.body).toMatchObject({ challengeId: 'ch1', code: '123456' });
    expect(localStorage.getItem('nimbo_device_studio')).toBe('tok');
    expect(unexpected).toEqual([]);
    // 2 toques de escolha + 2 campos + 1 enviar + 1 campo do código + 1 confirmar = 7 interações até confirmar
    expect(touches).toBe(7);
  });

  it('sem código automático: reserva PENDENTE e o cliente toca em "Confirmar no WhatsApp" (wa.me do estabelecimento)', async () => {
    mode = 'pending';
    open();
    await chooseServiceAndTime();
    typeInto(screen.getByLabelText(/Nome completo/), 'Ana Lima');
    typeInto(screen.getByLabelText(/Celular/), '11911111111');
    tap(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByText('Falta só um passo!', undefined, T)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Confirmar no WhatsApp/ });
    expect(link.getAttribute('href')).toContain('https://wa.me/5511988887777?text=');
    expect(localStorage.getItem('nimbo_device_studio')).toBeNull(); // celular não verificado: aparelho não é reconhecido
    tap(link);
    expect(await screen.findByText(/Pronto, Ana!/, undefined, T)).toBeTruthy();
    expect(calls.find(c => c.path === '/public/studio/book/client-confirmed')!.body).toEqual({ appointmentIds: ['x1'] });
    expect(touches).toBe(6); // 2 + 2 campos + enviar + tocar no WhatsApp
  });

  it('aparelho reconhecido: agenda direto, sem código, enviando X-Device-Token', async () => {
    mode = 'recognized';
    localStorage.setItem('nimbo_device_studio', 'tok-conhecido');
    open();
    await chooseServiceAndTime();
    const nome = screen.getByLabelText(/Nome completo/) as HTMLInputElement;
    expect(nome.value).toBe('Ana Lima'); // dados preenchidos a partir do aparelho
    tap(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByText('Agendamento confirmado!', undefined, T)).toBeTruthy();
    const book = calls.find(c => c.path === '/public/studio/book')!;
    expect(book.headers['x-device-token']).toBe('tok-conhecido');
    expect(calls.some(c => c.path.endsWith('/book/verify'))).toBe(false);
    expect(touches).toBe(3); // serviço + horário + confirmar
  });

  it('horário tomado por outra pessoa (409): mostra o erro e mantém o cliente na tela de dados', async () => {
    mode = 'slot_taken';
    open();
    await chooseServiceAndTime();
    typeInto(screen.getByLabelText(/Nome completo/), 'Ana Lima');
    typeInto(screen.getByLabelText(/Celular/), '11911111111');
    tap(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByText(/acabou de ser reservado/, undefined, T)).toBeTruthy();
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull();
  });

  it('a URL guarda o passo (?s=&d=&t=): recarregar a página no passo "dados" não perde a escolha', async () => {
    open();
    await chooseServiceAndTime();
    expect(window.location.pathname).toBe('/studio/dados');
    expect(window.location.search).toMatch(/s=s1/);
    expect(window.location.search).toMatch(/t=09(%3A|:)00/);
  });

  it('telefone inválido não envia', async () => {
    open();
    await chooseServiceAndTime();
    typeInto(screen.getByLabelText(/Nome completo/), 'Ana Lima');
    typeInto(screen.getByLabelText(/Celular/), '123');
    tap(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    await new Promise(r => setTimeout(r, 300));
    expect(calls.some(c => c.method === 'POST' && c.path === '/public/studio/book')).toBe(false);
  });
});
