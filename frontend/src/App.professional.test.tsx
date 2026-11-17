import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { profContext } from '@/components/professional/testFixtures';
import { setViewportWidth } from '@/test/setup';
import App from './App';

vi.mock('./context/ProfessionalContext', () => ({
  ProfessionalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useProfessional: () => profContext(),
}));
vi.mock('./pwa/PwaHost', () => ({ PwaHost: () => null }));
vi.mock('./motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));
vi.mock('./pages/LoginPage', () => ({ default: () => <p>tela de login</p> }));
vi.mock('./components/professional/ProfAgendaView', () => ({ default: () => <p>tela da agenda</p> }));
vi.mock('./components/professional/ProfServicesView', () => ({ default: () => <p>tela de serviços antiga</p> }));
vi.mock('./components/professional/ProfRevenueView', () => ({ default: () => <p>tela de faturamento antiga</p> }));
vi.mock('./components/professional/ProfSettingsView', () => ({ default: () => <p>tela de disponibilidade</p> }));

const signIn = (role: string) =>
  sessionStorage.setItem('agendepro_session', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Marina Souza', email: 'm@x.com', role } }));
const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };

describe('rotas do portal do profissional', { timeout: 15000 }, () => {
  beforeEach(() => { sessionStorage.clear(); setViewportWidth(1280); });

  it('/professional abre o Painel', async () => {
    signIn('professional');
    open('/professional');
    expect(await screen.findByRole('heading', { name: 'Olá, Marina' }, { timeout: 8000 })).toBeTruthy();
    expect(window.location.pathname).toBe('/professional/dashboard');
  });

  it('Agenda e Clientes abrem dentro do portal', async () => {
    signIn('professional');
    open('/professional/clients');
    expect(await screen.findByRole('heading', { name: 'Clientes' }, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByText('Carla Colega')).toBeNull();
  });

  it('a Agenda abre dentro do portal', async () => {
    signIn('professional');
    open('/professional/agenda');
    expect(await screen.findByText('tela da agenda')).toBeTruthy();
  });

  it('as telas antigas saíram do menu mas seguem alcançáveis por URL', async () => {
    signIn('professional');
    open('/professional/settings');
    expect(await screen.findByText('tela de disponibilidade')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /disponibilidade|serviços|faturamento/i })).toBeNull();
  });

  it('quem não é profissional não entra (guard por canEnterArea)', async () => {
    signIn('tenant_admin');
    open('/professional/dashboard');
    expect(await screen.findByText('tela de login')).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('sem sessão vai para o login', async () => {
    open('/professional/clients');
    expect(await screen.findByText('tela de login')).toBeTruthy();
  });
});
