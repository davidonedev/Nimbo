import { useCallback, useEffect, useState } from 'react';
import { useTenant } from '@/context/TenantContext';
import { buildClientNotice, firstName, formatNoticeDate, noticeEventFor } from '@/lib/clientNotice';
import type { Appointment, AppointmentStatus } from '@/types';

export interface NoticeLink {
  key: string;
  firstName: string;
  when: string;
  url: string;
}

export interface ClientNoticeState {
  links: NoticeLink[];
  /** Quantos avisos passaram do limite de linhas exibido. */
  extra: number;
}

const EMPTY: ClientNoticeState = { links: [], extra: 0 };
const MAX_LINKS = 5;
const AUTO_CLEAR_MS = 60_000;

/**
 * Depois que o dono aprova, recusa ou cancela, guarda os links do WhatsApp para avisar cada cliente com a mensagem pronta.
 * `offer` recebe os agendamentos como estavam ANTES da mudança (o status anterior decide se foi recusa ou cancelamento).
 */
export function useClientNotice() {
  const { tenant, clients, services, professionals } = useTenant();
  const [notice, setNotice] = useState<ClientNoticeState>(EMPTY);

  const clear = useCallback(() => setNotice(EMPTY), []);

  useEffect(() => {
    if (notice.links.length === 0) return;
    const timer = setTimeout(clear, AUTO_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [notice, clear]);

  const offer = useCallback((appointments: Appointment[], next: AppointmentStatus) => {
    if (!tenant) return;
    const all: NoticeLink[] = [];
    for (const appt of appointments) {
      const event = noticeEventFor(appt.status, next);
      const client = clients.find(c => c.id === appt.clientId);
      if (!event || !client) continue;
      const built = buildClientNotice(event, {
        clientName: client.name,
        clientPhone: client.phone,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        tenantAddress: tenant.address,
        serviceName: services.find(s => s.id === appt.serviceId)?.name ?? 'Atendimento',
        professionalName: professionals.find(p => p.id === appt.professionalId)?.name ?? '',
        date: appt.date,
        startTime: appt.startTime,
        siteUrl: window.location.origin,
      });
      if (!built) continue;
      all.push({ key: appt.id, firstName: firstName(client.name), when: `${formatNoticeDate(appt.date).slice(0, 5)} às ${appt.startTime}`, url: built.url });
    }
    setNotice(all.length === 0 ? EMPTY : { links: all.slice(0, MAX_LINKS), extra: Math.max(0, all.length - MAX_LINKS) });
  }, [tenant, clients, services, professionals]);

  return { notice, offer, clear };
}
