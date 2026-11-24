import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dayNumber, weekdayShort } from '@/lib/painel';
import type { DashboardSummary } from '@/services/dashboard.service';
import { CardError } from './SummaryState';
import { DayAppointmentsSheet } from './DayAppointmentsSheet';

interface Props {
  week?: DashboardSummary['week'];
  today?: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/**
 * Próximos 7 dias (hoje incluído): uma fileira de dias, cada um com o dia da semana, o número e a quantidade de
 * agendamentos. Hoje fica em destaque; tocar num dia abre a lista completa dele. A quantidade sempre aparece em
 * texto (a cor é só reforço).
 */
export function WeekStrip({ week, today, loading, error, onRetry }: Props) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const total = week?.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-1 space-y-0 pb-3">
        <CardTitle className="text-lg">Próximos 7 dias</CardTitle>
        {week && !loading && <p className="text-sm text-muted-foreground"><strong className="text-base text-foreground tabular-nums">{total}</strong> {total === 1 ? 'agendamento' : 'agendamentos'} na semana</p>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div role="status" aria-label="Carregando" className="flex gap-2">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-24 min-w-[3.5rem] flex-1 rounded-2xl" />)}
          </div>
        ) : error || !week ? (
          <CardError onRetry={onRetry} />
        ) : (
          <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0">
            {week.map(day => {
              const isToday = day.date === today;
              const label = `${weekdayShort(day.date)}, dia ${dayNumber(day.date)}${isToday ? ' (hoje)' : ''}: ${day.count === 0 ? 'livre' : `${day.count} ${day.count === 1 ? 'agendamento' : 'agendamentos'}`}`;
              return (
                <li key={day.date} className="min-w-[3.5rem] flex-1 snap-start">
                  <button
                    type="button"
                    onClick={() => setOpenDay(day.date)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-haspopup="dialog"
                    aria-label={label}
                    className={`flex min-h-[5.5rem] w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isToday ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90' : 'bg-muted/50 hover:bg-muted'}`}
                  >
                    <span className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{weekdayShort(day.date)}</span>
                    <span className="text-lg font-bold leading-none tabular-nums">{dayNumber(day.date)}</span>
                    {day.count === 0 ? (
                      <span className={`text-xs ${isToday ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>Livre</span>
                    ) : (
                      <span className={`min-w-[1.5rem] rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${isToday ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'}`}>{day.count}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <DayAppointmentsSheet day={openDay} onClose={() => setOpenDay(null)} />
    </Card>
  );
}
