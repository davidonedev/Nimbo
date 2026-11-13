import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAgendaPeriod } from '@/hooks/useAgendaPeriod';
import { useAgendaState } from '@/hooks/useAgendaState';
import { agendaPeriod, nowTimeSP, todaySP } from '@/lib/agendaDates';
import { computeBusinessStatus, computeDayHours, computeDayStats } from '@/lib/agendaStats';
import { DateStrip } from './DateStrip';
import { DaySummaryCard } from './DaySummaryCard';
import { ViewSwitcher } from './ViewSwitcher';
import type { AgendaScope } from './scope';

/**
 * Nova Agenda (rota beta até ter paridade com a atual), a mesma tela para o dono e para o profissional
 * (o `scope` define quais profissionais aparecem). Etapa 1: cabeçalho do dia e navegação de datas.
 */
export default function AgendaPage({ scope }: { scope: AgendaScope }) {
  const { tenant, professionals } = scope;
  const { view, setView, date, setDate, goToday } = useAgendaState();

  // Carrega só o período do mês visível (alimenta indicadores do dia, pontos da faixa e, depois, semana e mês).
  const range = agendaPeriod(date);
  const period = useAgendaPeriod(scope.cacheKey, scope.role, range.start, range.end);

  const today = todaySP();
  const nowTime = nowTimeSP();
  const hours = useMemo(() => computeDayHours(date, professionals), [date, professionals]);
  const status = computeBusinessStatus(date, today, hours, tenant.isOpen, nowTime);
  const stats = useMemo(
    () => period.data ? computeDayStats(date, today, period.data.appointments, period.data.blocks, professionals, nowTime) : undefined,
    [date, today, nowTime, period.data, professionals],
  );
  const busyDays = useMemo(
    () => new Set((period.data?.appointments ?? []).filter(a => a.status !== 'cancelled').map(a => a.date)),
    [period.data],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-2xl font-bold tracking-tight">Agenda</h2>
          <p className="text-sm text-muted-foreground">{scope.role === 'professional' ? 'Seus agendamentos, bloqueios e horários livres.' : 'Agendamentos, bloqueios e horários livres da equipe.'}</p>
        </div>
        <ViewSwitcher value={view} onChange={setView} />
        {/* TODO (etapa 3): abrir o formulário de novo agendamento */}
        <Button type="button" className="gap-1.5" onClick={() => { /* TODO */ }}>
          <Plus className="h-4 w-4" aria-hidden /> Novo agendamento
        </Button>
      </div>

      <DaySummaryCard
        date={date}
        stats={stats}
        status={status}
        hours={hours}
        bookingUrl={`${window.location.origin}/${tenant.slug}`}
        loading={period.loading && !period.data}
      />

      <Card>
        <CardContent className="p-4">
          <DateStrip date={date} busyDays={busyDays} onSelect={setDate} onToday={goToday} />
        </CardContent>
      </Card>

      {period.error ? (
        <Card><CardContent role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar a agenda deste período.</p>
          <Button type="button" variant="outline" size="sm" onClick={period.reload}>Tentar novamente</Button>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          {/* TODO (etapas 2 e 5): grade do dia, semana e mês */}
          A grade de horários ({view === 'day' ? 'Dia' : view === 'week' ? 'Semana' : 'Mês'}) chega na próxima etapa.
        </CardContent></Card>
      )}
    </div>
  );
}
