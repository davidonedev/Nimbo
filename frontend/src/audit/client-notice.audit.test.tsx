import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import App from '../App';
import { appt, brDate, installAdminBackend, signInAsTenantAdmin, type Backend } from './fakeBackend';

/** Depois de aprovar, recusar ou cancelar, o dono tem o botão que abre o WhatsApp com a mensagem pronta para o cliente. */
vi.mock('../pwa/PwaHost', () => ({ PwaHost: () => null }));
vi.mock('../motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const T = { timeout: 25000 };
const inMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
let be: Backend;

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  setViewportWidth(1280);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  Element.prototype.scrollIntoView = vi.fn();
  signInAsTenantAdmin();
});
afterEach(() => { vi.unstubAllGlobals(); });

const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };
const noticeLinks = () => screen.queryAllByRole('link', { name: /^Avisar .* no WhatsApp$/ });
const decodedText = (link: HTMLElement) => decodeURIComponent((link as HTMLAnchorElement).href.split('?text=')[1]);

describe('Aviso ao cliente pelo WhatsApp', { timeout: 90000 }, () => {
  it('Aceitar na Agenda mostra o link wa.me do cliente com a mensagem de confirmação', async () => {
    be = installAdminBackend([appt('a1', 'c1', brDate(1), '10:00', 'pending')]);
    open('/admin/agenda');
    fireEvent.click((await screen.findAllByRole('button', { name: /Aceitar/ }, T))[0]);

    const link = await screen.findByRole('link', { name: 'Avisar Ana no WhatsApp' }, T);
    expect((link as HTMLAnchorElement).href).toMatch(/^https:\/\/wa\.me\/5511911111111\?text=/);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(decodedText(link)).toContain('Seu horário em Studio Nimbo está confirmado: Corte feminino com Marina Souza');
    expect(decodedText(link)).toContain('Endereço: Rua A, 1.');
    expect(screen.getByText('Avise o cliente pelo WhatsApp:')).toBeTruthy();
  });

  it('Recusar na Agenda mostra a mensagem de recusa com o link para escolher outro horário', async () => {
    be = installAdminBackend([appt('a1', 'c1', brDate(1), '10:00', 'pending')]);
    open('/admin/agenda');
    fireEvent.click((await screen.findAllByRole('button', { name: /Recusar/ }, T))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar' }));

    const link = await screen.findByRole('link', { name: 'Avisar Ana no WhatsApp' }, T);
    expect(decodedText(link)).toContain('Não conseguimos atender');
    expect(decodedText(link)).toContain(`${window.location.origin}/studio`);
  });

  it('a faixa fecha no botão', async () => {
    be = installAdminBackend([appt('a1', 'c1', brDate(1), '10:00', 'pending')]);
    open('/admin/agenda');
    fireEvent.click((await screen.findAllByRole('button', { name: /Aceitar/ }, T))[0]);
    await screen.findByRole('link', { name: 'Avisar Ana no WhatsApp' }, T);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(noticeLinks()).toHaveLength(0);
  });

  it('se o servidor recusar a troca, não há aviso ao cliente (só o erro)', async () => {
    be = installAdminBackend([appt('a1', 'c1', brDate(1), '10:00', 'pending')]);
    open('/admin/agenda');
    const [aceitar] = await screen.findAllByRole('button', { name: /Aceitar/ }, T);
    be.failNextStatusWith = 500;
    fireEvent.click(aceitar);

    expect((await screen.findByRole('alert', undefined, T)).textContent).toContain('Não foi possível atualizar o agendamento');
    expect(noticeLinks()).toHaveLength(0);
  });

  it('cliente sem telefone: a ação funciona e nenhum aviso aparece', async () => {
    be = installAdminBackend([appt('a1', 'c4', brDate(1), '10:00', 'pending')]);
    open('/admin/agenda');
    fireEvent.click((await screen.findAllByRole('button', { name: /Aceitar/ }, T))[0]);

    await waitFor(() => expect(be.patches()).toHaveLength(1), T);
    await waitFor(() => expect(screen.queryByText(/aguardando confirmação/)).toBeNull(), T);
    expect(noticeLinks()).toHaveLength(0);
  });

  it('Agendamentos: concluir e marcar falta não avisam; cancelar um confirmado avisa o cancelamento', async () => {
    be = installAdminBackend([
      appt('x1', 'c3', brDate(1), '12:00', 'confirmed'),
      appt('x2', 'c2', brDate(1), '13:00', 'confirmed'),
      appt('x3', 'c1', brDate(1), '14:00', 'confirmed'),
    ]);
    open('/admin/appointments');
    fireEvent.click(await screen.findByRole('button', { name: /^Concluir:.*Carla Dias/ }, T));
    await waitFor(() => expect(be.patches()).toHaveLength(1), T);
    fireEvent.click(screen.getByRole('button', { name: /^Marcar falta:.*Bruno Costa/ }));
    await waitFor(() => expect(be.patches()).toHaveLength(2), T);
    expect(noticeLinks()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^Cancelar:.*Ana Lima/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar agendamento' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar agendamento' }));

    const link = await screen.findByRole('link', { name: 'Avisar Ana no WhatsApp' }, T);
    expect(decodedText(link)).toContain('foi cancelado. Para reagendar:');
  });

  it('Agendamentos: Confirmar um pendente avisa a aprovação só daquele cliente', async () => {
    be = installAdminBackend([
      appt('a1', 'c1', brDate(1), '10:00', 'pending', { confirmBy: inMin(90) }),
      appt('a2', 'c2', brDate(1), '11:00', 'pending', { clientConfirmedAt: inMin(-20) }),
    ]);
    open('/admin/appointments');
    const group = await screen.findByRole('list', { name: /já confirmou/ }, T);
    fireEvent.click(within(group).getByRole('button', { name: 'Confirmar' }));

    const link = await screen.findByRole('link', { name: 'Avisar Bruno no WhatsApp' }, T);
    expect(decodedText(link)).toContain('está confirmado');
    expect(noticeLinks()).toHaveLength(1);
  });

  it('confirmação em massa lista um aviso por cliente', async () => {
    be = installAdminBackend([
      appt('a1', 'c1', brDate(1), '10:00', 'pending', { confirmBy: inMin(90) }),
      appt('a2', 'c2', brDate(1), '11:00', 'pending', { clientConfirmedAt: inMin(-20) }),
      appt('a3', 'c4', brDate(1), '12:00', 'pending', { clientConfirmedAt: inMin(-10) }),
    ]);
    open('/admin/appointments');
    fireEvent.click(await screen.findByLabelText('Selecionar todos', undefined, T));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar selecionados/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Sim, confirmar 3/ }));

    await screen.findByRole('link', { name: 'Avisar Ana no WhatsApp' }, T);
    expect(screen.getByRole('link', { name: 'Avisar Bruno no WhatsApp' })).toBeTruthy();
    expect(noticeLinks()).toHaveLength(2); // a cliente sem telefone fica de fora
  });
});
