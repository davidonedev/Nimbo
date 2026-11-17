import { useMemo } from 'react';
import { useProfessional } from '@/context/ProfessionalContext';
import AgendaPage from './AgendaPage';
import type { AgendaScope } from './scope';

/** Agenda no portal do profissional: só a própria agenda. */
export default function ProfessionalAgenda() {
  const { professional, tenant } = useProfessional();
  const scope = useMemo<AgendaScope>(() => ({
    role: 'professional',
    cacheKey: `professional:${tenant.id}:${professional.id}`,
    tenant: { slug: tenant.slug, isOpen: tenant.isOpen },
    professionals: [professional],
    lockedProfessionalId: professional.id,
  }), [tenant.id, tenant.slug, tenant.isOpen, professional]);
  return <AgendaPage scope={scope} />;
}
