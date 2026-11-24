import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FilterX, MessageCircle, MoreHorizontal, Phone, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { STATUS_META } from '@/components/admin/agenda/statusStyle';
import { useTenant } from '@/context/TenantContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { formatCurrency } from '@/lib/utils';
import { normalizeWaNumber } from '@/lib/clientNotice';
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

const fieldClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const chipClass = (on: boolean) =>
  `inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:px-3 ${on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`;

const fmtDate = (d: string) => format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cabeçalho do dia na lista do celular: "Hoje · Quarta, 25 de nov" / "Amanhã · …" / "Ontem · …" / "Quarta, 18 de nov". */
function dayHeading(isoDay: string, todayIso: string): string {
  const full = capitalize(format(parseISO(isoDay), "EEE, d 'de' MMM", { locale: ptBR }));
  const rel = isoDay === todayIso ? 'Hoje'
    : isoDay === format(addDays(parseISO(todayIso), 1), 'yyyy-MM-dd') ? 'Amanhã'
    : isoDay === format(addDays(parseISO(todayIso), -1), 'yyyy-MM-dd') ? 'Ontem' : null;
  return rel ? `${rel} · ${full}` : full;
}

/** Cor + ícone + texto: a cor nunca é a única pista do status. */
function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, icon: Icon, card } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${card}`}>
      <Icon className="h-3 w-3" aria-hidden />{label}
    </span>
  );
}

interface RowData {
  appt: Appointment;
  clientName: string;
  clientPhone?: string | null;
  serviceName: string;
  professionalName: string;
}

const actionLabel = (row: RowData, a: StatusAction) => `${a.label}: ${row.clientName}, ${fmtDate(row.appt.date)} às ${row.appt.startTime}`;

/** Desktop: todas as ações como botões na linha da tabela. */
function ActionButtons({ row, onAction, busy }: { row: RowData; onAction: (r: RowData, a: StatusAction) => void; busy: boolean }) {
  const actions = statusActionsFor(row.appt.status);
  if (actions.length === 0) return <span className="text-xs text-muted-foreground">Sem ações</span>;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Ações do agendamento de ${row.clientName}`}>
      {actions.map(a => (
        <Button
          key={a.status} type="button" size="sm" disabled={busy}
          variant={a.status === 'cancelled' ? 'outline' : a.status === 'confirmed' ? 'default' : 'secondary'}
          className={`min-h-11 md:min-h-9 ${a.status === 'cancelled' ? 'text-destructive' : ''}`}
          aria-label={actionLabel(row, a)}
          onClick={() => onAction(row, a)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Celular: a ação principal (Confirmar ou Concluir) fica em largura total ao alcance do polegar; ligar, WhatsApp e as
 * ações menos usadas (Marcar falta, Cancelar) ficam ao lado, sem encher o cartão de botões.
 */
function MobileActions({ row, onAction, busy }: { row: RowData; onAction: (r: RowData, a: StatusAction) => void; busy: boolean }) {
  const actions = statusActionsFor(row.appt.status);
  const primary = actions.find(a => a.status === 'confirmed') ?? actions.find(a => a.status === 'completed');
  const more = actions.filter(a => a !== primary);
  const tel = (row.clientPhone ?? '').replace(/[^\d+]/g, '');
  const wa = normalizeWaNumber(row.clientPhone);
  if (!primary && more.length === 0 && !tel) return null;

  const iconLink = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      {primary && (
        <Button
          type="button" size="sm" disabled={busy}
          variant={primary.status === 'confirmed' ? 'default' : 'secondary'}
          className="min-h-11 flex-1"
          aria-label={actionLabel(row, primary)}
          onClick={() => onAction(row, primary)}
        >
          {primary.label}
        </Button>
      )}
      {tel && <a href={`tel:${tel}`} className={iconLink} aria-label={`Ligar para ${row.clientName}`}><Phone className="h-4 w-4" aria-hidden /></a>}
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={iconLink} aria-label={`Chamar ${row.clientName} no WhatsApp`}><MessageCircle className="h-4 w-4" aria-hidden /></a>}
      {more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}
              className={primary ? 'min-h-11 w-11 shrink-0 px-0' : 'min-h-11 flex-1'}
              aria-label={`Mais ações: ${row.clientName}, ${fmtDate(row.appt.date)} às ${row.appt.startTime}`}>
              <MoreHorizontal aria-hidden />{!primary && 'Ações'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {more.map(a => (
              <DropdownMenuItem key={a.status} destructive={a.status === 'cancelled'} className="min-h-11" onSelect={() => onAction(row, a)}>
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/**
 * Tela "Agendamentos": lista pesquisável de todos os agendamentos, com filtros (período, status,
 * profissional, serviço, busca por cliente) e ações de status. Tabela no desktop, cards agrupados por dia no celular.
 * A Agenda (calendário) continua em `AgendaView only="calendar"`.
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
      clientName: clientById.get(appt.clientId)?.name ?? 'Cliente removido',
      clientPhone: clientById.get(appt.clientId)?.phone,
      serviceName: svcById.get(appt.serviceId)?.name ?? '—',
      professionalName: profById.get(appt.professionalId)?.name ?? '—',
    }));
  }, [appointments, clients, professionals, services, filters]);

  // Celular: cartões agrupados por dia (a ordem do dia e a do horário seguem a tabela do desktop).
  const groups = useMemo(() => {
    const byDay = new Map<string, RowData[]>();
    for (const r of rows) { const list = byDay.get(r.appt.date); if (list) list.push(r); else byDay.set(r.appt.date, [r]); }
    return [...byDay.entries()];
  }, [rows]);

  const counts = useMemo(() => statusCounts(appointments, clients, filters), [appointments, clients, filters]);
  const activePreset = activePeriodPreset(filters, today);
  const invalidPeriod = !!filters.dateFrom && !!filters.dateTo && filters.dateFrom > filters.dateTo;
  // Filtros que moram no painel (os chips de status e período ficam sempre à vista).
  const panelFilterCount = (filters.dateFrom || filters.dateTo ? 1 : 0) + (filters.professionalId !== 'all' ? 1 : 0) + (filters.serviceId !== 'all' ? 1 : 0);
  const panelOpen = !isMobile || showFilters;

  const choosePreset = (key: PeriodPreset) => {
    const { dateFrom, dateTo } = activePreset === key ? { dateFrom: '', dateTo: '' } : periodRange(key, today);
    setFilters({ ...filters, dateFrom, dateTo });
  };

  const apply = async (row: RowData, status: AppointmentStatus) => {
    setError('');
    clientNotice.clear();
    setBusyId(row.appt.id);
    try {
      await updateAppointmentStatus(row.appt.id, status);
      clientNotice.offer([row.appt], status);
    }
    catch (err) { setError(statusErrorMessage(err)); }
    finally { setBusyId(null); }
  };

  const onAction = (row: RowData, a: StatusAction) => {
    if (a.status === 'cancelled') setPendingCancel(row);
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

        <div role="group" aria-label="Status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {STATUS_CHIPS.map(s => (
            <button key={s.value} type="button" aria-pressed={filters.status === s.value} onClick={() => set('status', s.value)} className={chipClass(filters.status === s.value)}>
              {s.label}{' '}
              <span className={`text-xs tabular-nums ${filters.status === s.value ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{counts[s.value]}</span>
            </button>
          ))}
        </div>

        <div role="group" aria-label="Período" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={!filters.dateFrom && !filters.dateTo} onClick={() => setFilters({ ...filters, dateFrom: '', dateTo: '' })}
            className={chipClass(!filters.dateFrom && !filters.dateTo)}>Todas as datas</button>
          {PERIOD_PRESETS.map(p => (
            <button key={p.key} type="button" aria-pressed={activePreset === p.key} onClick={() => choosePreset(p.key)} className={chipClass(activePreset === p.key)}>{p.label}</button>
          ))}
        </div>

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
      <ClientNoticeBar notice={clientNotice.notice} onClose={clientNotice.clear} />

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
                  <li key={row.appt.id}>
                    <Card className="shadow-sm"><CardContent className="space-y-3 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 shrink-0 text-center tabular-nums">
                          <p className="text-base font-bold">{row.appt.startTime}</p>
                          <p className="text-xs text-muted-foreground">{row.appt.endTime}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold">{row.clientName}</p>
                          <p className="truncate text-sm text-muted-foreground">{row.serviceName} · {row.professionalName}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge status={row.appt.status} />
                          <span className="text-sm font-bold tabular-nums">{formatCurrency(row.appt.price)}</span>
                        </div>
                      </div>
                      <MobileActions row={row} onAction={onAction} busy={busyId === row.appt.id} />
                    </CardContent></Card>
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
                  <tr key={row.appt.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">{fmtDate(row.appt.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{row.appt.startTime} – {row.appt.endTime}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="max-w-[160px] truncate font-medium">{row.clientName}</div>
                      {row.clientPhone && <div className="text-xs text-muted-foreground">{row.clientPhone}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm"><div className="max-w-[140px] truncate">{row.serviceName}</div></td>
                    <td className="px-4 py-3 text-sm"><div className="max-w-[120px] truncate">{row.professionalName}</div></td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold">{formatCurrency(row.appt.price)}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.appt.status} /></td>
                    <td className="px-4 py-3"><ActionButtons row={row} onAction={onAction} busy={busyId === row.appt.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={!!pendingCancel} onOpenChange={o => !o && setPendingCancel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar agendamento</DialogTitle>
            <DialogDescription>
              {pendingCancel && `Cancelar o agendamento de ${pendingCancel.clientName} em ${fmtDate(pendingCancel.appt.date)} às ${pendingCancel.appt.startTime}? O horário volta a ficar livre.`}
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
