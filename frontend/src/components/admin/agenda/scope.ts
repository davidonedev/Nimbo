import type { Professional } from '@/types';
import type { AgendaApiScope } from '@/services/appointments.service';

/**
 * A Agenda é a mesma tela para o dono (admin) e para o profissional. O que muda é o escopo:
 * o admin enxerga todos os profissionais do tenant; o profissional só a própria agenda.
 */
export interface AgendaScope {
  role: AgendaApiScope;
  /** identifica perfil + tenant + profissional (chave do cache de períodos) */
  cacheKey: string;
  tenant: { slug: string; isOpen: boolean };
  professionals: Professional[];
  /** profissional logado: a Agenda fica travada nele (sem escolher outro profissional) */
  lockedProfessionalId?: string;
}
