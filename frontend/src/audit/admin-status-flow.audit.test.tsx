import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import App from '../App';
import { appt, brDate, installAdminBackend, signInAsTenantAdmin, type Backend } from './fakeBackend';

/**
 * AUDITORIA (Fase 2 · A6/B): as telas do dono refletem cada mudança de status e chamam o endpoint certo.
 * App inteiro (rotas, contextos, lazy), só a rede é falsa e tem estado. Nada de WhatsApp/e-mail real: o front não envia nenhum.
 */
vi.mock('../pwa/PwaHost', () => ({ PwaHost: () => null }));
vi.mock('../motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const T = { timeout: 25000 };
const inMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };
let be: Backend;

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  setViewportWidth(1280);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  Element.prototype.scrollIntoView = vi.fn();
  signInAsTenantAdmin();
});
afterEach(() => { vi.unstubAllGlobals(); });

const dataRows = () => screen.getAllByRole('row').slice(1);
const rowOf = (name: string) => dataRows().find(r => r.textContent?.includes(name))!;

describe('Agenda: faixa "aguardando confirmação" (Aceitar / Recusar)', { timeout: 90000 }, () => {
  const seed = () => [
    appt('a1', 'c1', brDate(1), '10:00', 'pending', { confirmBy: inMin(90) }),
    appt('a2', 'c2', brDate(1), '11:00', 'pending', { clientConfirmedAt: inMin(-20) }),
    appt('a3', 'c3', brDate(1), '12:00', 'confirmed'),
  ];

  it('mostra só os pendentes e "Aceitar" chama PATCH /admin/appointments/{id}/status com confirmed', async () => {
    be = installAdminBackend(seed());
    open('/admin/agenda');
    expect(await screen.findByText('2 agendamentos aguardando confirmação', undefined, T)).toBeTruthy();

    const [aceitar] = await screen.findAllByRole('button', { name: /Aceitar/ });
    fireEvent.click(aceitar);

    expect(await screen.findByText('1 agendamento aguardando confirmação', undefined, T)).toBeTruthy();
    expect(be.patches()).toHaveLength(1);
    expect(be.patches()[0]).toMatchObject({ method: 'PATCH', path: '/admin/appointments/a1/status', body: { status: 'confirmed' } });
    expect(be.unexpected).toEqual([]);
  });

  it('"Recusar" pede confirmação e grava cancelled SEM motivo (a recusa não existe como status nem leva motivo)', async () => {
    be = installAdminBackend(seed());
    open('/admin/agenda');
    const [recusar] = await screen.findAllByRole('button', { name: /Recusar/ }, T);
    fireEvent.click(recusar);

    const dialog = await screen.findByRole('dialog');
    expect(be.patches()).toHaveLength(0); // nada foi enviado antes da confirmação
    expect(within(dialog).queryByRole('textbox')).toBeNull(); // sem campo de motivo
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar' }));

    await waitFor(() => expect(be.patches()).toHaveLength(1), T);
    expect(be.patches()[0].path).toBe('/admin/appointments/a1/status');
    expect(be.patches()[0].body).toEqual({ status: 'cancelled' }); // só o status: nenhum motivo é enviado
    expect(await screen.findByText('1 agendamento aguardando confirmação', undefined, T)).toBeTruthy();
  });
});

describe('Agendamentos: painel de pendentes e ações de status', { timeout: 90000 }, () => {
  it('pendentes: separa quem confirmou no WhatsApp; "Confirmar" -> confirmed; a linha da tabela vira Confirmado', async () => {
    be = installAdminBackend([
      appt('a1', 'c1', brDate(1), '10:00', 'pending', { confirmBy: inMin(90) }),
      appt('a2', 'c2', brDate(1), '11:00', 'pending', { clientConfirmedAt: inMin(-20) }),
    ]);
    open('/admin/appointments');
    const group = await screen.findByRole('list', { name: /já confirmou/ }, T);
    fireEvent.click(within(group).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(be.patches()).toHaveLength(1), T);
    expect(be.patches()[0]).toMatchObject({ path: '/admin/appointments/a2/status', body: { status: 'confirmed' } });
    await waitFor(() => expect(within(rowOf('Bruno Costa')).getByText('Confirmado')).toBeTruthy(), T);
    expect(within(rowOf('Ana Lima')).getByText('Pendente')).toBeTruthy(); // o outro continua pendente
  });

  it('confirmar em massa: modal de aviso e POST /admin/appointments/bulk-confirm com os ids', async () => {
    be = installAdminBackend([
      appt('a1', 'c1', brDate(1), '10:00', 'pending', { confirmBy: inMin(90) }),
      appt('a2', 'c2', brDate(1), '11:00', 'pending', { clientConfirmedAt: inMin(-20) }),
    ]);
    open('/admin/appointments');
    fireEvent.click(await screen.findByLabelText('Selecionar todos', undefined, T));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar selecionados/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/sem conferir um por um/);
    expect(be.calls.some(c => c.path.endsWith('bulk-confirm'))).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: /Sim, confirmar 2/ }));

    await waitFor(() => expect(be.calls.find(c => c.path === '/admin/appointments/bulk-confirm')).toBeTruthy(), T);
    const call = be.calls.find(c => c.path === '/admin/appointments/bulk-confirm')!;
    expect(call.method).toBe('POST');
    expect((call.body!.ids as string[]).sort()).toEqual(['a1', 'a2']);
    await waitFor(() => expect(within(rowOf('Ana Lima')).getByText('Confirmado')).toBeTruthy(), T);
    expect(within(rowOf('Bruno Costa')).getByText('Confirmado')).toBeTruthy();
  });

  it('confirmado -> concluído, falta e cancelado: cada ação chama o PATCH certo e a linha reflete o novo status', async () => {
    be = installAdminBackend([
      appt('x1', 'c3', brDate(1), '12:00', 'confirmed'),
      appt('x2', 'c2', brDate(1), '13:00', 'confirmed'),
      appt('x3', 'c1', brDate(1), '14:00', 'confirmed'),
    ]);
    open('/admin/appointments');
    fireEvent.click(await screen.findByRole('button', { name: /^Concluir:.*Carla Dias/ }, T));
    fireEvent.click(screen.getByRole('button', { name: /^Marcar falta:.*Bruno Costa/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar:.*Ana Lima/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar agendamento' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar agendamento' }));

    await waitFor(() => expect(be.patches()).toHaveLength(3), T);
    expect(be.patches().map(p => [p.path, p.body])).toEqual([
      ['/admin/appointments/x1/status', { status: 'completed' }],
      ['/admin/appointments/x2/status', { status: 'no_show' }],
      ['/admin/appointments/x3/status', { status: 'cancelled' }],
    ]);
    await waitFor(() => expect(within(rowOf('Carla Dias')).getByText('Concluído')).toBeTruthy(), T);
    // Rótulo da tabela é "Faltou"; a Agenda e o Painel usam "Não compareceu" (nomes diferentes para o mesmo status).
    expect(within(rowOf('Bruno Costa')).getByText('Faltou')).toBeTruthy();
    expect(within(rowOf('Ana Lima')).getByText('Cancelado')).toBeTruthy();
    expect(within(rowOf('Carla Dias')).getByText('Sem ações')).toBeTruthy(); // concluído é final no front
  });

  it('não existe ação "Iniciar atendimento": o fluxo vai direto de confirmado para concluído (sem status "em atendimento")', async () => {
    be = installAdminBackend([appt('x1', 'c3', brDate(1), '12:00', 'confirmed')]);
    open('/admin/appointments');
    await screen.findByRole('button', { name: /^Concluir:/ }, T);
    expect(screen.queryByRole('button', { name: /iniciar/i })).toBeNull();
  });
});

describe('Painel: contadores e "Cancelamentos e faltas recentes"', { timeout: 90000 }, () => {
  it('conta só pendentes de HOJE no card de agendamentos e traz cancelados/faltas do resumo do servidor', async () => {
    const today = new Date().toLocaleDateString('sv-SE'); // o Painel compara com a data local do navegador
    be = installAdminBackend([
      appt('h1', 'c1', today, '09:00', 'confirmed'),
      appt('h2', 'c2', today, '10:00', 'pending'),
      appt('f1', 'c3', brDate(2), '10:00', 'pending'), // pendente de outro dia: não entra no "pendentes" do Painel
      appt('k1', 'c1', brDate(-1), '10:00', 'cancelled'),
      appt('k2', 'c2', brDate(-2), '10:00', 'no_show'),
    ]);
    open('/admin/dashboard');
    expect(await screen.findByText('1 confirmados · 1 pendentes', undefined, T)).toBeTruthy();

    const card = (await screen.findByText('Cancelamentos e faltas recentes', undefined, T)).closest('div[class*="rounded"]') as HTMLElement;
    await waitFor(() => expect(card.textContent).toMatch(/1\s*cancelado/), T);
    expect(card.textContent).toMatch(/1\s*falta/);
  });
});
