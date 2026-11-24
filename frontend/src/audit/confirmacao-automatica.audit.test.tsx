import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { confirmInSafetyDialog, dismissSafetyDialog } from '@/test/confirmDialog';
import { resetWhatsappAutoCache } from '@/hooks/useWhatsappAuto';
import App from '../App';
import { appt, brDate, installAdminBackend, signInAsTenantAdmin, type Backend } from './fakeBackend';

/**
 * Confirmar um agendamento: pede uma segunda confirmação (segurança contra toque sem querer) e o aviso ao cliente sai
 * sozinho pelo WhatsApp quando o envio automático está ligado; senão a tela oferece o link como reserva.
 */
vi.mock('../pwa/PwaHost', () => ({ PwaHost: () => null }));
vi.mock('../motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const T = { timeout: 25000 };
let be: Backend;

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  resetWhatsappAutoCache();
  setViewportWidth(1280);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  Element.prototype.scrollIntoView = vi.fn();
  signInAsTenantAdmin();
});
afterEach(() => { vi.unstubAllGlobals(); });

const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };
const seed = () => [appt('a1', 'c1', brDate(1), '10:00', 'pending')];
const aceitar = async () => fireEvent.click((await screen.findAllByRole('button', { name: /Aceitar/ }, T))[0]);

describe('Confirmar agendamento: modal de segurança', { timeout: 90000 }, () => {
  it('Aceitar não confirma de imediato: abre o modal com quem e quando, e "Voltar" não chama a API', async () => {
    be = installAdminBackend(seed());
    open('/admin/agenda');
    await aceitar();

    const dialog = await screen.findByRole('dialog', { name: /Confirmar agendamento\?/ }, T);
    expect(dialog.textContent).toContain('Ana Lima');
    expect(dialog.textContent).toContain('Corte feminino');
    expect(dialog.textContent).toContain('10:00');
    expect(be.patches()).toHaveLength(0);

    await dismissSafetyDialog();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(be.patches()).toHaveLength(0);
    expect(be.appointments[0].status).toBe('pending');
  });

  it('só o segundo "Sim, confirmar" chama PATCH, uma única vez', async () => {
    be = installAdminBackend(seed());
    open('/admin/agenda');
    await aceitar();
    await confirmInSafetyDialog();

    await waitFor(() => expect(be.patches()).toHaveLength(1), T);
    expect(be.patches()[0].body).toEqual({ status: 'confirmed' });
  });

  it('em Agendamentos, o botão Confirmar da linha também passa pelo modal', async () => {
    be = installAdminBackend([appt('x1', 'c3', brDate(1), '12:00', 'pending')]);
    open('/admin/appointments');
    fireEvent.click(await screen.findByRole('button', { name: /^Confirmar:.*Carla Dias/ }, T));
    expect(be.patches()).toHaveLength(0);
    await dismissSafetyDialog();
    expect(be.patches()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^Confirmar:.*Carla Dias/ }));
    await confirmInSafetyDialog();
    await waitFor(() => expect(be.patches()).toHaveLength(1), T);
  });
});

describe('Confirmar agendamento: aviso automático ao cliente', { timeout: 90000 }, () => {
  it('com o WhatsApp automático ligado: o modal avisa que a mensagem sai sozinha e a tela mostra "enviada", sem link', async () => {
    be = installAdminBackend(seed());
    be.whatsappAuto = true;
    open('/admin/agenda');
    await aceitar();
    const dialog = await screen.findByRole('dialog', { name: /Confirmar agendamento\?/ }, T);
    expect(await within(dialog).findByText(/enviada automaticamente ao cliente pelo WhatsApp/, undefined, T)).toBeTruthy();
    await confirmInSafetyDialog();

    expect(await screen.findByText(/Confirmação enviada para Ana pelo WhatsApp\./, undefined, T)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Avisar Ana no WhatsApp/ })).toBeNull();
  });

  it('sem o WhatsApp automático: o modal explica, e depois de confirmar a tela oferece o link e o caminho para ativar', async () => {
    be = installAdminBackend(seed());
    be.whatsappAuto = false;
    open('/admin/agenda');
    await aceitar();
    const dialog = await screen.findByRole('dialog', { name: /Confirmar agendamento\?/ }, T);
    expect(await within(dialog).findByText(/envio automático pelo WhatsApp não está ativo/, undefined, T)).toBeTruthy();
    await confirmInSafetyDialog();

    expect(await screen.findByRole('link', { name: 'Avisar Ana no WhatsApp' }, T)).toBeTruthy();
    const ativar = screen.getByRole('link', { name: 'Ativar o envio automático' });
    expect(ativar.getAttribute('href')).toBe('/admin/settings/portal#whatsapp');
  });

  it('confirmar em massa mostra no modal se a mensagem sai sozinha', async () => {
    be = installAdminBackend([
      appt('a1', 'c1', brDate(1), '10:00', 'pending', { clientConfirmedAt: new Date(Date.now() - 600000).toISOString() }),
      appt('a2', 'c2', brDate(1), '11:00', 'pending', { clientConfirmedAt: new Date(Date.now() - 300000).toISOString() }),
    ]);
    be.whatsappAuto = true;
    open('/admin/appointments');
    fireEvent.click(await screen.findByLabelText('Selecionar todos', undefined, T));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar selecionados/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/enviada automaticamente ao cliente pelo WhatsApp/, undefined, T)).toBeTruthy();
  });
});
