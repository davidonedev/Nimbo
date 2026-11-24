import { useCallback, useEffect, useRef, useState } from 'react';
import { useTenant } from '@/context/TenantContext';
import { useProfessional } from '@/context/ProfessionalContext';
import { buildClientNotice, firstName, formatNoticeDate, noticeEventFor, type ClientNoticeEvent } from '@/lib/clientNotice';
import { getNotificationStatusApi, type NoticeScope, type NotificationStatusItem } from '@/services/notifications.service';
import type { Appointment, AppointmentStatus, Client, Professional, Service, Tenant } from '@/types';

export interface NoticeLink {
  key: string;
  firstName: string;
  when: string;
  url: string;
}

/** Por que a mensagem automática não saiu (decide o texto e se mostramos "ativar envio automático"). */
export type NoticeReason = 'not_configured' | 'failed' | null;

export interface ClientNoticeState {
  /** Avisos ainda sendo enviados automaticamente (primeiros nomes). */
  sending: string[];
  /** Avisos que o servidor já enviou sozinho (primeiros nomes). */
  sent: string[];
  /** Reserva: links do WhatsApp para avisar à mão quem não recebeu automaticamente. */
  links: NoticeLink[];
  /** Quantos avisos passaram do limite de linhas exibido. */
  extra: number;
  event: ClientNoticeEvent | null;
  reason: NoticeReason;
}

const EMPTY: ClientNoticeState = { sending: [], sent: [], links: [], extra: 0, event: null, reason: null };
const MAX_LINKS = 5;
const AUTO_CLEAR_MS = 60_000;
const SENT_CLEAR_MS = 20_000;
const POLL_MS = 1_500;
const MAX_POLLS = 16; // ~24 s esperando o envio automático antes de oferecer o link

const EVENT_NAME: Record<ClientNoticeEvent, string> = {
  approved: 'APPROVED', refused: 'REFUSED', cancelled_by_owner: 'CANCELLED_BY_OWNER',
};

interface Source {
  scope: NoticeScope;
  tenant: Tenant | null | undefined;
  clients: Client[];
  services: Service[];
  professionals: Professional[];
}

type Resolution = { kind: 'sent' } | { kind: 'waiting' } | { kind: 'fallback'; reason: NoticeReason };

/** Uma linha da fila de WhatsApp do aviso vira "enviado", "aguardando" ou "precisa do link". */
function resolve(rows: NotificationStatusItem[] | undefined): Resolution {
  const row = rows?.find(r => r.channel === 'WHATSAPP');
  if (!row) return { kind: 'fallback', reason: null };
  if (row.status === 'SENT') return { kind: 'sent' };
  if (row.status === 'PENDING') return row.error ? { kind: 'fallback', reason: 'failed' } : { kind: 'waiting' };
  if (row.status === 'SKIPPED') return { kind: 'fallback', reason: /configurado/i.test(row.error ?? '') ? 'not_configured' : 'failed' };
  return { kind: 'fallback', reason: 'failed' };
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Depois que o dono (ou o profissional) aprova, recusa ou cancela, acompanha o aviso ao cliente: o servidor manda a
 * mensagem pelo WhatsApp sozinho e aqui mostramos "enviando" e depois "enviada". Só se ela não sair (WhatsApp não
 * configurado ou falha) oferecemos o link do WhatsApp com a mensagem pronta, como reserva.
 * `offer` recebe os agendamentos como estavam ANTES da mudança (o status anterior decide se foi recusa ou cancelamento).
 */
function useClientNoticeCore({ scope, tenant, clients, services, professionals }: Source) {
  const [notice, setNotice] = useState<ClientNoticeState>(EMPTY);
  const run = useRef(0); // identifica a rodada atual; uma nova (ou fechar) cancela o acompanhamento anterior

  const clear = useCallback(() => { run.current += 1; setNotice(EMPTY); }, []);
  useEffect(() => () => { run.current += 1; }, []);

  useEffect(() => {
    if (notice.sending.length > 0) return;
    const hasSomething = notice.links.length > 0 || notice.sent.length > 0;
    if (!hasSomething) return;
    const timer = setTimeout(clear, notice.links.length > 0 ? AUTO_CLEAR_MS : SENT_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [notice, clear]);

  const offer = useCallback((appointments: Appointment[], next: AppointmentStatus) => {
    const token = ++run.current;
    if (!tenant) return;

    const items: { appt: Appointment; event: ClientNoticeEvent; link: NoticeLink }[] = [];
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
      items.push({ appt, event, link: { key: appt.id, firstName: firstName(client.name), when: `${formatNoticeDate(appt.date).slice(0, 5)} às ${appt.startTime}`, url: built.url } });
    }
    if (items.length === 0) { setNotice(EMPTY); return; }

    const event = items[0].event;
    const eventName = EVENT_NAME[event];
    const ids = items.map(i => i.appt.id);
    const groupOf = new Map(items.map(i => [i.appt.id, `${i.appt.clientId}|${i.appt.date}|${i.appt.professionalId}`]));
    setNotice({ ...EMPTY, sending: items.map(i => i.link.firstName), event });

    const settle = (resolved: Map<string, Resolution>, finalRound: boolean) => {
      const sent: string[] = [];
      const waiting: string[] = [];
      const fallback: NoticeLink[] = [];
      let reason: NoticeReason = null;
      for (const i of items) {
        const r = resolved.get(i.appt.id) ?? { kind: 'fallback', reason: null } as Resolution;
        if (r.kind === 'sent') sent.push(i.link.firstName);
        else if (r.kind === 'waiting' && !finalRound) waiting.push(i.link.firstName);
        else {
          fallback.push(i.link);
          const why = r.kind === 'fallback' ? r.reason : 'failed';
          if (why && reason !== 'not_configured') reason = why;
        }
      }
      setNotice({
        sending: waiting, sent, event, reason,
        links: fallback.slice(0, MAX_LINKS), extra: Math.max(0, fallback.length - MAX_LINKS),
      });
      return waiting.length === 0;
    };

    void (async () => {
      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        let rows: NotificationStatusItem[];
        try {
          rows = await getNotificationStatusApi(scope, ids);
        } catch {
          if (token === run.current) settle(new Map(), true); // não deu para consultar: oferece o link
          return;
        }
        if (token !== run.current) return;
        const byGroup = new Map<string, NotificationStatusItem[]>();
        const byId = new Map<string, NotificationStatusItem[]>();
        for (const r of rows) {
          if (r.event !== eventName) continue;
          byId.set(r.appointmentId, [...(byId.get(r.appointmentId) ?? []), r]);
          const g = groupOf.get(r.appointmentId);
          if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
        }
        // O aviso de uma reserva com vários serviços fica no primeiro agendamento; os outros herdam o resultado dele.
        const resolved = new Map(items.map(i => [i.appt.id, resolve(byId.get(i.appt.id) ?? byGroup.get(groupOf.get(i.appt.id) ?? ''))]));
        if (settle(resolved, attempt === MAX_POLLS - 1)) return;
        await sleep(POLL_MS);
        if (token !== run.current) return;
      }
    })();
  }, [tenant, clients, services, professionals, scope]);

  return { notice, offer, clear };
}

/** Aviso ao cliente no painel do dono. */
export function useClientNotice() {
  const { tenant, clients, services, professionals } = useTenant();
  return useClientNoticeCore({ scope: 'admin', tenant, clients, services, professionals });
}

/** Aviso ao cliente no portal do profissional (só ele e os clientes dele). */
export function useProfClientNotice() {
  const { tenant, clients, services, professional } = useProfessional();
  return useClientNoticeCore({ scope: 'professional', tenant, clients, services, professionals: [professional] });
}
