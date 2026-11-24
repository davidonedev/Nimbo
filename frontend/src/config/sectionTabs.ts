import {
  Ban, BarChart3, Bell, CalendarClock, Globe, KeyRound, Package, Scissors, User, type LucideIcon,
} from 'lucide-react';

export interface SectionTab {
  to: string;
  label: string;
  /** Só ativa na rota exata (aba inicial). */
  end?: boolean;
  /** Ícone e frase de apoio da lista de seções que abre no celular. */
  icon?: LucideIcon;
  description?: string;
}

export const SERVICES_TABS: readonly SectionTab[] = [
  { to: '/admin/services', label: 'Serviços', end: true, icon: Scissors, description: 'O que você oferece, com preço e duração' },
  { to: '/admin/services/products', label: 'Produtos', icon: Package, description: 'Itens à venda e controle de estoque' },
];

export const SETTINGS_TABS: readonly SectionTab[] = [
  { to: '/admin/settings', label: 'Conta', end: true, icon: User, description: 'Dados do estabelecimento e do acesso' },
  { to: '/admin/settings/portal', label: 'Portal do Cliente', icon: Globe, description: 'Link, aparência e WhatsApp do agendamento' },
  { to: '/admin/settings/schedule', label: 'Disponibilidade', icon: CalendarClock, description: 'Horários de atendimento e antecedência' },
  { to: '/admin/settings/blocks', label: 'Bloqueios', icon: Ban, description: 'Folgas, feriados e horários bloqueados' },
  { to: '/admin/settings/reminders', label: 'Lembretes', icon: Bell, description: 'Mensagens automáticas antes do horário' },
  { to: '/admin/settings/access-help', label: 'Pedidos de acesso', icon: KeyRound, description: 'Clientes que pediram ajuda para entrar' },
];

/** Configurações do super admin: conta e pedidos de acesso (que saíram do menu lateral). */
export const SUPER_SETTINGS_TABS: readonly SectionTab[] = [
  { to: '/super/account', label: 'Conta', end: true, icon: User, description: 'Seus dados de acesso' },
  { to: '/super/access-help', label: 'Pedidos de acesso', icon: KeyRound, description: 'Pedidos de ajuda para entrar' },
];

/** Hoje só há a aba Financeiro; comissões entram aqui quando existirem no sistema. */
export const REPORTS_TABS: readonly SectionTab[] = [
  { to: '/admin/reports', label: 'Financeiro', end: true, icon: BarChart3, description: 'Receita, atendimentos e ticket médio' },
];
