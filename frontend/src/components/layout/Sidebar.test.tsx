import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { navItemsFor } from '@/config/navigation';

const setup = (path = '/admin/appointments', collapsed = false) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar
        items={navItemsFor('tenant_admin', 'main')} footerItems={navItemsFor('tenant_admin', 'footer')}
        accentColor="#123456" collapsed={collapsed} onToggleCollapsed={() => {}} open onClose={() => {}}
        homeTo="/admin/dashboard" homeLabel="Nimbo — ir para o Painel"
      />
    </MemoryRouter>,
  );

describe('Sidebar do admin', () => {
  it('a lista principal tem os 7 itens, na ordem', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual([
      'Painel', 'Agenda', 'Agendamentos', 'Clientes', 'Serviços', 'Profissionais', 'Relatórios',
    ]);
  });

  it('o rodapé, separado, tem só Configurações', () => {
    setup();
    const footer = screen.getByRole('navigation', { name: 'Menu de configurações' });
    expect(within(footer).getAllByRole('link').map(l => l.textContent)).toEqual(['Configurações']);
  });

  it('não tem Usuário nem Sair na sidebar', () => {
    setup();
    expect(screen.queryByRole('button', { name: /sair/i })).toBeNull();
    expect(screen.queryByText(/^sair$/i)).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull(); // nenhum e-mail do usuário
  });

  it('destaca só o item da página atual', () => {
    setup('/admin/appointments');
    const current = screen.getAllByRole('link').filter(l => l.getAttribute('aria-current') === 'page');
    expect(current.map(l => l.textContent)).toEqual(['Agendamentos']);
  });

  it('Configurações fica ativa também nas URLs antigas de Minha Conta', () => {
    setup('/admin/account/portal');
    expect(screen.getByRole('link', { name: 'Configurações' }).getAttribute('aria-current')).toBe('page');
  });

  it('recolhida, cada ícone tem aria-label e tooltip no foco', () => {
    setup('/admin/dashboard', true);
    const link = screen.getByRole('link', { name: 'Clientes' });
    expect(link.getAttribute('aria-label')).toBe('Clientes');
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    fireEvent.focus(link);
    expect(screen.getByRole('tooltip').textContent).toBe('Clientes');
    fireEvent.blur(link);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Sidebar do super admin', () => {
  const setupSuper = (path = '/super/dashboard') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Sidebar
          items={navItemsFor('super_admin', 'main')} footerItems={navItemsFor('super_admin', 'footer')}
          accentColor="#1e1b4b" collapsed={false} onToggleCollapsed={() => {}}
          homeTo="/super/dashboard" homeLabel="Nimbo — ir para o Painel"
        />
      </MemoryRouter>,
    );

  it('principal com 4 itens e rodapé só com Configurações', () => {
    setupSuper();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual(['Painel', 'Empresas', 'Planos', 'Relatórios']);
    const footer = screen.getByRole('navigation', { name: 'Menu de configurações' });
    expect(within(footer).getAllByRole('link').map(l => l.textContent)).toEqual(['Configurações']);
  });

  it('não tem Usuário nem Sair, nem itens do admin', () => {
    setupSuper();
    expect(screen.queryByRole('button', { name: /sair/i })).toBeNull();
    expect(screen.queryByText(/^sair$/i)).toBeNull();
    expect(screen.queryByText('Agendamentos')).toBeNull();
    expect(screen.queryByText('Clientes')).toBeNull();
  });

  it('Configurações fica ativa em Pedidos de acesso', () => {
    setupSuper('/super/access-help');
    expect(screen.getByRole('link', { name: 'Configurações' }).getAttribute('aria-current')).toBe('page');
  });
});
