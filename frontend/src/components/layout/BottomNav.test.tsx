import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Calendar, LayoutDashboard, Users } from 'lucide-react';
import { BottomNav } from './BottomNav';

const items = [
  { to: '/admin/dashboard', label: 'Painel', icon: LayoutDashboard },
  { to: '/admin/agenda', label: 'Agenda', icon: Calendar },
  { to: '/admin/clients', label: 'Clientes', icon: Users },
];

const setup = (path = '/admin/agenda', onMore = vi.fn(), moreOpen = false) => {
  render(<MemoryRouter initialEntries={[path]}><BottomNav items={items} accentColor="#ff0000" onMore={onMore} moreOpen={moreOpen} /></MemoryRouter>);
  return onMore;
};

describe('BottomNav', () => {
  it('mostra os itens e o "Mais" dentro de uma navegação nomeada', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav.className).toContain('md:hidden'); // some no desktop
    expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual(['Painel', 'Agenda', 'Clientes']);
    expect(screen.getByRole('button', { name: 'Mais' })).toBeTruthy();
  });

  it('marca a página atual (aria-current) e só ela', () => {
    setup('/admin/clients');
    expect(screen.getByRole('link', { name: 'Clientes' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Agenda' }).getAttribute('aria-current')).toBeNull();
  });

  it('"Mais" chama o menu completo e informa se está aberto', () => {
    const onMore = setup('/admin/agenda', vi.fn(), true);
    const more = screen.getByRole('button', { name: 'Mais' });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(more);
    expect(onMore).toHaveBeenCalledOnce();
  });

  it('alvos de toque com no mínimo 44 px de altura', () => {
    setup();
    for (const el of [...screen.getAllByRole('link'), screen.getByRole('button', { name: 'Mais' })]) {
      expect(el.className).toContain('min-h-[56px]');
    }
  });
});
