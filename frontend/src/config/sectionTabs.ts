export interface SectionTab { to: string; label: string; /** Só ativa na rota exata (aba inicial). */ end?: boolean }

export const SERVICES_TABS: readonly SectionTab[] = [
  { to: '/admin/services', label: 'Serviços', end: true },
  { to: '/admin/services/products', label: 'Produtos' },
];

export const SETTINGS_TABS: readonly SectionTab[] = [
  { to: '/admin/settings', label: 'Conta', end: true },
  { to: '/admin/settings/portal', label: 'Portal do Cliente' },
  { to: '/admin/settings/schedule', label: 'Disponibilidade' },
  { to: '/admin/settings/blocks', label: 'Bloqueios' },
  { to: '/admin/settings/reminders', label: 'Lembretes' },
  { to: '/admin/settings/access-help', label: 'Pedidos de acesso' },
];

/** Configurações do super admin: conta e pedidos de acesso (que saíram do menu lateral). */
export const SUPER_SETTINGS_TABS: readonly SectionTab[] = [
  { to: '/super/account', label: 'Conta', end: true },
  { to: '/super/access-help', label: 'Pedidos de acesso' },
];

/** Hoje só há a aba Financeiro; comissões entram aqui quando existirem no sistema. */
export const REPORTS_TABS: readonly SectionTab[] = [
  { to: '/admin/reports', label: 'Financeiro', end: true },
];
