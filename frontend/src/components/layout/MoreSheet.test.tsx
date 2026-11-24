import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { setViewportWidth } from '@/test/setup';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { bottomBarItems, moreItems } from '@/config/navigation';
import type { Role } from '@/types';

function Harness({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <BottomNav items={bottomBarItems(role)} accentColor="#123456" onMore={() => setOpen(true)} moreOpen={open} />
      <MoreSheet items={moreItems(role)} open={open} onOpenChange={setOpen} accentColor="#123456" />
    </>
  );
}

const setup = (role: Role = 'tenant_admin', path = '/admin/dashboard') =>
  render(<MemoryRouter initialEntries={[path]}><Harness role={role} /></MemoryRouter>);

describe('BottomNav + "Mais" (celular)', () => {
  beforeEach(() => setViewportWidth(390));

  it('a barra do admin tem Painel, Agenda, Agendamentos, Clientes e Mais', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual(['Painel', 'Agenda', 'Agendamentos', 'Clientes']);
    expect(within(nav).getByRole('button', { name: 'Mais' })).toBeTruthy();
  });

  it('"Mais" abre uma folha com Serviços, Profissionais, Relatórios e as seções de Configurações', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    const more = screen.getByRole('button', { name: 'Mais' });
    expect(more.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(more);
    const dialog = screen.getByRole('dialog', { name: 'Mais opções' });
    expect(within(dialog).getAllByRole('link').map(l => l.textContent)).toEqual([
      'Serviços', 'Profissionais', 'Relatórios',
      'Conta', 'Portal do Cliente', 'Disponibilidade', 'Bloqueios', 'Lembretes', 'Pedidos de acesso',
    ]);
    // as seções ficam agrupadas sob o título Configurações (não é mais um link único)
    expect(within(dialog).getByRole('heading', { name: 'Configurações' })).toBeTruthy();
    expect(within(dialog).queryByRole('link', { name: 'Configurações' })).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('escolher uma seção de Configurações vai direto para ela e fecha a folha', () => {
    setup('tenant_admin', '/admin/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    const link = within(screen.getByRole('dialog')).getByRole('link', { name: 'Disponibilidade' });
    expect(link.getAttribute('href')).toBe('/admin/settings/schedule');
    fireEvent.click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a seção Conta (rota inicial) só fica ativa na rota exata', () => {
    setup('tenant_admin', '/admin/settings');
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Conta' }).getAttribute('aria-current')).toBe('page');
    expect(within(dialog).getByRole('link', { name: 'Portal do Cliente' }).getAttribute('aria-current')).toBeNull();
  });

  it('os links da folha têm alvo de 44 px e escolher um fecha a folha', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    const dialog = screen.getByRole('dialog');
    for (const l of within(dialog).getAllByRole('link')) expect(l.className).toContain('min-h-11');
    fireEvent.click(within(dialog).getByRole('link', { name: 'Serviços' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a folha marca a tela atual e nunca lista itens da barra', () => {
    setup('tenant_admin', '/admin/settings/portal');
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Portal do Cliente' }).getAttribute('aria-current')).toBe('page');
    expect(within(dialog).getByRole('link', { name: 'Conta' }).getAttribute('aria-current')).toBeNull();
    expect(within(dialog).queryByRole('link', { name: 'Painel' })).toBeNull();
    expect(within(dialog).queryByRole('link', { name: 'Clientes' })).toBeNull();
  });

  it('super admin: barra com 4 itens e "Mais" só com as seções de Configurações', () => {
    setup('super_admin', '/super/dashboard');
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual(['Painel', 'Empresas', 'Planos', 'Relatórios']);
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    expect(within(screen.getByRole('dialog')).getAllByRole('link').map(l => l.textContent)).toEqual(['Conta', 'Pedidos de acesso']);
  });
});
