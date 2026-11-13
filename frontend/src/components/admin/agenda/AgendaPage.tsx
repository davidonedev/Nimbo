import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgendaPeriod } from '@/hooks/useAgendaPeriod';
import { useAgendaState } from '@/hooks/useAgendaState';
import { agendaPeriod, nowTimeSP, todaySP } from '@/lib/agendaDates';
import { computeBusinessStatus, computeDayHours, computeDayStats } from '@/lib/agendaStats';
import type { GridInterval } from '@/lib/agendaGrid';
import { DateStrip } from './DateStrip';
import { DayGrid } from './DayGrid';
import { GridToolbar } from './GridToolbar';
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
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [interval, setIntervalState] = useState<GridInterval>(() => {
    try { const v = Number(localStorage.getItem('nimbo_agenda_interval')); return v === 15 || v === 60 ? v : 30; } catch { return 30; }
  });
  const changeInterval = useCallback((i: GridInterval) => {
    setIntervalState(i);
    try { localStorage.setItem('nimbo_agenda_interval', String(i)); } catch { /* sem storage */ }
  }, []);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [mobileProfId, setMobileProfId] = useState<string | null>(null);

  // Quem aparece na grade: profissional logado (só ele); mobile (um por vez); desktop (todos ou os selecionados).
  const visibleProfessionals = useMemo(() => {
    if (scope.lockedProfessionalId) return professionals.filter(p => p.id === scope.lockedProfessionalId);
    if (isMobile) return professionals.filter(p => p.id === (mobileProfId ?? professionals[0]?.id)).slice(0, 1);
    return selectedIds ? professionals.filter(p => selectedIds.includes(p.id)) : professionals;
  }, [scope.lockedProfessionalId, professionals, isMobile, mobileProfId, selectedIds]);

  // TODO (etapa 3): abrir formulário de novo agendamento / detalhes
  const handleSlotSelect = useCallback((professionalId: string, time: string) => { void professionalId; void time; }, []);
  const handleAppointmentSelect = useCallback((id: string) => { void id; }, []);

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

      {professionals.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">Cadastre ao menos um profissional para começar a agendar.</p>
          {scope.role === 'admin' && <Button asChild variant="outline" size="sm"><Link to="/admin/professionals">Cadastrar profissional</Link></Button>}
        </CardContent></Card>
      ) : period.error ? (
        <Card><CardContent role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar a agenda deste período.</p>
          <Button type="button" variant="outline" size="sm" onClick={period.reload}>Tentar novamente</Button>
        </CardContent></Card>
      ) : view === 'day' ? (
        <div className="space-y-3">
          {isMobile && professionals.length > 1 && !scope.lockedProfessionalId && (
            <div role="tablist" aria-label="Profissional" className="flex gap-1.5 overflow-x-auto pb-1">
              {professionals.map(p => (
                <button key={p.id} type="button" role="tab" aria-selected={p.id === (mobileProfId ?? professionals[0].id)} onClick={() => setMobileProfId(p.id)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${p.id === (mobileProfId ?? professionals[0].id) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <GridToolbar professionals={professionals} selectedIds={selectedIds} onSelectedChange={setSelectedIds}
            interval={interval} onIntervalChange={changeInterval} lockedProfessional={!!scope.lockedProfessionalId || isMobile} />
          {period.loading || !period.data ? (
            <div role="status" aria-label="Carregando a grade" className="space-y-2 rounded-xl border bg-card p-4">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <DayGrid date={date} professionals={visibleProfessionals} appointments={period.data.appointments} blocks={period.data.blocks}
              interval={interval} onSlotSelect={handleSlotSelect} onAppointmentSelect={handleAppointmentSelect} />
          )}
        </div>
      ) : (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          {/* TODO (etapa 5): visões Semana e Mês */}
          A visão {view === 'week' ? 'Semana' : 'Mês'} chega em uma próxima etapa.
        </CardContent></Card>
      )}
    </div>
  );
}
