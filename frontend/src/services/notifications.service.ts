import { api } from '../lib/api';

/** Qual portal está consultando: o profissional só enxerga os agendamentos dele. */
export type NoticeScope = 'admin' | 'professional';

export interface NotificationStatusItem {
  appointmentId: string;
  event: string;
  channel: 'EMAIL' | 'WHATSAPP';
  status: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
  /** Motivo curto quando não saiu ("WhatsApp não configurado"). */
  error: string | null;
}

/** O que aconteceu com os avisos ao cliente depois de aprovar, recusar ou cancelar. */
export function getNotificationStatusApi(scope: NoticeScope, ids: string[]): Promise<NotificationStatusItem[]> {
  const query = ids.map(id => `ids=${encodeURIComponent(id)}`).join('&');
  return api.get<NotificationStatusItem[]>(`/${scope}/notifications/status?${query}`);
}

/** O estabelecimento tem WhatsApp configurado para enviar as mensagens sozinho? */
export function getChannelsApi(scope: NoticeScope): Promise<{ whatsappAuto: boolean }> {
  return api.get<{ whatsappAuto: boolean }>(`/${scope}/notifications/channels`);
}
