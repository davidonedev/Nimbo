/**
 * URLs antigas do painel do admin e para onde cada uma foi. Telas saíram do menu mas NENHUMA
 * funcionalidade foi removida: favoritos e links antigos continuam funcionando via redirecionamento.
 * Chave = caminho relativo a /admin.
 */
export const LEGACY_ADMIN_REDIRECTS: Readonly<Record<string, string>> = {
  revenue:            '/admin/reports',               // Faturamento → aba Financeiro de Relatórios
  products:           '/admin/services/products',     // Produtos → aba de Serviços
  reminders:          '/admin/settings/reminders',    // Lembretes → aba de Configurações
  'access-help':      '/admin/settings/access-help',  // Pedidos de acesso → aba de Configurações
  account:            '/admin/settings',              // Minha Conta → Configurações
  'account/portal':   '/admin/settings/portal',
  'account/schedule': '/admin/settings/schedule',
};
