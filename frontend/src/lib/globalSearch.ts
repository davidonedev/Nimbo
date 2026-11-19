import { digitsOf, normalizeText } from '@/lib/text';
import { SETTINGS_TABS, SERVICES_TABS } from '@/config/sectionTabs';
import type { NavItem } from '@/config/navigation';
import type { Appointment, AppointmentStatus, Client, Professional, Service } from '@/types';

export type SearchKind = 'page' | 'client' | 'appointment' | 'service' | 'professional';

export interface SearchResult {
  /** Único dentro da lista (usado como id do <option>). */
  key: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  /** Rota de destino, já com `?q=` quando a tela de destino filtra por busca. */
  to: string;
}

export const KIND_LABEL: Record<SearchKind, string> = {
  page: 'Páginas', client: 'Clientes', appointment: 'Agendamentos', service: 'Serviços', professional: 'Profissionais',
};

/** Ordem em que os grupos aparecem. */
export const KIND_ORDER: readonly SearchKind[] = ['page', 'client', 'appointment', 'service', 'professional'];

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Agendado', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', no_show: 'Não compareceu',
};

export interface SearchData {
  clients: readonly Client[];
  appointments: readonly Appointment[];
  services: readonly Service[];
  professionals: readonly Professional[];
  /** Itens do menu do papel atual. */
  navItems: readonly Pick<NavItem, 'id' | 'to' | 'label'>[];
}

export const MIN_QUERY_LENGTH = 2;
const PER_GROUP = 5;

const withQuery = (path: string, q: string) => `${path}?q=${encodeURIComponent(q)}`;
const has = (haystack: string | null | undefined, q: string) => normalizeText(haystack ?? '').includes(q);

/** Páginas que não são itens do menu mas existem como aba (Produtos, Bloqueios, Lembretes…). */
const tabPages = () => [
  ...SERVICES_TABS.slice(1).map(t => ({ id: `tab-${t.to}`, to: t.to, label: `Serviços · ${t.label}` })),
  ...SETTINGS_TABS.slice(1).map(t => ({ id: `tab-${t.to}`, to: t.to, label: `Configurações · ${t.label}` })),
];

/**
 * Busca global do painel, em memória (os dados já estão carregados no contexto). Ignora acento e caixa;
 * telefone compara só os dígitos. Devolve até 5 por grupo, na ordem de `KIND_ORDER`.
 */
export function searchAdmin(data: SearchData, query: string): SearchResult[] {
  const q = normalizeText(query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const qDigits = digitsOf(query);

  const clientMatch = (c: Pick<Client, 'name' | 'email' | 'phone'>) =>
    has(c.name, q) || has(c.email, q) || (qDigits.length >= 3 && digitsOf(c.phone ?? '').includes(qDigits));

  const pages: SearchResult[] = [...data.navItems, ...tabPages()]
    .filter(p => has(p.label, q))
    .slice(0, PER_GROUP)
    .map(p => ({ key: `page:${p.id}`, kind: 'page', title: p.label, to: p.to }));

  const clients: SearchResult[] = data.clients
    .filter(clientMatch)
    .slice(0, PER_GROUP)
    .map(c => ({
      key: `client:${c.id}`, kind: 'client', title: c.name,
      subtitle: [c.email, c.phone].filter(Boolean).join(' · '),
      to: withQuery('/admin/clients', c.name),
    }));

  const clientById = new Map(data.clients.map(c => [c.id, c]));
  const serviceById = new Map(data.services.map(s => [s.id, s]));
  const profById = new Map(data.professionals.map(p => [p.id, p]));

  const appointments: SearchResult[] = data.appointments
    .filter(a => {
      const c = clientById.get(a.clientId);
      return (c && clientMatch(c)) || has(serviceById.get(a.serviceId)?.name, q) || has(profById.get(a.professionalId)?.name, q);
    })
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime)) // mais recentes primeiro
    .slice(0, PER_GROUP)
    .map(a => {
      const c = clientById.get(a.clientId);
      const day = a.date.split('-').reverse().join('/');
      return {
        key: `appointment:${a.id}`, kind: 'appointment' as const,
        title: c?.name ?? 'Cliente removido',
        subtitle: `${day} ${a.startTime} · ${serviceById.get(a.serviceId)?.name ?? 'Serviço'} · ${profById.get(a.professionalId)?.name ?? 'Profissional'} · ${STATUS_LABEL[a.status]}`,
        to: c ? withQuery('/admin/appointments', c.name) : '/admin/appointments',
      };
    });

  const services: SearchResult[] = data.services
    .filter(s => has(s.name, q) || has(s.category, q))
    .slice(0, PER_GROUP)
    .map(s => ({ key: `service:${s.id}`, kind: 'service', title: s.name, subtitle: s.category || undefined, to: '/admin/services' }));

  const professionals: SearchResult[] = data.professionals
    .filter(p => has(p.name, q) || has(p.specialty, q))
    .slice(0, PER_GROUP)
    .map(p => ({ key: `professional:${p.id}`, kind: 'professional', title: p.name, subtitle: p.specialty || undefined, to: '/admin/professionals' }));

  const byKind: Record<SearchKind, SearchResult[]> = { page: pages, client: clients, appointment: appointments, service: services, professional: professionals };
  return KIND_ORDER.flatMap(k => byKind[k]);
}
