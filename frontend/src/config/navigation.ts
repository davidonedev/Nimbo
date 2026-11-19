import {
  BarChart3, Building2, Calendar, ClipboardList, CreditCard, LayoutDashboard, Scissors, Settings, UserCog, Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types';

/**
 * Configuração central da navegação. Sidebar, BottomNav e guards de rota leem DAQUI:
 * um item novo (ou um papel novo) se declara uma vez, e os três lugares concordam.
 *
 * Esconder um item do menu NÃO protege a rota: a proteção real é do guard (`AREAS`) no front
 * e do papel exigido em cada endpoint no back.
 */

export type NavPlacement = 'main' | 'footer';

export interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  /** Papéis que enxergam o item. */
  roles: readonly Role[];
  /** `main`: lista principal da sidebar. `footer`: rodapé, separado dos demais. */
  placement: NavPlacement;
  /** Celular: `bar` na barra inferior; `more` dentro do "Mais". */
  mobile: 'bar' | 'more';
  /** Prefixos extras (telas filhas e URLs antigas) que também deixam o item ativo. */
  activeFor?: readonly string[];
}

const ADMIN: readonly Role[] = ['tenant_admin'];
const SUPER: readonly Role[] = ['super_admin'];
const PROF: readonly Role[] = ['professional'];

export const NAV_ITEMS: readonly NavItem[] = [
  // ── Dono da empresa (tenant_admin) ──────────────────────────────────────────
  { id: 'admin-painel',        to: '/admin/dashboard',     label: 'Painel',        icon: LayoutDashboard, roles: ADMIN, placement: 'main',   mobile: 'bar' },
  { id: 'admin-agenda',        to: '/admin/agenda',        label: 'Agenda',        icon: Calendar,        roles: ADMIN, placement: 'main',   mobile: 'bar', activeFor: ['/admin/agenda-beta'] },
  { id: 'admin-agendamentos',  to: '/admin/appointments',  label: 'Agendamentos',  icon: ClipboardList,   roles: ADMIN, placement: 'main',   mobile: 'bar' },
  { id: 'admin-clientes',      to: '/admin/clients',       label: 'Clientes',      icon: Users,           roles: ADMIN, placement: 'main',   mobile: 'bar' },
  { id: 'admin-servicos',      to: '/admin/services',      label: 'Serviços',      icon: Scissors,        roles: ADMIN, placement: 'main',   mobile: 'more' },
  { id: 'admin-profissionais', to: '/admin/professionals', label: 'Profissionais', icon: UserCog,         roles: ADMIN, placement: 'main',   mobile: 'more' },
  { id: 'admin-relatorios',    to: '/admin/reports',       label: 'Relatórios',    icon: BarChart3,       roles: ADMIN, placement: 'main',   mobile: 'more' },
  { id: 'admin-configuracoes', to: '/admin/settings',      label: 'Configurações', icon: Settings,        roles: ADMIN, placement: 'footer', mobile: 'more', activeFor: ['/admin/account'] },

  // ── Super admin (dono da plataforma) ────────────────────────────────────────
  // Usuário e Sair ficam só no menu do avatar do navbar. "Pedidos de acesso" é uma aba dentro de Configurações.
  { id: 'super-painel',        to: '/super/dashboard', label: 'Painel',        icon: LayoutDashboard, roles: SUPER, placement: 'main',   mobile: 'bar' },
  { id: 'super-empresas',      to: '/super/tenants',   label: 'Empresas',      icon: Building2,       roles: SUPER, placement: 'main',   mobile: 'bar' },
  { id: 'super-planos',        to: '/super/plans',     label: 'Planos',        icon: CreditCard,      roles: SUPER, placement: 'main',   mobile: 'bar' },
  { id: 'super-relatorios',    to: '/super/metrics',   label: 'Relatórios',    icon: BarChart3,       roles: SUPER, placement: 'main',   mobile: 'bar' },
  { id: 'super-configuracoes', to: '/super/account',   label: 'Configurações', icon: Settings,        roles: SUPER, placement: 'footer', mobile: 'more', activeFor: ['/super/access-help'] },
  // O profissional entra na config na etapa 5.
  // ── Profissional: só o que é dele (Painel resumido, Agenda e Clientes dele) ──
  { id: 'prof-painel',   to: '/professional/dashboard', label: 'Painel',   icon: LayoutDashboard, roles: PROF, placement: 'main', mobile: 'bar' },
  { id: 'prof-agenda',   to: '/professional/agenda',    label: 'Agenda',   icon: Calendar,        roles: PROF, placement: 'main', mobile: 'bar', activeFor: ['/professional/agenda-beta'] },
  { id: 'prof-clientes', to: '/professional/clients',   label: 'Clientes', icon: Users,           roles: PROF, placement: 'main', mobile: 'bar' },
  // Super admin entra na config na etapa 7.
];

/** Cada área do app, o prefixo de rota e quem pode entrar. Os guards do App usam isto. */
export const AREAS = {
  admin:        { prefix: '/admin',        roles: ['tenant_admin'] },
  professional: { prefix: '/professional', roles: ['professional'] },
  super:        { prefix: '/super',        roles: ['super_admin'] },
} as const satisfies Record<string, { prefix: string; roles: readonly Role[] }>;

export type AreaName = keyof typeof AREAS;

export const canEnterArea = (role: Role | undefined, area: AreaName): boolean =>
  !!role && (AREAS[area].roles as readonly Role[]).includes(role);

/** Tela inicial de cada papel (depois do login). */
export const HOME_PATH: Record<Role, string> = {
  super_admin:  '/super/dashboard',
  tenant_admin: '/admin/dashboard',
  professional: '/professional/dashboard',
};

/** Itens visíveis para o papel, na ordem declarada. */
export const navItemsFor = (role: Role | undefined, placement?: NavPlacement): NavItem[] =>
  !role ? [] : NAV_ITEMS.filter(i => i.roles.includes(role) && (!placement || i.placement === placement));

/** Itens da barra inferior do celular. */
export const bottomBarItems = (role: Role | undefined): NavItem[] =>
  navItemsFor(role).filter(i => i.mobile === 'bar');

/** Itens do "Mais" do celular. */
export const moreItems = (role: Role | undefined): NavItem[] =>
  navItemsFor(role).filter(i => i.mobile === 'more');

/** O item está ativo nesta URL? Vale a própria rota, as telas filhas e as URLs antigas (`activeFor`). */
export const isNavItemActive = (item: Pick<NavItem, 'to' | 'activeFor'>, pathname: string): boolean =>
  [item.to, ...(item.activeFor ?? [])].some(p => pathname === p || pathname.startsWith(`${p}/`));
