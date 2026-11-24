import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, CalendarPlus, FilterX, Search, SlidersHorizontal, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ClientNoticeBar from '@/components/admin/ClientNoticeBar';
import { AppointmentCard, type AppointmentCardData } from '@/components/appointments/AppointmentCard';
import { ConfirmAppointmentDialog } from '@/components/appointments/ConfirmAppointmentDialog';
import { FilterChips } from '@/components/appointments/FilterChips';
import { StatusBadge } from '@/components/appointments/StatusBadge';
import { SummaryStrip } from '@/components/appointments/SummaryStrip';
import { actionLabel, dayHeading, fmtDate } from '@/components/appointments/appointmentUi';
import { useProfessional } from '@/context/ProfessionalContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useProfClientNotice } from '@/hooks/useClientNotice';
import { todaySP } from '@/lib/agendaDates';
import { statusActionsFor, statusErrorMessage, type StatusAction } from '@/lib/appointmentFilters';
import { formatCurrency } from '@/lib/utils';
import { ownAppointments } from './ownData';
import type { Appointment, AppointmentStatus } from '@/types';

// ─── Helpers ────────────────────────────────────────────────────────────────
function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface ApptForm {
  clientId: string; serviceId: string; date: string; startTime: string; notes: string;
}
const emptyForm = (): ApptForm => ({
  clientId: '', serviceId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', notes: '',
});

type View = 'today' | 'upcoming' | 'past' | 'all';
type StatusFilter = AppointmentStatus | 'all';

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'completed', label: 'Concluídos' },
  { value: 'no_show', label: 'Faltas' },
  { value: 'cancelled', label: 'Cancelados' },
];

const VIEW_LABEL: Record<View, string> = { today: 'Hoje', upcoming: 'Próximos', past: 'Anteriores', all: 'Todos' };
const VIEW_ORDER: View[] = ['today', 'upcoming', 'past', 'all'];

interface Row extends AppointmentCardData { appt: Appointment }

/** O agendamento entra na visão? Cancelados só aparecem em "Todos" ou quando o filtro de status é Cancelados. */
function matchesView(r: { date: string; status: AppointmentStatus }, v: View, today: string, includeCancelled: boolean): boolean {
  if (r.status === 'cancelled' && v !== 'all' && !includeCancelled) return false;
  return v === 'all' ? true : v === 'today' ? r.date === today : v === 'upcoming' ? r.date > today : r.date < today;
}

// ─── Aguardando sua confirmação ──────────────────────────────────────────────
/** Pedidos novos: os dois primeiros à vista, o resto atrás de "Ver todos". Aceitar confirma; Recusar pede confirmação. */
function PendingBox({ rows, busy, onAccept, onRefuse }: {
  rows: Row[]; busy: boolean; onAccept: (r: Row) => void; onRefuse: (r: Row) => void;
}) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, 2);
  return (
    <Card className="border-yellow-300 dark:border-yellow-700">
      <CardContent className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Bell className="h-4 w-4" aria-hidden /> Aguardando sua confirmação
          <span aria-label={`${rows.length} aguardando`} className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">{rows.length}</span>
        </h3>
        <ul className="divide-y rounded-xl border bg-card" aria-label="Aguardando sua confirmação">
          {shown.map(r => (
            <li key={r.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate text-base font-semibold">{r.clientName}</p>
                <p className="truncate text-muted-foreground">
                  {format(parseISO(r.date), "EEE, d 'de' MMM", { locale: ptBR })} às {r.startTime} · {r.serviceName}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" disabled={busy}
                  className="min-h-11 flex-1 gap-1.5 bg-green-600 text-white hover:bg-green-700 sm:min-h-9 sm:flex-none"
                  aria-label={actionLabel('Aceitar', r.clientName, r.date, r.startTime)} onClick={() => onAccept(r)}>
                  <ThumbsUp aria-hidden /> Aceitar
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy}
                  className="min-h-11 flex-1 gap-1.5 text-destructive sm:min-h-9 sm:flex-none"
                  aria-label={actionLabel('Recusar', r.clientName, r.date, r.startTime)} onClick={() => onRefuse(r)}>
                  <ThumbsDown aria-hidden /> Recusar
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {rows.length > 2 && (
          <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={() => setAll(v => !v)}>
            {all ? 'Mostrar menos' : `Ver todos (${rows.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
/**
 * "Minha Agenda" do profissional: do quadro geral (hoje, próximos, receita) para o detalhe. Primeiro o que precisa de
 * decisão (pedidos aguardando), depois uma única lista por visão (Hoje, Próximos, Anteriores, Todos) com filtros
 * em camadas: cartões agrupados por dia no celular, tabela no desktop. O profissional só vê o que é dele.
 */
export default function ProfAgendaView() {
  const { appointments: all, clients, allClients, services, professional, addAppointment, updateAppointmentStatus, cancelAppointment } = useProfessional();
  const appointments = useMemo(() => ownAppointments(all, professional.id), [all, professional.id]);
  const { isMobile } = useBreakpoint();
  const clientNotice = useProfClientNotice();

  const [view, setView] = useState<View>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // New appointment dialog
  const [apptDialog, setApptDialog] = useState(false);
  const [apptForm,   setApptForm]   = useState<ApptForm>(emptyForm());
  const [apptError,  setApptError]  = useState('');

  const today = todaySP();

  const rows = useMemo<Row[]>(() => {
    const clientById = new Map(clients.map(c => [c.id, c]));
    const svcById = new Map(services.map(s => [s.id, s]));
    return appointments.map(a => ({
      appt: a,
      id: a.id, date: a.date, startTime: a.startTime, endTime: a.endTime, status: a.status, price: a.price,
      clientName: clientById.get(a.clientId)?.name ?? 'Cliente',
      clientPhone: clientById.get(a.clientId)?.phone,
      serviceName: svcById.get(a.serviceId)?.name ?? '—',
    }));
  }, [appointments, clients, services]);

  const viewCounts = useMemo(() => {
    const out = {} as Record<View, number>;
    for (const v of VIEW_ORDER) out[v] = rows.filter(r => matchesView(r, v, today, false)).length;
    return out;
  }, [rows, today]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = rows.filter(r => {
      if (!matchesView(r, view, today, statusFilter === 'cancelled')) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (q && !r.clientName.toLowerCase().includes(q) && !r.serviceName.toLowerCase().includes(q)) return false;
      return true;
    });
    const asc = view === 'today' || view === 'upcoming';
    return list.sort((a, b) => (asc
      ? a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      : b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)));
  }, [rows, view, statusFilter, dateFrom, dateTo, q, today]);

  const groups = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const r of filtered) { const l = byDay.get(r.date); if (l) l.push(r); else byDay.set(r.date, [r]); }
    return [...byDay.entries()];
  }, [filtered]);

  const statusCountsMap = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, pending: 0, confirmed: 0, completed: 0, no_show: 0, cancelled: 0 };
    for (const r of rows) { c.all += 1; c[r.status] += 1; }
    return c;
  }, [rows]);

  const pending = useMemo(() =>
    rows.filter(r => r.status === 'pending').sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
  [rows]);

  const stats = useMemo(() => ({
    today: rows.filter(r => r.date === today && r.status !== 'cancelled').length,
    upcoming: rows.filter(r => r.date > today && r.status !== 'cancelled').length,
    revenue: rows.filter(r => r.status === 'completed').reduce((s, r) => s + r.price, 0),
  }), [rows, today]);

  const panelCount = (statusFilter !== 'all' ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);
  const anyFilter = panelCount > 0 || q !== '';
  const clearFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); setStatusFilter('all'); };
  const panelOpen = !isMobile || showFilters;

  const myServices = useMemo(() => services.filter(s => professional.services.includes(s.id)), [services, professional.services]);
  const selectedSvc = myServices.find(s => s.id === apptForm.serviceId);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setActionError(''); setBusyId(id);
    try { await action(); }
    catch (err) { setActionError(statusErrorMessage(err)); }
    finally { setBusyId(null); }
  };
  const apply = (r: Row, status: AppointmentStatus) => run(r.id, async () => {
    clientNotice.clear();
    await updateAppointmentStatus(r.id, status);
    clientNotice.offer([r.appt], status);
  });
  const onAction = (r: Row, a: StatusAction) => {
    if (a.status === 'cancelled') setRejectId(r.id);
    else if (a.status === 'confirmed') setConfirmRow(r); // confirmar avisa o cliente: pede uma segunda confirmação
    else void apply(r, a.status);
  };

  const handleApptSave = async () => {
    setApptError('');
    if (!apptForm.clientId || !apptForm.serviceId || !apptForm.date || !apptForm.startTime) {
      setApptError('Preencha todos os campos obrigatórios.');
      return;
    }
    if (!selectedSvc) return;
    const endTime = addMinutes(apptForm.startTime, selectedSvc.duration);
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const sMin = toMin(apptForm.startTime), eMin = toMin(endTime);
    const conflict = appointments.some(a =>
      a.date === apptForm.date && a.status !== 'cancelled' &&
      sMin < toMin(a.endTime) && eMin > toMin(a.startTime)
    );
    if (conflict) { setApptError('Conflito de horário: você já tem um compromisso neste intervalo.'); return; }
    try {
      await addAppointment({
        clientId:       apptForm.clientId,
        professionalId: professional.id,
        serviceId:      apptForm.serviceId,
        date:           apptForm.date,
        startTime:      apptForm.startTime.slice(0, 5),
        notes:          apptForm.notes.trim() || undefined,
      });
      setApptDialog(false);
      setApptForm(emptyForm());
    } catch (err) {
      if (err && typeof err === 'object' && 'details' in err) {
        const details = (err as { details?: { field: string; message: string }[] }).details;
        if (details?.length) {
          setApptError(details.map(d => `${d.field}: ${d.message}`).join(' | '));
          return;
        }
      }
      setApptError(err instanceof Error ? err.message : 'Erro ao criar agendamento.');
    }
  };

  const rejectTarget = rows.find(r => r.id === rejectId);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">Minha Agenda</h2>
          <p className="truncate text-sm text-muted-foreground">{professional.name} · {professional.specialty}</p>
        </div>
        <Button className="h-11 shrink-0 gap-1.5 sm:h-9" size="sm" onClick={() => { setApptError(''); setApptForm(emptyForm()); setApptDialog(true); }}>
          <CalendarPlus aria-hidden /> Novo Agend.
        </Button>
      </div>

      <SummaryStrip label="Resumo da agenda" items={[
        { label: 'Hoje', value: stats.today },
        { label: 'Próximos', value: stats.upcoming },
        { label: 'Receita', value: formatCurrency(stats.revenue) },
      ]} />

      <PendingBox rows={pending} busy={busyId !== null} onAccept={r => setConfirmRow(r)} onRefuse={r => setRejectId(r.id)} />

      {/* Visões e filtros */}
      <form role="search" aria-label="Filtrar agendamentos" onSubmit={e => e.preventDefault()} className="space-y-3">
        <FilterChips label="Visão" value={view} onChange={setView}
          options={VIEW_ORDER.map(v => ({ value: v, label: VIEW_LABEL[v], count: viewCounts[v] }))} />

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" className="h-11 pl-9" placeholder="Buscar cliente ou serviço"
              aria-label="Buscar cliente ou serviço" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isMobile && (
            <Button type="button" variant="outline" className="h-11 shrink-0 gap-2 px-3"
              aria-expanded={showFilters} aria-controls="prof-filter-panel" onClick={() => setShowFilters(v => !v)}>
              <SlidersHorizontal aria-hidden /> Filtros
              {panelCount > 0 && (
                <span aria-label={`${panelCount} ${panelCount === 1 ? 'filtro ativo' : 'filtros ativos'}`}
                  className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">{panelCount}</span>
              )}
            </Button>
          )}
        </div>

        {panelOpen && (
          <div id="prof-filter-panel" className="space-y-3 rounded-2xl border bg-muted/30 p-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
            <FilterChips label="Status" value={statusFilter} onChange={setStatusFilter}
              options={STATUS_CHIPS.map(s => ({ ...s, count: statusCountsMap[s.value] }))} />
            <div className="grid grid-cols-2 gap-3 lg:max-w-md">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="prof-from">De</Label>
                <Input id="prof-from" type="date" className="h-11 min-w-0 px-2" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="prof-to">Até</Label>
                <Input id="prof-to" type="date" className="h-11 min-w-0 px-2" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
            <Button type="button" variant="outline" className="min-h-11 w-full gap-2 lg:w-auto" disabled={!anyFilter} onClick={clearFilters}>
              <FilterX aria-hidden /> Limpar filtros
            </Button>
          </div>
        )}
        {dateFrom && dateTo && dateFrom > dateTo && (
          <p role="alert" className="text-sm text-destructive">A data inicial é depois da data final. Ajuste o período.</p>
        )}
      </form>

      <ClientNoticeBar notice={clientNotice.notice} onClose={clientNotice.clear} />
      {actionError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p>}

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            {anyFilter ? 'Nenhum agendamento com esses filtros. Tente ampliar o período ou limpar os filtros.'
              : view === 'today' ? 'Nenhum agendamento para hoje.' : `Nenhum agendamento em "${VIEW_LABEL[view]}".`}
          </p>
          {anyFilter ? (
            <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={clearFilters}><FilterX aria-hidden /> Limpar filtros</Button>
          ) : view === 'today' && viewCounts.upcoming > 0 && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setView('upcoming')}>Ver próximos ({viewCounts.upcoming})</Button>
          )}
        </CardContent></Card>
      ) : isMobile ? (
        <div className="space-y-5">
          {groups.map(([d, items]) => (
            <section key={d} aria-label={dayHeading(d, today)} className="space-y-2">
              <h3 className="px-1 text-sm font-semibold text-muted-foreground">{dayHeading(d, today)}</h3>
              <ul className="space-y-3">
                {items.map(r => (
                  <li key={r.id}><AppointmentCard data={r} busy={busyId === r.id} onAction={(d2, a) => onAction(d2 as Row, a)} /></li>
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
                  {['Data', 'Hora', 'Cliente', 'Serviço', 'Valor', 'Status', 'Ações'].map(h => (
                    <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const actions = statusActionsFor(r.status);
                  return (
                    <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">{fmtDate(r.date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{r.startTime} – {r.endTime}</td>
                      <td className="px-4 py-3 text-sm"><div className="max-w-[180px] truncate font-medium">{r.clientName}</div></td>
                      <td className="px-4 py-3 text-sm"><div className="max-w-[160px] truncate">{r.serviceName}</div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold">{formatCurrency(r.price)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        {actions.length === 0 ? <span className="text-xs text-muted-foreground">Sem ações</span> : (
                          <div className="flex flex-wrap gap-2" role="group" aria-label={`Ações do agendamento de ${r.clientName}`}>
                            {actions.map(a => (
                              <Button key={a.status} type="button" size="sm" disabled={busyId === r.id}
                                variant={a.status === 'cancelled' ? 'outline' : a.status === 'confirmed' ? 'default' : 'secondary'}
                                className={`min-h-9 ${a.status === 'cancelled' ? 'text-destructive' : ''}`}
                                aria-label={actionLabel(a.label, r.clientName, r.date, r.startTime)} onClick={() => onAction(r, a)}>
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmAppointmentDialog scope="professional"
        target={confirmRow ? { clientName: confirmRow.clientName, date: confirmRow.date, startTime: confirmRow.startTime, serviceName: confirmRow.serviceName } : null}
        onCancel={() => setConfirmRow(null)}
        onConfirm={() => { const r = confirmRow; setConfirmRow(null); if (r) void apply(r, 'confirmed'); }} />

      {/* ── New Appointment Dialog ── */}
      <Dialog open={apptDialog} onOpenChange={o => { setApptDialog(o); if (!o) setApptError(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" /> Novo Agendamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Serviço *</Label>
              <Select value={apptForm.serviceId} onValueChange={v => setApptForm(f => ({ ...f, serviceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o serviço…" /></SelectTrigger>
                <SelectContent>
                  {myServices.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)} · {s.duration} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Select value={apptForm.clientId} onValueChange={v => setApptForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente…" /></SelectTrigger>
                <SelectContent>
                  {allClients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data *</Label>
                <Input type="date" value={apptForm.date} onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Horário *</Label>
                <Input type="time" value={apptForm.startTime} onChange={e => setApptForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
            </div>
            {selectedSvc && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Duração: <strong>{selectedSvc.duration} min</strong> · Término: <strong>{addMinutes(apptForm.startTime, selectedSvc.duration)}</strong> · Valor: <strong>{formatCurrency(selectedSvc.price)}</strong>
              </p>
            )}
            <div className="space-y-1">
              <Label>Observações (opcional)</Label>
              <Textarea placeholder="Alguma observação…" value={apptForm.notes} onChange={e => setApptForm(f => ({ ...f, notes: e.target.value }))} className="resize-none h-20" />
            </div>
            {apptError && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
                <X className="h-4 w-4 shrink-0" /> {apptError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApptDialog(false); setApptError(''); }}>Cancelar</Button>
            <Button onClick={handleApptSave}>Criar Agendamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recusar / cancelar: pede confirmação */}
      <Dialog open={!!rejectId} onOpenChange={o => !o && setRejectId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar cancelamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja {rejectTarget?.status === 'pending' ? 'recusar' : 'cancelar'} este agendamento? O cliente será notificado.
          </p>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setRejectId(null)}>Voltar</Button>
            <Button variant="destructive" className="min-h-11" onClick={() => {
              const id = rejectId; setRejectId(null);
              const row = rows.find(x => x.id === id);
              if (id) void run(id, async () => { clientNotice.clear(); await cancelAppointment(id); if (row) clientNotice.offer([row.appt], 'cancelled'); });
            }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
