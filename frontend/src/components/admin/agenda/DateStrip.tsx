import { useEffect, useMemo, useRef } from 'react';
import { CalendarSearch, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDaysISO, dayNumber, monthYearLabel, todaySP, weekdayShort } from '@/lib/agendaDates';

/** Quantos dias a faixa mostra antes e depois do dia selecionado. */
export const STRIP_BEFORE = 7;
export const STRIP_AFTER = 21;

interface Props {
  date: string;
  /** dias com agendamento (para o indicador discreto) */
  busyDays: Set<string>;
  onSelect: (iso: string) => void;
  onToday: () => void;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/**
 * Faixa horizontal de dias com mês/ano, "Hoje", seletor de data e atalhos de teclado
 * (← → trocam o dia, T volta para hoje). Só reage ao teclado fora de campos de texto.
 */
export function DateStrip({ date, busyDays, onSelect, onToday }: Props) {
  const today = todaySP();
  const days = useMemo(() => Array.from({ length: STRIP_BEFORE + STRIP_AFTER + 1 }, (_, i) => addDaysISO(date, i - STRIP_BEFORE)), [date]);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') { onSelect(addDaysISO(date, -1)); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { onSelect(addDaysISO(date, 1)); e.preventDefault(); }
      else if (e.key === 't' || e.key === 'T') { onToday(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [date, onSelect, onToday]);

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker(); else el.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold" aria-live="polite">{monthYearLabel(date)}</h3>
        <Button type="button" variant="outline" size="sm" onClick={onToday} aria-label="Ir para hoje (atalho: T)">Hoje</Button>
        <div className="relative">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openPicker} aria-label="Escolher uma data no calendário">
            <CalendarSearch className="h-4 w-4" aria-hidden /> Data
          </Button>
          <input
            ref={pickerRef}
            type="date"
            value={date}
            tabIndex={-1}
            aria-hidden
            onChange={e => e.target.value && onSelect(e.target.value)}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onSelect(addDaysISO(date, -7))} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <ul className="flex flex-1 gap-1.5 overflow-x-auto py-1" aria-label="Dias">
          {days.map(d => {
            const selected = d === date;
            const isToday = d === today;
            const busy = busyDays.has(d);
            return (
              <li key={d}>
                <button
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  onClick={() => onSelect(d)}
                  aria-current={selected ? 'date' : undefined}
                  aria-label={`${weekdayShort(d)}, dia ${dayNumber(d)}${isToday ? ' (hoje)' : ''}${busy ? ', com agendamentos' : ''}`}
                  className={`relative flex w-12 flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary text-primary-foreground' : isToday ? 'border-primary/50 bg-primary/5' : 'bg-card hover:bg-muted'}`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${selected ? '' : 'text-muted-foreground'}`}>{weekdayShort(d)}</span>
                  <span className="text-lg font-bold leading-none">{dayNumber(d)}</span>
                  <span aria-hidden className={`mt-0.5 h-1.5 w-1.5 rounded-full ${busy ? (selected ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent'}`} />
                </button>
              </li>
            );
          })}
        </ul>
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onSelect(addDaysISO(date, 7))} aria-label="Próxima semana">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
