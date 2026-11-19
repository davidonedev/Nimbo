import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { LEGACY_ADMIN_REDIRECTS } from './legacyRoutes';
import { NAV_ITEMS } from './navigation';
import { REPORTS_TABS, SERVICES_TABS, SETTINGS_TABS } from './sectionTabs';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

/** Mesma montagem do App: cada URL antiga vira um <Navigate> para o destino novo. */
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="admin">
          {Object.entries(LEGACY_ADMIN_REDIRECTS).map(([from, to]) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
          <Route path="*" element={<Where />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('redirecionamento das rotas antigas do admin', () => {
  it.each([
    ['/admin/revenue', '/admin/reports'],
    ['/admin/products', '/admin/services/products'],
    ['/admin/reminders', '/admin/settings/reminders'],
    ['/admin/access-help', '/admin/settings/access-help'],
    ['/admin/account', '/admin/settings'],
    ['/admin/account/portal', '/admin/settings/portal'],
    ['/admin/account/schedule', '/admin/settings/schedule'],
  ])('%s leva para %s', (from, to) => {
    renderAt(from);
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('todo destino é um item do menu ou uma aba (nenhuma tela fica inalcançável)', () => {
    const reachable = new Set<string>([
      ...NAV_ITEMS.map(i => i.to),
      ...SERVICES_TABS.map(t => t.to), ...SETTINGS_TABS.map(t => t.to), ...REPORTS_TABS.map(t => t.to),
    ]);
    for (const to of Object.values(LEGACY_ADMIN_REDIRECTS)) expect(reachable.has(to)).toBe(true);
  });

  it('nenhum destino aponta para outra URL antiga (sem cadeia de redirecionamentos)', () => {
    const olds = Object.keys(LEGACY_ADMIN_REDIRECTS).map(k => `/admin/${k}`);
    for (const to of Object.values(LEGACY_ADMIN_REDIRECTS)) expect(olds).not.toContain(to);
  });
});

describe('abas das seções', () => {
  it('Serviços tem Produtos; Configurações tem Bloqueios, Lembretes e Pedidos de acesso', () => {
    expect(SERVICES_TABS.map(t => t.label)).toEqual(['Serviços', 'Produtos']);
    expect(SETTINGS_TABS.map(t => t.label)).toEqual(['Conta', 'Portal do Cliente', 'Disponibilidade', 'Bloqueios', 'Lembretes', 'Pedidos de acesso']);
    expect(REPORTS_TABS.map(t => t.label)).toEqual(['Financeiro']);
  });
});
