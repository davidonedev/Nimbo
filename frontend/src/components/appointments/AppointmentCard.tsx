import { MessageCircle, MoreHorizontal, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { normalizeWaNumber } from '@/lib/clientNotice';
import { statusActionsFor, type StatusAction } from '@/lib/appointmentFilters';
import { formatCurrency } from '@/lib/utils';
import type { AppointmentStatus } from '@/types';
import { StatusBadge } from './StatusBadge';
import { actionLabel, fmtDate } from './appointmentUi';

export interface AppointmentCardData {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  price: number;
  clientName: string;
  clientPhone?: string | null;
  serviceName: string;
  /** Só no admin: na agenda do profissional todos os agendamentos são dele. */
  professionalName?: string;
}

interface Props {
  data: AppointmentCardData;
  busy?: boolean;
  onAction: (data: AppointmentCardData, action: StatusAction) => void;
  /** Muda o dia/horário (só pendente ou confirmado). Sem a prop, o item não aparece. */
  onReschedule?: (data: AppointmentCardData) => void;
}

/**
 * Cartão de agendamento do celular. Mostra horário, cliente, serviço, status e valor; embaixo, a ação principal
 * (Confirmar ou Concluir) em largura total ao alcance do polegar, ligar, WhatsApp e o menu "Mais" (Marcar falta, Cancelar).
 */
export function AppointmentCard({ data, busy = false, onAction, onReschedule }: Props) {
  const actions = statusActionsFor(data.status);
  const primary = actions.find(a => a.status === 'confirmed') ?? actions.find(a => a.status === 'completed');
  const more = actions.filter(a => a !== primary);
  const canMove = !!onReschedule && (data.status === 'pending' || data.status === 'confirmed');
  const tel = (data.clientPhone ?? '').replace(/[^\d+]/g, '');
  const wa = normalizeWaNumber(data.clientPhone);
  const hasFooter = !!primary || more.length > 0 || canMove || !!tel;
  const iconLink = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const who = data.professionalName ? `${data.serviceName} · ${data.professionalName}` : data.serviceName;

  return (
    <Card className="shadow-sm"><CardContent className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="w-12 shrink-0 text-center tabular-nums">
          <p className="text-base font-bold">{data.startTime}</p>
          <p className="text-xs text-muted-foreground">{data.endTime}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{data.clientName}</p>
          <p className="truncate text-sm text-muted-foreground">{who}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={data.status} />
          <span className="text-sm font-bold tabular-nums">{formatCurrency(data.price)}</span>
        </div>
      </div>

      {hasFooter && (
        <div className="flex items-center gap-2 border-t pt-3">
          {primary && (
            <Button
              type="button" size="sm" disabled={busy}
              variant={primary.status === 'confirmed' ? 'default' : 'secondary'}
              className="min-h-11 flex-1"
              aria-label={actionLabel(primary.label, data.clientName, data.date, data.startTime)}
              onClick={() => onAction(data, primary)}
            >
              {primary.label}
            </Button>
          )}
          {tel && <a href={`tel:${tel}`} className={iconLink} aria-label={`Ligar para ${data.clientName}`}><Phone className="h-4 w-4" aria-hidden /></a>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={iconLink} aria-label={`Chamar ${data.clientName} no WhatsApp`}><MessageCircle className="h-4 w-4" aria-hidden /></a>}
          {(more.length > 0 || canMove) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" disabled={busy}
                  className={primary ? 'min-h-11 w-11 shrink-0 px-0' : 'min-h-11 flex-1'}
                  aria-label={`Mais ações: ${data.clientName}, ${fmtDate(data.date)} às ${data.startTime}`}>
                  <MoreHorizontal aria-hidden />{!primary && 'Ações'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canMove && (
                  <DropdownMenuItem className="min-h-11" onSelect={() => onReschedule?.(data)}>Alterar horário</DropdownMenuItem>
                )}
                {more.map(a => (
                  <DropdownMenuItem key={a.status} destructive={a.status === 'cancelled'} className="min-h-11" onSelect={() => onAction(data, a)}>
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </CardContent></Card>
  );
}
