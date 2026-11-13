import { useMemo } from 'react';
import { useTenant } from '@/context/TenantContext';
import AgendaPage from './AgendaPage';
import type { AgendaScope } from './scope';

/** Agenda no painel do dono: todos os profissionais. */
export default function AdminAgenda() {
  const { tenant, professionals } = useTenant();
  const scope = useMemo<AgendaScope>(() => ({
    role: 'admin',
    cacheKey: `admin:${tenant.id}`,
    tenant: { slug: tenant.slug, isOpen: tenant.isOpen },
    professionals,
  }), [tenant.id, tenant.slug, tenant.isOpen, professionals]);
  return <AgendaPage scope={scope} />;
}
