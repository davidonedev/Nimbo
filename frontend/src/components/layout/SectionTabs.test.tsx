import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setViewportWidth } from '@/test/setup';
import { SectionLayout } from './SectionTabs';
import { REPORTS_TABS, SERVICES_TABS, SETTINGS_TABS } from '@/config/sectionTabs';

const setWidth = (w: number) => {
  setViewportWidth(w);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
};

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

describe('SectionLayout (tablet e desktop)', () => {
  beforeEach(() => setWidth(1280));

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

describe('SectionLayout (celular): seletor com folha inferior', () => {
  beforeEach(() => setWidth(390));
  afterEach(() => setWidth(1280));

  const settings = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="admin/settings" element={<SectionLayout tabs={SETTINGS_TABS} label="Configurações" />}>
          <Route index element={<p>tela da conta</p>} />
          <Route path="portal" element={<p>tela do portal</p>} />
          <Route path="schedule" element={<p>tela de disponibilidade</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  it('mostra só a seção atual numa barra, sem lista de abas e sem rolagem horizontal', () => {
    settings('/admin/settings/portal');
    const picker = screen.getByRole('button', { name: /Configurações: Portal do Cliente/ });
    expect(picker.textContent).toContain('Portal do Cliente');
    expect(picker.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryAllByRole('link')).toHaveLength(0); // as outras seções ficam escondidas até tocar
    expect(document.querySelector('.overflow-x-auto')).toBeNull();
    expect(screen.getByText('tela do portal')).toBeTruthy();
  });

  it('tocar abre a folha com todas as seções, ícone e descrição, e a atual marcada', () => {
    settings('/admin/settings/portal');
    fireEvent.click(screen.getByRole('button', { name: /Trocar de seção/ }));
    const sheet = screen.getByRole('dialog', { name: 'Configurações' });
    const links = within(sheet).getAllByRole('link');
    expect(links.map(l => l.querySelector('.text-base')?.textContent)).toEqual(
      ['Conta', 'Portal do Cliente', 'Disponibilidade', 'Bloqueios', 'Lembretes', 'Pedidos de acesso'],
    );
    expect(within(sheet).getByText('Horários de atendimento e antecedência')).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: /Portal do Cliente/ }).getAttribute('aria-current')).toBe('page');
    for (const l of links) expect(l.className).toContain('min-h-14');
  });

  it('escolher uma seção navega, fecha a folha e a barra passa a mostrar a nova seção', () => {
    settings('/admin/settings/portal');
    fireEvent.click(screen.getByRole('button', { name: /Trocar de seção/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: /Disponibilidade/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('tela de disponibilidade')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Configurações: Disponibilidade/ })).toBeTruthy();
  });

  it('na rota inicial a seção atual é a Conta', () => {
    settings('/admin/settings');
    expect(screen.getByRole('button', { name: /Configurações: Conta/ })).toBeTruthy();
  });

  it('com hideOnMobile (Configurações) o celular não mostra seletor: as seções estão no "Mais"', () => {
    render(
      <MemoryRouter initialEntries={['/admin/settings']}>
        <Routes>
          <Route path="admin/settings" element={<SectionLayout tabs={SETTINGS_TABS} label="Configurações" hideOnMobile />}>
            <Route index element={<p>tela da conta</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /Trocar de seção/ })).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('tela da conta')).toBeTruthy();
  });

  it('com uma seção só (Relatórios) não há seletor', () => {
    render(
      <MemoryRouter initialEntries={['/admin/reports']}>
        <Routes>
          <Route path="admin/reports" element={<SectionLayout tabs={REPORTS_TABS} label="Relatórios" />}>
            <Route index element={<p>financeiro</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /Trocar de seção/ })).toBeNull();
    expect(screen.getByText('financeiro')).toBeTruthy();
  });
});
