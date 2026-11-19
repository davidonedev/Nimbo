import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setViewportWidth } from '@/test/setup';
import SuperLayout from './SuperLayout';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', name: 'Dona Plataforma', email: 'dona@nimbo.com', role: 'super_admin' }, logout: vi.fn() }),
}));

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/super/dashboard']}>
      <Routes>
        <Route path="super" element={<SuperLayout />}>
          <Route path="dashboard" element={<p>conteúdo</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('SuperLayout', () => {
  beforeEach(() => setViewportWidth(1280));

  it('a sidebar tem os itens do super admin e Configurações no rodapé', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual(['Painel', 'Empresas', 'Planos', 'Relatórios']);
    const footer = screen.getByRole('navigation', { name: 'Menu de configurações' });
    expect(within(footer).getAllByRole('link').map(l => l.textContent)).toEqual(['Configurações']);
  });

  it('Usuário e Sair não estão na sidebar; o usuário fica no menu do navbar', () => {
    setup();
    const aside = document.querySelector('aside') as HTMLElement;
    expect(within(aside).queryByText(/sair/i)).toBeNull();
    expect(within(aside).queryByText('Dona Plataforma')).toBeNull();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('button', { name: 'Menu do usuário' })).toBeTruthy();
  });

  it('não mostra itens do menu do admin', () => {
    setup();
    expect(screen.queryByRole('link', { name: 'Agendamentos' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull();
    expect(screen.getByText('conteúdo')).toBeTruthy();
  });
});
