import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SectionLayout } from './SectionTabs';
import { SERVICES_TABS, SETTINGS_TABS } from '@/config/sectionTabs';

const setup = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="admin/services" element={<SectionLayout tabs={SERVICES_TABS} label="Serviços e produtos" />}>
          <Route index element={<p>tela de serviços</p>} />
          <Route path="products" element={<p>tela de produtos</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('SectionLayout', () => {
  it('mostra as abas e a tela da aba inicial', () => {
    setup('/admin/services');
    const nav = screen.getByRole('navigation', { name: 'Serviços e produtos' });
    expect(nav.textContent).toContain('Serviços');
    expect(nav.textContent).toContain('Produtos');
    expect(screen.getByText('tela de serviços')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Serviços' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Produtos' }).getAttribute('aria-current')).toBeNull();
  });

  it('a aba Produtos abre pela própria URL', () => {
    setup('/admin/services/products');
    expect(screen.getByText('tela de produtos')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Produtos' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Serviços' }).getAttribute('aria-current')).toBeNull(); // `end`: não fica ativa nas filhas
  });

  it('no celular as abas viram uma grade, sem rolagem horizontal', () => {
    render(
      <MemoryRouter initialEntries={['/admin/settings']}>
        <Routes><Route path="admin/settings" element={<SectionLayout tabs={SETTINGS_TABS} label="Configurações" />}><Route index element={<p>conta</p>} /></Route></Routes>
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Configurações' });
    expect(nav.className).not.toContain('overflow-x');
    const list = nav.querySelector('ul') as HTMLElement;
    expect(list.className).toContain('grid');
    expect(list.className).toContain('grid-cols-3'); // 6 abas em 2 linhas de 3
    expect(list.className).not.toContain('overflow-x');
    expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual(['Conta', 'Portal do Cliente', 'Disponibilidade', 'Bloqueios', 'Lembretes', 'Pedidos de acesso']);
  });

  it('com duas abas a grade tem duas colunas', () => {
    setup('/admin/services');
    expect((screen.getByRole('navigation').querySelector('ul') as HTMLElement).className).toContain('grid-cols-2');
  });

  it('alvos de toque de ao menos 44 px', () => {
    setup('/admin/services');
    for (const a of screen.getAllByRole('link')) expect(a.className).toContain('min-h-11');
  });
});
