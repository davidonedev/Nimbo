import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SectionLayout } from './SectionTabs';
import { SERVICES_TABS } from '@/config/sectionTabs';

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

  it('alvos de toque de ao menos 44 px', () => {
    setup('/admin/services');
    for (const a of screen.getAllByRole('link')) expect(a.className).toContain('min-h-11');
  });
});
