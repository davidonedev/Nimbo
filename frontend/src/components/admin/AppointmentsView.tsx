import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Clock, FilterX, Scissors, Search, User, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { STATUS_META } from '@/components/admin/agenda/statusStyle';
import { useTenant } from '@/context/TenantContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { formatCurrency } from '@/lib/utils';
import {
  EMPTY_FILTERS, filterAppointments, hasActiveFilters, statusActionsFor,
  type AppointmentFilters, type StatusAction,
} from '@/lib/appointmentFilters';
import PendingConfirmations from '@/components/admin/PendingConfirmations';
import type { Appointment, AppointmentStatus } from '@/types';

const STATUS_OPTIONS: AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled'];

const fieldClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const fmtDate = (d: string) => format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');
const fmtDateLong = (d: string) => format(new Date(`${d}T00:00:00`), "EEE, d 'de' MMM", { locale: ptBR });

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
          aria-label={`${a.label}: ${row.clientName}, ${fmtDate(row.appt.date)} às ${row.appt.startTime}`}
          onClick={() => onAction(row, a)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Tela "Agendamentos": lista pesquisável de todos os agendamentos, com filtros (período, status,
 * profissional, serviço, busca por cliente) e ações de status. Tabela no desktop, cards no celular.
 * A Agenda (calendário) continua em `AgendaView only="calendar"`.
 */
export default function AppointmentsView() {
  const { appointments, clients, professionals, services, updateAppointmentStatus } = useTenant();
  const { isMobile } = useBreakpoint();
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
  const set = <K extends keyof AppointmentFilters>(k: K, v: AppointmentFilters[K]) => setFilters({ ...filters, [k]: v });

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

  const invalidPeriod = !!filters.dateFrom && !!filters.dateTo && filters.dateFrom > filters.dateTo;

  const apply = async (row: RowData, status: AppointmentStatus) => {
    setError('');
    setBusyId(row.appt.id);
    try { await updateAppointmentStatus(row.appt.id, status); }
    catch { setError('Não foi possível atualizar o agendamento. Tente novamente.'); }
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

      {/* Filtros */}
      <form role="search" aria-label="Filtrar agendamentos" onSubmit={e => e.preventDefault()} className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search" className="h-11 pl-9" placeholder="Buscar por nome, e-mail ou telefone do cliente"
            aria-label="Buscar cliente por nome, e-mail ou telefone"
            value={filters.search} onChange={e => set('search', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-from`}>De</Label>
            <Input id={`${uid}-from`} type="date" className="h-11" value={filters.dateFrom} max={filters.dateTo || undefined}
              onChange={e => set('dateFrom', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-to`}>Até</Label>
            <Input id={`${uid}-to`} type="date" className="h-11" value={filters.dateTo} min={filters.dateFrom || undefined}
              onChange={e => set('dateTo', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-status`}>Status</Label>
            <select id={`${uid}-status`} className={fieldClass} value={filters.status} onChange={e => set('status', e.target.value as AppointmentStatus | 'all')}>
              <option value="all">Todos</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
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
          <div className="flex items-end">
            <Button type="button" variant="outline" className="min-h-11 w-full gap-2" disabled={!hasActiveFilters(filters)} onClick={() => setFilters(EMPTY_FILTERS)}>
              <FilterX aria-hidden /> Limpar filtros
            </Button>
          </div>
        </div>
        {invalidPeriod && (
          <p role="alert" className="text-sm text-destructive">A data inicial é depois da data final. Ajuste o período.</p>
        )}
      </form>

      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          {hasActiveFilters(filters) ? 'Nenhum agendamento com esses filtros. Tente ampliar o período ou limpar os filtros.' : 'Ainda não há agendamentos.'}
        </CardContent></Card>
      ) : isMobile ? (
        <ul className="space-y-3" aria-label="Lista de agendamentos">
          {rows.map(row => (
            <li key={row.appt.id}>
              <Card className="shadow-sm"><CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={row.appt.status} />
                  <span className="text-base font-bold">{formatCurrency(row.appt.price)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{fmtDateLong(row.appt.date)}</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden />{row.appt.startTime} – {row.appt.endTime}</span>
                </div>
                <div className="space-y-1 border-t pt-3 text-sm">
                  <p className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span><span className="font-semibold">{row.clientName}</span>{row.clientPhone && <span className="block text-xs text-muted-foreground">{row.clientPhone}</span>}</span></p>
                  <p className="flex items-center gap-2"><Scissors className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />{row.serviceName}</p>
                  <p className="flex items-center gap-2 text-muted-foreground"><UserCheck className="h-4 w-4 shrink-0" aria-hidden />{row.professionalName}</p>
                </div>
                <div className="border-t pt-3"><ActionButtons row={row} onAction={onAction} busy={busyId === row.appt.id} /></div>
              </CardContent></Card>
            </li>
          ))}
        </ul>
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
