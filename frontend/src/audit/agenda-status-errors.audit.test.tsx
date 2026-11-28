import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { confirmInSafetyDialog } from '@/test/confirmDialog';
import App from '../App';
import { appt, brDate, installAdminBackend, signInAsTenantAdmin, type Backend } from './fakeBackend';

/** Agenda do dono: quando o servidor recusa uma troca de status, a tela mostra o aviso (antes o clique parecia não fazer nada). */
vi.mock('../motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const T = { timeout: 25000 };
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
const seed = () => [
  appt('a1', 'c1', brDate(1), '10:00', 'pending'),
  appt('a2', 'c2', brDate(1), '11:00', 'pending'),
];

describe('Agenda: erro ao mudar o status fica visível', { timeout: 90000 }, () => {
  it('"Aceitar" com erro 500: avisa, mantém a lista e não deixa promessa rejeitada solta', async () => {
    be = installAdminBackend(seed());
    open('/admin/agenda');
    expect(await screen.findByText('2 agendamentos aguardando confirmação', undefined, T)).toBeTruthy();

    be.failNextStatusWith = 500;
    fireEvent.click((await screen.findAllByRole('button', { name: /Aceitar/ }))[0]);
    await confirmInSafetyDialog();

    const alert = await screen.findByRole('alert', undefined, T);
    expect(alert.textContent).toContain('Não foi possível atualizar o agendamento');
    expect(screen.getByText('2 agendamentos aguardando confirmação')).toBeTruthy();
  });

  it('erro 409 mostra a explicação do servidor, e a mensagem some quando a próxima ação dá certo', async () => {
    be = installAdminBackend(seed());
    open('/admin/agenda');
    await screen.findByText('2 agendamentos aguardando confirmação', undefined, T);

    be.failNextStatusWith = 409;
    fireEvent.click((await screen.findAllByRole('button', { name: /Aceitar/ }))[0]);
    await confirmInSafetyDialog();
    expect((await screen.findByRole('alert', undefined, T)).textContent).toContain('Falha simulada');

    fireEvent.click((await screen.findAllByRole('button', { name: /Aceitar/ }))[0]);
    await confirmInSafetyDialog();
    expect(await screen.findByText('1 agendamento aguardando confirmação', undefined, T)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"Recusar" com erro: avisa e o agendamento continua pendente', async () => {
    be = installAdminBackend(seed());
    open('/admin/agenda');
    const [recusar] = await screen.findAllByRole('button', { name: /Recusar/ }, T);
    fireEvent.click(recusar);
    const dialog = await screen.findByRole('dialog');

    be.failNextStatusWith = 500;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível atualizar o agendamento'), T);
    expect(screen.getByText('2 agendamentos aguardando confirmação')).toBeTruthy();
  });
});
