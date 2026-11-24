import { useState, useMemo } from 'react';
import {
  format, parseISO, isWithinInterval,
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  differenceInDays,
  addDays, addWeeks, addMonths, addYears, subDays, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/context/TenantContext';
import { formatCurrency } from '@/lib/utils';
import type { RevenueRange } from '@/types';

const PIE_PALETTE = ['#2563eb','#16a34a','#d97706','#dc2626','#0891b2','#db2777'];

/** Rótulo do período em andamento (o botão central do navegador, no período atual). */
const RANGE_LABELS: Record<RevenueRange, string> = {
  day:    'Hoje',
  week:   'Esta semana',
  month:  'Este mês',
  year:   'Este ano',
  custom: 'Personalizado',
};

/** Rótulo curto do seletor, para caber os cinco numa linha só no celular. */
const RANGE_SHORT: Record<RevenueRange, string> = {
  day: 'Hoje', week: 'Semana', month: 'Mês', year: 'Ano', custom: 'Período',
};

const RANGE_ORDER: RevenueRange[] = ['day', 'week', 'month', 'year', 'custom'];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RevenueView() {
  const { appointments, services, professionals, tenant } = useTenant();
  const adminColor = tenant.adminColor ?? tenant.primaryColor;
  const COLORS = [adminColor, ...PIE_PALETTE];

  const [range, setRange] = useState<RevenueRange>('month');
  /** Quantos períodos para trás (0 = o atual). Não há como avançar para o futuro. */
  const [offset, setOffset] = useState(0);
  const changeRange = (r: RevenueRange) => { setRange(r); setOffset(0); };

  // Custom range defaults: last 30 days
  const [customStart, setCustomStart] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd,   setCustomEnd]   = useState(() => format(new Date(), 'yyyy-MM-dd'));

  // ── Interval ────────────────────────────────────────────────────────────────
  const interval = useMemo(() => {
    const now = new Date();
    if (range === 'custom') {
      const s = parseISO(customStart);
      const e = parseISO(customEnd);
      return { start: startOfDay(s), end: endOfDay(e > s ? e : s) };
    }
    switch (range) {
      case 'day':   { const d = addDays(now, offset);   return { start: startOfDay(d), end: endOfDay(d) }; }
      case 'week':  { const d = addWeeks(now, offset);  return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) }; }
      case 'month': { const d = addMonths(now, offset); return { start: startOfMonth(d), end: endOfMonth(d) }; }
      case 'year':  { const d = addYears(now, offset);  return { start: startOfYear(d), end: endOfYear(d) }; }
    }
  }, [range, offset, customStart, customEnd]);

  // ── Filtered appointments ───────────────────────────────────────────────────
  const completedInRange = useMemo(() =>
    appointments.filter(a => {
      if (a.status !== 'completed') return false;
      try { return isWithinInterval(parseISO(a.date), interval); } catch { return false; }
    }),
  [appointments, interval]);

  const cancelCount = useMemo(() =>
    appointments.filter(a => {
      if (a.status !== 'cancelled') return false;
      try { return isWithinInterval(parseISO(a.date), interval); } catch { return false; }
    }).length,
  [appointments, interval]);

  const totalRevenue = completedInRange.reduce((s, a) => s + a.price, 0);
  const totalCount   = completedInRange.length;
  const avgTicket    = totalCount > 0 ? totalRevenue / totalCount : 0;

  // ── Chart grouping strategy ─────────────────────────────────────────────────
  // day/week → line by day; month → line by day; year → bar by month
  // custom → ≤31d: by day  |  ≤90d: by week  |  >90d: by month
  const spanDays  = differenceInDays(interval.end, interval.start) + 1;
  const useMonths = range === 'year' || (range === 'custom' && spanDays > 90);
  const useWeeks  = range === 'custom' && spanDays > 31 && spanDays <= 90;

  const chartData = useMemo(() => {
    if (useMonths) {
      return eachMonthOfInterval(interval).map(month => ({
        label: format(month, 'MMM/yy', { locale: ptBR }),
        revenue: completedInRange
          .filter(a => a.date.startsWith(format(month, 'yyyy-MM')))
          .reduce((s, a) => s + a.price, 0),
      }));
    }
    if (useWeeks) {
      return eachWeekOfInterval(interval, { weekStartsOn: 1 }).map(week => ({
        label: format(week, "d/MM", { locale: ptBR }),
        revenue: completedInRange.filter(a => {
          const d = parseISO(a.date);
          const wEnd = new Date(week); wEnd.setDate(wEnd.getDate() + 6);
          return d >= week && d <= wEnd;
        }).reduce((s, a) => s + a.price, 0),
      }));
    }
    // by day
    return eachDayOfInterval(interval).map(day => ({
      label: format(day, range === 'week' ? 'EEE' : 'd/MM', { locale: ptBR }),
      revenue: completedInRange
        .filter(a => a.date === format(day, 'yyyy-MM-dd'))
        .reduce((s, a) => s + a.price, 0),
    }));
  }, [useMonths, useWeeks, interval, completedInRange, range]);

  const byService = services.map(s => ({
    name:  s.name,
    value: completedInRange.filter(a => a.serviceId === s.id).reduce((sum, a) => sum + a.price, 0),
    count: completedInRange.filter(a => a.serviceId === s.id).length,
  })).filter(s => s.value > 0);

  const byProfessional = professionals.map(p => ({
    name:    p.name.split(' ')[0],
    revenue: completedInRange.filter(a => a.professionalId === p.id).reduce((sum, a) => sum + a.price, 0),
  }));

  // ── Period label ────────────────────────────────────────────────────────────
  const periodDetail = (() => {
    const d = (date: Date, pattern: string) => format(date, pattern, { locale: ptBR });
    if (range === 'custom') return `${d(interval.start, "d 'de' MMM")} → ${d(interval.end, "d 'de' MMM 'de' yyyy")}`;
    if (range === 'day') return capitalize(d(interval.start, "EEEE, d 'de' MMMM"));
    if (range === 'week') return `${d(interval.start, "d 'de' MMM")} – ${d(interval.end, "d 'de' MMM")}`;
    if (range === 'month') return capitalize(d(interval.start, "MMMM 'de' yyyy"));
    return d(interval.start, 'yyyy');
  })();
  // Botão central do navegador: "Hoje", "Esta semana"… no período atual; "Ontem", "Semana passada" ou as datas nos anteriores.
  const periodName = offset === 0 ? RANGE_LABELS[range]
    : range === 'day' && offset === -1 ? 'Ontem'
    : range === 'week' && offset === -1 ? 'Semana passada'
    : periodDetail;

  const setCustomPreset = (key: '7d' | '30d' | 'lastMonth') => {
    const today = new Date();
    const iso = (date: Date) => format(date, 'yyyy-MM-dd');
    if (key === 'lastMonth') {
      const lm = subMonths(today, 1);
      setCustomStart(iso(startOfMonth(lm))); setCustomEnd(iso(endOfMonth(lm)));
    } else {
      setCustomStart(iso(subDays(today, key === '7d' ? 6 : 29))); setCustomEnd(iso(today));
    }
  };
  const invalidCustom = customStart > customEnd;
  return (
    <div className="space-y-6">

      {/* Header + filtros de período */}
      <div className="space-y-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Faturamento</h2>
          <p className="text-muted-foreground text-sm" aria-live="polite">{periodDetail}</p>
        </div>

        <div role="radiogroup" aria-label="Período do relatório" className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1 sm:mx-0 sm:w-fit">
          {RANGE_ORDER.map(r => (
            <button
              key={r} type="button" role="radio" aria-checked={range === r}
              onClick={() => changeRange(r)}
              className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:flex-none ${range === r ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r === 'custom' && <CalendarRange className="h-3.5 w-3.5" aria-hidden />}{RANGE_SHORT[r]}
            </button>
          ))}
        </div>

        {range !== 'custom' && (
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 sm:w-fit sm:min-w-[20rem]">
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-10 sm:w-10" onClick={() => setOffset(o => o - 1)} aria-label="Período anterior">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <button
              type="button" disabled={offset === 0} onClick={() => setOffset(0)}
              aria-label={offset === 0 ? `Período atual: ${periodName}` : `${periodName}. Voltar para ${RANGE_LABELS[range].toLowerCase()}`}
              className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default sm:min-h-10"
            >
              <span className="max-w-full truncate text-sm font-semibold">{periodName}</span>
              {offset !== 0 && <span className="text-xs text-primary">Voltar para {RANGE_LABELS[range].toLowerCase()}</span>}
            </button>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-10 sm:w-10" onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Próximo período">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}

        {/* Período personalizado: atalhos + datas */}
        {range === 'custom' && (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de período">
                {([['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['lastMonth', 'Mês passado']] as const).map(([key, label]) => (
                  <Button key={key} type="button" variant="outline" size="sm" className="h-11 rounded-full px-4 sm:h-9" onClick={() => setCustomPreset(key)}>{label}</Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <div className="space-y-1">
                  <Label htmlFor="rev-from" className="text-xs">Data inicial</Label>
                  <Input id="rev-from" type="date" className="h-11" value={customStart} max={customEnd} onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rev-to" className="text-xs">Data final</Label>
                  <Input id="rev-to" type="date" className="h-11" value={customEnd} min={customStart} max={format(new Date(), 'yyyy-MM-dd')} onChange={e => setCustomEnd(e.target.value)} />
                </div>
              </div>
              {invalidCustom ? (
                <p role="alert" className="text-sm text-destructive">A data inicial é depois da data final. Ajuste o período.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {spanDays} {spanDays === 1 ? 'dia' : 'dias'} selecionado{spanDays !== 1 ? 's' : ''}
                  {useWeeks ? ' · agrupado por semana' : useMonths ? ' · agrupado por mês' : ' · agrupado por dia'}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Receita Total',  value: formatCurrency(totalRevenue) },
          { label: 'Atendimentos',   value: totalCount.toString() },
          { label: 'Ticket Médio',   value: formatCurrency(avgTicket) },
          { label: 'Cancelamentos',  value: cancelCount.toString(), className: 'text-destructive' },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-sm">{kpi.label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${kpi.className ?? ''}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Evolution chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Evolução da Receita</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            {useMonths ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="text-xs fill-muted-foreground" interval="preserveStartEnd" />
                <YAxis className="text-xs fill-muted-foreground" tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={spanDays <= 14} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* By service + by professional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Receita por Serviço</CardTitle></CardHeader>
          <CardContent>
            {byService.length === 0
              ? <p className="text-center text-muted-foreground py-8">Sem dados no período</p>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byService} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {byService.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Receita por Profissional</CardTitle></CardHeader>
          <CardContent>
            {byProfessional.every(p => p.revenue === 0)
              ? <p className="text-center text-muted-foreground py-8">Sem dados no período</p>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byProfessional} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={v => `R$${v}`} />
                    <YAxis type="category" dataKey="name" className="text-xs fill-muted-foreground" width={60} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>
      </div>

      {/* Service breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento por Serviço</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {services.map(s => {
            const count   = completedInRange.filter(a => a.serviceId === s.id).length;
            const revenue = completedInRange.filter(a => a.serviceId === s.id).reduce((sum, a) => sum + a.price, 0);
            const pct     = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
            return (
              <div key={s.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{s.name}</span>
                  <span className="font-medium">{formatCurrency(revenue)} ({count} atend.)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
