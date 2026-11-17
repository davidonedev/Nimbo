import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, CalendarDays, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfessional } from '@/context/ProfessionalContext';
import type { Appointment } from '@/types';
import { STATUS_BADGE, STATUS_LABEL, STATUS_ORDER, countByStatus, ownAppointments, startKey } from './ownData';

const UPCOMING_LIMIT = 5;

/**
 * Painel do profissional: resumido e só dele. Mostra os agendamentos de hoje, os próximos e a
 * contagem por status no mês. Sem valores financeiros e sem dados de colegas.
 */
export default function ProfDashboardView() {
  const { professional, appointments, clients, services } = useProfessional();

  const { today, upcoming, monthCounts, monthLabel } = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const own = ownAppointments(appointments, professional.id);
    const byStart = (a: Appointment, b: Appointment) => startKey(a).localeCompare(startKey(b));
    return {
      today: own.filter(a => a.date === todayStr).sort(byStart),
      // Próximos: dias futuros ainda em aberto (cancelado/concluído não é "próximo").
      upcoming: own.filter(a => a.date > todayStr && (a.status === 'pending' || a.status === 'confirmed')).sort(byStart).slice(0, UPCOMING_LIMIT),
      monthCounts: countByStatus(own.filter(a => a.date.startsWith(format(now, 'yyyy-MM')))),
      monthLabel: format(now, "MMMM 'de' yyyy", { locale: ptBR }),
    };
  }, [appointments, professional.id]);

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? 'Cliente';
  const serviceName = (id: string) => services.find(s => s.id === id)?.name ?? 'Serviço';
  const firstName = professional.name.split(' ')[0];

  const row = (a: Appointment, withDate: boolean) => (
    <li key={a.id} className="flex min-h-[44px] items-center gap-3 py-3">
      <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">
        {a.startTime}
        {withDate && <span className="block text-xs font-normal text-muted-foreground">{format(parseISO(a.date), 'dd/MM', { locale: ptBR })}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{clientName(a.clientId)}</p>
        <p className="truncate text-xs text-muted-foreground">{serviceName(a.serviceId)}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Olá, {firstName}</h2>
        <p className="text-sm capitalize text-muted-foreground">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
      </div>

      <section aria-labelledby="prof-status-title" className="space-y-3">
        <h3 id="prof-status-title" className="text-sm font-semibold text-muted-foreground">Seus agendamentos em {monthLabel}</h3>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_ORDER.map(status => (
            <li key={status}>
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-2xl font-bold tabular-nums">{monthCounts[status]}</p>
                  <p className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4" aria-hidden />Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {today.length === 0
              ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum agendamento para hoje.</p>
              : <ul aria-label="Agendamentos de hoje" className="divide-y">{today.map(a => row(a, false))}</ul>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" aria-hidden />Próximos</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0
              ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
              : <ul aria-label="Próximos agendamentos" className="divide-y">{upcoming.map(a => row(a, true))}</ul>}
            <Link
              to="/professional/agenda"
              className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ver minha agenda <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
