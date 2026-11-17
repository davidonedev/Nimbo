import { describe, expect, it } from 'vitest';
import { bottomBarItems, canEnterArea, HOME_PATH, isNavItemActive, moreItems, navItemsFor, NAV_ITEMS } from './navigation';

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

describe('menu do super admin (super_admin)', () => {
  it('lista Painel, Empresas, Planos e Relatórios, nesta ordem', () => {
    expect(labels(navItemsFor('super_admin', 'main'))).toEqual(['Painel', 'Empresas', 'Planos', 'Relatórios']);
    expect(navItemsFor('super_admin', 'main').map(i => i.to)).toEqual([
      '/super/dashboard', '/super/tenants', '/super/plans', '/super/metrics',
    ]);
  });

  it('o rodapé tem só Configurações', () => {
    expect(labels(navItemsFor('super_admin', 'footer'))).toEqual(['Configurações']);
  });

  it('não tem Usuário nem Sair; Pedidos de acesso não é item, mas segue alcançável por Configurações', () => {
    const items = navItemsFor('super_admin');
    expect(labels(items).join('|').toLowerCase()).not.toMatch(/sair|usuário|usuario|logout|pedidos/);
    const cfg = items.find(i => i.label === 'Configurações')!;
    expect(isNavItemActive(cfg, '/super/access-help')).toBe(true);
    expect(isNavItemActive(cfg, '/super/account')).toBe(true);
  });

  it('Empresas fica ativa também no detalhe de uma empresa', () => {
    const emp = navItemsFor('super_admin').find(i => i.label === 'Empresas')!;
    expect(isNavItemActive(emp, '/super/tenants/abc')).toBe(true);
  });

  it('super_admin e tenant_admin não se misturam', () => {
    const sup = navItemsFor('super_admin').map(i => i.id);
    const adm = navItemsFor('tenant_admin').map(i => i.id);
    expect(sup.filter(id => adm.includes(id))).toEqual([]);
    expect(navItemsFor('super_admin').every(i => i.to.startsWith('/super/'))).toBe(true);
    expect(navItemsFor('tenant_admin').every(i => i.to.startsWith('/admin/'))).toBe(true);
  });

  it('celular: 4 itens na barra e Configurações no "Mais"', () => {
    expect(labels(bottomBarItems('super_admin'))).toEqual(['Painel', 'Empresas', 'Planos', 'Relatórios']);
    expect(labels(moreItems('super_admin'))).toEqual(['Configurações']);
  });

  it('canEnterArea: super_admin só entra em /super', () => {
    expect(canEnterArea('super_admin', 'super')).toBe(true);
    expect(canEnterArea('tenant_admin', 'super')).toBe(false);
    expect(canEnterArea('professional', 'super')).toBe(false);
  });
});

describe('menu do profissional', () => {
  it('tem exatamente Painel, Agenda e Clientes, nesta ordem', () => {
    expect(labels(navItemsFor('professional'))).toEqual(['Painel', 'Agenda', 'Clientes']);
    expect(navItemsFor('professional').map(i => i.to)).toEqual(['/professional/dashboard', '/professional/agenda', '/professional/clients']);
  });

  it('não tem rodapé, nem Sair/Usuário, e tudo cabe na barra do celular (sem "Mais")', () => {
    expect(navItemsFor('professional', 'footer')).toEqual([]);
    expect(labels(navItemsFor('professional')).join('|').toLowerCase()).not.toMatch(/sair|usuário|usuario|logout/);
    expect(labels(bottomBarItems('professional'))).toEqual(['Painel', 'Agenda', 'Clientes']);
    expect(moreItems('professional')).toEqual([]);
  });

  it('não recebe nenhum item do admin (nem Relatórios, Configurações ou Profissionais) e vice-versa', () => {
    const prof = navItemsFor('professional');
    expect(prof.every(i => i.to.startsWith('/professional/'))).toBe(true);
    for (const banned of ['Relatórios', 'Configurações', 'Profissionais', 'Agendamentos', 'Serviços']) {
      expect(labels(prof)).not.toContain(banned);
    }
    expect(navItemsFor('tenant_admin').some(i => i.to.startsWith('/professional/'))).toBe(false);
    expect(navItemsFor('super_admin').some(i => i.to.startsWith('/professional/'))).toBe(false);
  });

  it('a home do profissional é o Painel e só ele entra na própria área', () => {
    expect(HOME_PATH.professional).toBe('/professional/dashboard');
    expect(canEnterArea('professional', 'professional')).toBe(true);
    expect(canEnterArea('tenant_admin', 'professional')).toBe(false);
    expect(canEnterArea('super_admin', 'professional')).toBe(false);
    expect(canEnterArea(undefined, 'professional')).toBe(false);
  });

  it('a Agenda fica ativa também na Nova Agenda (beta)', () => {
    const agenda = navItemsFor('professional').find(i => i.label === 'Agenda')!;
    expect(isNavItemActive(agenda, '/professional/agenda-beta')).toBe(true);
    expect(isNavItemActive(agenda, '/professional/clients')).toBe(false);
  });
});
