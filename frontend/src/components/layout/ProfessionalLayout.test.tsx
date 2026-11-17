import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { setViewportWidth } from '@/test/setup';
import { profContext } from '@/components/professional/testFixtures';
import ProfessionalLayout from './ProfessionalLayout';

const logout = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Marina Souza', email: 'marina@studio.com', role: 'professional' }, logout }),
}));
vi.mock('@/context/ProfessionalContext', () => ({ useProfessional: () => profContext() }));

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const setup = (path = '/professional/dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="professional" element={<ProfessionalLayout />}>
          <Route path="*" element={<Where />} />
        </Route>
        <Route path="login" element={<p>tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProfessionalLayout', () => {
  beforeEach(() => { setViewportWidth(1280); logout.mockClear(); });

  it('a sidebar tem exatamente Painel, Agenda e Clientes, sem rodapé', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual(['Painel', 'Agenda', 'Clientes']);
    expect(screen.queryByRole('navigation', { name: 'Menu de configurações' })).toBeNull();
  });

  it('não mostra Relatórios, Configurações, Profissionais nem itens do admin', () => {
    setup();
    for (const name of ['Relatórios', 'Configurações', 'Profissionais', 'Agendamentos', 'Serviços', 'Meu Faturamento', 'Disponibilidade']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
  });

  it('Usuário e Sair não estão na sidebar; ficam só no avatar do navbar', () => {
    setup();
    const aside = document.querySelector('aside') as HTMLElement;
    expect(within(aside).queryByText(/sair/i)).toBeNull();
    expect(within(aside).queryByText('Marina Souza')).toBeNull();
    expect(within(aside).queryByText(/@/)).toBeNull();
    const header = screen.getByRole('banner');
    const trigger = within(header).getByRole('button', { name: 'Menu do usuário' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeTruthy();
    expect(screen.getByText('marina@studio.com')).toBeTruthy();
  });

  it('"Meu horário" do avatar leva a Disponibilidade (settings) e não há "Minha Conta"', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Menu do usuário' }), { key: 'Enter' });
    expect(screen.queryByRole('menuitem', { name: /minha conta/i })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /meu horário/i }));
    expect(screen.getByTestId('where').textContent).toBe('/professional/settings');
  });

  it('Sair do avatar encerra a sessão e volta ao login', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Menu do usuário' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair' }));
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByText('tela de login')).toBeTruthy();
  });

  it('no celular, a barra inferior tem os 3 itens e não tem "Mais"', () => {
    setup('/professional/clients');
    const bar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(bar).getAllByRole('link').map(l => l.textContent)).toEqual(['Painel', 'Agenda', 'Clientes']);
    expect(within(bar).queryByRole('button', { name: 'Mais' })).toBeNull();
    expect(within(bar).getByRole('link', { name: 'Clientes' }).getAttribute('aria-current')).toBe('page');
  });
});
