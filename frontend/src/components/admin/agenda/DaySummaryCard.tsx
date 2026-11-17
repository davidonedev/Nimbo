import { useEffect, useRef, useState } from 'react';
import { Ban, CalendarCheck2, CalendarClock, CalendarX2, CheckCircle2, Clock3, Hourglass, Link2, MoreVertical, Printer, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { copyText } from '@/lib/clipboard';
import { dayNumber, monthLong, weekdayLong } from '@/lib/agendaDates';
import type { BusinessStatus, DayHours, DayStats } from '@/lib/agendaStats';

interface Props {
  date: string;
  stats?: DayStats;
  status: BusinessStatus;
  hours: DayHours | null;
  bookingUrl: string;
  loading: boolean;
}

const STATUS_TONE: Record<BusinessStatus['state'], string> = {
  open: 'bg-green-500',
  opens_later: 'bg-amber-500',
  closed_today: 'bg-red-500',
  closed: 'bg-red-500',
};

/** Card de resumo do dia: data em destaque, funcionamento, indicadores e menu de ações. */
export function DaySummaryCard({ date, stats, status, hours, bookingUrl, loading }: Props) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    setCopied((await copyText(bookingUrl)) ? 'ok' : 'fail');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied('idle'), 3000);
  };

  // TODO: bloquear o dia / intervalo (etapa de bloqueios) e imprimir/exportar o dia (sem backend ainda).
  const handleBlockDay = () => { /* TODO */ };
  const handleBlockRange = () => { /* TODO */ };
  const handlePrint = () => { /* TODO */ };

  const indicators = stats && [
    { label: 'Agendamentos', value: stats.total, icon: CalendarClock },
    { label: 'Confirmados', value: stats.confirmed, icon: CalendarCheck2 },
    { label: 'Pendentes', value: stats.pending, icon: Hourglass },
    { label: 'Concluídos', value: stats.completed, icon: CheckCircle2 },
    { label: 'Cancelados e faltas', value: stats.cancelledOrNoShow, icon: CalendarX2 },
    { label: 'Horários livres', value: stats.freeSlots, icon: Timer },
  ];

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground" aria-hidden>
            <span className="text-2xl font-bold leading-none">{dayNumber(date)}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide">{monthLong(date).slice(0, 3)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">{weekdayLong(date)}</p>
            <p className="text-sm text-muted-foreground">{dayNumber(date)} de {monthLong(date)} de {date.slice(0, 4)}</p>
            <p role="status" className="mt-1 flex items-center gap-2 text-sm font-medium">
              <span className={`h-2 w-2 rounded-full ${STATUS_TONE[status.state]}`} aria-hidden />
              {status.label}
              <span className="flex items-center gap-1 font-normal text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {hours ? `${hours.open} às ${hours.close}` : 'Sem expediente'}
              </span>
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Ações do dia"><MoreVertical className="h-4 w-4" aria-hidden /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem className="gap-2" onSelect={handleBlockDay}><Ban className="h-4 w-4 text-muted-foreground" aria-hidden /> Bloquear o dia</DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={handleBlockRange}><Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden /> Bloquear intervalo</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" onSelect={() => { void handleCopy(); }}><Link2 className="h-4 w-4 text-muted-foreground" aria-hidden /> Copiar link de agendamento</DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={handlePrint}><Printer className="h-4 w-4 text-muted-foreground" aria-hidden /> Imprimir ou exportar o dia</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {loading || !indicators
            ? Array.from({ length: 6 }, (_, i) => <li key={i}><Skeleton className="h-16 w-full" /></li>)
            : indicators.map(({ label, value, icon: Icon }) => (
              <li key={label} className="rounded-xl border bg-muted/30 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{label}</span></p>
                <p className="text-xl font-bold">{value}</p>
              </li>
            ))}
        </ul>

      </CardContent>
      <p role="status" className="sr-only">
        {copied === 'ok' ? 'Link de agendamento copiado.' : copied === 'fail' ? 'Não foi possível copiar o link.' : ''}
      </p>
    </Card>
  );
}
