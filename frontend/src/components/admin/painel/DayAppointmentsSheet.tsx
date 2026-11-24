import { useMemo } from 'react';
import { CalendarCheck } from 'lucide-react';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import { STATUS_META } from '@/components/admin/agenda/statusStyle';
import { useTenant } from '@/context/TenantContext';
import { longDayLabel } from '@/lib/painel';
import { formatCurrency } from '@/lib/utils';

interface Props {
  /** Dia aberto (YYYY-MM-DD); null = fechado. */
  day: string | null;
  onClose: () => void;
}

/**
 * Todos os agendamentos de um dia, abertos ao tocar num dia de "Próximos 7 dias". Usa o mesmo critério da contagem
 * do painel (tudo que não foi cancelado), então o número do dia e esta lista sempre batem.
 */
export function DayAppointmentsSheet({ day, onClose }: Props) {
  const { appointments, clients, services, professionals } = useTenant();

  const rows = useMemo(() => {
    if (!day) return [];
    const clientById = new Map(clients.map(c => [c.id, c]));
    const svcById = new Map(services.map(s => [s.id, s]));
    const profById = new Map(professionals.map(p => [p.id, p]));
    return appointments
      .filter(a => a.date === day && a.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(a => ({
        appt: a,
        client: clientById.get(a.clientId)?.name ?? 'Cliente removido',
        service: svcById.get(a.serviceId)?.name ?? '—',
        professional: profById.get(a.professionalId)?.name ?? '—',
      }));
  }, [day, appointments, clients, services, professionals]);

  return (
    <ResponsiveSheet
      open={day !== null}
      onOpenChange={o => { if (!o) onClose(); }}
      title={day ? longDayLabel(day) : ''}
      description={rows.length === 0 ? 'Nenhum agendamento' : `${rows.length} ${rows.length === 1 ? 'agendamento' : 'agendamentos'}`}
    >
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CalendarCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Dia livre</p>
          <p className="max-w-xs text-sm text-muted-foreground">Nenhum cliente marcou este dia ainda. Compartilhe seu link de agendamento para encher a agenda.</p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Agendamentos do dia">
          {rows.map(({ appt, client, service, professional }) => {
            const { label, icon: Icon, card } = STATUS_META[appt.status];
            return (
              <li key={appt.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                <div className="w-12 shrink-0 text-center tabular-nums">
                  <p className="text-sm font-bold">{appt.startTime}</p>
                  <p className="text-xs text-muted-foreground">{appt.endTime}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{client}</p>
                  <p className="truncate text-xs text-muted-foreground">{service} · {professional}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${card}`}>
                    <Icon className="h-3 w-3" aria-hidden />{label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(appt.price)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ResponsiveSheet>
  );
}
