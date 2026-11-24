import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { FilterX, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppointmentCard, type AppointmentCardData } from '@/components/appointments/AppointmentCard';
import { ConfirmAppointmentDialog } from '@/components/appointments/ConfirmAppointmentDialog';
import { FilterChips } from '@/components/appointments/FilterChips';
import { StatusBadge } from '@/components/appointments/StatusBadge';
import { SummaryStrip } from '@/components/appointments/SummaryStrip';
import { actionLabel, dayHeading, fmtDate } from '@/components/appointments/appointmentUi';
import { useTenant } from '@/context/TenantContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { formatCurrency } from '@/lib/utils';
import { todaySP } from '@/lib/agendaDates';
import {
  EMPTY_FILTERS, PERIOD_PRESETS, activePeriodPreset, filterAppointments, hasActiveFilters, periodRange, statusActionsFor,
  statusCounts, statusErrorMessage,
  type AppointmentFilters, type PeriodPreset, type StatusAction,
} from '@/lib/appointmentFilters';
import PendingConfirmations from '@/components/admin/PendingConfirmations';
import ClientNoticeBar from '@/components/admin/ClientNoticeBar';
import { useClientNotice } from '@/hooks/useClientNotice';
import type { Appointment, AppointmentStatus } from '@/types';

/** Chips de status, na ordem em que o dono costuma agir (pendentes primeiro). */
const STATUS_CHIPS: { value: AppointmentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'completed', label: 'Concluídos' },
  { value: 'no_show', label: 'Faltas' },
  { value: 'cancelled', label: 'Cancelados' },
];

const PERIOD_CHIPS: { value: PeriodPreset | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas as datas' },
  ...PERIOD_PRESETS.map(p => ({ value: p.key as PeriodPreset | 'all', label: p.label })),
];

const fieldClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

interface RowData extends AppointmentCardData {
  appt: Appointment;
  professionalName: string;
}

/** Desktop: todas as ações como botões na linha da tabela. */
function ActionButtons({ row, onAction, busy }: { row: RowData; onAction: (r: RowData, a: StatusAction) => void; busy: boolean }) {
  const actions = statusActionsFor(row.status);
  if (actions.length === 0) return <span className="text-xs text-muted-foreground">Sem ações</span>;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Ações do agendamento de ${row.clientName}`}>
      {actions.map(a => (
        <Button
          key={a.status} type="button" size="sm" disabled={busy}
          variant={a.status === 'cancelled' ? 'outline' : a.status === 'confirmed' ? 'default' : 'secondary'}
          className={`min-h-9 ${a.status === 'cancelled' ? 'text-destructive' : ''}`}
          aria-label={actionLabel(a.label, row.clientName, row.date, row.startTime)}
          onClick={() => onAction(row, a)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Tela "Agendamentos": do quadro geral (hoje, pendentes, próximos 7 dias) para o detalhe. Primeiro o que precisa de
 * decisão (aguardando confirmação), depois filtros em camadas (busca, status e período à vista; o resto num painel) e a
 * lista: tabela no desktop, cartões agrupados por dia no celular. A Agenda (calendário) fica em `AgendaView only="calendar"`.
 */
export default function AppointmentsView() {
  const { appointments, clients, professionals, services, updateAppointmentStatus } = useTenant();
  const { isMobile } = useBreakpoint();
  const clientNotice = useClientNotice();
  const uid = useId();
  // O texto da busca mora na URL (?q=): a busca global da navbar abre esta tela já filtrada.
  const [params, setParams] = useSearchParams();
  const [otherFilters, setOtherFilters] = useState<AppointmentFilters>(EMPTY_FILTERS);
  const filters = useMemo<AppointmentFilters>(() => ({ ...otherFilters, search: params.get('q') ?? '' }), [otherFilters, params]);
  const setFilters = (next: AppointmentFilters) => {
    setOtherFilters(next);
    setParams(next.search ? { q: next.search } : {}, { replace: true });
  };
  const [pendingCancel, setPendingCancel] = useState<RowData | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<RowData | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const set = <K extends keyof AppointmentFilters>(k: K, v: AppointmentFilters[K]) => setFilters({ ...filters, [k]: v });

  const today = todaySP();
  const rows = useMemo<RowData[]>(() => {
    const clientById = new Map(clients.map(c => [c.id, c]));
    const profById = new Map(professionals.map(p => [p.id, p]));
    const svcById = new Map(services.map(s => [s.id, s]));
    return filterAppointments(appointments, clients, filters).map(appt => ({
      appt,
      id: appt.id, date: appt.date, startTime: appt.startTime, endTime: appt.endTime, status: appt.status, price: appt.price,
      clientName: clientById.get(appt.clientId)?.name ?? 'Cliente removido',
      clientPhone: clientById.get(appt.clientId)?.phone,
      serviceName: svcById.get(appt.serviceId)?.name ?? '—',
      professionalName: profById.get(appt.professionalId)?.name ?? '—',
    }));
  }, [appointments, clients, professionals, services, filters]);

  // Celular: cartões agrupados por dia (a ordem do dia e a do horário seguem a tabela do desktop).
  const groups = useMemo(() => {
    const byDay = new Map<string, RowData[]>();
    for (const r of rows) { const list = byDay.get(r.date); if (list) list.push(r); else byDay.set(r.date, [r]); }
    return [...byDay.entries()];
  }, [rows]);

  // Quadro geral: independe dos filtros, é o retrato do negócio.
  const overview = useMemo(() => {
    const end = format(addDays(new Date(`${today}T12:00:00`), 6), 'yyyy-MM-dd');
    const active = appointments.filter(a => a.status !== 'cancelled');
    return {
      today: active.filter(a => a.date === today).length,
      pending: appointments.filter(a => a.status === 'pending').length,
      week: active.filter(a => a.date >= today && a.date <= end).length,
    };
  }, [appointments, today]);

  const counts = useMemo(() => statusCounts(appointments, clients, filters), [appointments, clients, filters]);
  const activePreset = activePeriodPreset(filters, today);
  const invalidPeriod = !!filters.dateFrom && !!filters.dateTo && filters.dateFrom > filters.dateTo;
  // Filtros que moram no painel (os chips de status e período ficam sempre à vista).
  const panelFilterCount = (filters.dateFrom || filters.dateTo ? 1 : 0) + (filters.professionalId !== 'all' ? 1 : 0) + (filters.serviceId !== 'all' ? 1 : 0);
  const panelOpen = !isMobile || showFilters;

  const choosePeriod = (key: PeriodPreset | 'all') => {
    const { dateFrom, dateTo } = key === 'all' || activePreset === key ? { dateFrom: '', dateTo: '' } : periodRange(key, today);
    setFilters({ ...filters, dateFrom, dateTo });
  };

  const apply = async (row: RowData, status: AppointmentStatus) => {
    setError('');
    clientNotice.clear();
    setBusyId(row.id);
    try {
      await updateAppointmentStatus(row.id, status);
      clientNotice.offer([row.appt], status);
    }
    catch (err) { setError(statusErrorMessage(err)); }
    finally { setBusyId(null); }
  };

  const onAction = (row: RowData, a: StatusAction) => {
    if (a.status === 'cancelled') setPendingCancel(row);
    else if (a.status === 'confirmed') setPendingConfirm(row); // confirmar avisa o cliente: pede uma segunda confirmação
    else void apply(row, a.status);
  };

  const count = rows.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Agendamentos</h2>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {count === 0 ? 'Nenhum agendamento encontrado' : `${count} agendamento${count !== 1 ? 's' : ''} encontrado${count !== 1 ? 's' : ''}`}
        </p>
      </div>

      <SummaryStrip label="Resumo dos agendamentos" items={[
        { label: 'Hoje', value: overview.today },
        { label: 'Pendentes', value: overview.pending, highlight: overview.pending > 0 },
        { label: 'Próx. 7 dias', value: overview.week },
      ]} />

      {/* Reservas sem código aguardando o cliente confirmar pelo WhatsApp */}
      <PendingConfirmations />

      {/* Filtros: busca, status e período à vista; o resto no painel */}
      <form role="search" aria-label="Filtrar agendamentos" onSubmit={e => e.preventDefault()} className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search" className="h-11 pl-9" placeholder="Buscar cliente"
              aria-label="Buscar cliente por nome, e-mail ou telefone"
              value={filters.search} onChange={e => set('search', e.target.value)}
            />
          </div>
          {isMobile && (
            <Button type="button" variant="outline" className="relative h-11 shrink-0 gap-2 px-3"
              aria-expanded={showFilters} aria-controls={`${uid}-panel`} onClick={() => setShowFilters(v => !v)}>
              <SlidersHorizontal aria-hidden /> Filtros
              {panelFilterCount > 0 && (
                <span aria-label={`${panelFilterCount} ${panelFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}`}
                  className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">{panelFilterCount}</span>
              )}
            </Button>
          )}
        </div>

        <FilterChips label="Status" value={filters.status} onChange={v => set('status', v)}
          options={STATUS_CHIPS.map(s => ({ ...s, count: counts[s.value] }))} />
        <FilterChips label="Período" value={!filters.dateFrom && !filters.dateTo ? 'all' : activePreset} onChange={choosePeriod}
          options={PERIOD_CHIPS} />

        {panelOpen && (
          <div id={`${uid}-panel`} className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-3 lg:grid-cols-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`${uid}-from`}>De</Label>
              <Input id={`${uid}-from`} type="date" className="h-11 min-w-0 px-2" value={filters.dateFrom} max={filters.dateTo || undefined}
                onChange={e => set('dateFrom', e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`${uid}-to`}>Até</Label>
              <Input id={`${uid}-to`} type="date" className="h-11 min-w-0 px-2" value={filters.dateTo} min={filters.dateFrom || undefined}
                onChange={e => set('dateTo', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-prof`}>Profissional</Label>
              <select id={`${uid}-prof`} className={fieldClass} value={filters.professionalId} onChange={e => set('professionalId', e.target.value)}>
                <option value="all">Todos</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-svc`}>Serviço</Label>
              <select id={`${uid}-svc`} className={fieldClass} value={filters.serviceId} onChange={e => set('serviceId', e.target.value)}>
                <option value="all">Todos</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex items-end lg:col-span-1">
              <Button type="button" variant="outline" className="min-h-11 w-full gap-2" disabled={!hasActiveFilters(filters)} onClick={() => setFilters(EMPTY_FILTERS)}>
                <FilterX aria-hidden /> Limpar filtros
              </Button>
            </div>
          </div>
        )}
        {invalidPeriod && (
          <p role="alert" className="text-sm text-destructive">A data inicial é depois da data final. Ajuste o período.</p>
        )}
      </form>

      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <ClientNoticeBar notice={clientNotice.notice} onClose={clientNotice.clear} settingsHref="/admin/settings/portal#whatsapp" />

      {rows.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            {hasActiveFilters(filters) ? 'Nenhum agendamento com esses filtros. Tente ampliar o período ou limpar os filtros.' : 'Ainda não há agendamentos. Quando um cliente marcar um horário, ele aparece aqui.'}
          </p>
          {hasActiveFilters(filters) && (
            <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => setFilters(EMPTY_FILTERS)}>
              <FilterX aria-hidden /> Limpar filtros
            </Button>
          )}
        </CardContent></Card>
      ) : isMobile ? (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <section key={day} aria-label={dayHeading(day, today)} className="space-y-2">
              <h3 className="px-1 text-sm font-semibold text-muted-foreground">{dayHeading(day, today)}</h3>
              <ul className="space-y-3">
                {items.map(row => (
                  <li key={row.id}>
                    <AppointmentCard data={row} busy={busyId === row.id} onAction={(d, a) => onAction(d as RowData, a)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Lista de agendamentos</caption>
              <thead>
                <tr className="border-b bg-muted/40">
                  {['Data', 'Hora', 'Cliente', 'Serviço', 'Profissional', 'Valor', 'Status', 'Ações'].map(h => (
                    <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">{fmtDate(row.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{row.startTime} – {row.endTime}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="max-w-[160px] truncate font-medium">{row.clientName}</div>
                      {row.clientPhone && <div className="text-xs text-muted-foreground">{row.clientPhone}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm"><div className="max-w-[140px] truncate">{row.serviceName}</div></td>
                    <td className="px-4 py-3 text-sm"><div className="max-w-[120px] truncate">{row.professionalName}</div></td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold">{formatCurrency(row.price)}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3"><ActionButtons row={row} onAction={onAction} busy={busyId === row.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmAppointmentDialog scope="admin"
        target={pendingConfirm ? { clientName: pendingConfirm.clientName, date: pendingConfirm.date, startTime: pendingConfirm.startTime, serviceName: pendingConfirm.serviceName } : null}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => { const r = pendingConfirm; setPendingConfirm(null); if (r) void apply(r, 'confirmed'); }} />

      <Dialog open={!!pendingCancel} onOpenChange={o => !o && setPendingCancel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar agendamento</DialogTitle>
            <DialogDescription>
              {pendingCancel && `Cancelar o agendamento de ${pendingCancel.clientName} em ${fmtDate(pendingCancel.date)} às ${pendingCancel.startTime}? O horário volta a ficar livre.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setPendingCancel(null)}>Voltar</Button>
            <Button type="button" variant="destructive" className="min-h-11"
              onClick={() => { const r = pendingCancel; setPendingCancel(null); if (r) void apply(r, 'cancelled'); }}>
              Cancelar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
