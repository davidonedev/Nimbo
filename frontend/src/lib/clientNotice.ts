import type { AppointmentStatus } from '@/types';

export type ClientNoticeEvent = 'approved' | 'refused' | 'cancelled_by_owner';

export interface ClientNoticeContext {
  clientName: string;
  clientPhone: string | null | undefined;
  tenantName: string;
  tenantSlug: string;
  tenantAddress?: string | null;
  serviceName: string;
  professionalName: string;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm */
  startTime: string;
  siteUrl: string;
}

export interface ClientNotice {
  text: string;
  url: string;
}

/** wa.me exige só dígitos com DDI: 10-11 dígitos ganham o 55; 12-13 começando em 55 ficam como estão. */
export function normalizeWaNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export function formatNoticeDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** Que aviso o cliente merece quando o dono muda o status; concluir e falta não avisam. */
export function noticeEventFor(previous: AppointmentStatus, next: AppointmentStatus): ClientNoticeEvent | null {
  if (next === 'confirmed' && previous === 'pending') return 'approved';
  if (next === 'cancelled') {
    if (previous === 'pending') return 'refused';
    if (previous === 'confirmed') return 'cancelled_by_owner';
  }
  return null;
}

/** Texto e link do WhatsApp para avisar o cliente (mesmas mensagens que o servidor envia quando há canal automático). */
export function buildClientNotice(event: ClientNoticeEvent, ctx: ClientNoticeContext): ClientNotice | null {
  const number = normalizeWaNumber(ctx.clientPhone);
  if (!number) return null;

  const name = firstName(ctx.clientName);
  const when = `${formatNoticeDate(ctx.date)} às ${ctx.startTime}`;
  const address = ctx.tenantAddress?.trim();
  const portal = `${ctx.siteUrl}/${ctx.tenantSlug}`;

  let text: string;
  switch (event) {
    case 'approved':
      text = `Olá, ${name}! Seu horário em ${ctx.tenantName} está confirmado: ${ctx.serviceName} com ${ctx.professionalName}, ${when}.`
        + (address ? ` Endereço: ${address}.` : '');
      break;
    case 'refused':
      text = `Olá, ${name}. Não conseguimos atender ${when} em ${ctx.tenantName}. Escolha outro horário: ${portal}`;
      break;
    case 'cancelled_by_owner':
      text = `Olá, ${name}. Seu horário de ${when} em ${ctx.tenantName} foi cancelado. Para reagendar: ${portal}`;
      break;
  }
  return { text, url: `https://wa.me/${number}?text=${encodeURIComponent(text)}` };
}
