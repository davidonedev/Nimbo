import { describe, expect, it } from 'vitest';
import { bottomBarItems, canEnterArea, isNavItemActive, moreItems, navItemsFor, NAV_ITEMS } from './navigation';

const labels = (items: { label: string }[]) => items.map(i => i.label);

describe('menu do admin (tenant_admin)', () => {
  it('lista exatamente os 7 itens, nesta ordem', () => {
    expect(labels(navItemsFor('tenant_admin', 'main'))).toEqual([
      'Painel', 'Agenda', 'Agendamentos', 'Clientes', 'Serviços', 'Profissionais', 'Relatórios',
    ]);
  });

  it('o rodapé tem só Configurações', () => {
    expect(labels(navItemsFor('tenant_admin', 'footer'))).toEqual(['Configurações']);
  });

  it('não tem Usuário nem Sair em nenhum lugar do menu', () => {
    const all = labels(navItemsFor('tenant_admin')).join('|').toLowerCase();
    expect(all).not.toMatch(/sair|usuário|usuario|logout/);
  });

  it('telas que saíram do menu não voltam como item', () => {
    const tos = navItemsFor('tenant_admin').map(i => i.to);
    for (const gone of ['/admin/products', '/admin/reminders', '/admin/revenue', '/admin/access-help', '/admin/account/portal', '/admin/account/schedule']) {
      expect(tos).not.toContain(gone);
    }
  });
});

describe('celular', () => {
  it('a barra inferior tem Painel, Agenda, Agendamentos e Clientes', () => {
    expect(labels(bottomBarItems('tenant_admin'))).toEqual(['Painel', 'Agenda', 'Agendamentos', 'Clientes']);
  });

  it('"Mais" tem Serviços, Profissionais, Relatórios e Configurações', () => {
    expect(labels(moreItems('tenant_admin'))).toEqual(['Serviços', 'Profissionais', 'Relatórios', 'Configurações']);
  });

  it('todo item aparece ou na barra ou no "Mais"', () => {
    const shown = [...bottomBarItems('tenant_admin'), ...moreItems('tenant_admin')];
    expect(shown.length).toBe(navItemsFor('tenant_admin').length);
  });
});

describe('papéis', () => {
  it('não mistura itens entre papéis', () => {
    for (const item of NAV_ITEMS) {
      const prefix = item.to.split('/')[1];
      const expected = { admin: 'tenant_admin', professional: 'professional', super: 'super_admin' }[prefix];
      expect(item.roles).toEqual([expected]);
    }
  });

  it('papel desconhecido não recebe item nenhum', () => {
    expect(navItemsFor(undefined)).toEqual([]);
  });

  it('cada papel só entra na própria área', () => {
    expect(canEnterArea('tenant_admin', 'admin')).toBe(true);
    expect(canEnterArea('tenant_admin', 'super')).toBe(false);
    expect(canEnterArea('professional', 'admin')).toBe(false);
    expect(canEnterArea('super_admin', 'admin')).toBe(false);
    expect(canEnterArea(undefined, 'admin')).toBe(false);
  });
});

describe('item ativo', () => {
  const cfg = navItemsFor('tenant_admin').find(i => i.label === 'Configurações')!;
  const agenda = navItemsFor('tenant_admin').find(i => i.label === 'Agenda')!;

  it('vale para a rota, as filhas e as URLs antigas', () => {
    expect(isNavItemActive(cfg, '/admin/settings')).toBe(true);
    expect(isNavItemActive(cfg, '/admin/settings/portal')).toBe(true);
    expect(isNavItemActive(cfg, '/admin/account/schedule')).toBe(true);
    expect(isNavItemActive(agenda, '/admin/agenda-beta')).toBe(true);
  });

  it('não confunde rotas de prefixo parecido', () => {
    expect(isNavItemActive(agenda, '/admin/agendamentos-x')).toBe(false);
    expect(isNavItemActive(navItemsFor('tenant_admin')[0], '/admin/dashboard-x')).toBe(false);
  });
});
